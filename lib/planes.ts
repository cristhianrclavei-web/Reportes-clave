'use client';

import { useEffect, useState } from 'react';
import { createClient } from './supabaseClient';

// Paquetes de la app (ver supabase/patch_planes.sql: los módulos de cada
// plan deben coincidir con modulos_activos()).
export type Modulo =
  | 'reportes' | 'servicios' | 'ubicacion' | 'clientes'
  | 'cotizaciones' | 'almacen' | 'formatos' | 'facturacion' | 'ia';

export type PlanClave = 'campo' | 'profesional' | 'empresa';

export const PLANES: Record<PlanClave, { nombre: string; modulos: Modulo[] }> = {
  campo: { nombre: 'Campo', modulos: ['reportes', 'servicios', 'ubicacion', 'clientes'] },
  profesional: {
    nombre: 'Profesional',
    modulos: ['reportes', 'servicios', 'ubicacion', 'clientes', 'cotizaciones', 'almacen', 'formatos'],
  },
  empresa: {
    nombre: 'Empresa',
    modulos: ['reportes', 'servicios', 'ubicacion', 'clientes', 'cotizaciones', 'almacen', 'formatos', 'facturacion', 'ia'],
  },
};

export type MiPlan = {
  plan: PlanClave;
  modulos: Modulo[];
  limite_usuarios: number | null;
  usuarios_activos: number;
};

// Mientras no se sabe el plan (o si la función aún no existe en la base) se
// asume todo activo: así nada desaparece por un error de red.
export const PLAN_COMPLETO: MiPlan = { plan: 'empresa', modulos: PLANES.empresa.modulos, limite_usuarios: null, usuarios_activos: 0 };

const KEY = 'miPlan';

export function usePlan(): MiPlan {
  const [plan, setPlan] = useState<MiPlan>(PLAN_COMPLETO);

  useEffect(() => {
    try {
      const guardado = sessionStorage.getItem(KEY);
      if (guardado) {
        setPlan(JSON.parse(guardado));
        return;
      }
    } catch {
      // sin almacenamiento: se consulta
    }
    createClient()
      .rpc('mi_plan')
      .then(({ data, error }) => {
        if (error || !data) return;
        setPlan(data as MiPlan);
        try {
          sessionStorage.setItem(KEY, JSON.stringify(data));
        } catch {
          // modo privado
        }
      });
  }, []);

  return plan;
}

export function tieneModulo(plan: MiPlan, m: Modulo): boolean {
  return plan.modulos.includes(m);
}
