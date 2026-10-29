// Lógica de «Imprimir varios» (Reportes → Imprimir varios): qué reportes
// entran según los filtros, en qué orden y cómo se acomodan las páginas.
// Sin React ni Supabase para poder probarla (impresionReportes.test.ts).

import { tieneTipo } from './tiposServicio';

export type ReporteImprimible = {
  id: string;
  fecha: string; // YYYY-MM-DD
  empresa_cliente: string;
  tipo_servicio: string | null;
  created_by?: string | null;
  data?: any;
  profiles?: any;
};

export type ClavePeriodo = 'hoy' | 'ayer' | 'semana' | 'semana_pasada' | 'mes' | 'mes_pasado' | 'personalizado';
export type EstadoRevision = 'revisados' | 'todos' | 'pendientes';
export type Orden = 'fecha' | 'cliente' | 'tecnico';

export type FiltrosImpresion = {
  desde: string;
  hasta: string;
  texto: string;
  tecnicoId: string; // '' = todos
  tipo: string; // '' = todos
  estado: EstadoRevision;
  soloSinImprimir: boolean;
};

// Lo más reciente que se sabe de la impresión de un reporte.
export type Impresion = { en: string; por: string };

// Más que esto tarda mucho en el teléfono y el archivo pesa demasiado para
// mandarlo a la impresora de una sola vez.
export const MAXIMO_POR_ARCHIVO = 60;

export const PERIODOS: { clave: ClavePeriodo; texto: string }[] = [
  { clave: 'hoy', texto: 'Hoy' },
  { clave: 'ayer', texto: 'Ayer' },
  { clave: 'semana', texto: 'Esta semana' },
  { clave: 'semana_pasada', texto: 'Semana pasada' },
  { clave: 'mes', texto: 'Este mes' },
  { clave: 'mes_pasado', texto: 'Mes pasado' },
  { clave: 'personalizado', texto: 'Elegir fechas' },
];

function aTexto(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function desdeTexto(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function sumarDias(s: string, dias: number): string {
  const d = desdeTexto(s);
  d.setDate(d.getDate() + dias);
  return aTexto(d);
}

// Rango de fechas de cada periodo. `hoy` llega de fuera (YYYY-MM-DD local)
// para no leer el reloj aquí. La semana empieza en lunes, como en la app.
export function rangoDelPeriodo(clave: Exclude<ClavePeriodo, 'personalizado'>, hoy: string): { desde: string; hasta: string } {
  if (clave === 'hoy') return { desde: hoy, hasta: hoy };
  if (clave === 'ayer') {
    const ayer = sumarDias(hoy, -1);
    return { desde: ayer, hasta: ayer };
  }
  if (clave === 'semana' || clave === 'semana_pasada') {
    const diaSemana = desdeTexto(hoy).getDay(); // 0 = domingo
    const desdeLunes = diaSemana === 0 ? 6 : diaSemana - 1;
    let lunes = sumarDias(hoy, -desdeLunes);
    if (clave === 'semana_pasada') lunes = sumarDias(lunes, -7);
    return { desde: lunes, hasta: sumarDias(lunes, 6) };
  }
  const d = desdeTexto(hoy);
  if (clave === 'mes_pasado') d.setMonth(d.getMonth() - 1, 1);
  else d.setDate(1);
  const primero = aTexto(d);
  const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { desde: primero, hasta: aTexto(ultimoDia) };
}

export function nombreTecnico(r: ReporteImprimible): string {
  const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
  return p?.full_name || 'Personal técnico';
}

export function folioDe(r: ReporteImprimible): string {
  return r.data?.claveFormato || r.id.slice(0, 8).toUpperCase();
}

export function estaRevisado(r: ReporteImprimible): boolean {
  return !!r.data?.firmaRevisionData;
}

// Sin acentos ni mayúsculas, para que «garcia» encuentre «García».
function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function filtrarParaImprimir(
  reportes: ReporteImprimible[],
  filtros: FiltrosImpresion,
  impresos: Record<string, Impresion>,
): ReporteImprimible[] {
  const texto = normalizar(filtros.texto.trim());
  return reportes.filter((r) => {
    if (!r.fecha || r.fecha < filtros.desde || r.fecha > filtros.hasta) return false;
    if (filtros.tecnicoId && r.created_by !== filtros.tecnicoId) return false;
    if (filtros.tipo && !tieneTipo(r.tipo_servicio, filtros.tipo)) return false;
    if (filtros.estado === 'revisados' && !estaRevisado(r)) return false;
    if (filtros.estado === 'pendientes' && estaRevisado(r)) return false;
    if (filtros.soloSinImprimir && impresos[r.id]) return false;
    if (texto) {
      const donde = normalizar(`${r.empresa_cliente} ${folioDe(r)} ${nombreTecnico(r)}`);
      if (!donde.includes(texto)) return false;
    }
    return true;
  });
}

// Por fecha va del más antiguo al más reciente: así se entregan en orden.
// Empates: por cliente y luego por folio, para que el orden no cambie solo.
export function ordenarParaImprimir(reportes: ReporteImprimible[], orden: Orden): ReporteImprimible[] {
  const porFecha = (a: ReporteImprimible, b: ReporteImprimible) => a.fecha.localeCompare(b.fecha);
  const porCliente = (a: ReporteImprimible, b: ReporteImprimible) => a.empresa_cliente.localeCompare(b.empresa_cliente, 'es');
  const porTecnico = (a: ReporteImprimible, b: ReporteImprimible) => nombreTecnico(a).localeCompare(nombreTecnico(b), 'es');
  const porFolio = (a: ReporteImprimible, b: ReporteImprimible) => folioDe(a).localeCompare(folioDe(b));

  const criterios = orden === 'cliente'
    ? [porCliente, porFecha, porFolio]
    : orden === 'tecnico'
      ? [porTecnico, porFecha, porCliente, porFolio]
      : [porFecha, porCliente, porFolio];

  return [...reportes].sort((a, b) => {
    for (const comparar of criterios) {
      const resultado = comparar(a, b);
      if (resultado !== 0) return resultado;
    }
    return 0;
  });
}

// Para imprimir a doble cara cada reporte debe empezar en una hoja nueva:
// si un reporte termina en página impar, se agrega una página en blanco.
export function paginasEnBlancoDespues(paginas: number, dobleCara: boolean): number {
  if (!dobleCara) return 0;
  return paginas % 2 === 1 ? 1 : 0;
}
