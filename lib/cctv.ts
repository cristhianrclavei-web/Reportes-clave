// CCTV: almacenamiento de grabación y lista de materiales de un plano.
// Lógica pura; se prueba en lib/cctv.test.ts.

import { equipoCatalogo, esCamara } from './equiposSistemas';
import { tipoDispositivo } from './lazos';
import { cantidadesDeTuberia, type Sembrado } from './planos';

export type ConfigGrabacion = {
  dias: number;
  horas: number;
  resolucion: '2MP' | '4MP' | '5MP' | '8MP';
  codec: 'H.265' | 'H.264';
  fps: 15 | 30;
  // Qué parte del día graba (100 = continua).
  movimientoPct: number;
};

// Flujo típico en Mbps con H.265 a 15 cuadros por segundo. H.264 gasta cerca
// de 60 % más; 30 cuadros, 50 % más. Son estimados de fabricante.
export const RESOLUCIONES: { clave: ConfigGrabacion['resolucion']; nombre: string; mbps: number }[] = [
  { clave: '2MP', nombre: '2 MP (1080p)', mbps: 2 },
  { clave: '4MP', nombre: '4 MP', mbps: 3 },
  { clave: '5MP', nombre: '5 MP', mbps: 3.5 },
  { clave: '8MP', nombre: '8 MP (4K)', mbps: 5 },
];

export const DISCOS_TB = [1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20];

export function almacenamientoCctv(camaras: number, c: ConfigGrabacion): { mbpsPorCamara: number; tb: number; discoSugerido: number | null } {
  const base = RESOLUCIONES.find((r) => r.clave === c.resolucion)?.mbps ?? 3;
  const mbpsPorCamara = base * (c.codec === 'H.264' ? 1.6 : 1) * (c.fps === 30 ? 1.5 : 1);
  // Mbps → megabytes por segundo (÷8) → por hora (×3600) → TB (÷1,000,000).
  const tb = (camaras * mbpsPorCamara / 8) * 3600 * c.horas * c.dias * (c.movimientoPct / 100) / 1_000_000;
  const discoSugerido = DISCOS_TB.find((d) => d >= tb) ?? null;
  return { mbpsPorCamara, tb, discoSugerido };
}

export type RenglonMaterial = { descripcion: string; cantidad: number; unidad: string; modelo: string | null };

// Lo sembrado en un plano como renglones de cotización: equipos agrupados por
// tipo y modelo, y tubería por tipo y diámetro (en metros si hay escala).
export function materialesDelPlano(sembrado: Sembrado, metrosPorUnidad: number | null): RenglonMaterial[] {
  const grupos = new Map<string, { tipo: string; renglon: RenglonMaterial }>();
  for (const e of sembrado.equipos) {
    const modelo = e.modelo?.trim() || null;
    const clave = `${e.tipo}|${modelo || ''}`;
    const previo = grupos.get(clave);
    if (previo) { previo.renglon.cantidad += 1; continue; }
    const nombre = equipoCatalogo(e.tipo)?.nombre || tipoDispositivo(e.tipo).nombre;
    grupos.set(clave, { tipo: e.tipo, renglon: { descripcion: modelo ? `${nombre} ${modelo}` : nombre, cantidad: 1, unidad: 'Pza', modelo } });
  }
  // Cámaras primero, luego lo demás, como se cotiza normalmente.
  const lista = [...grupos.values()]
    .sort((a, b) => Number(esCamara(b.tipo)) - Number(esCamara(a.tipo)))
    .map((g) => g.renglon);
  for (const t of cantidadesDeTuberia(sembrado, metrosPorUnidad)) {
    const metros = t.metros !== null ? Math.ceil(t.metros) : null;
    lista.push({
      descripcion: `Tubería ${t.tipo} de ${t.diametro}${metros === null ? ` (${t.tramos} ${t.tramos === 1 ? 'tramo' : 'tramos'}, plano sin escala)` : ''}`,
      cantidad: metros ?? t.tramos, unidad: metros === null ? 'Tramo' : 'Mts', modelo: null,
    });
  }
  return lista;
}
