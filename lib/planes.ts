'use client';

import { useEffect, useState } from 'react';
import { createClient } from './supabaseClient';
import { PLANES, MiPlan } from './planesDatos';

// Mientras no se sabe el plan (o si la función aún no existe en la base) se
// asume todo activo: así nada desaparece por un error de red.
export const PLAN_COMPLETO: MiPlan = { plan: 'empresa', modulos: PLANES.empresa.modulos, limite_usuarios: null, usuarios_activos: 0 };

const KEY = 'miPlan';

export function usePlan(): MiPlan {
  const [plan, setPlan] = useState<MiPlan>(PLAN_COMPLETO);

  // Se muestra al instante el último plan conocido y siempre se vuelve a
  // consultar: si el plan cambia, se aplica en la siguiente carga sin tener
  // que cerrar la app.
  useEffect(() => {
    try {
      const guardado = sessionStorage.getItem(KEY);
      if (guardado) setPlan(JSON.parse(guardado));
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

