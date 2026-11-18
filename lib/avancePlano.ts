// Avance de la instalación sobre el plano: en qué va cada equipo (pendiente,
// con tubería, instalado, direccionado, probado), qué no se pudo instalar y
// por qué, y las cuentas para el reporte de avance. Lógica pura; se prueba
// en lib/avancePlano.test.ts. Los datos están en lib/planosDatos.ts y el
// esquema en supabase/patch_lazos_avance.sql.

import { z } from 'zod';
import { PANEL_EN_PLANO, tipoDispositivo } from './lazos';
import type { EquipoPlano, Punto } from './planos';

// En orden de obra: cada estado incluye a los anteriores.
// `letra`: lo que se lee en el plano y en la lista, para no depender solo del color.
export const ESTADOS_AVANCE = [
  { id: 'pendiente', nombre: 'Pendiente', corto: 'Pendiente', color: '#94a3b8', letra: 'P' },
  { id: 'canalizado', nombre: 'Tubería y cable listos', corto: 'Tubería y cable', color: '#0ea5e9', letra: 'T' },
  { id: 'instalado', nombre: 'Instalado', corto: 'Instalado', color: '#eab308', letra: 'I' },
  { id: 'direccionado', nombre: 'Direccionado', corto: 'Direccionado', color: '#8b5cf6', letra: 'D' },
  { id: 'probado', nombre: 'Probado y funcionando', corto: 'Probado', color: '#16a34a', letra: '✓' },
] as const;

export type EstadoAvance = (typeof ESTADOS_AVANCE)[number]['id'];

export const COLOR_BLOQUEADO = '#dc2626';
export const LETRA_BLOQUEADO = '✕';
// Los motivos viejos («Área sin acceso»…) siguen siendo válidos al leer.
export const MOTIVOS_BLOQUEO = ['Falta material', 'Sin acceso', 'Dañado', 'Obra civil', 'Falta plafón', 'Otro'] as const;
// Etapas de obra que se pueden elegir.
export const ETAPAS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

// `foto`: ruta en el bucket (opcional desde patch_radio_25_foto_opcional.sql).
export type Bloqueo = { motivo: string; nota?: string | null; foto?: string | null };

export type MarcaAvance = {
  estado: EstadoAvance;
  // «No se puede instalar»: por qué. Se quita al marcarlo instalado.
  bloqueo?: Bloqueo | null;
  // Opcionales al marcar: comentario y foto de evidencia.
  comentario?: string | null;
  foto?: string | null;
  // «Probado» sin pasar por «Direccionado»: el motivo que puso supervisión.
  forzado?: string | null;
  // Cuándo se marcó (hora del teléfono) y quién (lo pone el servidor).
  en?: string;
  por?: string;
  nombre?: string;
};

export type AvancePlano = Record<string, MarcaAvance>;

const marcaSchema = z.object({
  estado: z.enum(['pendiente', 'canalizado', 'instalado', 'direccionado', 'probado']),
  bloqueo: z.object({ motivo: z.string().trim().min(1).max(60), nota: z.string().trim().max(300).nullish(), foto: z.string().max(300).nullish() }).nullish(),
  comentario: z.string().max(300).nullish(),
  foto: z.string().max(300).nullish(),
  forzado: z.string().max(200).nullish(),
  en: z.string().max(40).optional(),
  por: z.string().max(40).optional(),
  nombre: z.string().max(120).optional(),
});

export const bloqueoSchema = z.object({
  motivo: z.string().trim().min(1, 'Elige el motivo.').max(60),
  nota: z.string().trim().max(300, 'Máximo 300 letras.').nullish(),
});

// Lo que viene de la base o de una copia local: lo que no se entiende se ignora.
export function leerAvance(valor: unknown): AvancePlano {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {};
  const avance: AvancePlano = {};
  for (const [id, marca] of Object.entries(valor as Record<string, unknown>)) {
    const leida = marcaSchema.safeParse(marca);
    if (leida.success) avance[id] = leida.data;
  }
  return avance;
}

// Una sola marca (del historial); null si no se entiende.
export function leerMarca(valor: unknown): MarcaAvance | null {
  const leida = marcaSchema.safeParse(valor);
  return leida.success ? leida.data : null;
}

export function estadoDe(avance: AvancePlano, equipoId: string): EstadoAvance {
  return avance[equipoId]?.estado || 'pendiente';
}

export function datosDeEstado(estado: EstadoAvance) {
  return ESTADOS_AVANCE.find((e) => e.id === estado) || ESTADOS_AVANCE[0];
}

// El color con que se pinta un equipo: rojo si está bloqueado, si no el de su estado.
export function colorDeAvance(marca: MarcaAvance | undefined): string {
  if (marca?.bloqueo) return COLOR_BLOQUEADO;
  return datosDeEstado(marca?.estado || 'pendiente').color;
}

// La marca nueva de un equipo al cambiarle el estado o el bloqueo.
// Instalarlo quita el «no se puede instalar»: ya se pudo.
export type CambioAvance = { estado?: EstadoAvance; bloqueo?: Bloqueo | null; comentario?: string | null; foto?: string | null; forzado?: string | null };

export function marcaNueva(previa: MarcaAvance | undefined, cambio: CambioAvance, ahora: string): MarcaAvance {
  const estado = cambio.estado || previa?.estado || 'pendiente';
  let bloqueo = cambio.bloqueo === undefined ? previa?.bloqueo || null : cambio.bloqueo;
  const yaPuesto = estado === 'instalado' || estado === 'direccionado' || estado === 'probado';
  if (cambio.estado && yaPuesto) bloqueo = null;
  const marca: MarcaAvance = { estado, bloqueo, en: ahora };
  if (cambio.comentario) marca.comentario = cambio.comentario;
  if (cambio.foto) marca.foto = cambio.foto;
  if (cambio.forzado) marca.forzado = cambio.forzado;
  return marca;
}

// ---------- Flujo ----------

// El paso que sigue (null si ya está probado).
export function siguienteEstado(estado: EstadoAvance): EstadoAvance | null {
  const i = ESTADOS_AVANCE.findIndex((e) => e.id === estado);
  return i >= 0 && i < ESTADOS_AVANCE.length - 1 ? ESTADOS_AVANCE[i + 1].id : null;
}

// «Probado» solo después de «Direccionado»; lo demás se puede marcar
// (también hacia atrás). Si no, supervisión lo puede autorizar con motivo.
export function necesitaAutorizacion(actual: EstadoAvance, destino: EstadoAvance): boolean {
  return destino === 'probado' && actual !== 'direccionado' && actual !== 'probado';
}

// Letra y color de un equipo en el plano y en la lista.
export function insigniaDe(marca: MarcaAvance | undefined): { letra: string; color: string; nombre: string } {
  if (marca?.bloqueo) return { letra: LETRA_BLOQUEADO, color: COLOR_BLOQUEADO, nombre: 'No se puede instalar' };
  const datos = datosDeEstado(marca?.estado || 'pendiente');
  return { letra: datos.letra, color: datos.color, nombre: datos.corto };
}

export function errorDeBloqueo(bloqueo: { motivo: string; nota: string }): string | null {
  if (!bloqueo.motivo) return 'Elige por qué no se puede instalar.';
  if (bloqueo.motivo === 'Otro' && bloqueo.nota.trim().length < 3) return 'Con «Otro», escribe qué impide instalarlo.';
  if (bloqueo.nota.trim().length > 300) return 'La nota es muy larga (máximo 300 letras).';
  return null;
}

// El panel no cuenta como dispositivo por instalar.
export function equiposQueCuentan(equipos: EquipoPlano[]): EquipoPlano[] {
  return equipos.filter((e) => e.tipo !== PANEL_EN_PLANO);
}

export type Cuenta = { total: number; porEstado: Record<EstadoAvance, number>; bloqueados: number };

export function cuentaVacia(): Cuenta {
  return { total: 0, porEstado: { pendiente: 0, canalizado: 0, instalado: 0, direccionado: 0, probado: 0 }, bloqueados: 0 };
}

// Un equipo bloqueado («no se puede instalar») cuenta solo como bloqueado,
// no en su estado: total = suma de porEstado + bloqueados.
export function contar(equipos: EquipoPlano[], avance: AvancePlano): Cuenta {
  const cuenta = cuentaVacia();
  for (const e of equiposQueCuentan(equipos)) {
    cuenta.total += 1;
    if (avance[e.id]?.bloqueo) cuenta.bloqueados += 1;
    else cuenta.porEstado[estadoDe(avance, e.id)] += 1;
  }
  return cuenta;
}

// Los dos números del avance. Lo que no se puede instalar queda fuera.
export function porcentajes(c: Cuenta): { aplicables: number; probados: number; conAvance: number; probado: number; avance: number } {
  const aplicables = c.total - c.bloqueados;
  const probados = c.porEstado.probado;
  const conAvance = aplicables - c.porEstado.pendiente;
  return { aplicables, probados, conAvance, probado: porcentaje(probados, aplicables), avance: porcentaje(conAvance, aplicables) };
}

export function sumar(a: Cuenta, b: Cuenta): Cuenta {
  const suma = cuentaVacia();
  suma.total = a.total + b.total;
  suma.bloqueados = a.bloqueados + b.bloqueados;
  for (const { id } of ESTADOS_AVANCE) suma.porEstado[id] = a.porEstado[id] + b.porEstado[id];
  return suma;
}

// Los que ya pasaron por `estado`: un equipo probado también está instalado
// y direccionado (cada estado incluye a los anteriores).
export function alMenos(c: Cuenta, estado: EstadoAvance): number {
  const desde = ESTADOS_AVANCE.findIndex((e) => e.id === estado);
  let suma = 0;
  for (const e of ESTADOS_AVANCE.slice(desde)) suma += c.porEstado[e.id];
  return suma;
}

export function instalados(c: Cuenta): number {
  return alMenos(c, 'instalado');
}

export function porcentaje(parte: number, total: number): number {
  return total === 0 ? 0 : Math.round((parte / total) * 100);
}

// Una fila por etapa (y «Sin etapa» al final si hay equipos sin asignar).
export function resumenPorEtapa(equipos: EquipoPlano[], avance: AvancePlano): { etapa: number | null; cuenta: Cuenta }[] {
  const grupos = new Map<number | null, EquipoPlano[]>();
  for (const e of equiposQueCuentan(equipos)) {
    const etapa = e.etapa || null;
    grupos.set(etapa, [...(grupos.get(etapa) || []), e]);
  }
  const etapas = [...grupos.keys()].sort((a, b) => (a === null ? 1 : b === null ? -1 : a - b));
  return etapas.map((etapa) => ({ etapa, cuenta: contar(grupos.get(etapa) || [], avance) }));
}

export function resumenPorTipo(equipos: EquipoPlano[], avance: AvancePlano): { tipo: string; nombre: string; cuenta: Cuenta }[] {
  const grupos = new Map<string, EquipoPlano[]>();
  for (const e of equiposQueCuentan(equipos)) grupos.set(e.tipo, [...(grupos.get(e.tipo) || []), e]);
  return [...grupos].map(([tipo, lista]) => ({ tipo, nombre: tipoDispositivo(tipo).nombre, cuenta: contar(lista, avance) }))
    .sort((a, b) => b.cuenta.total - a.cuenta.total);
}

export function nombreEtapa(etapa: number | null | undefined): string {
  return etapa ? `Etapa ${etapa}` : 'Sin etapa';
}

// Filtro del plano y de la lista: etapa de obra ('todas', 'sin' o el número),
// solo lo que falta por probar, estado, lazo (id), tipo y texto de dirección.
export type FiltroAvance = {
  etapa: 'todas' | 'sin' | number;
  soloFaltan: boolean;
  estado?: EstadoAvance | 'bloqueado' | null;
  lazo?: string | null;
  tipo?: string | null;
  texto?: string;
};

// `lazoDe`: el lazo del equipo (por su dispositivo ligado), para filtrar por lazo.
export function pasaFiltro(equipo: EquipoPlano, avance: AvancePlano, filtro: FiltroAvance, lazoDe?: (e: EquipoPlano) => string | null, rotulo?: string): boolean {
  if (filtro.etapa === 'sin' && equipo.etapa) return false;
  if (typeof filtro.etapa === 'number' && equipo.etapa !== filtro.etapa) return false;
  if (filtro.soloFaltan && estadoDe(avance, equipo.id) === 'probado' && !avance[equipo.id]?.bloqueo) return false;
  if (filtro.estado) {
    const bloqueado = Boolean(avance[equipo.id]?.bloqueo);
    if (filtro.estado === 'bloqueado' ? !bloqueado : bloqueado || estadoDe(avance, equipo.id) !== filtro.estado) return false;
  }
  if (filtro.lazo && lazoDe && (lazoDe(equipo) || 'sin') !== filtro.lazo) return false;
  if (filtro.tipo && equipo.tipo !== filtro.tipo) return false;
  const buscado = (filtro.texto || '').trim().toUpperCase().replace(/\s+/g, '');
  if (buscado && !(rotulo || equipo.etiqueta || '').toUpperCase().replace(/\s+/g, '').includes(buscado)) return false;
  return true;
}

// Lo que falta primero (en orden de obra: lo más atrasado arriba), luego lo
// bloqueado y al final lo probado; dentro, por dirección.
export function ordenarParaLista<T extends EquipoPlano>(equipos: T[], avance: AvancePlano, rotulo: (e: T) => string): T[] {
  const grupo = (e: T) => (avance[e.id]?.bloqueo ? 1 : estadoDe(avance, e.id) === 'probado' ? 2 : 0);
  const paso = (e: T) => ESTADOS_AVANCE.findIndex((x) => x.id === estadoDe(avance, e.id));
  return [...equipos].sort((a, b) => grupo(a) - grupo(b) || paso(a) - paso(b) || rotulo(a).localeCompare(rotulo(b), 'es', { numeric: true }));
}

// Una fila por lazo (los equipos sin dispositivo ligado van en «Sin lazo»).
export function resumenPorLazo(
  equipos: EquipoPlano[], avance: AvancePlano, lazoDe: (e: EquipoPlano) => { id: string; nombre: string } | null,
): { id: string; nombre: string; cuenta: Cuenta }[] {
  const grupos = new Map<string, { nombre: string; equipos: EquipoPlano[] }>();
  for (const e of equiposQueCuentan(equipos)) {
    const lazo = lazoDe(e) || { id: 'sin', nombre: 'Sin lazo' };
    const grupo = grupos.get(lazo.id) || { nombre: lazo.nombre, equipos: [] };
    grupo.equipos.push(e);
    grupos.set(lazo.id, grupo);
  }
  return [...grupos].map(([id, g]) => ({ id, nombre: g.nombre, cuenta: contar(g.equipos, avance) }))
    .sort((a, b) => (a.id === 'sin' ? 1 : b.id === 'sin' ? -1 : a.nombre.localeCompare(b.nombre, 'es', { numeric: true })));
}

// Equipos dentro del recuadro que forman dos esquinas opuestas.
export function equiposEnRecuadro(equipos: EquipoPlano[], a: Punto, b: Punto): EquipoPlano[] {
  const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
  const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  return equipos.filter((e) => e.x >= x0 && e.x <= x1 && e.y >= y0 && e.y <= y1);
}
