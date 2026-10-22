'use client';

import { useEffect, useRef, useState } from 'react';
import type { LayerGroup, Map as MapaLeaflet, Polyline } from 'leaflet';
import { EstadoSenal, PuntoRecorrido, UltimaUbicacion, estadoSenal, recorridoDeHoy, ultimasUbicacionesHoy } from '@/lib/ubicacionTecnicos';
import { useEnVivo } from '@/lib/useEnVivo';
import { fechaLocal, hoyLocal } from '@/lib/fechaHoy';

// Lo que comparten el mapa de Servicios → Mapa y la tarjeta del Resumen:
// carga las últimas ubicaciones (y se actualiza sola), dibuja el mapa de
// Leaflet con un pin por técnico y, al elegir uno, su recorrido de hoy.
// Quien lo usa pone `contenedorRef` en el div del mapa y arma lo demás.

export const COLOR_SENAL: Record<EstadoSenal, string> = { en_linea: '#16a34a', reciente: '#d97706', sin_senal: '#6b7280' };
export const TEXTO_SENAL: Record<EstadoSenal, string> = { en_linea: 'En línea', reciente: 'Hace unos minutos', sin_senal: 'Sin señal' };

export function horaCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export function inicialesTecnico(nombre: string | null): string {
  // Solo letras y números: el texto va dentro del HTML del pin.
  const limpio = (nombre || '').replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  const partes = limpio.split(/\s+/).filter(Boolean).slice(0, 2);
  if (partes.length === 0) return '?';
  return partes.map((p) => p[0]).join('').toUpperCase();
}

export function useMapaTecnicos({ zoomControl = true }: { zoomControl?: boolean } = {}) {
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
  // Hora de la última carga; null hasta montar (no se lee el reloj en el render).
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
      const mapa = L.map(contenedorRef.current, { zoomControl }).setView([23.6345, -102.5528], 5);
      if (!zoomControl) L.control.zoom({ position: 'bottomright' }).addTo(mapa);
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
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // El halo que late solo en los que están en línea.
        const halo = estado === 'en_linea'
          ? `<span style="position:absolute;inset:-6px;border-radius:50%;background:${COLOR_SENAL[estado]};opacity:.35;animation:pulsoTecnico 2s ease-out infinite"></span>`
          : '';
        const icono = L.divIcon({
          className: '',
          html: `<div style="position:relative;width:36px;height:36px">${halo}<div style="position:relative;width:36px;height:36px;border-radius:50%;background:${COLOR_SENAL[estado]};border:3px solid ${borde};color:#fff;font:700 12px sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,.35)">${inicialesTecnico(t.nombre)}</div></div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });
        L.marker([t.lat, t.lng], { icon: icono, title: t.nombre || '' })
          .bindTooltip(`${t.nombre || 'Técnico'} · ${horaCorta(t.registrado_en)}`)
          .on('click', () => setElegido(t.tecnico_id))
          .addTo(pines);
      }
      if (!yaEncuadreRef.current && tecnicos.length > 0) {
        yaEncuadreRef.current = true;
        encuadrarTodos();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function encuadrarTodos() {
    const mapa = mapaRef.current;
    if (!mapa || tecnicos.length === 0) return;
    if (tecnicos.length === 1) {
      mapa.setView([tecnicos[0].lat, tecnicos[0].lng], 15);
      return;
    }
    mapa.fitBounds(tecnicos.map((t) => [t.lat, t.lng] as [number, number]), { padding: [50, 50] });
  }

  // Elegir (o soltar) a un técnico y acercar el mapa a él.
  function enfocar(t: UltimaUbicacion) {
    const yaElegido = t.tecnico_id === elegido;
    setElegido(yaElegido ? null : t.tecnico_id);
    const mapa = mapaRef.current;
    if (mapa && !yaElegido) mapa.setView([t.lat, t.lng], Math.max(mapa.getZoom(), 15));
  }

  return { contenedorRef, tecnicos, elegido, recorrido, error, cargando, ahora, enfocar, encuadrarTodos };
}
