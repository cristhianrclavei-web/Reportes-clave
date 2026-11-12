// Copia resumida de una guía de conexión para anexarla al reporte: qué se
// conectó, quién lo hizo y qué dieron las pruebas. Se guarda dentro del
// reporte (data.guiasConexion) para que el PDF salga igual aunque después
// cambien la guía. Lógica pura; se prueba en lib/anexoGuia.test.ts.

import { estadoDePrueba, progresoDe, rangoDePrueba, textoPunta, type EstadoPrueba, type Guia } from './guias';

export type AnexoGuia = {
  version: 1;
  guia_id: string;
  nombre: string;
  sistema: string;
  equipos: string[];
  conexiones: { de: string; a: string; cable: string; hecha: boolean; por: string }[];
  pruebas: { texto: string; rango: string; valor: number | null; unidad: string; estado: EstadoPrueba; por: string }[];
  porcentaje: number;
  terminado: boolean;
  anexado_en: string;
};

export function resumirGuia(guia: Guia, ahora: string): AnexoGuia {
  const progreso = progresoDe(guia.datos, guia.avance);
  return {
    version: 1,
    guia_id: guia.id,
    nombre: guia.nombre,
    sistema: guia.sistema,
    equipos: guia.datos.equipos.map((e) => [e.nombre, e.modelo].filter(Boolean).join(' · ')),
    conexiones: guia.datos.conexiones.map((c) => {
      const marca = guia.avance.conexiones[c.id];
      return {
        de: textoPunta(guia.datos, c.de),
        a: textoPunta(guia.datos, c.a),
        cable: [c.color, c.calibre ? `cal. ${c.calibre}` : null].filter(Boolean).join(' '),
        hecha: Boolean(marca),
        por: marca?.nombre || '',
      };
    }),
    pruebas: guia.datos.pruebas.map((p) => {
      const marca = guia.avance.pruebas[p.id];
      return {
        texto: p.texto,
        rango: rangoDePrueba(p),
        valor: marca ? marca.valor : null,
        unidad: p.unidad || '',
        estado: estadoDePrueba(p, marca?.valor),
        por: marca?.nombre || '',
      };
    }),
    porcentaje: progreso.porcentaje,
    terminado: progreso.terminado,
    anexado_en: ahora,
  };
}

// Lo guardado en el reporte, descartando lo que no tenga la forma esperada.
export function anexosGuiaDeReporte(valor: unknown): AnexoGuia[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((a) => a && typeof a === 'object' && a.version === 1 && typeof a.guia_id === 'string' && Array.isArray(a.conexiones) && Array.isArray(a.pruebas)) as AnexoGuia[];
}

// «7 de 9 conexiones · 2 de 2 pruebas» y, si hay, cuántas fuera de rango.
export function resumenCortoGuia(a: AnexoGuia): string {
  const hechas = a.conexiones.filter((c) => c.hecha).length;
  const medidas = a.pruebas.filter((p) => p.valor !== null).length;
  const fuera = a.pruebas.filter((p) => p.estado === 'fuera').length;
  const partes = [`${hechas} de ${a.conexiones.length} conexiones`];
  if (a.pruebas.length > 0) partes.push(`${medidas} de ${a.pruebas.length} pruebas`);
  if (fuera > 0) partes.push(`${fuera} fuera de rango`);
  return partes.join(' · ');
}
