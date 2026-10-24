'use client';

import 'leaflet/dist/leaflet.css';
import { ChevronLeft, ChevronRight, ExternalLink, MapPin, Route, Smartphone } from 'lucide-react';
import { estadoSenal } from '@/lib/ubicacionTecnicos';
import { COLOR_HISTORIAL, COLOR_SENAL, TEXTO_SENAL, horaCorta, inicialesTecnico, useMapaTecnicos } from './useMapaTecnicos';
import { fechaLocal, sumarDias } from '@/lib/fechaHoy';
import BotonMotorMapa from './BotonMotorMapa';
import { enlaceGoogleMaps } from './motorMapa';

// Mapa de los técnicos con teléfono de la empresa (app de Android): dónde
// está cada uno ahora y, al elegir uno, su recorrido de hoy. Se actualiza
// solo cuando llega un punto nuevo. Solo hay puntos en horario de trabajo.
// Con el selector de fecha se ven los días anteriores (hasta 90 días).
// La lógica del mapa vive en useMapaTecnicos (también la usa el Resumen).

export default function MapaTecnicos() {
  const {
    contenedorRef, tecnicos, elegido, recorrido, error, cargando, ahora, enfocar, motor, hayGoogle, cambiarMotor,
    fecha, hoy, esHoy, fechaMinima, irADia,
  } = useMapaTecnicos();
  const elegidoDatos = tecnicos.find((t) => t.tecnico_id === elegido) || null;
  const textoDia = fecha ? fechaLocal(fecha).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
  const textoRecorrido = esHoy ? 'Recorrido de hoy' : `Recorrido del ${textoDia}`;

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <div className="lg:w-[280px] shrink-0 flex flex-col gap-2">
        <p className="text-[12.5px] text-muted leading-relaxed">
          Teléfonos de la empresa con la app de Android. Solo comparten la ubicación en horario de trabajo o con un servicio abierto.
        </p>
        {fecha && hoy && fechaMinima && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => irADia(sumarDias(fecha, -1))}
              disabled={fecha <= fechaMinima}
              aria-label="Día anterior"
              className="w-10 h-10 rounded-xl border border-line bg-surface flex items-center justify-center text-ink/75 disabled:opacity-35 active:scale-95 transition"
            >
              <ChevronLeft size={18} />
            </button>
            <input
              type="date"
              aria-label="Día a ver"
              value={fecha}
              min={fechaMinima}
              max={hoy}
              onChange={(e) => { if (e.target.value) irADia(e.target.value); }}
              className="flex-1 min-w-0 h-10 px-2.5 rounded-xl border border-line bg-surface text-[13.5px] font-semibold"
            />
            <button
              type="button"
              onClick={() => irADia(sumarDias(fecha, 1))}
              disabled={esHoy}
              aria-label="Día siguiente"
              className="w-10 h-10 rounded-xl border border-line bg-surface flex items-center justify-center text-ink/75 disabled:opacity-35 active:scale-95 transition"
            >
              <ChevronRight size={18} />
            </button>
            {!esHoy && (
              <button type="button" onClick={() => irADia(hoy)} className="h-10 px-3 rounded-xl bg-teal text-inkOnAccent text-[12.5px] font-semibold active:scale-95 transition">
                Hoy
              </button>
            )}
          </div>
        )}
        {!esHoy && fecha && (
          <p className="text-[12px] text-muted">Viendo el {textoDia}: último punto de cada técnico ese día. Toca uno para ver su recorrido.</p>
        )}
        {error && <p className="text-[13px] text-red font-semibold">{error}</p>}
        {!error && !cargando && tecnicos.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center">
            <Smartphone size={22} className="mx-auto text-muted mb-2" />
            <p className="text-[13.5px] font-semibold">{esHoy ? 'Todavía no hay ubicaciones hoy' : 'No hay ubicaciones ese día'}</p>
            <p className="text-[12.5px] text-muted mt-1">
              {esHoy ? 'Aparecen cuando los teléfonos con la app están en horario de trabajo.' : 'Ese día ningún teléfono con la app compartió su ubicación.'}
            </p>
          </div>
        )}
        {ahora !== null && tecnicos.map((t) => {
          const estado = estadoSenal(t.registrado_en, ahora);
          const activo = t.tecnico_id === elegido;
          const color = esHoy ? COLOR_SENAL[estado] : COLOR_HISTORIAL;
          const detalle = esHoy ? `${TEXTO_SENAL[estado]} · ${horaCorta(t.registrado_en)}` : `Último punto · ${horaCorta(t.registrado_en)}`;
          return (
            <button
              key={t.tecnico_id}
              type="button"
              onClick={() => enfocar(t)}
              aria-pressed={activo}
              className={`w-full text-left rounded-2xl border p-3 flex items-center gap-3 transition-colors ${activo ? 'border-teal bg-teal/10' : 'border-line bg-surface hover:bg-surface-2'}`}
            >
              <span className="w-9 h-9 rounded-full text-white text-[12px] font-bold flex items-center justify-center shrink-0" style={{ background: color }}>
                {inicialesTecnico(t.nombre)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold truncate">{t.nombre || 'Técnico'}</span>
                <span className="block text-[12px] text-muted">{detalle}</span>
              </span>
              <MapPin size={16} className="text-muted shrink-0" />
            </button>
          );
        })}
        {elegidoDatos && (
          <p className="text-[12.5px] text-muted flex items-center gap-1.5">
            <Route size={14} className="text-teal shrink-0" />
            {recorrido.length >= 2
              ? `${textoRecorrido}: ${recorrido.length} puntos, de ${horaCorta(recorrido[0].registrado_en)} a ${horaCorta(recorrido[recorrido.length - 1].registrado_en)}.`
              : `${textoRecorrido}: sin suficientes puntos.`}
          </p>
        )}
        {elegidoDatos && (
          <a
            href={enlaceGoogleMaps(elegidoDatos.lat, elegidoDatos.lng)}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[42px] rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold flex items-center justify-center gap-2"
          >
            <ExternalLink size={15} />
            Abrir en Google Maps
          </a>
        )}
        <BotonMotorMapa motor={motor} hayGoogle={hayGoogle} cambiar={cambiarMotor} className="justify-center" />
      </div>
      <div className="flex-1 min-w-0 rounded-2xl overflow-hidden border border-line">
        {/* z-0: los controles del mapa no deben quedar encima de los menús de la app. */}
        <div ref={contenedorRef} className="h-[420px] lg:h-[560px] w-full z-0" />
      </div>
    </div>
  );
}
