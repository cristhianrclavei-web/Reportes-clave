'use client';

import 'leaflet/dist/leaflet.css';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Crosshair, ExternalLink, MapIcon, Maximize2, Minimize2, Radio, Smartphone } from 'lucide-react';
import { estadoSenal, EstadoSenal, FALTA_SQL_UBICACION } from '@/lib/ubicacionTecnicos';
import { COLOR_HISTORIAL, COLOR_SENAL, TEXTO_SENAL, horaCorta, inicialesTecnico, useMapaTecnicos } from '@/components/servicios/useMapaTecnicos';
import SelectorDiaMapa from '@/components/servicios/SelectorDiaMapa';
import { fechaLocal } from '@/lib/fechaHoy';
import BotonMotorMapa from '@/components/servicios/BotonMotorMapa';
import { enlaceGoogleMaps } from '@/components/servicios/motorMapa';

// Primera tarjeta del Resumen: el mapa con dónde está cada técnico ahora.
// Encima del mapa van el título con los conteos y, abajo, una tira con
// cada técnico (tocarlo acerca el mapa y muestra su recorrido de hoy).
// Con el selector de día se ven los días anteriores (hasta 90), sobre el
// mismo mapa: no cuenta como otra carga de Google Maps.
// «Abrir mapa» lleva a Servicios → Mapa, que usa esta misma tarjeta más alta
// (enServicios). El botón de ampliar pone el mapa en toda la pantalla.

const MAPA_COMPLETO = '/dashboard/servicios?sub=mapa';

export default function TecnicosEnCampo({ enServicios = false }: { enServicios?: boolean }) {
  const {
    contenedorRef, tecnicos, elegido, recorrido, error, cargando, ahora, enfocar, encuadrarTodos, motor, hayGoogle, cambiarMotor,
    fecha, hoy, esHoy, fechaMinima, irADia,
  } = useMapaTecnicos({ zoomControl: false });
  const elegidoDatos = tecnicos.find((t) => t.tecnico_id === elegido) || null;
  const textoDia = fecha ? fechaLocal(fecha).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }) : '';

  const cuenta: Record<EstadoSenal, number> = { en_linea: 0, reciente: 0, sin_senal: 0 };
  if (ahora !== null) {
    for (const t of tecnicos) cuenta[estadoSenal(t.registrado_en, ahora)] += 1;
  }
  const sinDatos = !cargando && !error && tecnicos.length === 0;

  // Pantalla completa con CSS (fixed) y no con la API del navegador: así
  // también funciona en iPhone. Esc la cierra en la computadora.
  const [ampliado, setAmpliado] = useState(false);
  useEffect(() => {
    if (!ampliado) return;
    function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') setAmpliado(false);
    }
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [ampliado]);

  let clasesTarjeta = 'relative mb-5 rounded-3xl border border-line overflow-hidden shadow-diffuse bg-surface';
  let clasesMapa = enServicios ? 'h-[480px] lg:h-[620px]' : 'h-[320px] lg:h-[400px]';
  if (ampliado) {
    // z-[95]: encima de las barras de la app y del botón del asistente (z-90),
    // que si no tapa los botones de zoom.
    clasesTarjeta = 'fixed inset-0 z-[95] overflow-hidden bg-surface';
    clasesMapa = 'h-full';
  }

  function textoRecorrido(): string {
    if (recorrido.length < 2) return esHoy ? 'Todavía no hay recorrido hoy' : 'Sin suficientes puntos ese día';
    const desde = horaCorta(recorrido[0].registrado_en);
    const hasta = horaCorta(recorrido[recorrido.length - 1].registrado_en);
    return esHoy ? `Recorrido de hoy desde las ${desde}` : `Recorrido de ${desde} a ${hasta}`;
  }

  // Una base sin el rastreo (por ejemplo, el demo) no muestra la tarjeta en
  // el Resumen; en Servicios → Mapa sí, con el aviso al centro.
  if (error === FALTA_SQL_UBICACION && !enServicios) return null;

  return (
    <section aria-label="Técnicos en campo" className={clasesTarjeta}>
      {/* El tamaño va en la caja de afuera: el div del mapa no debe cambiar
          de clase, porque React borraría las que le pone Leaflet.
          z-0: el mapa no debe quedar encima de los menús de la app. */}
      <div className={`${clasesMapa} w-full relative z-0`}>
        <div ref={contenedorRef} className="h-full w-full" />
      </div>

      {/* Encabezado sobre el mapa */}
      {/* z-20: siempre encima del aviso de «nadie ha compartido», para que el selector de día se pueda usar. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 lg:p-4 flex items-start justify-between gap-3">
        <div className="pointer-events-auto rounded-2xl bg-surface/90 backdrop-blur-md border border-line shadow-diffuse px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="relative flex w-2.5 h-2.5">
              {cuenta.en_linea > 0 && <span className="absolute inset-0 rounded-full bg-[#16a34a] opacity-60 animate-ping" />}
              <span className={`relative w-2.5 h-2.5 rounded-full ${cuenta.en_linea > 0 ? 'bg-[#16a34a]' : 'bg-faint'}`} />
            </span>
            <h2 className="font-display font-bold text-[17px] lg:text-[19px] tracking-wide leading-none">Técnicos en campo</h2>
          </div>
          {esHoy ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
              <Conteo color={COLOR_SENAL.en_linea} numero={cuenta.en_linea} texto="en línea" />
              {cuenta.reciente > 0 && <Conteo color={COLOR_SENAL.reciente} numero={cuenta.reciente} texto="sin puntos recientes" />}
              {cuenta.sin_senal > 0 && <Conteo color={COLOR_SENAL.sin_senal} numero={cuenta.sin_senal} texto="sin señal" />}
              {ahora !== null && <span className="text-muted">· {new Date(ahora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>}
            </div>
          ) : (
            <p className="mt-2 text-[12.5px] text-muted first-letter:uppercase">
              {textoDia} · <span className="font-semibold text-ink/85">{tecnicos.length}</span> {tecnicos.length === 1 ? 'técnico' : 'técnicos'}
            </p>
          )}
          {fecha && hoy && fechaMinima && (
            <div className="mt-2.5">
              <SelectorDiaMapa fecha={fecha} hoy={hoy} fechaMinima={fechaMinima} irADia={irADia} />
            </div>
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          {/* En el teléfono solo el ícono: el texto no cabe junto al título. */}
          <BotonMotorMapa motor={motor} hayGoogle={hayGoogle} cambiar={cambiarMotor} className="max-sm:[&>span]:hidden max-sm:w-11 max-sm:px-0 max-sm:justify-center" />
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
          <button
            type="button"
            onClick={() => setAmpliado(!ampliado)}
            aria-label={ampliado ? 'Salir de pantalla completa' : 'Ampliar a pantalla completa'}
            title={ampliado ? 'Salir de pantalla completa (Esc)' : 'Pantalla completa'}
            className="w-11 h-11 rounded-2xl bg-surface/90 backdrop-blur-md border border-line shadow-diffuse flex items-center justify-center text-ink/75 hover:text-teal hover:border-teal/50 active:scale-95 transition"
          >
            {ampliado ? <Minimize2 size={18} strokeWidth={2.2} /> : <Maximize2 size={18} strokeWidth={2.2} />}
          </button>
          {!enServicios && !ampliado && (
            <Link
              href={MAPA_COMPLETO}
              className="h-11 px-4 rounded-2xl bg-teal text-inkOnAccent text-[13.5px] font-semibold shadow-glow-teal flex items-center gap-2 hover:brightness-110 active:scale-95 transition"
            >
              <MapIcon size={16} strokeWidth={2.4} />
              <span className="hidden sm:inline">Abrir mapa</span>
            </Link>
          )}
        </div>
      </div>

      {/* Sin técnicos ese día o falta el SQL: en el celular el aviso va abajo
          (al centro tapaba el selector de día); en la computadora, al centro. */}
      {(sinDatos || error) && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-end lg:items-center justify-center p-3 lg:p-4">
          <div className="pointer-events-auto max-w-sm rounded-2xl bg-surface/95 backdrop-blur-md border border-line shadow-diffuse px-4 py-3 lg:px-5 lg:py-4 text-center">
            <Smartphone size={22} className="hidden lg:block mx-auto text-muted mb-1.5" />
            {error ? (
              <p className="text-[13.5px] font-semibold text-red">{error}</p>
            ) : (
              <>
                <p className="text-[14px] font-semibold">{esHoy ? 'Nadie ha compartido su ubicación hoy' : 'No hay ubicaciones ese día'}</p>
                <p className="text-[12.5px] text-muted mt-1">
                  {esHoy ? 'Los teléfonos de la empresa aparecen aquí en horario de trabajo.' : 'Ese día ningún teléfono con la app compartió su ubicación.'}
                </p>
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
              const color = esHoy ? COLOR_SENAL[estado] : COLOR_HISTORIAL;
              const detalle = esHoy ? `${TEXTO_SENAL[estado]} · ${horaCorta(t.registrado_en)}` : `Último punto · ${horaCorta(t.registrado_en)}`;
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
                  <span className="w-8 h-8 rounded-full text-white text-[11.5px] font-bold flex items-center justify-center ring-2 ring-white/80" style={{ background: color }}>
                    {inicialesTecnico(t.nombre)}
                  </span>
                  <span className="text-left leading-tight">
                    <span className="block text-[13px] font-semibold max-w-[150px] truncate">{t.nombre || 'Técnico'}</span>
                    <span className={`block text-[11.5px] ${activo ? 'opacity-85' : 'text-muted'}`}>
                      {detalle}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {elegidoDatos && (
            <div className="pointer-events-auto mt-2 flex flex-wrap items-center gap-2">
              <p className="inline-flex items-center gap-1.5 rounded-full bg-surface/92 backdrop-blur-md border border-line px-3 py-1 text-[12px] text-ink/80">
                <Radio size={13} className="text-teal" />
                {textoRecorrido()}
              </p>
              {/* Abre la app de Google Maps para llegar (gratis, no usa la llave). */}
              <a
                href={enlaceGoogleMaps(elegidoDatos.lat, elegidoDatos.lng)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-teal text-inkOnAccent px-3 py-1 text-[12px] font-semibold"
              >
                <ExternalLink size={13} />
                Abrir en Google Maps
              </a>
            </div>
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
