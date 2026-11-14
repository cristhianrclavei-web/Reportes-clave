// Visitas que el rastreo (GPS) detectó con un cliente y que piden reporte.
//
// La regla vive en SQL (supabase/patch_visitas_exigibles.sql): si el teléfono
// de la empresa ubica al técnico 20 minutos o más con un cliente, esa visita
// necesita un reporte o un levantamiento de ese cliente ese día. Si no lo
// hay, el técnico la justifica y el supervisor autoriza o rechaza.
//
// Aquí solo va la lógica pura que comparten la app y el aviso automático; se
// prueba en lib/visitasExigibles.test.ts. Las consultas están en
// lib/visitasExigiblesDatos.ts.

import { HORA_CORTE_MIN, INICIO_COBERTURA, fechaCorta } from './coberturaReportes';
import { textoDuracion } from './visitas';

// Una fila de visitas_por_revisar().
export type VisitaExigible = {
  id: string;
  tecnico_id: string;
  tecnico: string | null;
  fecha: string; // AAAA-MM-DD
  cliente_id: string;
  cliente: string;
  llegada: string; // ISO
  salida: string; // ISO
  minutos: number;
  sin_senal: number;
  // 'cubierta': hay reporte, levantamiento o visita sin trabajo de ese cliente ese día.
  estado: 'cubierta' | 'justificada' | 'por_autorizar' | 'sin_reporte';
  cubre: 'reporte' | 'levantamiento' | 'visita_sin_trabajo' | null;
  motivo: MotivoVisita | null;
  detalle: string | null;
  justificacion_estado: 'pendiente' | 'aprobada' | 'rechazada' | null;
  justifico: string | null;
  justificado_en: string | null;
  reviso: string | null;
  revisado_en: string | null;
  // Clientes vecinos que sí tienen reporte o levantamiento ese día.
  cerca_con_registro: string | null;
};

export type MotivoVisita = 'cliente_cercano' | 'sin_trabajo' | 'compra_material' | 'otro';

export const MOTIVOS_VISITA: { valor: MotivoVisita; label: string; detalle: string; pregunta: string }[] = [
  {
    valor: 'cliente_cercano',
    label: 'Estaba con otro cliente cercano',
    detalle: 'En el mismo edificio, plaza o a un lado',
    pregunta: '¿Con qué cliente estabas?',
  },
  {
    valor: 'sin_trabajo',
    label: 'No hice trabajo ahí',
    detalle: 'Pasé a dejar o recoger algo, esperé, comí cerca…',
    pregunta: '¿Qué hiciste ahí?',
  },
  {
    valor: 'compra_material',
    label: 'Recolección o compra de material',
    detalle: 'Recogí o compré material ahí o a un lado',
    pregunta: '¿Qué material y dónde?',
  },
  { valor: 'otro', label: 'Otro', detalle: 'Explica el motivo', pregunta: 'Explica el motivo' },
];

export const TEXTO_CUBRE: Record<NonNullable<VisitaExigible['cubre']>, string> = {
  reporte: 'Con reporte',
  levantamiento: 'Con levantamiento',
  visita_sin_trabajo: 'Visita sin trabajo',
};

export function etiquetaMotivoVisita(motivo: string | null): string {
  const encontrado = MOTIVOS_VISITA.find((m) => m.valor === motivo);
  return encontrado ? encontrado.label : motivo || '';
}

// Hora de reloj «HH:MM» (24 h, hora de México), que es el formato de los
// campos de hora del reporte.
export function horaReloj(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });
}

// «09:23 – 13:03 · 3 h 40 min»
export function textoHorario(visita: { llegada: string; salida: string; minutos: number }): string {
  return `${horaReloj(visita.llegada)} – ${horaReloj(visita.salida)} · ${textoDuracion(visita.minutos)}`;
}

// Las que ya se le cobran al técnico: sin reporte ni justificación, de días
// anteriores o de hoy después de las 18:00 (antes todavía está a tiempo, y
// puede que siga con el cliente).
export function visitasPendientes<T extends { estado: string; fecha: string }>(visitas: T[], hoy: string, minutosDelDia: number): T[] {
  return visitas.filter((visita) => {
    if (visita.estado !== 'sin_reporte') return false;
    if (visita.fecha < hoy) return true;
    return visita.fecha === hoy && minutosDelDia >= HORA_CORTE_MIN;
  });
}

// Revisa la justificación antes de mandarla. Devuelve el mensaje de error o null.
export function errorDeJustificacion(motivo: string, detalle: string): string | null {
  if (!MOTIVOS_VISITA.some((m) => m.valor === motivo)) return 'Elige el motivo.';
  const texto = detalle.trim();
  if (texto.length < 3) return 'Explica qué pasó (al menos unas palabras).';
  if (texto.length > 500) return 'La explicación es muy larga (máximo 500 letras).';
  return null;
}

// Si el último punto con el cliente es de hace menos de esto, puede que el
// técnico siga ahí: la hora de salida todavía no se sugiere.
export const MINUTOS_PARA_DAR_SALIDA = 15;

// Horas para llenar el reporte a partir de lo que vio el rastreo. `salida`
// va vacía si parece que el técnico sigue con el cliente.
export function horarioSugerido(gps: { llegada: string; salida: string }, ahoraMs: number): { llegada: string; salida: string } {
  const minutosDesdeLaSalida = (ahoraMs - Date.parse(gps.salida)) / 60000;
  const yaSeFue = minutosDesdeLaSalida >= MINUTOS_PARA_DAR_SALIDA;
  return { llegada: horaReloj(gps.llegada), salida: yaSeFue ? horaReloj(gps.salida) : '' };
}

// Enlace a «Nuevo reporte» con la fecha y el cliente de la visita ya puestos.
// El horario lo llena el propio formulario con el rastreo.
export function enlaceReporteDeVisita(visita: { fecha: string; cliente_id: string; cliente: string }): string {
  const parametros = new URLSearchParams({ fecha: visita.fecha, cliente: visita.cliente_id, nombre: visita.cliente });
  return `/nuevo?${parametros.toString()}`;
}

// Texto del aviso (push) al técnico. 'tarde' = las de hoy; 'manana' = días anteriores.
export function mensajeVisitasPendientes(momento: 'tarde' | 'manana', visitas: { fecha: string; cliente: string }[]): { titulo: string; cuerpo: string } {
  const accion = 'Haz el reporte o justifica la visita desde la app.';
  if (visitas.length === 1) {
    const unica = visitas[0];
    const cuando = momento === 'tarde' ? 'hoy' : `el ${fechaCorta(unica.fecha)}`;
    return {
      titulo: `Falta el reporte de ${unica.cliente}`,
      cuerpo: `El rastreo te ubica con ese cliente ${cuando}. ${accion}`,
    };
  }
  const clientes = [...new Set(visitas.map((v) => v.cliente))];
  const lista = clientes.length <= 3 ? clientes.join(', ') : `${clientes.slice(0, 3).join(', ')} y ${clientes.length - 3} más`;
  return {
    titulo: `Faltan reportes de ${visitas.length} visitas`,
    cuerpo: `El rastreo te ubica con: ${lista}. ${accion}`,
  };
}

// Agrupa por técnico (para mandar un aviso a cada uno).
export function visitasPorTecnico<T extends { tecnico_id: string }>(visitas: T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const visita of visitas) {
    const lista = mapa.get(visita.tecnico_id) || [];
    lista.push(visita);
    mapa.set(visita.tecnico_id, lista);
  }
  return mapa;
}

// ---------- Aviso del Resumen para supervisión ----------

// Lo que le falta a una persona: días sin reporte, visitas del rastreo sin
// reporte y justificaciones (de días o visitas) esperando autorización.
export type FaltantesDeTecnico = {
  tecnicoId: string;
  tecnico: string;
  diasSinReporte: string[];
  visitasSinReporte: { fecha: string; cliente: string }[];
  porAutorizar: number;
};

type DiaCobertura = { tecnico_id: string; tecnico: string | null; fecha: string; estado: string };
type VisitaResumida = { tecnico_id: string; tecnico: string | null; fecha: string; cliente: string; estado: string };

// Agrupa por persona lo que falta. Las mismas reglas que Cobertura: el día
// de hoy solo se cobra desde las 18:00. Ordena de quien debe más a quien menos.
export function reportesFaltantes(dias: DiaCobertura[], visitas: VisitaResumida[], hoy: string, minutosDelDia: number): FaltantesDeTecnico[] {
  const porTecnico = new Map<string, FaltantesDeTecnico>();
  function de(tecnicoId: string, nombre: string | null): FaltantesDeTecnico {
    let fila = porTecnico.get(tecnicoId);
    if (!fila) {
      fila = { tecnicoId, tecnico: nombre || 'Personal técnico', diasSinReporte: [], visitasSinReporte: [], porAutorizar: 0 };
      porTecnico.set(tecnicoId, fila);
    }
    return fila;
  }
  const yaSeCobra = (fecha: string) => fecha < hoy || (fecha === hoy && minutosDelDia >= HORA_CORTE_MIN);

  for (const dia of dias) {
    if (dia.fecha < INICIO_COBERTURA) continue;
    if (dia.estado === 'sin_reporte' && yaSeCobra(dia.fecha)) de(dia.tecnico_id, dia.tecnico).diasSinReporte.push(dia.fecha);
    if (dia.estado === 'por_autorizar') de(dia.tecnico_id, dia.tecnico).porAutorizar++;
  }
  for (const visita of visitasPendientes(visitas, hoy, minutosDelDia)) {
    de(visita.tecnico_id, visita.tecnico).visitasSinReporte.push({ fecha: visita.fecha, cliente: visita.cliente });
  }
  for (const visita of visitas) {
    if (visita.estado === 'por_autorizar') de(visita.tecnico_id, visita.tecnico).porAutorizar++;
  }

  const lista = Array.from(porTecnico.values());
  for (const fila of lista) {
    fila.diasSinReporte.sort();
    fila.visitasSinReporte.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }
  const faltan = (f: FaltantesDeTecnico) => f.diasSinReporte.length + f.visitasSinReporte.length;
  return lista.sort((a, b) => faltan(b) - faltan(a) || b.porAutorizar - a.porAutorizar || a.tecnico.localeCompare(b.tecnico));
}
