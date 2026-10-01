'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from './supabaseClient';
import { operar } from './borradorReporte';

// Borrador automático para cualquier formulario (cotizaciones,
// levantamientos…), en la misma base local del borrador de reportes. Lo
// capturado se guarda en el dispositivo mientras se llena; si la página se
// recarga o se cierra, al volver se recupera con un aviso. Las fotos (File)
// se guardan tal cual: IndexedDB las acepta.
//
// Mientras hay datos sin guardar también se bloquea el «jalar para
// recargar» del celular y el navegador pregunta antes de salir.

const VIGENCIA_MS = 7 * 24 * 60 * 60 * 1000;

// Para saber si algo cambió: las fotos cuentan por nombre y tamaño.
function huella(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (x instanceof Blob ? `blob:${(x as File).name || ''}:${x.size}` : x));
}

export function useBorradorFormulario<T>({
  clave,
  datos,
  hayDatos,
  aplicar,
}: {
  // Identifica el formulario: p. ej. 'cotizacion:nueva' o 'levantamiento:<id>'.
  clave: string;
  datos: T;
  hayDatos: boolean;
  aplicar: (d: T) => void;
}) {
  const [uid, setUid] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [recuperadoEn, setRecuperadoEn] = useState<number | null>(null);
  const aplicarRef = useRef(aplicar);
  aplicarRef.current = aplicar;
  const llave = uid ? `form:${clave}:${uid}` : null;

  // Leer el borrador al abrir.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const { data } = await createClient().auth.getSession();
        const id = data.session?.user.id;
        if (!id || cancelado) return;
        setUid(id);
        const b = await operar<{ guardadoEn: number; datos: T }>('readonly', (s) => s.get(`form:${clave}:${id}`));
        if (b && Date.now() - b.guardadoEn < VIGENCIA_MS && !cancelado) {
          aplicarRef.current(b.datos);
          setRecuperadoEn(b.guardadoEn);
        }
      } catch {
        // sin IndexedDB el formulario funciona igual
      } finally {
        if (!cancelado) setListo(true);
      }
    })();
    return () => { cancelado = true; };
  }, [clave]);

  // Guardar medio segundo después del último cambio.
  const h = huella(datos);
  const datosRef = useRef(datos);
  datosRef.current = datos;
  useEffect(() => {
    if (!listo || !llave) return;
    const t = setTimeout(() => {
      const accion = hayDatos
        ? operar('readwrite', (s) => s.put({ guardadoEn: Date.now(), datos: datosRef.current }, llave))
        : operar('readwrite', (s) => s.delete(llave));
      accion.catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [h, hayDatos, listo, llave]);

  // Sin recargas accidentales mientras hay datos.
  useEffect(() => {
    if (!hayDatos) return;
    const html = document.documentElement;
    const antes = html.style.overscrollBehaviorY;
    html.style.overscrollBehaviorY = 'none';
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avisar);
    return () => {
      html.style.overscrollBehaviorY = antes;
      window.removeEventListener('beforeunload', avisar);
    };
  }, [hayDatos]);

  // Al guardar en el servidor (o al descartar), se borra el borrador.
  async function limpiar() {
    setRecuperadoEn(null);
    if (llave) await operar('readwrite', (s) => s.delete(llave)).catch(() => {});
  }

  return { recuperadoEn, limpiar };
}
