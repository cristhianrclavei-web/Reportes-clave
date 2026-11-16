'use client';

// Los dos mapas que puede usar el mapa de técnicos, con las mismas
// operaciones: Google Maps (si hay llave, NEXT_PUBLIC_GOOGLE_MAPS_NAVEGADOR)
// y el mapa básico de OpenStreetMap con Leaflet (gratis, siempre disponible).
// El mapa de técnicos en campo (components/campo) elige uno y, si Google falla, cambia al básico.
//
// Costo de Google: cada vez que se crea un mapa cuenta como una carga
// (10,000 gratis al mes). Mover, hacer zoom o cambiar a satélite no cuenta.
// El tope diario se pone en Google Cloud (cuota de Maps JavaScript API).

import { CENTRO_GUADALAJARA, ZOOM_GUADALAJARA, paraEncuadrar } from '@/lib/campo';

export type TipoMotor = 'google' | 'basico';
export type PinMapa = { id: string; lat: number; lng: number; html: string; titulo: string };
// Marca informativa sobre el recorrido (paradas, inicio, fin, lugares). El
// HTML trae su propia tarjeta de detalle (clases .marca-hora en globals.css).
// `alTocar`: en vez de abrir la tarjeta (p. ej. un grupo de paradas: acerca el mapa).
export type MarcaMapa = { lat: number; lng: number; html: string; alTocar?: () => void };
export type Punto = [number, number];
// `punteada`: lo que falta por recorrer. `opacidad` baja: rutas de otros técnicos, atenuadas.
export type RutaMapa = { puntos: Punto[]; color: string; punteada?: boolean; opacidad?: number; grosor?: number };

export interface MotorMapa {
  ponerPines(pines: PinMapa[], alTocar: (id: string) => void): void;
  // Un recorrido por técnico elegido (hasta 3), cada uno con su color.
  ponerRutas(rutas: RutaMapa[]): void;
  ponerMarcas(marcas: MarcaMapa[]): void;
  // Marcador del reproductor (dónde iba a esa hora); null lo quita.
  ponerCursor(punto: Punto | null, html: string): void;
  zoom(): number;
  // Avisa cuando termina un cambio de zoom (para separar o juntar marcas).
  alCambiarZoom(cb: () => void): void;
  encuadrar(puntos: Punto[]): void;
  centrar(punto: Punto, zoomMinimo: number): void;
  ajustarTamano(): void;
  destruir(): void;
}


export const LLAVE_GOOGLE_MAPS = process.env.NEXT_PUBLIC_GOOGLE_MAPS_NAVEGADOR || '';

// Tarjetas de detalle de las marcas: solo una abierta a la vez. Tocar otra
// marca cierra la anterior, la × la cierra y tocar el mapa las cierra todas.
function cerrarDetalles(contenedor: HTMLElement) {
  contenedor.querySelectorAll('.marca-hora.abierta').forEach((m) => m.classList.remove('abierta'));
}

function tocarMarca(contenedor: HTMLElement, marca: Element | null | undefined, objetivo: EventTarget | null) {
  if (!marca) return;
  const tocado = objetivo instanceof Element ? objetivo : null;
  if (tocado?.closest('.marca-hora-cerrar')) {
    marca.classList.remove('abierta');
    marca.classList.add('sin-hover');
    marca.addEventListener('mouseleave', () => marca.classList.remove('sin-hover'), { once: true });
    return;
  }
  // Tocar dentro de la tarjeta (por ejemplo, para copiar las coordenadas) no la cierra.
  if (tocado?.closest('.marca-hora-detalle')) return;
  const estabaAbierta = marca.classList.contains('abierta');
  cerrarDetalles(contenedor);
  if (!estabaAbierta) marca.classList.add('abierta');
}

// ---------- Mapa básico (Leaflet + OpenStreetMap) ----------

export async function crearMotorBasico(div: HTMLDivElement, zoomControl: boolean): Promise<MotorMapa> {
  const L = await import('leaflet');
  const mapa = L.map(div, { zoomControl }).setView(CENTRO_GUADALAJARA, ZOOM_GUADALAJARA);
  if (!zoomControl) L.control.zoom({ position: 'bottomright' }).addTo(mapa);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa);
  const pines = L.layerGroup().addTo(mapa);
  const marcasCapa = L.layerGroup().addTo(mapa);
  mapa.on('click', () => cerrarDetalles(div));
  let ruta: ReturnType<typeof L.layerGroup> | null = null;
  let cursor: ReturnType<typeof L.marker> | null = null;

  return {
    ponerPines(lista, alTocar) {
      pines.clearLayers();
      for (const p of lista) {
        const icono = L.divIcon({ className: '', html: p.html, iconSize: [40, 40], iconAnchor: [20, 20] });
        L.marker([p.lat, p.lng], { icon: icono, title: p.titulo })
          .bindTooltip(p.titulo)
          .on('click', () => alTocar(p.id))
          .addTo(pines);
      }
    },
    ponerMarcas(marcas) {
      marcasCapa.clearLayers();
      for (const m of marcas) {
        const icono = L.divIcon({ className: '', html: m.html, iconSize: [0, 0], iconAnchor: [0, 0] });
        const marca = L.marker([m.lat, m.lng], { icon: icono, zIndexOffset: 500, keyboard: false });
        // Encima de lo demás mientras se ve su detalle; tocarla lo deja abierto (celular).
        marca.on('mouseover', () => marca.setZIndexOffset(3000));
        marca.on('mouseout', () => marca.setZIndexOffset(500));
        marca.on('click', (e) => (m.alTocar ? m.alTocar() : tocarMarca(div, marca.getElement()?.querySelector('.marca-hora'), e.originalEvent.target)));
        marca.addTo(marcasCapa);
      }
    },
    ponerRutas(lista) {
      ruta?.remove();
      // Borde blanco debajo de cada línea de color: se lee sobre calles y satélite.
      const lineas = lista.filter((r) => r.puntos.length >= 2).flatMap((r) => {
        const grosor = r.grosor ?? 4.5;
        const opacidad = r.opacidad ?? 0.95;
        if (r.punteada) return [L.polyline(r.puntos, { color: r.color, weight: grosor - 1, opacity: opacidad, dashArray: '2 9', lineCap: 'round' })];
        return [
          L.polyline(r.puntos, { color: '#ffffff', weight: grosor + 3.5, opacity: 0.9 * opacidad, lineCap: 'round', lineJoin: 'round' }),
          L.polyline(r.puntos, { color: r.color, weight: grosor, opacity: opacidad, lineCap: 'round', lineJoin: 'round' }),
        ];
      });
      ruta = L.layerGroup(lineas).addTo(mapa);
    },
    ponerCursor(punto, html) {
      cursor?.remove();
      cursor = null;
      if (!punto) return;
      const icono = L.divIcon({ className: '', html, iconSize: [40, 40], iconAnchor: [20, 20] });
      cursor = L.marker(punto, { icon: icono, zIndexOffset: 4000, keyboard: false }).addTo(mapa);
    },
    zoom() {
      return mapa.getZoom();
    },
    alCambiarZoom(cb) {
      mapa.on('zoomend', cb);
    },
    encuadrar(todos) {
      const puntos = paraEncuadrar(todos);
      if (puntos.length === 0) return;
      if (puntos.length === 1) {
        mapa.setView(puntos[0], 15);
        return;
      }
      const ajustar = () => mapa.fitBounds(puntos, { padding: [50, 50] });
      // Si el mapa todavía se está acercando (al elegir a alguien), Leaflet
      // ignora el nuevo encuadre: se espera a que termine.
      if ((mapa as any)._animatingZoom) mapa.once('zoomend', ajustar);
      else ajustar();
    },
    centrar(punto, zoomMinimo) {
      mapa.setView(punto, Math.max(mapa.getZoom(), zoomMinimo));
    },
    ajustarTamano() {
      mapa.invalidateSize();
    },
    destruir() {
      mapa.remove();
    },
  };
}

// ---------- Google Maps ----------

// Google se carga una sola vez por página. Si la llave no sirve (o la cuenta
// no tiene facturación), Google llama a window.gm_authFailure.
let cargaGoogle: Promise<void> | null = null;
let alFallarGoogle: (() => void) | null = null;

function cargarGoogle(): Promise<void> {
  if (cargaGoogle) return cargaGoogle;
  cargaGoogle = new Promise((resolver, rechazar) => {
    const w = window as any;
    w.gm_authFailure = () => {
      rechazar(new Error('Google Maps rechazó la llave'));
      alFallarGoogle?.();
    };
    w.__claveGoogleListo = () => resolver();
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(LLAVE_GOOGLE_MAPS)}&v=weekly&loading=async&language=es&region=MX&callback=__claveGoogleListo`;
    script.async = true;
    script.onerror = () => rechazar(new Error('No se pudo descargar Google Maps'));
    document.head.appendChild(script);
  });
  // Si falló, el siguiente intento vuelve a probar.
  cargaGoogle.catch(() => { cargaGoogle = null; });
  return cargaGoogle;
}

// Carga Google y devuelve su espacio de nombres (sin los tipos de Google
// instalados: `any`). `siFalla` se llama si Google rechaza la llave después
// de dibujar el mapa. Lo usan este mapa y el de elegir el punto del sitio.
export async function prepararGoogle(siFalla: () => void): Promise<any> {
  await cargarGoogle();
  alFallarGoogle = siFalla;
  return (window as any).google;
}

// Al quitar un mapa de Google ya no hay que avisarle si la llave falla.
export function soltarAvisoGoogle(siFalla: () => void) {
  if (alFallarGoogle === siFalla) alFallarGoogle = null;
}

export async function crearMotorGoogle(div: HTMLDivElement, zoomControl: boolean, siFalla: () => void): Promise<MotorMapa> {
  const google = await prepararGoogle(siFalla);
  const { Map, OverlayView, Polyline } = await google.maps.importLibrary('maps');
  // LatLngBounds no viene en la librería «maps» sino en la base (google.maps),
  // que ya está cargada: tomarlo de «maps» daba «is not a constructor».
  const { LatLngBounds } = google.maps;

  const mapa = new Map(div, {
    center: { lat: CENTRO_GUADALAJARA[0], lng: CENTRO_GUADALAJARA[1] },
    zoom: ZOOM_GUADALAJARA,
    zoomControl,
    // Mapa / Satélite. Street View se cobra aparte: apagado.
    mapTypeControl: true,
    streetViewControl: false,
    fullscreenControl: false,
    clickableIcons: false,
  });
  mapa.addListener('click', () => cerrarDetalles(div));

  // Pin con HTML propio (las iniciales y el color de la señal), igual que en
  // el mapa básico. Los marcadores nuevos de Google piden un «Map ID».
  class PinHtml extends OverlayView {
    caja: HTMLDivElement;
    posicion: any;
    constructor(p: PinMapa, alTocar: (id: string) => void) {
      super();
      this.posicion = new google.maps.LatLng(p.lat, p.lng);
      this.caja = document.createElement('div');
      this.caja.style.position = 'absolute';
      this.caja.style.cursor = 'pointer';
      this.caja.title = p.titulo;
      this.caja.innerHTML = p.html;
      this.caja.addEventListener('click', () => alTocar(p.id));
      OverlayView.preventMapHitsAndGesturesFrom(this.caja);
    }
    onAdd() {
      this.getPanes().overlayMouseTarget.appendChild(this.caja);
    }
    draw() {
      const pixel = this.getProjection().fromLatLngToDivPixel(this.posicion);
      if (!pixel) return;
      // El pin mide 40 px: se ancla por su centro.
      this.caja.style.left = `${pixel.x - 20}px`;
      this.caja.style.top = `${pixel.y - 20}px`;
    }
    onRemove() {
      this.caja.remove();
    }
  }

  // Marca cada 10 minutos: el HTML se acomoda solo sobre el punto (ver .marca-hora).
  class MarcaHtml extends OverlayView {
    caja: HTMLDivElement;
    posicion: any;
    constructor(m: MarcaMapa) {
      super();
      this.posicion = new google.maps.LatLng(m.lat, m.lng);
      this.caja = document.createElement('div');
      this.caja.style.position = 'absolute';
      this.caja.style.zIndex = '1';
      this.caja.innerHTML = m.html;
      this.caja.addEventListener('mouseenter', () => { this.caja.style.zIndex = '10'; });
      this.caja.addEventListener('mouseleave', () => { this.caja.style.zIndex = '1'; });
      this.caja.addEventListener('click', (e) => (m.alTocar ? m.alTocar() : tocarMarca(div, this.caja.querySelector('.marca-hora'), e.target)));
      OverlayView.preventMapHitsAndGesturesFrom(this.caja);
    }
    onAdd() {
      this.getPanes().floatPane.appendChild(this.caja);
    }
    draw() {
      const pixel = this.getProjection().fromLatLngToDivPixel(this.posicion);
      if (!pixel) return;
      this.caja.style.left = `${pixel.x}px`;
      this.caja.style.top = `${pixel.y}px`;
    }
    onRemove() {
      this.caja.remove();
    }
  }

  let pines: PinHtml[] = [];
  let marcas: MarcaHtml[] = [];
  let rutas: any[] = [];
  let cursor: PinHtml | null = null;

  return {
    ponerPines(lista, alTocar) {
      for (const pin of pines) pin.setMap(null);
      pines = lista.map((p) => {
        const pin = new PinHtml(p, alTocar);
        pin.setMap(mapa);
        return pin;
      });
    },
    ponerMarcas(lista) {
      for (const m of marcas) m.setMap(null);
      marcas = lista.map((m) => {
        const marca = new MarcaHtml(m);
        marca.setMap(mapa);
        return marca;
      });
    },
    ponerRutas(lista) {
      for (const r of rutas) r.setMap(null);
      // Borde blanco debajo de cada línea de color, igual que en el mapa básico.
      rutas = lista.filter((r) => r.puntos.length >= 2).flatMap((r) => {
        const path = r.puntos.map(([lat, lng]) => ({ lat, lng }));
        const grosor = r.grosor ?? 4.5;
        const opacidad = r.opacidad ?? 0.95;
        if (r.punteada) {
          // Línea punteada: Google la dibuja con un símbolo que se repite.
          const punto = { path: 'M 0,-1 0,1', strokeOpacity: opacidad, strokeColor: r.color, scale: grosor - 1.5 };
          return [new Polyline({ path, strokeOpacity: 0, icons: [{ icon: punto, offset: '0', repeat: '12px' }], map: mapa })];
        }
        return [
          new Polyline({ path, strokeColor: '#ffffff', strokeWeight: grosor + 3.5, strokeOpacity: 0.9 * opacidad, map: mapa }),
          new Polyline({ path, strokeColor: r.color, strokeWeight: grosor, strokeOpacity: opacidad, map: mapa }),
        ];
      });
    },
    ponerCursor(punto, html) {
      cursor?.setMap(null);
      cursor = null;
      if (!punto) return;
      cursor = new PinHtml({ id: 'cursor', lat: punto[0], lng: punto[1], html, titulo: '' }, () => {});
      cursor.caja.style.zIndex = '50';
      cursor.setMap(mapa);
    },
    zoom() {
      return mapa.getZoom() || ZOOM_GUADALAJARA;
    },
    alCambiarZoom(cb) {
      mapa.addListener('zoom_changed', cb);
    },
    encuadrar(todos) {
      const puntos = paraEncuadrar(todos);
      if (puntos.length === 0) return;
      if (puntos.length === 1) {
        mapa.setCenter({ lat: puntos[0][0], lng: puntos[0][1] });
        mapa.setZoom(15);
        return;
      }
      const limites = new LatLngBounds();
      for (const [lat, lng] of puntos) limites.extend({ lat, lng });
      mapa.fitBounds(limites, 50);
    },
    centrar([lat, lng], zoomMinimo) {
      mapa.setCenter({ lat, lng });
      mapa.setZoom(Math.max(mapa.getZoom() || 0, zoomMinimo));
    },
    // Google Maps se acomoda solo cuando cambia el tamaño de su caja.
    ajustarTamano() {},
    destruir() {
      soltarAvisoGoogle(siFalla);
      for (const pin of pines) pin.setMap(null);
      for (const m of marcas) m.setMap(null);
      for (const r of rutas) r.setMap(null);
      cursor?.setMap(null);
      div.innerHTML = '';
    },
  };
}

// Enlace que abre la ubicación en la app de Google Maps (gratis: no usa la llave).
export function enlaceGoogleMaps(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
