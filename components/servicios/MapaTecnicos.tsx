'use client';

import { useEffect, useRef, useState } from 'react';
import type { LayerGroup, Map as MapaLeaflet, Polyline } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Route, Smartphone } from 'lucide-react';
import { EstadoSenal, PuntoRecorrido, UltimaUbicacion, estadoSenal, recorridoDeHoy, ultimasUbicacionesHoy } from '@/lib/ubicacionTecnicos';
import { useEnVivo } from '@/lib/useEnVivo';
import { fechaLocal, hoyLocal } from '@/lib/fechaHoy';

// Mapa de los técnicos con teléfono de la empresa (app de Android): dónde
// está cada uno ahora y, al elegir uno, su recorrido de hoy. Se actualiza
// solo cuando llega un punto nuevo. Solo hay puntos en horario de trabajo.

const COLOR: Record<EstadoSenal, string> = { en_linea: '#16a34a', reciente: '#d97706', sin_senal: '#6b7280' };
const TEXTO: Record<EstadoSenal, string> = { en_linea: 'En línea', reciente: 'Hace unos minutos', sin_senal: 'Sin señal' };

function horaCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function iniciales(nombre: string | null): string {
  // Solo letras y números: el texto va dentro del HTML del pin.
  const limpio = (nombre || '').replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  const partes = limpio.split(/\s+/).filter(Boolean).slice(0, 2);
  if (partes.length === 0) return '?';
  return partes.map((p) => p[0]).join('').toUpperCase();
}

export default function MapaTecnicos() {
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<MapaLeaflet | null>(null);
  const pinesRef = useRef<LayerGroup | null>(null);
  const rutaRef = useRef<Polyline | null>(null);
  const yaEncuadreRef = useRef(false);

  const [tecnicos, setTecnicos] = useState<UltimaUbicacion[]>([]);
  const [elegido, setElegido] = useState<string | null>(null);
  const [recorrido, setRecorrido] = useState<PuntoRecorrido[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ahora, setAhora] = useState<number | null>(null);
  const [listo, setListo] = useState(false);

  async function cargar() {
    try {
      const lista = await ultimasUbicacionesHoy();
      setTecnicos(lista);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
      setAhora(Date.now());
    }
  }

  useEffect(() => { cargar(); }, []);
  useEnVivo({ tablas: ['ubicaciones_tecnicos'], alCambiar: cargar, cadaMs: 60000 });

  // Mapa: se crea una vez. Leaflet usa `window`, por eso se importa aquí.
  useEffect(() => {
    let cancelado = false;
    import('leaflet').then((L) => {
      if (cancelado || !contenedorRef.current) return;
      const mapa = L.map(contenedorRef.current).setView([23.6345, -102.5528], 5);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa);
      pinesRef.current = L.layerGroup().addTo(mapa);
      mapaRef.current = mapa;
      setListo(true);
    });
    return () => {
      cancelado = true;
      mapaRef.current?.remove();
      mapaRef.current = null;
    };
  }, []);

  // Pines: uno por técnico, con sus iniciales y el color de su señal.
  useEffect(() => {
    if (!listo || ahora === null) return;
    import('leaflet').then((L) => {
      const mapa = mapaRef.current;
      const pines = pinesRef.current;
      if (!mapa || !pines) return;
      pines.clearLayers();
      for (const t of tecnicos) {
        const estado = estadoSenal(t.registrado_en, ahora);
        const borde = t.tecnico_id === elegido ? '#111827' : '#ffffff';
        const icono = L.divIcon({
          className: '',
          html: `<div style="width:34px;height:34px;border-radius:50%;background:${COLOR[estado]};border:3px solid ${borde};color:#fff;font:700 12px sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.35)">${iniciales(t.nombre)}</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        L.marker([t.lat, t.lng], { icon: icono, title: t.nombre || '' })
          .bindTooltip(`${t.nombre || 'Técnico'} · ${horaCorta(t.registrado_en)}`)
          .on('click', () => setElegido(t.tecnico_id))
          .addTo(pines);
      }
      // La primera vez se encuadra a todos.
      if (!yaEncuadreRef.current && tecnicos.length > 0) {
        yaEncuadreRef.current = true;
        if (tecnicos.length === 1) mapa.setView([tecnicos[0].lat, tecnicos[0].lng], 15);
        else mapa.fitBounds(tecnicos.map((t) => [t.lat, t.lng] as [number, number]), { padding: [40, 40] });
      }
    });
  }, [listo, tecnicos, elegido, ahora]);

  // Recorrido de hoy del técnico elegido (se recarga con cada punto nuevo).
  useEffect(() => {
    if (!elegido) {
      setRecorrido([]);
      return;
    }
    const inicioDelDia = fechaLocal(hoyLocal()).toISOString();
    recorridoDeHoy(elegido, inicioDelDia)
      .then(setRecorrido)
      .catch((e) => setError(e.message));
  }, [elegido, tecnicos]);

  useEffect(() => {
    if (!listo) return;
    import('leaflet').then((L) => {
      const mapa = mapaRef.current;
      if (!mapa) return;
      rutaRef.current?.remove();
      rutaRef.current = null;
      if (recorrido.length < 2) return;
      rutaRef.current = L.polyline(recorrido.map((p) => [p.lat, p.lng] as [number, number]), {
        color: '#2563eb', weight: 4, opacity: 0.8,
      }).addTo(mapa);
    });
  }, [listo, recorrido]);

  function enfocar(t: UltimaUbicacion) {
    setElegido(t.tecnico_id === elegido ? null : t.tecnico_id);
    mapaRef.current?.setView([t.lat, t.lng], Math.max(mapaRef.current.getZoom(), 15));
  }

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
              <span className="w-9 h-9 rounded-full text-white text-[12px] font-bold flex items-center justify-center shrink-0" style={{ background: COLOR[estado] }}>
                {iniciales(t.nombre)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold truncate">{t.nombre || 'Técnico'}</span>
                <span className="block text-[12px] text-muted">{TEXTO[estado]} · {horaCorta(t.registrado_en)}</span>
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
