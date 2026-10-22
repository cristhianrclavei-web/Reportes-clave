'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as MapaLeaflet, Marker, TileLayer } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Punto } from '@/lib/geocerca';

// Mapa para marcar el punto exacto del sitio: se toca el mapa o se arrastra
// el pin. Usa Leaflet con mapas de OpenStreetMap y la vista de satélite de
// Esri (gratis, sin llave), para distinguir la entrada del edificio.

const CAPAS = {
  mapa: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    atribucion: '© OpenStreetMap',
  },
  satelite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    atribucion: '© Esri',
  },
};
type TipoCapa = keyof typeof CAPAS;

// Sin punto ni zona de trabajo se abre en el centro de México.
const CENTRO_MEXICO: Punto = { lat: 23.6345, lng: -102.5528 };

export default function MapaElegirPunto({
  punto, cerca, onElegir,
}: {
  punto: Punto | null;
  cerca?: Punto | null;
  onElegir: (punto: Punto) => void;
}) {
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<MapaLeaflet | null>(null);
  const pinRef = useRef<Marker | null>(null);
  const capaRef = useRef<TileLayer | null>(null);
  // Leaflet llama al último onElegir aunque el componente se vuelva a pintar.
  const onElegirRef = useRef(onElegir);
  onElegirRef.current = onElegir;
  const [tipoCapa, setTipoCapa] = useState<TipoCapa>('mapa');
  const [listo, setListo] = useState(false);

  // Se crea una sola vez. Leaflet se importa aquí porque usa `window` y no
  // puede cargarse en el servidor.
  useEffect(() => {
    let cancelado = false;
    import('leaflet').then((L) => {
      if (cancelado || !contenedorRef.current) return;
      const inicio = punto || cerca || CENTRO_MEXICO;
      const zoom = punto ? 17 : cerca ? 11 : 5;
      const mapa = L.map(contenedorRef.current).setView([inicio.lat, inicio.lng], zoom);
      mapaRef.current = mapa;

      // Pin dibujado con CSS: los íconos de imagen de Leaflet no se
      // encuentran al empaquetar la app.
      const icono = L.divIcon({
        className: '',
        html: '<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;background:#ef4444;border:3px solid #fff;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>',
        iconSize: [26, 26],
        iconAnchor: [13, 26],
      });
      const pin = L.marker([inicio.lat, inicio.lng], { draggable: true, icon: icono });
      pinRef.current = pin;
      if (punto) pin.addTo(mapa);

      pin.on('dragend', () => {
        const p = pin.getLatLng();
        onElegirRef.current(redondear(p.lat, p.lng));
      });
      mapa.on('click', (e) => {
        pin.setLatLng(e.latlng);
        if (!mapa.hasLayer(pin)) pin.addTo(mapa);
        onElegirRef.current(redondear(e.latlng.lat, e.latlng.lng));
      });
      setListo(true);
    });
    return () => {
      cancelado = true;
      mapaRef.current?.remove();
      mapaRef.current = null;
    };
    // Solo al montar: después el punto se sigue con el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cambio de capa (mapa o satélite).
  useEffect(() => {
    if (!listo || !mapaRef.current) return;
    import('leaflet').then((L) => {
      if (!mapaRef.current) return;
      capaRef.current?.remove();
      const capa = CAPAS[tipoCapa];
      capaRef.current = L.tileLayer(capa.url, { maxZoom: 19, attribution: capa.atribucion }).addTo(mapaRef.current);
    });
  }, [listo, tipoCapa]);

  // Si el punto cambia desde fuera (búsqueda, enlace, coordenadas), el pin
  // y el mapa lo siguen.
  useEffect(() => {
    const mapa = mapaRef.current;
    const pin = pinRef.current;
    if (!listo || !mapa || !pin || !punto) return;
    const actual = pin.getLatLng();
    if (mapa.hasLayer(pin) && actual.lat === punto.lat && actual.lng === punto.lng) return;
    pin.setLatLng([punto.lat, punto.lng]);
    if (!mapa.hasLayer(pin)) pin.addTo(mapa);
    mapa.setView([punto.lat, punto.lng], Math.max(mapa.getZoom(), 16));
  }, [listo, punto?.lat, punto?.lng]);

  return (
    <div className="mb-2.5">
      <div className="relative rounded-lg overflow-hidden border border-line">
        {/* z-0: los controles de Leaflet no deben quedar encima de los menús de la app. */}
        <div ref={contenedorRef} className="h-[280px] w-full z-0" />
        <div className="absolute top-2 right-2 z-[400] flex rounded-lg overflow-hidden border border-line-strong shadow">
          {(['mapa', 'satelite'] as TipoCapa[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipoCapa(t)}
              className={`px-2.5 min-h-[32px] text-[12px] font-semibold ${tipoCapa === t ? 'bg-teal text-inkOnAccent' : 'bg-surface text-ink/80'}`}
            >
              {t === 'mapa' ? 'Mapa' : 'Satélite'}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11.5px] text-muted mt-1">Toca el mapa donde está el sitio o arrastra el pin para afinarlo.</p>
    </div>
  );
}

// Seis decimales ≈ 10 cm: más que eso es ruido.
function redondear(lat: number, lng: number): Punto {
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}
