// Plazo de los proyectos: si terminaron en los días cotizados y, cuando no,
// cuántos días se agregaron y por qué (patch_plazo_proyectos.sql).
//
// Cada proyecto guarda los días con los que se programó (dias_planeados) y
// cada día agregado al ampliar guarda su motivo (ampliacion_motivo). Con eso:
//   - a tiempo:        terminó usando los días cotizados o menos;
//   - desfase propio:  algún día extra fue por causa del personal en campo
//                      (retrabajo, olvido de herramienta…);
//   - desfase externo: todos los días extra fueron por causas ajenas
//                      (permiso, clima, el cliente agregó trabajo…).
// Igual que en lib/eficiencia.ts, un día extra sin motivo cuenta como propio:
// lo ajeno hay que decirlo.
//
// Los proyectos programados antes del parche no tienen dias_planeados: salen
// como «sin medir» y no entran en ningún porcentaje.

import { Servicio } from './serviciosProgramados';
import { Origen, origenMotivo, textoMotivo } from './motivosServicio';

export type DiaPlazo = Pick<
  Servicio,
  'id' | 'grupo_id' | 'proyecto' | 'fecha' | 'numero_dia' | 'estado' | 'resultado' | 'resultado_motivo'
> & { dias_planeados?: number | null; ampliacion_motivo?: string | null };

export type EstadoPlazo = 'a_tiempo' | 'antes' | 'desfase_propio' | 'desfase_externo' | 'en_curso' | 'sin_medir';

export type PlazoProyecto = {
  grupoId: string;
  proyecto: string;
  planeados: number | null;
  // Días que sí cuentan: todos menos los cancelados.
  programados: number;
  concluidos: number;
  extra: number;
  extraPropios: number;
  extraExternos: number;
  motivosExtra: { clave: string; origen: Origen; dias: number }[];
  terminado: boolean;
  ultimaFecha: string;
  estado: EstadoPlazo;
  // El último día programado cerró con trabajo pendiente y no hay más días:
  // hay que ampliar o cerrar el proyecto. Trae el motivo que dio el técnico.
  faltaAmpliar: { motivo: string | null; diaId: string } | null;
};

export function plazoDelProyecto(diasDelGrupo: DiaPlazo[]): PlazoProyecto {
  const dias = [...diasDelGrupo].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const vigentes = dias.filter((d) => d.estado !== 'cancelado');
  const concluidos = vigentes.filter((d) => d.estado === 'concluido');
  const planeados = dias.find((d) => d.dias_planeados)?.dias_planeados ?? null;
  const programados = vigentes.length;

  // Los días extra se explican con los días agregados que siguen vigentes,
  // en orden de fecha; lo que no se alcanza a explicar cuenta como propio.
  const extra = planeados === null ? 0 : Math.max(0, programados - planeados);
  const agregados = vigentes.filter((d) => d.ampliacion_motivo).slice(0, extra);
  const porMotivo = new Map<string, { clave: string; origen: Origen; dias: number }>();
  let extraExternos = 0;
  for (const d of agregados) {
    const clave = d.ampliacion_motivo as string;
    const origen = origenMotivo(clave);
    if (origen === 'externo') extraExternos++;
    const fila = porMotivo.get(clave) || { clave, origen, dias: 0 };
    fila.dias++;
    porMotivo.set(clave, fila);
  }
  // Si el último día cerró con trabajo pendiente, el proyecto no terminó:
  // espera que lo amplíen.
  const ultimo = vigentes[vigentes.length - 1];
  const faltaAmpliar = ultimo && ultimo.estado === 'concluido' && ultimo.resultado === 'pendiente'
    ? { motivo: ultimo.resultado_motivo || null, diaId: ultimo.id }
    : null;
  const terminado = concluidos.length > 0 && concluidos.length === vigentes.length && !faltaAmpliar;

  const sinMotivo = extra - agregados.length;
  if (sinMotivo > 0) porMotivo.set('sin_motivo', { clave: 'sin_motivo', origen: 'propio', dias: sinMotivo });
  const extraPropios = extra - extraExternos;

  let estado: EstadoPlazo;
  if (planeados === null) estado = 'sin_medir';
  else if (!terminado) estado = 'en_curso';
  else if (extra === 0) estado = programados < planeados ? 'antes' : 'a_tiempo';
  else estado = extraPropios > 0 ? 'desfase_propio' : 'desfase_externo';

  return {
    grupoId: dias[0]?.grupo_id || '',
    proyecto: dias[0]?.proyecto || '',
    planeados,
    programados,
    concluidos: concluidos.length,
    extra,
    extraPropios,
    extraExternos,
    motivosExtra: [...porMotivo.values()].sort((a, b) => b.dias - a.dias),
    terminado,
    ultimaFecha: (ultimo || dias[dias.length - 1])?.fecha || '',
    estado,
    faltaAmpliar,
  };
}

// ¿Va atrasado? Compara el avance de las tareas con los días cotizados que ya
// se trabajaron: si a la mitad del plazo lleva menos del 30 %, lo más probable
// es que no alcance. El margen (20 puntos) evita alarmas por un día lento.
export const MARGEN_RIESGO_PCT = 20;

export function enRiesgo(plazo: PlazoProyecto, avancePct: number | null): boolean {
  if (plazo.terminado || plazo.planeados === null || avancePct === null) return false;
  if (plazo.faltaAmpliar) return true;
  if (plazo.concluidos === 0) return false;
  const esperadoPct = Math.min(100, (plazo.concluidos / plazo.planeados) * 100);
  return avancePct < esperadoPct - MARGEN_RIESGO_PCT;
}

export function agruparPorProyecto<T extends DiaPlazo>(dias: T[]): PlazoProyecto[] {
  const grupos = new Map<string, T[]>();
  for (const d of dias) {
    const lista = grupos.get(d.grupo_id) || [];
    lista.push(d);
    grupos.set(d.grupo_id, lista);
  }
  return [...grupos.values()].map(plazoDelProyecto);
}

export type ResumenPlazos = {
  terminados: number;
  aTiempo: number;
  antes: number;
  desfasePropio: number;
  desfaseExterno: number;
  sinMedir: number;
  // A tiempo (o antes) entre todos los terminados medidos.
  aTiempoPct: number | null;
  // Igual, pero sin contar los desfasados por causas ajenas: lo que sí
  // depende del equipo.
  cumplimientoPct: number | null;
  diasExtraPropios: number;
  diasExtraExternos: number;
  motivos: { clave: string; texto: string; origen: Origen; dias: number }[];
  desfasados: PlazoProyecto[];
};

// Proyectos terminados cuyo último día cae entre `desde` y `hasta`
// (AAAA-MM-DD, incluidos).
export function resumenPlazos(proyectos: PlazoProyecto[], desde: string, hasta: string): ResumenPlazos {
  const enPeriodo = proyectos.filter((p) => p.terminado && p.ultimaFecha >= desde && p.ultimaFecha <= hasta);
  const medidos = enPeriodo.filter((p) => p.estado !== 'sin_medir');
  const cuenta = (e: EstadoPlazo) => medidos.filter((p) => p.estado === e).length;
  const aTiempo = cuenta('a_tiempo');
  const antes = cuenta('antes');
  const desfasePropio = cuenta('desfase_propio');
  const desfaseExterno = cuenta('desfase_externo');

  const motivos = new Map<string, { clave: string; texto: string; origen: Origen; dias: number }>();
  let diasExtraPropios = 0, diasExtraExternos = 0;
  for (const p of medidos) {
    diasExtraPropios += p.extraPropios;
    diasExtraExternos += p.extraExternos;
    for (const m of p.motivosExtra) {
      const texto = m.clave === 'sin_motivo' ? 'Sin motivo' : textoMotivo(m.clave);
      const fila = motivos.get(m.clave) || { clave: m.clave, texto, origen: m.origen, dias: 0 };
      fila.dias += m.dias;
      motivos.set(m.clave, fila);
    }
  }

  const aTiempoTotal = aTiempo + antes;
  const baseJusta = aTiempoTotal + desfasePropio;
  return {
    terminados: medidos.length,
    aTiempo, antes, desfasePropio, desfaseExterno,
    sinMedir: enPeriodo.length - medidos.length,
    aTiempoPct: medidos.length > 0 ? (aTiempoTotal / medidos.length) * 100 : null,
    cumplimientoPct: baseJusta > 0 ? (aTiempoTotal / baseJusta) * 100 : null,
    diasExtraPropios, diasExtraExternos,
    motivos: [...motivos.values()].sort((a, b) => b.dias - a.dias),
    desfasados: medidos.filter((p) => p.extra > 0).sort((a, b) => b.extra - a.extra),
  };
}
