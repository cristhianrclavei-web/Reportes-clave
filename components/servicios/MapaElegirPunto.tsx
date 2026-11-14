'use client';

import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type { Punto } from '@/lib/geocerca';
import { LLAVE_GOOGLE_MAPS, prepararGoogle, soltarAvisoGoogle } from './motorMapa';
import BotonMotorMapa from './BotonMotorMapa';
import type { TipoMotor } from './useMapaTecnicos';

// Mapa para marcar el punto exacto del sitio: se toca el mapa o se arrastra
// el pin. Usa Google Maps si hay llave y, si no (o si Google falla), el mapa
// básico: Leaflet con OpenStreetMap y la vista de satélite de Esri (gratis).
// Cada vez que se abre con Google cuenta como una carga (10,000 gratis al mes).

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

// Qué mapa prefiere quien agenda (se recuerda en este aparato).
const CLAVE_PREFERENCIA = 'mapaSitioMotor';

function preferenciaGuardada(): TipoMotor {
  if (!LLAVE_GOOGLE_MAPS) return 'basico';
  try {
    if (localStorage.getItem(CLAVE_PREFERENCIA) === 'basico') return 'basico';
  } catch { /* sin almacenamiento: Google */ }
  return 'google';
}

// Lo que el componente necesita de cualquiera de los dos mapas.
type MapaSitio = {
  // Pone (o mueve) el pin y acerca el mapa a ese punto.
  verPunto(punto: Punto): void;
  ponerCapa(capa: TipoCapa): void;
  // Dibuja el aro del radio (en metros) alrededor del pin; null lo quita.
  ponerRadio(metros: number | null): void;
  destruir(): void;
};

type AlElegir = (punto: Punto) => void;

// El aro usa el color de acento de la app (cambia con el tema).
function colorDeAcento(): string {
  const valor = getComputedStyle(document.documentElement).getPropertyValue('--c-acento').trim();
  return valor ? `rgb(${valor.split(/\s+/).join(',')})` : '#0d9488';
}

// El aro crece o se encoge en un cuarto de segundo en vez de brincar: así se
// nota qué cambió al elegir otro radio. Devuelve cómo cancelar la animación.
function animarRadio(desde: number, hasta: number, poner: (metros: number) => void): () => void {
  const DURACION_MS = 250;
  const inicio = performance.now();
  let cuadro = 0;
  function paso(ahora: number) {
    const avance = Math.min(1, (ahora - inicio) / DURACION_MS);
    poner(desde + (hasta - desde) * avance);
    if (avance < 1) cuadro = requestAnimationFrame(paso);
  }
  cuadro = requestAnimationFrame(paso);
  return () => cancelAnimationFrame(cuadro);
}

// ---------- Mapa básico (Leaflet) ----------

async function crearMapaBasico(div: HTMLDivElement, inicio: Punto, zoom: number, conPin: boolean, alElegir: AlElegir): Promise<MapaSitio> {
  // Leaflet se importa aquí porque usa `window` y no puede cargarse en el servidor.
  const L = await import('leaflet');
  const mapa = L.map(div).setView([inicio.lat, inicio.lng], zoom);

  // Pin dibujado con CSS: los íconos de imagen de Leaflet no se
  // encuentran al empaquetar la app.
  const icono = L.divIcon({
    className: '',
    html: '<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;background:#ef4444;border:3px solid #fff;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>',
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  });
  const pin = L.marker([inicio.lat, inicio.lng], { draggable: true, icon: icono });
  if (conPin) pin.addTo(mapa);

  // El aro del radio. No recibe toques: tocar dentro del aro mueve el pin.
  const acento = colorDeAcento();
  const aro = L.circle([inicio.lat, inicio.lng], { radius: 1, color: acento, weight: 2.5, fillColor: acento, fillOpacity: 0.16, interactive: false });
  let radioActual: number | null = null;
  let cancelarAnimacion = () => {};

  // El aro solo se ve si hay pin y hay radio.
  function acomodarAro() {
    aro.setLatLng(pin.getLatLng());
    const visible = radioActual !== null && mapa.hasLayer(pin);
    if (visible && !mapa.hasLayer(aro)) aro.addTo(mapa);
    if (!visible && mapa.hasLayer(aro)) aro.remove();
  }
  // Acerca o aleja el mapa para que el aro completo quepa.
  function encuadrar() {
    if (radioActual === null || !mapa.hasLayer(pin)) return;
    mapa.fitBounds(pin.getLatLng().toBounds(radioActual * 2), { padding: [18, 18] });
  }

  pin.on('drag', acomodarAro);
  pin.on('dragend', () => {
    const p = pin.getLatLng();
    alElegir(redondear(p.lat, p.lng));
  });
  mapa.on('click', (e) => {
    pin.setLatLng(e.latlng);
    if (!mapa.hasLayer(pin)) pin.addTo(mapa);
    acomodarAro();
    alElegir(redondear(e.latlng.lat, e.latlng.lng));
  });

  let capaActual: ReturnType<typeof L.tileLayer> | null = null;

  return {
    verPunto(punto) {
      const actual = pin.getLatLng();
      if (mapa.hasLayer(pin) && actual.lat === punto.lat && actual.lng === punto.lng) return;
      pin.setLatLng([punto.lat, punto.lng]);
      if (!mapa.hasLayer(pin)) pin.addTo(mapa);
      acomodarAro();
      if (radioActual === null) mapa.setView([punto.lat, punto.lng], Math.max(mapa.getZoom(), 16));
      else encuadrar();
    },
    ponerRadio(metros) {
      cancelarAnimacion();
      const anterior = radioActual;
      radioActual = metros;
      acomodarAro();
      if (metros === null) return;
      if (anterior === null) aro.setRadius(metros);
      else cancelarAnimacion = animarRadio(anterior, metros, (m) => aro.setRadius(m));
      encuadrar();
    },
    ponerCapa(tipo) {
      capaActual?.remove();
      const capa = CAPAS[tipo];
      capaActual = L.tileLayer(capa.url, { maxZoom: 19, attribution: capa.atribucion }).addTo(mapa);
    },
    destruir() {
      cancelarAnimacion();
      mapa.remove();
    },
  };
}

// ---------- Google Maps ----------

async function crearMapaGoogle(div: HTMLDivElement, inicio: Punto, zoom: number, conPin: boolean, alElegir: AlElegir, siFalla: () => void): Promise<MapaSitio> {
  const google = await prepararGoogle(siFalla);
  const { Map, Circle } = await google.maps.importLibrary('maps');
  // El pin clásico de Google: el nuevo (AdvancedMarker) pide un «Map ID».
  const { Marker } = await google.maps.importLibrary('marker');

  const mapa = new Map(div, {
    center: inicio,
    zoom,
    // Mapa / Satélite con nombres de calles. Street View se cobra aparte: apagado.
    mapTypeControl: true,
    mapTypeControlOptions: { mapTypeIds: ['roadmap', 'hybrid'] },
    streetViewControl: false,
    fullscreenControl: false,
    clickableIcons: false,
  });
  const pin = new Marker({ position: inicio, draggable: true, map: conPin ? mapa : null });

  // El aro del radio. No recibe toques: tocar dentro del aro mueve el pin.
  const acento = colorDeAcento();
  const aro = new Circle({
    center: inicio, radius: 1, map: null, clickable: false,
    strokeColor: acento, strokeWeight: 2.5, strokeOpacity: 1, fillColor: acento, fillOpacity: 0.16,
  });
  let radioActual: number | null = null;
  let cancelarAnimacion = () => {};

  // El aro solo se ve si hay pin y hay radio.
  function acomodarAro() {
    aro.setCenter(pin.getPosition());
    const visible = radioActual !== null && !!pin.getMap();
    if (visible && !aro.getMap()) aro.setMap(mapa);
    if (!visible && aro.getMap()) aro.setMap(null);
  }
  // Acerca o aleja el mapa para que el aro completo quepa. Los límites se
  // piden a un círculo aparte porque el aro puede ir a media animación.
  function encuadrar() {
    if (radioActual === null || !pin.getMap()) return;
    const limites = new Circle({ center: pin.getPosition(), radius: radioActual }).getBounds();
    if (limites) mapa.fitBounds(limites, 18);
  }

  pin.addListener('drag', acomodarAro);
  pin.addListener('dragend', () => {
    const p = pin.getPosition();
    alElegir(redondear(p.lat(), p.lng()));
  });
  mapa.addListener('click', (e: any) => {
    pin.setPosition(e.latLng);
    if (!pin.getMap()) pin.setMap(mapa);
    acomodarAro();
    alElegir(redondear(e.latLng.lat(), e.latLng.lng()));
  });

  return {
    verPunto(punto) {
      const actual = pin.getPosition();
      if (pin.getMap() && actual?.lat() === punto.lat && actual?.lng() === punto.lng) return;
      pin.setPosition(punto);
      if (!pin.getMap()) pin.setMap(mapa);
      acomodarAro();
      if (radioActual === null) {
        mapa.setCenter(punto);
        mapa.setZoom(Math.max(mapa.getZoom() || 0, 16));
      } else {
        encuadrar();
      }
    },
    ponerRadio(metros) {
      cancelarAnimacion();
      const anterior = radioActual;
      radioActual = metros;
      acomodarAro();
      if (metros === null) return;
      if (anterior === null) aro.setRadius(metros);
      else cancelarAnimacion = animarRadio(anterior, metros, (m) => aro.setRadius(m));
      encuadrar();
    },
    // Google trae su propio botón de Mapa / Satélite.
    ponerCapa() {},
    destruir() {
      soltarAvisoGoogle(siFalla);
      cancelarAnimacion();
      aro.setMap(null);
      pin.setMap(null);
      div.innerHTML = '';
    },
  };
}

export default function MapaElegirPunto({
  punto, cerca, onElegir, radio,
}: {
  punto: Punto | null;
  cerca?: Punto | null;
  onElegir: (punto: Punto) => void;
  // Metros que cubre el lugar: se dibuja como un aro alrededor del pin.
  radio?: number;
}) {
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<MapaSitio | null>(null);
  // El mapa llama al último onElegir y usa el último punto aunque el
  // componente se vuelva a pintar.
  const onElegirRef = useRef(onElegir);
  onElegirRef.current = onElegir;
  const puntoRef = useRef(punto);
  puntoRef.current = punto;
  const [tipoCapa, setTipoCapa] = useState<TipoCapa>('mapa');
  // null hasta montar: la preferencia vive en el navegador.
  const [motor, setMotor] = useState<TipoMotor | null>(null);
  // Cambia cada vez que se crea un mapa, para volver a poner capa y punto.
  const [version, setVersion] = useState(0);

  useEffect(() => { setMotor(preferenciaGuardada()); }, []);

  // El mapa se crea al montar y cada vez que se cambia entre Google y el
  // básico. Si Google no carga (llave, cuota, sin señal), queda el básico.
  useEffect(() => {
    const div = contenedorRef.current;
    if (!motor || !div) return;
    let cancelado = false;
    let creado: MapaSitio | null = null;
    const pasarABasico = () => setMotor('basico');

    async function crear() {
      const actual = puntoRef.current;
      const inicio = actual || cerca || CENTRO_MEXICO;
      const zoom = actual ? 17 : cerca ? 11 : 5;
      const alElegir: AlElegir = (p) => onElegirRef.current(p);
      try {
        if (motor === 'google') {
          creado = await crearMapaGoogle(div!, inicio, zoom, !!actual, alElegir, pasarABasico);
        } else {
          creado = await crearMapaBasico(div!, inicio, zoom, !!actual, alElegir);
        }
      } catch (e) {
        if (motor === 'google') {
          console.error('Mapa del sitio: Google Maps no cargó, se usa el mapa básico', e);
          if (!cancelado) setMotor('basico');
        } else {
          console.error('Mapa del sitio: no se pudo dibujar', e);
        }
        return;
      }
      if (cancelado) {
        creado.destruir();
        return;
      }
      mapaRef.current = creado;
      setVersion((v) => v + 1);
    }
    crear();

    return () => {
      cancelado = true;
      creado?.destruir();
      mapaRef.current = null;
    };
    // `cerca` solo sirve para el primer encuadre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motor]);

  // Cambio de capa (mapa o satélite) en el mapa básico.
  useEffect(() => {
    if (version > 0) mapaRef.current?.ponerCapa(tipoCapa);
  }, [version, tipoCapa]);

  // Si el punto cambia desde fuera (búsqueda, enlace, coordenadas), el pin
  // y el mapa lo siguen.
  useEffect(() => {
    if (version > 0 && punto) mapaRef.current?.verPunto(punto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, punto?.lat, punto?.lng]);

  // El aro va después del punto: así el mapa termina encuadrado al aro.
  useEffect(() => {
    if (version > 0) mapaRef.current?.ponerRadio(radio ?? null);
  }, [version, radio]);

  function cambiarMotor() {
    const siguiente: TipoMotor = motor === 'google' ? 'basico' : 'google';
    try { localStorage.setItem(CLAVE_PREFERENCIA, siguiente); } catch { /* solo no se recuerda */ }
    setMotor(siguiente);
  }

  return (
    <div className="mb-2.5">
      <div className="relative rounded-lg overflow-hidden border border-line">
        {/* z-0: los controles del mapa no deben quedar encima de los menús de la app. */}
        <div ref={contenedorRef} className="h-[280px] w-full z-0" />
        {motor === 'basico' && (
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
        )}
        <BotonMotorMapa
          motor={motor}
          hayGoogle={!!LLAVE_GOOGLE_MAPS}
          cambiar={cambiarMotor}
          // Abajo a la izquierda va el logo de Google (no se tapa); arriba a la derecha, Mapa/Satélite del básico.
          className={`absolute z-[400] !h-9 !px-3 !text-[12px] ${motor === 'google' ? 'top-2 right-2' : 'bottom-2 left-2'}`}
        />
      </div>
      <p className="text-[11.5px] text-muted mt-1">Toca el mapa donde está el sitio o arrastra el pin para afinarlo.</p>
      {radio !== undefined && punto && (
        <p className="text-[12px] text-ink/80 mt-1 flex items-center gap-1.5">
          <span aria-hidden className="w-3.5 h-3.5 rounded-full border-2 border-teal bg-teal/20 shrink-0" />
          El aro marca lo que cubre: {textoMetros(radio)} alrededor del punto ({textoMetros(radio * 2)} de lado a lado).
        </p>
      )}
    </div>
  );
}

// Seis decimales ≈ 10 cm: más que eso es ruido.
function redondear(lat: number, lng: number): Punto {
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

// «200 m», «1 km», «1.5 km».
function textoMetros(metros: number): string {
  return metros >= 1000 ? `${metros / 1000} km` : `${metros} m`;
}
