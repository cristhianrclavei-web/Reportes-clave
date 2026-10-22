'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { MapPin, Map as IconoMapa } from 'lucide-react';
import { getCurrentLocation } from '@/lib/geolocation';
import { extraerCoordenadas, esEnlaceCortoMaps, Punto } from '@/lib/geocerca';
import {
  buscarDirecciones, buscarEnGoogle, coordenadasDeLugarGoogle, direccionDePunto, resolverEnlaceMapa, LugarGoogle, SugerenciaDireccion,
} from '@/lib/geocoding';
import { generarUUID } from '@/lib/uuid';

// El mapa solo se carga al abrirlo: Leaflet pesa y no corre en el servidor.
const MapaElegirPunto = dynamic(() => import('./MapaElegirPunto'), {
  ssr: false,
  loading: () => <div className="h-[280px] mb-2.5 rounded-lg bg-surface border border-line flex items-center justify-center text-[12px] text-muted">Cargando mapa…</div>,
});

// Ubicación de un sitio, capturada de cinco formas: escribiendo la
// dirección (con sugerencias de Google Maps, o de OpenStreetMap si Google no
// está disponible), tecleando latitud y longitud, marcándola en el
// mapa, usando la ubicación actual o pegando un enlace de Google Maps. Lo usan el alta de un
// servicio y su edición.

// Lo que hay escrito en los campos (texto, tal cual se teclea).
export type CamposUbicacion = { lat: string; lng: string; direccion: string };
export const UBICACION_VACIA: CamposUbicacion = { lat: '', lng: '', direccion: '' };

// De lo guardado en el servicio a los campos del formulario.
export function camposDeUbicacion(u: { lat: number; lng: number; direccion?: string } | null | undefined): CamposUbicacion {
  return u ? { lat: String(u.lat), lng: String(u.lng), direccion: u.direccion || '' } : UBICACION_VACIA;
}

// De los campos a lo que se guarda. `incompleta`: hay algo escrito en
// latitud o longitud pero no las dos, o no son números.
export function ubicacionDeCampos(c: CamposUbicacion): { ubicacion: { lat: number; lng: number; direccion?: string } | null; incompleta: boolean } {
  const lat = parseFloat(c.lat);
  const lng = parseFloat(c.lng);
  const hayAlgo = !!(c.lat.trim() || c.lng.trim());
  if (!c.lat.trim() || !c.lng.trim() || Number.isNaN(lat) || Number.isNaN(lng)) return { ubicacion: null, incompleta: hayAlgo };
  return { ubicacion: { lat, lng, ...(c.direccion.trim() ? { direccion: c.direccion.trim() } : {}) }, incompleta: false };
}

export default function CampoUbicacionSitio({
  valor, onCambio, cerca,
}: {
  valor: CamposUbicacion;
  onCambio: (valor: CamposUbicacion) => void;
  // Zona donde ya hay servicios: la búsqueda muestra primero lo cercano.
  cerca?: Punto | null;
}) {
  const [ubicSugerencias, setUbicSugerencias] = useState<SugerenciaDireccion[]>([]);
  const [lugaresGoogle, setLugaresGoogle] = useState<LugarGoogle[]>([]);
  // Une las sugerencias de Google con el lugar elegido (se cobra como una
  // sola búsqueda); se renueva después de elegir.
  const sesionGoogleRef = useRef(generarUUID());
  const [ubicBuscandoDireccion, setUbicBuscandoDireccion] = useState(false);
  const ubicDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ubicEnlace, setUbicEnlace] = useState('');
  const [ubicBuscando, setUbicBuscando] = useState(false);
  const [ubicResolviendoEnlace, setUbicResolviendoEnlace] = useState(false);
  const [ubicError, setUbicError] = useState<string | null>(null);
  const [mapaAbierto, setMapaAbierto] = useState(false);
  const puntoActual = ubicacionDeCampos(valor).ubicacion;

  async function handleUsarUbicacionActual() {
    setUbicBuscando(true);
    setUbicError(null);
    const loc = await getCurrentLocation();
    setUbicBuscando(false);
    if (!loc) {
      setUbicError('No se pudo obtener tu ubicación. Revisa el permiso de ubicación del navegador.');
      return;
    }
    fijarPuntoDelSitio(loc);
  }

  // Coordenadas que no vienen de la búsqueda (ubicación actual o enlace de
  // Maps): se guardan y, aparte, se averigua su dirección para llenar el
  // campo. Si no se encuentra, el campo queda vacío y el punto sirve igual.
  function fijarPuntoDelSitio(punto: { lat: number; lng: number }) {
    onCambio({ lat: String(punto.lat), lng: String(punto.lng), direccion: '' });
    setUbicSugerencias([]);
    setLugaresGoogle([]);
    setUbicBuscandoDireccion(true);
    direccionDePunto(punto)
      // Solo se escribe si mientras tanto nadie tecleó otra cosa en el campo.
      .then((direccion) => { if (direccion) onCambio({ lat: String(punto.lat), lng: String(punto.lng), direccion }); })
      .finally(() => setUbicBuscandoDireccion(false));
  }

  async function handleUsarEnlaceUbicacion() {
    const directo = extraerCoordenadas(ubicEnlace);
    if (directo) {
      setUbicError(null);
      fijarPuntoDelSitio(directo);
      return;
    }

    // Los enlaces cortos (maps.app.goo.gl) no traen coordenadas en la URL:
    // hay que resolverlos en el servidor. Cualquier otro texto sin
    // coordenadas es simplemente un texto inválido.
    if (!esEnlaceCortoMaps(ubicEnlace)) {
      setUbicError('No se encontraron coordenadas en ese texto. Pega el enlace de Google Maps o "lat, lng".');
      return;
    }

    setUbicError(null);
    setUbicResolviendoEnlace(true);
    try {
      const resultado = await resolverEnlaceMapa(ubicEnlace.trim());
      if ('error' in resultado) {
        setUbicError(resultado.error);
        return;
      }
      fijarPuntoDelSitio(resultado.punto);
    } finally {
      setUbicResolviendoEnlace(false);
    }
  }

  // Igual que escribir en el buscador de Google Maps: cada tecla dispara una
  // búsqueda con medio segundo de margen, para no mandar un request por
  // letra mientras la persona sigue escribiendo.
  function handleCambiarDireccion(texto: string) {
    onCambio({ ...valor, direccion: texto });
    setUbicError(null);
    if (ubicDebounceRef.current) clearTimeout(ubicDebounceRef.current);
    if (texto.trim().length < 3) {
      setUbicSugerencias([]);
      setLugaresGoogle([]);
      return;
    }
    ubicDebounceRef.current = setTimeout(async () => {
      setUbicBuscandoDireccion(true);
      try {
        // Primero Google (lo mismo que encuentra Google Maps); si no está
        // disponible o no encuentra nada, OpenStreetMap.
        const deGoogle = await buscarEnGoogle(texto, sesionGoogleRef.current, cerca);
        if (deGoogle && deGoogle.length > 0) {
          setLugaresGoogle(deGoogle);
          setUbicSugerencias([]);
        } else {
          setLugaresGoogle([]);
          setUbicSugerencias(await buscarDirecciones(texto, cerca));
        }
      } catch {
        setUbicSugerencias([]);
        setLugaresGoogle([]);
      } finally {
        setUbicBuscandoDireccion(false);
      }
    }, 500);
  }

  async function handleElegirLugarGoogle(lugar: LugarGoogle) {
    setLugaresGoogle([]);
    onCambio({ ...valor, direccion: lugar.direccion });
    setUbicBuscandoDireccion(true);
    const resultado = await coordenadasDeLugarGoogle(lugar.placeId, sesionGoogleRef.current);
    sesionGoogleRef.current = generarUUID();
    setUbicBuscandoDireccion(false);
    if ('error' in resultado) {
      setUbicError(resultado.error + ' Marca el punto en el mapa o intenta de nuevo.');
      return;
    }
    setUbicError(null);
    onCambio({ lat: String(resultado.punto.lat), lng: String(resultado.punto.lng), direccion: lugar.direccion });
  }

  function handleElegirSugerencia(s: SugerenciaDireccion) {
    onCambio({ lat: String(s.lat), lng: String(s.lng), direccion: s.direccion });
    setUbicSugerencias([]);
  }

  return (
    <div className="mb-1 p-3.5 rounded-xl bg-surface-2 border border-line">
      <div className="relative mb-2.5">
        <input
          placeholder="Escribe la dirección…"
          value={valor.direccion}
          onChange={(e) => handleCambiarDireccion(e.target.value)}
          className="w-full px-3 min-h-[44px] rounded-lg bg-surface border border-line focus:border-teal focus:outline-none text-[14px]"
        />
        {ubicBuscandoDireccion && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-faint">Buscando…</span>
        )}
        {lugaresGoogle.length > 0 && (
          <div className="absolute z-10 top-full left-0 right-0 mt-1 rounded-lg bg-surface border border-line-strong shadow-glow overflow-hidden">
            {lugaresGoogle.map((l) => (
              <button
                key={l.placeId}
                type="button"
                onClick={() => handleElegirLugarGoogle(l)}
                className="w-full text-left px-3 py-2.5 border-b border-line active:bg-surface-2"
              >
                <span className="block text-[13.5px] font-medium">{l.principal || l.direccion}</span>
                {l.secundario && <span className="block text-[12px] text-muted">{l.secundario}</span>}
              </button>
            ))}
            {/* Google pide decir de dónde vienen los resultados. */}
            <p className="px-3 py-1.5 text-[11px] text-faint text-right">Resultados de Google</p>
          </div>
        )}
        {ubicSugerencias.length > 0 && (
          <div className="absolute z-10 top-full left-0 right-0 mt-1 rounded-lg bg-surface border border-line-strong shadow-glow overflow-hidden">
            {ubicSugerencias.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleElegirSugerencia(s)}
                className="w-full text-left px-3 py-2.5 text-[13px] border-b border-line last:border-b-0 active:bg-surface-2"
              >
                {s.direccion}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2.5 mb-2.5">
        <input
          type="number" step="any" placeholder="Latitud" value={valor.lat}
          onChange={(e) => onCambio({ ...valor, lat: e.target.value })}
          className="w-full px-3 min-h-[44px] rounded-lg bg-surface border border-line focus:border-teal focus:outline-none text-[14px]"
        />
        <input
          type="number" step="any" placeholder="Longitud" value={valor.lng}
          onChange={(e) => onCambio({ ...valor, lng: e.target.value })}
          className="w-full px-3 min-h-[44px] rounded-lg bg-surface border border-line focus:border-teal focus:outline-none text-[14px]"
        />
      </div>
      {mapaAbierto && (
        <MapaElegirPunto
          punto={puntoActual ? { lat: puntoActual.lat, lng: puntoActual.lng } : null}
          cerca={cerca}
          onElegir={fijarPuntoDelSitio}
        />
      )}
      <button
        type="button"
        onClick={() => setMapaAbierto((v) => !v)}
        className="w-full min-h-[40px] mb-2.5 rounded-lg bg-surface border border-line text-[13px] font-medium flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
      >
        <IconoMapa size={14} strokeWidth={2.4} />
        {mapaAbierto ? 'Ocultar el mapa' : 'Marcar el punto en el mapa'}
      </button>
      <button
        type="button"
        onClick={handleUsarUbicacionActual}
        disabled={ubicBuscando}
        className="w-full min-h-[40px] mb-2.5 rounded-lg bg-surface border border-line text-[13px] font-medium flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform disabled:opacity-60"
      >
        <MapPin size={14} strokeWidth={2.4} />
        {ubicBuscando ? 'Buscando…' : 'Usar mi ubicación actual'}
      </button>
      <div className="flex gap-2">
        <input
          placeholder="O pega un enlace de Google Maps"
          value={ubicEnlace}
          onChange={(e) => setUbicEnlace(e.target.value)}
          disabled={ubicResolviendoEnlace}
          className="flex-1 min-w-0 px-3 min-h-[40px] rounded-lg bg-surface border border-line focus:border-teal focus:outline-none text-[13px] disabled:opacity-60"
        />
        <button
          type="button"
          onClick={handleUsarEnlaceUbicacion}
          disabled={ubicResolviendoEnlace}
          className="px-3.5 min-h-[40px] rounded-lg bg-surface border border-line text-[13px] font-medium shrink-0 active:scale-95 transition-transform disabled:opacity-60"
        >
          {ubicResolviendoEnlace ? 'Resolviendo…' : 'Usar'}
        </button>
      </div>
      {ubicError && <p className="text-[12px] text-red mt-2">{ubicError}</p>}
    </div>
  );
}
