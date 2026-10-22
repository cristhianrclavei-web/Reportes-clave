'use client';

import 'leaflet/dist/leaflet.css';
import Link from 'next/link';
import { Crosshair, Maximize2, Radio, Smartphone } from 'lucide-react';
import { estadoSenal, EstadoSenal, FALTA_SQL_UBICACION } from '@/lib/ubicacionTecnicos';
import { COLOR_SENAL, TEXTO_SENAL, horaCorta, inicialesTecnico, useMapaTecnicos } from '@/components/servicios/useMapaTecnicos';

// Primera tarjeta del Resumen: el mapa con dónde está cada técnico ahora.
// Encima del mapa van el título con los conteos y, abajo, una tira con
// cada técnico (tocarlo acerca el mapa y muestra su recorrido de hoy).
// «Abrir mapa» lleva a Servicios → Mapa, con la lista completa.

const MAPA_COMPLETO = '/dashboard/servicios?sub=mapa';

export default function TecnicosEnCampo() {
  const { contenedorRef, tecnicos, elegido, recorrido, error, cargando, ahora, enfocar, encuadrarTodos } = useMapaTecnicos({ zoomControl: false });

  const cuenta: Record<EstadoSenal, number> = { en_linea: 0, reciente: 0, sin_senal: 0 };
  if (ahora !== null) {
    for (const t of tecnicos) cuenta[estadoSenal(t.registrado_en, ahora)] += 1;
  }
  const sinDatos = !cargando && !error && tecnicos.length === 0;

  // Una base sin el rastreo (por ejemplo, el demo) no muestra la tarjeta.
  if (error === FALTA_SQL_UBICACION) return null;

  return (
    <section aria-label="Técnicos en campo" className="relative mb-5 rounded-3xl border border-line overflow-hidden shadow-diffuse bg-surface">
      {/* z-0: el mapa no debe quedar encima de los menús de la app. */}
      <div ref={contenedorRef} className="h-[320px] lg:h-[400px] w-full z-0" />

      {/* Encabezado sobre el mapa */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3 lg:p-4 flex items-start justify-between gap-3">
        <div className="pointer-events-auto rounded-2xl bg-surface/90 backdrop-blur-md border border-line shadow-diffuse px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="relative flex w-2.5 h-2.5">
              {cuenta.en_linea > 0 && <span className="absolute inset-0 rounded-full bg-[#16a34a] opacity-60 animate-ping" />}
              <span className={`relative w-2.5 h-2.5 rounded-full ${cuenta.en_linea > 0 ? 'bg-[#16a34a]' : 'bg-faint'}`} />
            </span>
            <h2 className="font-display font-bold text-[17px] lg:text-[19px] tracking-wide leading-none">Técnicos en campo</h2>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
            <Conteo color={COLOR_SENAL.en_linea} numero={cuenta.en_linea} texto="en línea" />
            {cuenta.reciente > 0 && <Conteo color={COLOR_SENAL.reciente} numero={cuenta.reciente} texto="sin puntos recientes" />}
            {cuenta.sin_senal > 0 && <Conteo color={COLOR_SENAL.sin_senal} numero={cuenta.sin_senal} texto="sin señal" />}
            {ahora !== null && <span className="text-muted">· {new Date(ahora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          {tecnicos.length > 0 && (
            <button
              type="button"
              onClick={encuadrarTodos}
              aria-label="Ver a todos"
              title="Ver a todos"
              className="w-11 h-11 rounded-2xl bg-surface/90 backdrop-blur-md border border-line shadow-diffuse flex items-center justify-center text-ink/75 hover:text-teal hover:border-teal/50 active:scale-95 transition"
            >
              <Crosshair size={18} strokeWidth={2.2} />
            </button>
          )}
          <Link
            href={MAPA_COMPLETO}
            className="h-11 px-4 rounded-2xl bg-teal text-inkOnAccent text-[13.5px] font-semibold shadow-glow-teal flex items-center gap-2 hover:brightness-110 active:scale-95 transition"
          >
            <Maximize2 size={16} strokeWidth={2.4} />
            <span className="hidden sm:inline">Abrir mapa</span>
          </Link>
        </div>
      </div>

      {/* Sin técnicos hoy o falta el SQL: aviso al centro del mapa */}
      {(sinDatos || error) && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
          <div className="pointer-events-auto max-w-sm rounded-2xl bg-surface/95 backdrop-blur-md border border-line shadow-diffuse px-5 py-4 text-center">
            <Smartphone size={22} className="mx-auto text-muted mb-1.5" />
            {error ? (
              <p className="text-[13.5px] font-semibold text-red">{error}</p>
            ) : (
              <>
                <p className="text-[14px] font-semibold">Nadie ha compartido su ubicación hoy</p>
                <p className="text-[12.5px] text-muted mt-1">Los teléfonos de la empresa aparecen aquí en horario de trabajo.</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Tira de técnicos sobre el borde de abajo */}
      {ahora !== null && tecnicos.length > 0 && (
        <div className="absolute inset-x-0 bottom-0 z-10 pt-10 pb-3 px-3 lg:px-4 bg-gradient-to-t from-black/35 to-transparent pointer-events-none">
          <div className="pointer-events-auto flex gap-2 overflow-x-auto no-scrollbar pr-12">
            {tecnicos.map((t) => {
              const estado = estadoSenal(t.registrado_en, ahora);
              const activo = t.tecnico_id === elegido;
              return (
                <button
                  key={t.tecnico_id}
                  type="button"
                  onClick={() => enfocar(t)}
                  aria-pressed={activo}
                  className={`shrink-0 flex items-center gap-2.5 pl-1.5 pr-3.5 py-1.5 rounded-full border backdrop-blur-md shadow-diffuse transition ${
                    activo ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface/92 border-line hover:border-teal/50'
                  }`}
                >
                  <span className="w-8 h-8 rounded-full text-white text-[11.5px] font-bold flex items-center justify-center ring-2 ring-white/80" style={{ background: COLOR_SENAL[estado] }}>
                    {inicialesTecnico(t.nombre)}
                  </span>
                  <span className="text-left leading-tight">
                    <span className="block text-[13px] font-semibold max-w-[150px] truncate">{t.nombre || 'Técnico'}</span>
                    <span className={`block text-[11.5px] ${activo ? 'opacity-85' : 'text-muted'}`}>
                      {TEXTO_SENAL[estado]} · {horaCorta(t.registrado_en)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {elegido && (
            <p className="pointer-events-auto mt-2 inline-flex items-center gap-1.5 rounded-full bg-surface/92 backdrop-blur-md border border-line px-3 py-1 text-[12px] text-ink/80">
              <Radio size={13} className="text-teal" />
              {recorrido.length >= 2 ? `Recorrido de hoy desde las ${horaCorta(recorrido[0].registrado_en)}` : 'Todavía no hay recorrido hoy'}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Conteo({ color, numero, texto }: { color: string; numero: number; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      <span className="font-semibold tabular-nums">{numero}</span>
      <span className="text-muted">{texto}</span>
    </span>
  );
}
