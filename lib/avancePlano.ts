// Avance de la instalación sobre el plano: en qué va cada equipo (pendiente,
// con tubería, instalado, direccionado, probado), qué no se pudo instalar y
// por qué, y las cuentas para el reporte de avance. Lógica pura; se prueba
// en lib/avancePlano.test.ts. Los datos están en lib/planosDatos.ts y el
// esquema en supabase/patch_lazos_avance.sql.

import { z } from 'zod';
import { PANEL_EN_PLANO, tipoDispositivo } from './lazos';
import type { EquipoPlano, Punto } from './planos';

// En orden de obra: cada estado incluye a los anteriores.
export const ESTADOS_AVANCE = [
  { id: 'pendiente', nombre: 'Pendiente', corto: 'Pendiente', color: '#94a3b8' },
  { id: 'canalizado', nombre: 'Tubería y cable listos', corto: 'Tubería y cable', color: '#0ea5e9' },
  { id: 'instalado', nombre: 'Instalado', corto: 'Instalado', color: '#eab308' },
  { id: 'direccionado', nombre: 'Direccionado', corto: 'Direccionado', color: '#8b5cf6' },
  { id: 'probado', nombre: 'Probado y funcionando', corto: 'Probado', color: '#16a34a' },
] as const;

export type EstadoAvance = (typeof ESTADOS_AVANCE)[number]['id'];

export const COLOR_BLOQUEADO = '#dc2626';
export const MOTIVOS_BLOQUEO = ['Obra civil', 'Falta plafón', 'Falta material', 'Área sin acceso', 'Otro'] as const;
// Etapas de obra que se pueden elegir.
export const ETAPAS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export type Bloqueo = { motivo: string; nota?: string | null };

export type MarcaAvance = {
  estado: EstadoAvance;
  // «No se puede instalar»: por qué. Se quita al marcarlo instalado.
  bloqueo?: Bloqueo | null;
  // Cuándo se marcó (hora del teléfono) y quién (lo pone el servidor).
  en?: string;
  por?: string;
  nombre?: string;
};

export type AvancePlano = Record<string, MarcaAvance>;

const marcaSchema = z.object({
  estado: z.enum(['pendiente', 'canalizado', 'instalado', 'direccionado', 'probado']),
  bloqueo: z.object({ motivo: z.string().trim().min(1).max(60), nota: z.string().trim().max(300).nullish() }).nullish(),
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
export function marcaNueva(previa: MarcaAvance | undefined, cambio: { estado?: EstadoAvance; bloqueo?: Bloqueo | null }, ahora: string): MarcaAvance {
  const estado = cambio.estado || previa?.estado || 'pendiente';
  let bloqueo = cambio.bloqueo === undefined ? previa?.bloqueo || null : cambio.bloqueo;
  const yaPuesto = estado === 'instalado' || estado === 'direccionado' || estado === 'probado';
  if (cambio.estado && yaPuesto) bloqueo = null;
  return { estado, bloqueo, en: ahora };
}

// El panel no cuenta como dispositivo por instalar.
export function equiposQueCuentan(equipos: EquipoPlano[]): EquipoPlano[] {
  return equipos.filter((e) => e.tipo !== PANEL_EN_PLANO);
}

export type Cuenta = { total: number; porEstado: Record<EstadoAvance, number>; bloqueados: number };

export function cuentaVacia(): Cuenta {
  return { total: 0, porEstado: { pendiente: 0, canalizado: 0, instalado: 0, direccionado: 0, probado: 0 }, bloqueados: 0 };
}

export function contar(equipos: EquipoPlano[], avance: AvancePlano): Cuenta {
  const cuenta = cuentaVacia();
  for (const e of equiposQueCuentan(equipos)) {
    cuenta.total += 1;
    cuenta.porEstado[estadoDe(avance, e.id)] += 1;
    if (avance[e.id]?.bloqueo) cuenta.bloqueados += 1;
  }
  return cuenta;
}

export function sumar(a: Cuenta, b: Cuenta): Cuenta {
  const suma = cuentaVacia();
  suma.total = a.total + b.total;
  suma.bloqueados = a.bloqueados + b.bloqueados;
  for (const { id } of ESTADOS_AVANCE) suma.porEstado[id] = a.porEstado[id] + b.porEstado[id];
  return suma;
}

// Instalados = instalado, direccionado o probado (cada estado incluye al anterior).
export function instalados(c: Cuenta): number {
  return c.porEstado.instalado + c.porEstado.direccionado + c.porEstado.probado;
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

// Filtro del plano: por etapa ('todas', 'sin' o el número) y solo lo que falta por probar.
export type FiltroAvance = { etapa: 'todas' | 'sin' | number; soloFaltan: boolean };

export function pasaFiltro(equipo: EquipoPlano, avance: AvancePlano, filtro: FiltroAvance): boolean {
  if (filtro.etapa === 'sin' && equipo.etapa) return false;
  if (typeof filtro.etapa === 'number' && equipo.etapa !== filtro.etapa) return false;
  if (filtro.soloFaltan && estadoDe(avance, equipo.id) === 'probado') return false;
  return true;
}

// Equipos dentro del recuadro que forman dos esquinas opuestas.
export function equiposEnRecuadro(equipos: EquipoPlano[], a: Punto, b: Punto): EquipoPlano[] {
  const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
  const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  return equipos.filter((e) => e.x >= x0 && e.x <= x1 && e.y >= y0 && e.y <= y1);
}
