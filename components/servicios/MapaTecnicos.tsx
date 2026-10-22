'use client';

import 'leaflet/dist/leaflet.css';
import { MapPin, Route, Smartphone } from 'lucide-react';
import { estadoSenal } from '@/lib/ubicacionTecnicos';
import { COLOR_SENAL, TEXTO_SENAL, horaCorta, inicialesTecnico, useMapaTecnicos } from './useMapaTecnicos';

// Mapa de los técnicos con teléfono de la empresa (app de Android): dónde
// está cada uno ahora y, al elegir uno, su recorrido de hoy. Se actualiza
// solo cuando llega un punto nuevo. Solo hay puntos en horario de trabajo.
// La lógica del mapa vive en useMapaTecnicos (también la usa el Resumen).

export default function MapaTecnicos() {
  const { contenedorRef, tecnicos, elegido, recorrido, error, cargando, ahora, enfocar } = useMapaTecnicos();
  const elegidoDatos = tecnicos.find((t) => t.tecnico_id === elegido) || null;

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <div className="lg:w-[280px] shrink-0 flex flex-col gap-2">
        <p className="text-[12.5px] text-muted leading-relaxed">
          Teléfonos de la empresa con la app de Android. Solo comparten la ubicación en horario de trabajo o con un servicio abierto.
        </p>
        {error && <p className="text-[13px] text-red font-semibold">{error}</p>}
        {!error && !cargando && tecnicos.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center">
            <Smartphone size={22} className="mx-auto text-muted mb-2" />
            <p className="text-[13.5px] font-semibold">Todavía no hay ubicaciones hoy</p>
            <p className="text-[12.5px] text-muted mt-1">Aparecen cuando los teléfonos con la app están en horario de trabajo.</p>
          </div>
        )}
        {ahora !== null && tecnicos.map((t) => {
          const estado = estadoSenal(t.registrado_en, ahora);
          const activo = t.tecnico_id === elegido;
          return (
            <button
              key={t.tecnico_id}
              type="button"
              onClick={() => enfocar(t)}
              aria-pressed={activo}
              className={`w-full text-left rounded-2xl border p-3 flex items-center gap-3 transition-colors ${activo ? 'border-teal bg-teal/10' : 'border-line bg-surface hover:bg-surface-2'}`}
            >
              <span className="w-9 h-9 rounded-full text-white text-[12px] font-bold flex items-center justify-center shrink-0" style={{ background: COLOR_SENAL[estado] }}>
                {inicialesTecnico(t.nombre)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold truncate">{t.nombre || 'Técnico'}</span>
                <span className="block text-[12px] text-muted">{TEXTO_SENAL[estado]} · {horaCorta(t.registrado_en)}</span>
              </span>
              <MapPin size={16} className="text-muted shrink-0" />
            </button>
          );
        })}
        {elegidoDatos && (
          <p className="text-[12.5px] text-muted flex items-center gap-1.5">
            <Route size={14} className="text-teal shrink-0" />
            {recorrido.length >= 2
              ? `Recorrido de hoy: ${recorrido.length} puntos, desde las ${horaCorta(recorrido[0].registrado_en)}.`
              : 'Todavía no hay recorrido hoy.'}
          </p>
        )}
      </div>
      <div className="flex-1 min-w-0 rounded-2xl overflow-hidden border border-line">
        {/* z-0: los controles de Leaflet no deben quedar encima de los menús de la app. */}
        <div ref={contenedorRef} className="h-[420px] lg:h-[560px] w-full z-0" />
      </div>
    </div>
  );
}
