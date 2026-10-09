'use client';

import { useEffect, useMemo, useState } from 'react';
import { Coffee } from 'lucide-react';
import { leerAjustesOperacion, listarPausasEquipo } from '@/lib/serviciosProgramados';
import { hoyLocal, sumarDias, fechaLocal } from '@/lib/fechaHoy';
import { AJUSTES_POR_DEFECTO, AjustesOperacion, EventoPausa, resumenPausas, minutosTexto } from '@/lib/pausas';
import { Tarjeta } from '@/components/KpiOperativos';

// Pausas y salidas del sitio por persona en los últimos 30 días. Es solo
// informativo: no entra en el cálculo de eficiencia. Aparece cuando ya hay
// algo que mostrar.
const DIAS = 30;

export default function KpiPausas() {
  const [eventos, setEventos] = useState<EventoPausa[]>([]);
  const [ajustes, setAjustes] = useState<AjustesOperacion>(AJUSTES_POR_DEFECTO);

  useEffect(() => {
    // «Hoy» se lee ya montado (Vercel corre en UTC).
    const desde = fechaLocal(sumarDias(hoyLocal(), -(DIAS - 1))).toISOString();
    listarPausasEquipo(desde).then(setEventos).catch(() => {});
    leerAjustesOperacion().then(setAjustes).catch(() => {});
  }, []);

  const filas = useMemo(() => resumenPausas(eventos, ajustes.tolerancia_min), [eventos, ajustes.tolerancia_min]);
  if (filas.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="font-display font-semibold text-[15px] tracking-wide mb-3">Pausas y salidas del sitio · últimos {DIAS} días</h2>
      <Tarjeta titulo="Pausas del personal" Icono={Coffee} color="text-amber"
        explicacion={
          <>
            Sale de las pausas que cada quien registró en sus servicios. <b>Excedidas</b> son las que pasaron de su
            tiempo permitido más la tolerancia ({minutosTexto(ajustes.tolerancia_min)}). <b>Fuera del sitio</b> cuenta
            las veces que reanudó lejos del sitio o que la app lo detectó fuera con el servicio en curso. Es
            informativo: no cambia la eficiencia.
          </>
        }
      >
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[13px] min-w-[420px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="font-medium px-1 pb-2">Persona</th>
                <th className="font-medium px-1 pb-2 text-right">Comidas</th>
                <th className="font-medium px-1 pb-2 text-right">Promedio</th>
                <th className="font-medium px-1 pb-2 text-right">Excedidas</th>
                <th className="font-medium px-1 pb-2 text-right">Fuera del sitio</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className="border-t border-line">
                  <td className="px-1 py-2 font-medium truncate max-w-[180px]">{f.nombre}</td>
                  <td className="px-1 py-2 text-right tabular-nums">{f.comidas}</td>
                  <td className={`px-1 py-2 text-right tabular-nums ${f.comidas && f.comidaPromedio > ajustes.comida_min ? 'text-amber font-semibold' : ''}`}>
                    {f.comidas ? minutosTexto(f.comidaPromedio) : '–'}
                  </td>
                  <td className={`px-1 py-2 text-right tabular-nums ${f.excedidas ? 'text-red font-semibold' : 'text-muted'}`}>{f.excedidas}</td>
                  <td className={`px-1 py-2 text-right tabular-nums ${f.fuera ? 'text-red font-semibold' : 'text-muted'}`}>{f.fuera}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  );
}
