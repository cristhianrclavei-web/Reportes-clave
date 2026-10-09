'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Timer } from 'lucide-react';
import { leerAjustesOperacion, guardarAjustesOperacion } from '@/lib/serviciosProgramados';
import { AJUSTES_POR_DEFECTO, AjustesOperacion, minutosTexto } from '@/lib/pausas';
import { showToast } from '@/components/Toast';

// Tiempos de pausa y de verificación. Los fija supervisión y aplican a todo
// el personal desde la siguiente pausa (las que ya están corriendo conservan
// el tiempo con el que empezaron).

const CAMPOS: { clave: keyof AjustesOperacion; texto: string; detalle: string; min: number; max: number }[] = [
  { clave: 'comida_min', texto: 'Comida', detalle: 'Minutos permitidos de comida', min: 10, max: 240 },
  { clave: 'otras_pausas_min', texto: 'Otras pausas', detalle: 'Espera del cliente, asunto personal u otro', min: 5, max: 240 },
  { clave: 'tolerancia_min', texto: 'Tolerancia', detalle: 'Minutos de más antes de avisar a supervisión', min: 0, max: 120 },
  { clave: 'verificacion_min', texto: 'Verificación', detalle: 'Minutos para responder «Estoy aquí»', min: 3, max: 60 },
];

export default function AjustesPausasSection() {
  const [abierto, setAbierto] = useState(false);
  const [guardado, setGuardado] = useState<AjustesOperacion>(AJUSTES_POR_DEFECTO);
  const [valores, setValores] = useState<Record<keyof AjustesOperacion, string>>({
    comida_min: '60', otras_pausas_min: '30', tolerancia_min: '15', verificacion_min: '10',
  });
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    leerAjustesOperacion().then((a) => {
      setGuardado(a);
      setValores({
        comida_min: String(a.comida_min), otras_pausas_min: String(a.otras_pausas_min),
        tolerancia_min: String(a.tolerancia_min), verificacion_min: String(a.verificacion_min),
      });
    }).catch(() => {});
  }, []);

  const cambio = CAMPOS.some((c) => String(guardado[c.clave]) !== valores[c.clave].trim());

  async function guardar() {
    const nuevo = { ...guardado };
    for (const c of CAMPOS) {
      const n = Number(valores[c.clave]);
      if (!Number.isInteger(n) || n < c.min || n > c.max) {
        showToast(`${c.texto}: escribe un número entre ${c.min} y ${c.max}`, 'error');
        return;
      }
      nuevo[c.clave] = n;
    }
    setGuardando(true);
    try {
      await guardarAjustesOperacion(nuevo);
      setGuardado(nuevo);
      showToast('Tiempos de pausa guardados', 'success');
    } catch (e: any) {
      showToast('No se pudo guardar: ' + (e?.message || 'error'), 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mb-4 rounded-2xl bg-surface border border-line">
      <button onClick={() => setAbierto((v) => !v)} className="w-full p-4 flex items-center justify-between gap-3 text-left">
        <span className="flex items-center gap-2.5 min-w-0">
          <Timer size={18} strokeWidth={2.3} className="text-teal shrink-0" />
          <span className="min-w-0">
            <span className="text-[14px] font-semibold block">Pausas y comida</span>
            <span className="text-[12px] text-muted">
              Comida {minutosTexto(guardado.comida_min)} · otras pausas {minutosTexto(guardado.otras_pausas_min)} · tolerancia {minutosTexto(guardado.tolerancia_min)}
            </span>
          </span>
        </span>
        <ChevronDown size={18} className={`text-muted shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-3">
            {CAMPOS.map((c) => (
              <label key={c.clave} className="block">
                <span className="text-[12.5px] font-semibold block mb-1">{c.texto}</span>
                <span className="flex items-center gap-1.5">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={c.min}
                    max={c.max}
                    value={valores[c.clave]}
                    onChange={(e) => setValores((v) => ({ ...v, [c.clave]: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px] tabular-nums"
                  />
                  <span className="text-[12.5px] text-muted shrink-0">min</span>
                </span>
                <span className="text-[11.5px] text-muted leading-snug block mt-1">{c.detalle}</span>
              </label>
            ))}
          </div>
          <p className="text-[12.5px] text-muted leading-relaxed mb-3">
            Al técnico le llega un recordatorio 10 min antes de que termine su pausa y otro al terminar. Si se pasa de la tolerancia, se le avisa de nuevo y también a supervisión. La salida por material usa el tiempo que el técnico calcule al salir.
          </p>
          <button
            onClick={guardar}
            disabled={!cambio || guardando}
            className="min-h-[44px] px-5 rounded-xl bg-teal text-inkOnAccent text-[14px] font-semibold active:scale-95 transition-transform disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Guardar tiempos'}
          </button>
        </div>
      )}
    </div>
  );
}
