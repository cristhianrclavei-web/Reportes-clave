'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MARCA } from '@/lib/marca';
import {
  Sparkles, X, Mic, MicOff, Square, SendHorizontal, Volume2, VolumeX, History, ChevronLeft, ChevronRight,
  ImagePlus, AudioLines, SquarePen, Settings2,
} from 'lucide-react';

// Chat del asistente de IA. Botón flotante que aparece únicamente si
// /api/asistente dice que está disponible para quien tiene la sesión:
// instalación con la llave configurada, paquete con el módulo `ia` y cuenta
// activa.
//
// Voz, toda con lo que trae el navegador (sin costo ni servicio externo):
//   · Dictar la pregunta: SpeechRecognition. Existe en Chrome (Android y
//     computadora); donde no existe el micrófono no se muestra y queda el
//     dictado del teclado del teléfono.
//   · Leer la respuesta: speechSynthesis, opcional y recordado por equipo.
//   · Conversación por voz: las dos encadenadas — escucha, manda, lee la
//     respuesta y vuelve a escuchar — hasta que se cierra.
//
// Historial: cada pregunta y respuesta queda en el servidor (asistente_uso).
// El chat muestra la conversación de hoy y los días anteriores se consultan
// aparte, para que la pantalla no se llene.

type Mensaje = { rol: 'user' | 'assistant'; texto: string; error?: boolean; fotos?: number };
type Adjunto = { tipo: 'image/jpeg'; datos: string; vista: string };
type DiaHistorial = { dia: string; mensajes: number };
type EstadoVoz = 'escuchando' | 'pensando' | 'hablando' | 'pausa';

// Pantallas sin sesión, y el formulario del reporte (ahí el botón estorbaría
// sobre las firmas y los botones de avanzar).
const SIN_CHAT = ['/login', '/firmar', '/verificar', '/restablecer', '/aviso-privacidad', '/nuevo'];

const SUGERENCIAS: Record<'supervisor' | 'tecnico', string[]> = {
  supervisor: [
    '¿Qué servicios hay hoy y quién está asignado?',
    'Ayúdame a programar un servicio',
    'Ayúdame a armar una cotización',
  ],
  tecnico: [
    '¿Qué servicios tengo hoy y mañana?',
    '¿Qué material llevo en mi vale?',
    '¿Qué reportes hice esta semana?',
  ],
};

// [texto](/ruta) para pantallas de la app y [sitio](https://…) para fuentes
// de internet. Ningún otro esquema (javascript:, data:) llega a ser enlace.
const ENLACE = /\[([^\]\n]+)\]\((\/(?!\/)[^)\s]*|https:\/\/[^)\s]+)\)/g;

// Texto de la respuesta con los enlaces como vínculos. Son <a> normales
// (recarga completa) a propósito: las listas de reportes abren el detalle al
// cargar, y así funciona aunque ya se esté en esa pantalla.
function conEnlaces(t: string) {
  const partes: React.ReactNode[] = [];
  let ultimo = 0;
  for (const m of t.matchAll(ENLACE)) {
    if (m.index > ultimo) partes.push(t.slice(ultimo, m.index));
    partes.push(
      <a
        key={m.index} href={m[2]}
        {...(m[2].startsWith('/') ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
        className="text-teal font-medium underline underline-offset-2"
      >
        {m[1]}
      </a>,
    );
    ultimo = m.index + m[0].length;
  }
  if (ultimo < t.length) partes.push(t.slice(ultimo));
  return partes;
}

const AVISOS_VOZ: Record<string, string> = {
  'not-allowed': 'El navegador no tiene permiso para usar el micrófono. Actívalo en el candado de la barra de direcciones.',
  'service-not-allowed': 'El dictado no está disponible en este navegador. Usa el micrófono del teclado.',
  'no-speech': 'No te escuché. Toca el micrófono y habla de nuevo.',
  'audio-capture': 'No se encontró un micrófono en este equipo.',
  network: 'El dictado necesita conexión a internet.',
};

// Nombre del asistente: las iniciales de la marca de la instalación (CI-BOT
// en Clave Inteligente).
const NOMBRE = `${MARCA.iniciales}-BOT`;

// La bienvenida solo promete lo que el asistente hace hoy para cada rol.
const BIENVENIDA: Record<'supervisor' | 'tecnico', string> = {
  supervisor: 'Estoy aquí para ayudarte con información de reportes, servicios y almacén, y para programar servicios y armar cotizaciones.',
  tecnico: 'Estoy aquí para ayudarte con tus servicios, reportes y material, y a preparar tu trabajo.',
};
const SEGUNDOS_BIENVENIDA = 5;
const K_BIENVENIDA = 'asistenteBienvenida';

const K_CHARLA = 'asistenteCharla';
const K_VOZ = 'asistenteVoz';
// Voz elegida para leer (voiceURI del navegador) y desde cuándo cuenta la
// conversación de hoy («Conversación nueva» no borra el historial: solo deja
// de mostrar y de mandar al modelo lo anterior).
const K_VOZ_ELEGIDA = 'asistenteVozElegida';
const K_DESDE = 'asistenteDesde';

const MAX_FOTOS = 3;
const LADO_FOTO = 1280;

// Lo que se lee en voz alta no debe llevar los signos de formato ni rutas.
function paraVoz(t: string): string {
  return t.replace(ENLACE, '$1').replace(/\*\*/g, '').replace(/^\s*[-•]\s*/gm, '').replace(/[#_`]/g, '');
}

// Foto → JPEG de lado máximo 1280 px en base64. Una foto de celular queda en
// 150–300 KB: se lee bien una placa y no pesa en la petición.
async function prepararFoto(archivo: File): Promise<Adjunto | null> {
  try {
    const bmp = await createImageBitmap(archivo, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const escala = Math.min(1, LADO_FOTO / Math.max(bmp.width, bmp.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(bmp.width * escala);
    lienzo.height = Math.round(bmp.height * escala);
    lienzo.getContext('2d')!.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
    bmp.close();
    const vista = lienzo.toDataURL('image/jpeg', 0.8);
    return { tipo: 'image/jpeg', datos: vista.slice(vista.indexOf(',') + 1), vista };
  } catch {
    return null;
  }
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
// 'AAAA-MM-DD' → «martes 6 de octubre», sin depender del reloj del equipo.
function diaLargo(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return `${DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${d} de ${MESES[m - 1]}`;
}

const ETIQUETA_VOZ: Record<EstadoVoz, string> = {
  escuchando: 'Te escucho…',
  pensando: 'Consultando…',
  hablando: 'Toca el círculo para interrumpir',
  pausa: 'En pausa · toca el círculo para hablar',
};

export default function Asistente() {
  const pathname = usePathname();
  const oculto = SIN_CHAT.some((p) => pathname === p || pathname.startsWith(p + '/'));

  const [rol, setRol] = useState<'supervisor' | 'tecnico' | null>(null);
  const [restantes, setRestantes] = useState<number | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [leer, setLeer] = useState(false);
  const [puedeDictar, setPuedeDictar] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [avisoVoz, setAvisoVoz] = useState('');
  // Bienvenida: 'no' (sin montar) → 'entra' → 'visible' → 'sale' → 'no'.
  const [bienvenida, setBienvenida] = useState<'no' | 'entra' | 'visible' | 'sale'>('no');
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  // Historial: 'chat' (hoy), 'dias' (lista de días) o un día 'AAAA-MM-DD'.
  const [vista, setVista] = useState<string>('chat');
  const [dias, setDias] = useState<DiaHistorial[] | null>(null);
  const [diaAbierto, setDiaAbierto] = useState<{ hora: string; pregunta: string; respuesta: string }[] | null>(null);
  const [hoyCargado, setHoyCargado] = useState(false);
  // Conversación por voz.
  const [modoVoz, setModoVoz] = useState(false);
  const [estadoVoz, setEstadoVoz] = useState<EstadoVoz>('pausa');
  const [subtitulo, setSubtitulo] = useState<{ tu: string; bot: string }>({ tu: '', bot: '' });
  const [ajustesVoz, setAjustesVoz] = useState(false);
  const [voces, setVoces] = useState<SpeechSynthesisVoice[]>([]);
  const [vozElegida, setVozElegida] = useState('');

  const reconocedor = useRef<any>(null);
  const fin = useRef<HTMLDivElement>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const mensajesRef = useRef<Mensaje[]>([]);
  mensajesRef.current = mensajes;
  const modoVozRef = useRef(false);
  modoVozRef.current = modoVoz;
  const silencios = useRef(0);
  const escucharRef = useRef<() => void>(() => {});

  // ¿Hay asistente para esta sesión? Se vuelve a preguntar al salir de una
  // pantalla pública (acaba de iniciar sesión).
  useEffect(() => {
    if (oculto) return;
    let vigente = true;
    fetch('/api/asistente')
      .then((r) => r.json())
      .then((d) => {
        if (!vigente) return;
        setRol(d.disponible ? d.rol : null);
        setRestantes(d.disponible ? d.restantes : null);
      })
      .catch(() => { /* sin red: no se muestra */ });
    return () => { vigente = false; };
  }, [oculto]);

  useEffect(() => {
    try {
      const guardada = sessionStorage.getItem(K_CHARLA);
      if (guardada) setMensajes(JSON.parse(guardada));
      setLeer(localStorage.getItem(K_VOZ) === '1');
      setVozElegida(localStorage.getItem(K_VOZ_ELEGIDA) || '');
    } catch { /* modo privado */ }
    const w = window as any;
    setPuedeDictar(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    // Las voces llegan después de cargar la página en casi todos los navegadores.
    const voz = window.speechSynthesis;
    if (!voz) return;
    const cargar = () => setVoces(voz.getVoices().filter((v) => v.lang.toLowerCase().startsWith('es')));
    cargar();
    voz.addEventListener?.('voiceschanged', cargar);
    return () => voz.removeEventListener?.('voiceschanged', cargar);
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem(K_CHARLA, JSON.stringify(mensajes.slice(-40))); } catch { /* modo privado */ }
    fin.current?.scrollIntoView({ block: 'end' });
  }, [mensajes, pensando, vista]);

  // Al abrir el chat sin conversación en pantalla se trae la de hoy del
  // servidor: así sigue ahí al cerrar la app o al cambiar de equipo.
  useEffect(() => {
    if (!abierto || hoyCargado) return;
    setHoyCargado(true);
    if (mensajesRef.current.length > 0) return;
    let desde = '';
    try { desde = localStorage.getItem(K_DESDE) || ''; } catch { /* modo privado */ }
    fetch('/api/asistente/historial?dia=hoy')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.conversacion || mensajesRef.current.length > 0) return;
        // Solo la plática en curso: lo posterior a la última pausa de más
        // de una hora, y solo si la última pregunta fue hace menos de tres.
        // Lo demás del día sigue en Historial; así ni se llena la pantalla
        // ni se le manda al modelo contexto viejo en cada pregunta.
        const filas = (d.conversacion as any[]).filter((c) => !desde || c.ts > desde);
        let inicio = 0;
        for (let n = 1; n < filas.length; n++) {
          if (new Date(filas[n].ts).getTime() - new Date(filas[n - 1].ts).getTime() > 60 * 60_000) inicio = n;
        }
        const ultima = filas[filas.length - 1];
        const reciente = ultima && Date.now() - new Date(ultima.ts).getTime() < 3 * 60 * 60_000;
        const deHoy: Mensaje[] = (reciente ? filas.slice(inicio) : [])
          .flatMap((c) => [{ rol: 'user' as const, texto: c.pregunta }, { rol: 'assistant' as const, texto: c.respuesta }]);
        if (deHoy.length) setMensajes(deHoy.slice(-40));
      })
      .catch(() => { /* sin red: se empieza en blanco */ });
  }, [abierto, hoyCargado]);

  // Mensaje de bienvenida sobre el botón: una vez cada que se abre la app
  // (por sesión del navegador, no en cada cambio de pantalla), dura unos
  // segundos y se va solo.
  useEffect(() => {
    if (!rol || oculto) return;
    try {
      if (sessionStorage.getItem(K_BIENVENIDA)) return;
      sessionStorage.setItem(K_BIENVENIDA, '1');
    } catch { /* modo privado: se muestra igual */ }
    const t1 = setTimeout(() => setBienvenida('entra'), 700);
    const t2 = setTimeout(() => setBienvenida('visible'), 760);
    const t3 = setTimeout(() => setBienvenida('sale'), 760 + SEGUNDOS_BIENVENIDA * 1000);
    const t4 = setTimeout(() => setBienvenida('no'), 760 + SEGUNDOS_BIENVENIDA * 1000 + 400);
    return () => { [t1, t2, t3, t4].forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rol]);

  const callar = useCallback(() => {
    try { window.speechSynthesis?.cancel(); } catch { /* sin voz */ }
  }, []);

  // Lee un texto en voz alta. alTerminar se llama al acabar (o si no se pudo).
  const decir = useCallback((t: string, alTerminar?: () => void) => {
    const voz = window.speechSynthesis;
    if (!voz) { alTerminar?.(); return; }
    voz.cancel();
    const u = new SpeechSynthesisUtterance(paraVoz(t));
    const todas = voz.getVoices();
    const elegida = todas.find((v) => v.voiceURI === vozElegida)
      || todas.find((v) => v.lang === 'es-MX') || todas.find((v) => v.lang.startsWith('es-US')) || todas.find((v) => v.lang.startsWith('es'));
    if (elegida) u.voice = elegida;
    u.lang = elegida?.lang || 'es-MX';
    if (alTerminar) {
      let listo = false;
      const una = () => { if (!listo) { listo = true; alTerminar(); } };
      u.onend = una;
      u.onerror = una;
    }
    voz.speak(u);
  }, [vozElegida]);

  // Manda la pregunta. Devuelve la respuesta (o null si falló) para que la
  // conversación por voz sepa qué leer.
  const enviar = useCallback(async (pregunta: string, opciones: { porVoz?: boolean } = {}): Promise<string | null> => {
    const p = pregunta.trim() || (adjuntos.length ? 'Revisa la foto y dime qué ves.' : '');
    if (!p || pensando) return null;
    callar();
    // iPhone solo deja hablar si la voz se «estrena» dentro del toque del
    // usuario; la respuesta llega después, fuera de ese toque.
    if (leer && !opciones.porVoz) { try { window.speechSynthesis?.speak(new SpeechSynthesisUtterance('')); } catch { /* sin voz */ } }
    const fotos = opciones.porVoz ? [] : adjuntos;
    const charla: Mensaje[] = [...mensajesRef.current.filter((m) => !m.error), { rol: 'user', texto: p, ...(fotos.length ? { fotos: fotos.length } : {}) }];
    setMensajes(charla);
    setTexto('');
    setAdjuntos([]);
    setVista('chat');
    setPensando(true);
    try {
      const r = await fetch('/api/asistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensajes: charla.map(({ rol, texto }) => ({ rol, texto })),
          ...(fotos.length ? { imagenes: fotos.map(({ tipo, datos }) => ({ tipo, datos })) } : {}),
          ...(opciones.porVoz ? { modo: 'voz' } : {}),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const falla = d.error || 'El asistente no pudo responder.';
        setMensajes([...charla, { rol: 'assistant', texto: falla, error: true }]);
        return opciones.porVoz ? falla : null;
      }
      setMensajes([...charla, { rol: 'assistant', texto: d.respuesta }]);
      if (typeof d.restantes === 'number') setRestantes(d.restantes);
      if (leer && !opciones.porVoz) decir(d.respuesta);
      return d.respuesta as string;
    } catch {
      const falla = 'Sin conexión. Revisa tu señal e intenta de nuevo.';
      setMensajes([...charla, { rol: 'assistant', texto: falla, error: true }]);
      return opciones.porVoz ? falla : null;
    } finally {
      setPensando(false);
    }
  }, [pensando, leer, adjuntos, callar, decir]);

  // Dictado de una sola pregunta (micrófono del cuadro de texto).
  const dictar = () => {
    if (escuchando) { reconocedor.current?.stop(); return; }
    const w = window as any;
    const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Rec) return;
    callar();
    setAvisoVoz('');
    const rec = new Rec();
    rec.lang = 'es-MX';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let definitivo = '';
    rec.onresult = (ev: any) => {
      let parcial = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) definitivo += ev.results[i][0].transcript;
        else parcial += ev.results[i][0].transcript;
      }
      setTexto((definitivo + parcial).trim());
    };
    rec.onerror = (ev: any) => {
      setEscuchando(false);
      if (ev?.error !== 'aborted') setAvisoVoz(AVISOS_VOZ[ev?.error] || 'No se pudo usar el dictado. Escribe tu pregunta.');
    };
    rec.onend = () => {
      setEscuchando(false);
      // Al terminar de hablar la pregunta se manda sola, como un asistente de voz.
      if (definitivo.trim()) enviar(definitivo);
    };
    reconocedor.current = rec;
    setEscuchando(true);
    try { rec.start(); } catch { setEscuchando(false); setAvisoVoz(AVISOS_VOZ['service-not-allowed']); }
  };

  // ---------- Conversación por voz ----------
  // Un turno: escuchar → mandar → leer la respuesta → volver a escuchar.
  const escuchar = useCallback(() => {
    if (!modoVozRef.current) return;
    const w = window as any;
    const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Rec) return;
    try { reconocedor.current?.abort?.(); } catch { /* ya terminó */ }
    const rec = new Rec();
    rec.lang = 'es-MX';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let definitivo = '';
    let fallo = '';
    rec.onresult = (ev: any) => {
      let parcial = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) definitivo += ev.results[i][0].transcript;
        else parcial += ev.results[i][0].transcript;
      }
      setSubtitulo({ tu: (definitivo + parcial).trim(), bot: '' });
    };
    rec.onerror = (ev: any) => { fallo = ev?.error || 'error'; };
    rec.onend = async () => {
      if (!modoVozRef.current || reconocedor.current !== rec) return;
      const dicho = definitivo.trim();
      if (!dicho) {
        // Sin permiso o sin micrófono no tiene caso insistir; el silencio sí
        // se reintenta, pero no indefinidamente (gasta batería y pita).
        if (fallo && fallo !== 'no-speech' && fallo !== 'aborted') {
          setAvisoVoz(AVISOS_VOZ[fallo] || 'No se pudo usar el micrófono.');
          setEstadoVoz('pausa');
          return;
        }
        silencios.current += 1;
        if (silencios.current >= 3) { setEstadoVoz('pausa'); return; }
        escucharRef.current();
        return;
      }
      silencios.current = 0;
      setEstadoVoz('pensando');
      const respuesta = await enviar(dicho, { porVoz: true });
      if (!modoVozRef.current) return;
      if (!respuesta) { setEstadoVoz('pausa'); return; }
      setSubtitulo({ tu: dicho, bot: paraVoz(respuesta) });
      setEstadoVoz('hablando');
      decir(respuesta, () => { if (modoVozRef.current) escucharRef.current(); });
    };
    reconocedor.current = rec;
    setAvisoVoz('');
    setEstadoVoz('escuchando');
    try { rec.start(); } catch { setEstadoVoz('pausa'); }
  }, [enviar, decir]);
  escucharRef.current = escuchar;

  const abrirVoz = () => {
    callar();
    reconocedor.current?.stop?.();
    setEscuchando(false);
    setSubtitulo({ tu: '', bot: '' });
    silencios.current = 0;
    modoVozRef.current = true;
    setModoVoz(true);
    setAjustesVoz(false);
    // Estrena la voz dentro del toque (iPhone) y arranca a escuchar.
    try { window.speechSynthesis?.speak(new SpeechSynthesisUtterance('')); } catch { /* sin voz */ }
    setTimeout(() => escucharRef.current(), 150);
  };

  const cerrarVoz = () => {
    modoVozRef.current = false;
    setModoVoz(false);
    setEstadoVoz('pausa');
    callar();
    try { reconocedor.current?.abort?.(); } catch { /* ya terminó */ }
    reconocedor.current = null;
  };

  // Toque en el círculo: interrumpe lo que esté diciendo y escucha; si estaba
  // escuchando, se pone en pausa.
  const tocarOrbe = () => {
    if (estadoVoz === 'pensando') return;
    if (estadoVoz === 'escuchando') {
      try { reconocedor.current?.abort?.(); } catch { /* ya terminó */ }
      reconocedor.current = null;
      setEstadoVoz('pausa');
      return;
    }
    callar();
    silencios.current = 0;
    escucharRef.current();
  };

  const elegirVoz = (uri: string) => {
    setVozElegida(uri);
    try { localStorage.setItem(K_VOZ_ELEGIDA, uri); } catch { /* modo privado */ }
  };

  const cambiarVoz = () => {
    const nuevo = !leer;
    setLeer(nuevo);
    if (!nuevo) callar();
    try { localStorage.setItem(K_VOZ, nuevo ? '1' : '0'); } catch { /* modo privado */ }
  };

  const agregarFotos = async (lista: FileList | null) => {
    if (!lista) return;
    const libres = MAX_FOTOS - adjuntos.length;
    const nuevas = (await Promise.all([...lista].slice(0, libres).map(prepararFoto))).filter((a): a is Adjunto => !!a);
    if (nuevas.length) setAdjuntos((prev) => [...prev, ...nuevas].slice(0, MAX_FOTOS));
    if (archivo.current) archivo.current.value = '';
  };

  // No borra nada del historial: marca desde cuándo cuenta lo que se muestra
  // y lo que se le manda al modelo como contexto.
  const nuevaConversacion = () => {
    callar();
    setMensajes([]);
    setAdjuntos([]);
    setVista('chat');
    try { localStorage.setItem(K_DESDE, new Date().toISOString()); } catch { /* modo privado */ }
  };

  const abrirHistorial = () => {
    setVista('dias');
    setDias(null);
    fetch('/api/asistente/historial')
      .then((r) => (r.ok ? r.json() : { dias: [] }))
      .then((d) => setDias(d.dias || []))
      .catch(() => setDias([]));
  };

  const abrirDia = (dia: string) => {
    setVista(dia);
    setDiaAbierto(null);
    fetch(`/api/asistente/historial?dia=${dia}`)
      .then((r) => (r.ok ? r.json() : { conversacion: [] }))
      .then((d) => setDiaAbierto(d.conversacion || []))
      .catch(() => setDiaAbierto([]));
  };

  const cerrar = () => { setAbierto(false); callar(); reconocedor.current?.stop?.(); };

  if (oculto || !rol) return null;

  if (!abierto) {
    return (
      <>
        {bienvenida !== 'no' && (
          <div
            className={`fixed right-4 z-[90] w-[min(19rem,calc(100vw-2rem))] origin-bottom-right transition-all duration-300 ease-out motion-reduce:transition-none print:hidden ${bienvenida === 'visible' ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-3 scale-95 pointer-events-none'}`}
            style={{ bottom: 'calc(5.25rem + env(safe-area-inset-bottom))' }}
          >
            <div role="status" className="relative overflow-hidden rounded-2xl rounded-br-md border border-line-strong bg-surface shadow-glow">
              <button
                type="button"
                onClick={() => { setBienvenida('no'); setAbierto(true); }}
                className="flex w-full items-start gap-3 px-3.5 py-3 text-left"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal/15 text-teal">
                  <Sparkles size={18} strokeWidth={2.2} />
                </span>
                <span className="min-w-0 pr-5">
                  <span className="block font-display text-[15px] font-semibold tracking-wide leading-tight">
                    Hola, soy {NOMBRE}
                    <span className="ml-1.5 align-middle text-[10.5px] font-sans font-medium normal-case tracking-normal text-muted">tu asistente</span>
                  </span>
                  <span className="mt-1 block text-[13px] leading-snug text-ink/85">{BIENVENIDA[rol]}</span>
                </span>
              </button>
              <button
                type="button" onClick={() => setBienvenida('no')} aria-label="Cerrar el mensaje"
                className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full text-muted transition hover:text-ink active:scale-90"
              >
                <X size={15} />
              </button>
              {/* Se vacía en lo que dura el mensaje: avisa que se cierra solo. */}
              <span
                aria-hidden
                className="block h-[3px] origin-left bg-teal/70 ease-linear motion-reduce:hidden"
                style={{ transform: bienvenida === 'visible' ? 'scaleX(0)' : 'scaleX(1)', transitionProperty: 'transform', transitionDuration: bienvenida === 'visible' ? `${SEGUNDOS_BIENVENIDA}s` : '0s' }}
              />
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => { setBienvenida('no'); setAbierto(true); }}
          aria-label="Abrir el asistente"
          title={NOMBRE}
          className="fixed right-4 z-[90] w-14 h-14 rounded-full bg-teal text-inkOnAccent flex items-center justify-center shadow-glow-teal transition hover:brightness-110 active:scale-90 print:hidden"
          style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          <Sparkles size={24} strokeWidth={2.2} />
        </button>
      </>
    );
  }

  const botonEncabezado = 'w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink transition active:scale-90';

  return (
    <div
      role="dialog"
      aria-label={NOMBRE}
      className="fixed z-[90] inset-0 sm:inset-auto sm:right-4 sm:bottom-4 sm:w-[400px] sm:h-[620px] sm:max-h-[calc(100dvh-2rem)] flex flex-col bg-surface sm:rounded-2xl sm:border sm:border-line-strong sm:shadow-glow sm:overflow-hidden print:hidden"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center gap-1 px-3 h-14 border-b border-line shrink-0">
        {vista !== 'chat' ? (
          <button type="button" onClick={() => setVista(vista === 'dias' ? 'chat' : 'dias')} aria-label="Volver" className={botonEncabezado}>
            <ChevronLeft size={20} />
          </button>
        ) : (
          <Sparkles size={18} className="text-teal mx-1.5 shrink-0" />
        )}
        <div className="flex-1 min-w-0 ml-0.5">
          <div className="font-semibold text-[15px] leading-tight truncate first-letter:uppercase">
            {vista === 'chat' ? NOMBRE : vista === 'dias' ? 'Historial' : diaLargo(vista)}
          </div>
          <div className="text-[11.5px] text-muted leading-tight truncate">
            {vista !== 'chat'
              ? 'Conversaciones anteriores'
              : rol === 'supervisor' ? 'Consulta, agenda servicios y arma cotizaciones' : 'Solo consulta · no modifica nada'}
          </div>
        </div>
        {vista === 'chat' && (
          <>
            <button
              type="button" onClick={cambiarVoz}
              aria-pressed={leer} aria-label={leer ? 'Dejar de leer las respuestas en voz alta' : 'Leer las respuestas en voz alta'}
              title={leer ? 'Voz activada' : 'Voz desactivada'}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition active:scale-90 ${leer ? 'bg-teal/15 text-teal' : 'text-muted hover:text-ink'}`}
            >
              {leer ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <button type="button" onClick={abrirHistorial} aria-label="Ver conversaciones anteriores" title="Historial" className={botonEncabezado}>
              <History size={18} />
            </button>
            {mensajes.length > 0 && (
              <button type="button" onClick={nuevaConversacion} aria-label="Empezar una conversación nueva" title="Conversación nueva" className={botonEncabezado}>
                <SquarePen size={17} />
              </button>
            )}
          </>
        )}
        <button type="button" onClick={cerrar} aria-label="Cerrar el asistente" className={botonEncabezado}>
          <X size={20} />
        </button>
      </div>

      {vista === 'dias' && (
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {dias === null && <p className="px-1 text-[13.5px] text-muted animate-pulse">Cargando…</p>}
          {dias?.length === 0 && <p className="px-1 text-[13.5px] text-muted">Todavía no hay conversaciones guardadas.</p>}
          <div className="flex flex-col gap-2">
            {dias?.map((d) => (
              <button
                key={d.dia} type="button" onClick={() => abrirDia(d.dia)}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-left transition hover:border-teal/50 active:scale-[0.99]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium first-letter:uppercase">{diaLargo(d.dia)}</span>
                  <span className="block text-[12px] text-muted">{d.mensajes === 1 ? '1 pregunta' : `${d.mensajes} preguntas`}</span>
                </span>
                <ChevronRight size={17} className="text-muted shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {vista !== 'chat' && vista !== 'dias' && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {diaAbierto === null && <p className="text-[13.5px] text-muted animate-pulse">Cargando…</p>}
          {diaAbierto?.length === 0 && <p className="text-[13.5px] text-muted">No hay conversaciones de ese día.</p>}
          {diaAbierto?.map((c, n) => (
            <div key={n} className="space-y-2">
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2 bg-teal/85 text-inkOnAccent text-[14px] whitespace-pre-wrap">
                  {c.pregunta}
                  <span className="mt-0.5 block text-right text-[10.5px] opacity-70">{c.hora}</span>
                </div>
              </div>
              <div className="flex justify-start">
                <div className="max-w-[92%] rounded-2xl rounded-bl-md px-3.5 py-2 border border-line bg-surface-2 text-[14px] leading-relaxed whitespace-pre-wrap">
                  {conEnlaces(c.respuesta.replace(/\*\*/g, ''))}
                </div>
              </div>
            </div>
          ))}
          <div ref={fin} />
        </div>
      )}

      {vista === 'chat' && (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" aria-live="polite">
            {mensajes.length === 0 && (
              <div className="pt-4">
                <p className="text-[14px] text-muted mb-3">
                  Pregúntame por reportes, equipos instalados, servicios, almacén o clientes. Por ejemplo:
                </p>
                <div className="space-y-2">
                  {SUGERENCIAS[rol].map((s) => (
                    <button
                      key={s} type="button" onClick={() => enviar(s)}
                      className="block w-full text-left text-[14px] px-3 py-2.5 rounded-xl border border-line bg-surface-2 hover:border-teal/50 transition active:scale-[0.98]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {mensajes.map((m, i) => (
              <div key={i} className={m.rol === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={
                    m.rol === 'user'
                      ? 'max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2 bg-teal text-inkOnAccent text-[14.5px] whitespace-pre-wrap'
                      : `max-w-[92%] rounded-2xl rounded-bl-md px-3.5 py-2 border text-[14.5px] leading-relaxed whitespace-pre-wrap ${m.error ? 'border-red/40 bg-red/10 text-red' : 'border-line bg-surface-2'}`
                  }
                >
                  {m.fotos ? <span className="mb-1 flex items-center gap-1.5 text-[11.5px] opacity-80"><ImagePlus size={13} />{m.fotos === 1 ? '1 foto' : `${m.fotos} fotos`}</span> : null}
                  {m.rol === 'user' ? m.texto : conEnlaces(m.texto.replace(/\*\*/g, ''))}
                </div>
              </div>
            ))}
            {pensando && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md px-3.5 py-2 border border-line bg-surface-2 text-[14px] text-muted animate-pulse">
                  Consultando…
                </div>
              </div>
            )}
            <div ref={fin} />
          </div>

          {avisoVoz && !modoVoz && (
            <div role="alert" className="shrink-0 px-4 py-2 text-[12.5px] text-amber border-t border-line">{avisoVoz}</div>
          )}

          {adjuntos.length > 0 && (
            <div className="shrink-0 flex gap-2 px-3 pt-2.5 border-t border-line">
              {adjuntos.map((a, n) => (
                <div key={n} className="relative h-16 w-16 overflow-hidden rounded-xl border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.vista} alt={`Foto ${n + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button" onClick={() => setAdjuntos((prev) => prev.filter((_, k) => k !== n))} aria-label={`Quitar la foto ${n + 1}`}
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => { e.preventDefault(); enviar(texto); }}
            className={`shrink-0 px-3 py-2.5 flex items-end gap-1.5 ${adjuntos.length ? '' : 'border-t border-line'}`}
          >
            <input ref={archivo} type="file" accept="image/*" multiple hidden onChange={(e) => agregarFotos(e.target.files)} />
            <button
              type="button" onClick={() => archivo.current?.click()} disabled={pensando || adjuntos.length >= MAX_FOTOS}
              aria-label="Adjuntar una foto" title="Adjuntar foto"
              className="w-10 h-11 shrink-0 rounded-full flex items-center justify-center text-ink/75 hover:text-teal transition active:scale-90 disabled:opacity-40"
            >
              <ImagePlus size={20} />
            </button>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(texto); } }}
              rows={1}
              maxLength={1200}
              placeholder={escuchando ? 'Te escucho…' : 'Escribe tu pregunta'}
              aria-label="Tu pregunta"
              className="flex-1 min-w-0 min-h-[44px] max-h-32 resize-none rounded-2xl border border-line-strong bg-surface-2 px-3.5 py-2.5 text-[15px] outline-none focus:border-teal/60"
            />
            {puedeDictar && (
              <button
                type="button" onClick={dictar} disabled={pensando}
                aria-label={escuchando ? 'Dejar de escuchar' : 'Dictar la pregunta'}
                className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition active:scale-90 disabled:opacity-40 ${escuchando ? 'bg-red text-white animate-pulse' : 'border border-line-strong bg-surface-2 text-ink/85 hover:text-teal'}`}
              >
                {escuchando ? <Square size={16} fill="currentColor" /> : <Mic size={19} />}
              </button>
            )}
            {/* Con texto o foto, el botón principal envía; vacío, abre la
                conversación por voz (si el navegador puede dictar). */}
            {texto.trim() || adjuntos.length > 0 || !puedeDictar ? (
              <button
                type="submit" disabled={pensando || (!texto.trim() && adjuntos.length === 0)} aria-label="Enviar"
                className="w-11 h-11 shrink-0 rounded-full bg-teal text-inkOnAccent flex items-center justify-center transition hover:brightness-110 active:scale-90 disabled:opacity-40"
              >
                <SendHorizontal size={18} />
              </button>
            ) : (
              <button
                type="button" onClick={abrirVoz} disabled={pensando} aria-label="Conversar por voz" title="Conversar por voz"
                className="w-11 h-11 shrink-0 rounded-full bg-teal text-inkOnAccent flex items-center justify-center transition hover:brightness-110 active:scale-90 disabled:opacity-40"
              >
                <AudioLines size={20} />
              </button>
            )}
          </form>
          {restantes !== null && restantes <= 5 && (
            <div className="shrink-0 px-4 pb-2 text-[11.5px] text-muted text-center">
              {restantes === 0 ? 'Llegaste al tope de preguntas de hoy.' : `Te quedan ${restantes} preguntas hoy.`}
            </div>
          )}
        </>
      )}

      {/* Conversación por voz: cubre el chat; al cerrar, la plática queda escrita abajo. */}
      {modoVoz && (
        <div
          className="absolute inset-0 z-10 flex flex-col bg-bg"
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex items-center justify-between px-4 h-14 shrink-0">
            <span className="font-display text-[15px] font-semibold tracking-wide">{NOMBRE}</span>
            <button
              type="button" onClick={() => setAjustesVoz((v) => !v)} aria-expanded={ajustesVoz} aria-label="Elegir la voz"
              className={`w-10 h-10 rounded-full flex items-center justify-center border border-line-strong transition active:scale-90 ${ajustesVoz ? 'bg-teal/15 text-teal' : 'bg-surface-2 text-ink/80'}`}
            >
              <Settings2 size={18} />
            </button>
          </div>

          {ajustesVoz && (
            <div className="mx-4 mb-2 rounded-2xl border border-line bg-surface p-3.5 shrink-0">
              <label htmlFor="asistente-voz" className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">Voz</label>
              {voces.length > 0 ? (
                <div className="flex gap-2">
                  <select
                    id="asistente-voz" value={vozElegida} onChange={(e) => elegirVoz(e.target.value)}
                    className="min-w-0 flex-1 rounded-xl border border-line-strong bg-surface-2 px-3 py-2.5 text-[14px] outline-none focus:border-teal/60"
                  >
                    <option value="">Automática (español de México)</option>
                    {voces.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>)}
                  </select>
                  <button
                    type="button" onClick={() => decir(`Hola, soy ${NOMBRE}. Así se escucha esta voz.`)}
                    className="shrink-0 rounded-xl border border-line-strong bg-surface-2 px-3.5 text-[13.5px] font-medium active:scale-95 transition"
                  >
                    Probar
                  </button>
                </div>
              ) : (
                <p className="text-[13px] text-muted">Este equipo no tiene voces en español instaladas.</p>
              )}
              <p className="mt-2 text-[12px] leading-snug text-muted">Las voces son las que tiene instaladas tu teléfono o computadora.</p>
            </div>
          )}

          <div className="flex flex-1 flex-col items-center justify-center gap-7 px-6 min-h-0">
            <button
              type="button" onClick={tocarOrbe} data-estado={estadoVoz}
              aria-label={estadoVoz === 'escuchando' ? 'Pausar' : estadoVoz === 'hablando' ? 'Interrumpir y hablar' : 'Hablar'}
              className="asistente-orbe relative h-44 w-44 shrink-0 overflow-hidden rounded-full shadow-glow-teal outline-none focus-visible:ring-4 focus-visible:ring-teal/40"
              style={{ background: 'radial-gradient(circle at 30% 25%, rgb(var(--c-acento) / 1), rgb(var(--c-acento-oscuro) / 1) 75%)' }}
            >
              <span
                aria-hidden className="asistente-orbe-brillo absolute -inset-6"
                style={{ background: 'conic-gradient(from 0deg, transparent 0deg, rgb(255 255 255 / 0.55) 70deg, transparent 150deg, rgb(255 255 255 / 0.25) 250deg, transparent 330deg)', filter: 'blur(18px)' }}
              />
            </button>
            <div className="w-full max-w-sm text-center" aria-live="polite">
              <p className="text-[13px] font-medium text-teal">{avisoVoz || ETIQUETA_VOZ[estadoVoz]}</p>
              {subtitulo.tu && <p className="mt-3 text-[14px] leading-snug text-muted line-clamp-3">«{subtitulo.tu}»</p>}
              {subtitulo.bot && <p className="mt-2 text-[15px] leading-snug text-ink line-clamp-5">{subtitulo.bot}</p>}
            </div>
          </div>

          <div className="flex items-center justify-center gap-5 px-6 pb-6 pt-2 shrink-0">
            <button
              type="button" onClick={tocarOrbe} disabled={estadoVoz === 'pensando'}
              aria-label={estadoVoz === 'escuchando' ? 'Silenciar el micrófono' : 'Activar el micrófono'}
              className={`w-14 h-14 rounded-full flex items-center justify-center border transition active:scale-90 disabled:opacity-40 ${estadoVoz === 'escuchando' ? 'border-line-strong bg-surface-2 text-ink' : 'border-amber/50 bg-amber/15 text-amber'}`}
            >
              {estadoVoz === 'escuchando' ? <Mic size={22} /> : <MicOff size={22} />}
            </button>
            <button
              type="button" onClick={cerrarVoz} aria-label="Terminar la conversación por voz"
              className="w-14 h-14 rounded-full flex items-center justify-center bg-ink text-bg transition active:scale-90"
            >
              <X size={24} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
