'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Radio } from 'lucide-react';
import type { PuntoRecorrido } from '@/lib/ubicacionTecnicos';

// Reproductor del día del técnico elegido: el marcador recorre la ruta al
// arrastrar o al darle play (20 minutos del día por segundo). «Ahora» regresa al final.

const MINUTOS_POR_PASO = 2;
const PASO_MS = 100;

function hora(ms: number): string {
  return new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export default function ReproductorDia({ recorrido, tiempo, onTiempo, esHoy }: {
  recorrido: PuntoRecorrido[];
  tiempo: number | null;
  onTiempo: (ms: number | null) => void;
  esHoy: boolean;
}) {
  const [reproduciendo, setReproduciendo] = useState(false);
  const inicio = recorrido.length ? Date.parse(recorrido[0].registrado_en) : 0;
  const fin = recorrido.length ? Date.parse(recorrido[recorrido.length - 1].registrado_en) : 0;
  const actual = tiempo ?? fin;
  const actualRef = useRef(actual);
  actualRef.current = actual;

  useEffect(() => {
    if (!reproduciendo) return;
    const intervalo = setInterval(() => {
      const siguiente = actualRef.current + MINUTOS_POR_PASO * 60000;
      if (siguiente >= fin) {
        onTiempo(null);
        setReproduciendo(false);
        return;
      }
      onTiempo(siguiente);
    }, PASO_MS);
    return () => clearInterval(intervalo);
  }, [reproduciendo, fin, onTiempo]);

  if (recorrido.length < 2) return null;

  function play() {
    // Al final, play empieza desde el inicio.
    if (!reproduciendo && actual >= fin) onTiempo(inicio);
    setReproduciendo(!reproduciendo);
  }

  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-surface/95 backdrop-blur-md border border-line shadow-diffuse px-2.5 py-2">
      <button type="button" onClick={play} aria-label={reproduciendo ? 'Pausar' : 'Reproducir el día'}
        className="w-11 h-11 shrink-0 rounded-xl bg-teal text-inkOnAccent flex items-center justify-center active:scale-95 transition-transform">
        {reproduciendo ? <Pause size={19} /> : <Play size={19} />}
      </button>
      <span className="font-mono text-[12px] text-muted shrink-0 hidden sm:inline">{hora(inicio)}</span>
      <input type="range" min={inicio} max={fin} step={60000} value={actual} aria-label="Hora del recorrido"
        onChange={(ev) => { setReproduciendo(false); const v = Number(ev.target.value); onTiempo(v >= fin ? null : v); }}
        className="flex-1 min-w-0 accent-teal h-11" />
      <span className="font-mono text-[13px] font-bold shrink-0 tabular-nums min-w-[48px] text-center">{hora(actual)}</span>
      <span className="font-mono text-[12px] text-muted shrink-0 hidden sm:inline">{hora(fin)}</span>
      {tiempo !== null && (
        <button type="button" onClick={() => { setReproduciendo(false); onTiempo(null); }}
          className="h-11 px-3 shrink-0 rounded-xl border border-line text-[12.5px] font-semibold flex items-center gap-1.5">
          <Radio size={14} /> {esHoy ? 'Ahora' : 'Final'}
        </button>
      )}
    </div>
  );
}
