'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MARCA } from '@/lib/marca';
import { Sparkles, X, Mic, Square, SendHorizontal, Volume2, VolumeX, Trash2 } from 'lucide-react';

// Chat del asistente de IA (Fase 1: solo consultas). Botón flotante que
// aparece únicamente si /api/asistente dice que está disponible para quien
// tiene la sesión: instalación con la llave configurada, paquete con el
// módulo `ia` y cuenta activa.
//
// Voz, las dos con lo que trae el navegador (sin costo ni servicio externo):
//   · Dictar la pregunta: SpeechRecognition. Existe en Chrome (Android y
//     computadora); donde no existe el micrófono no se muestra y queda el
//     dictado del teclado del teléfono.
//   · Leer la respuesta: speechSynthesis, opcional y recordado por equipo.

type Mensaje = { rol: 'user' | 'assistant'; texto: string; error?: boolean };

// Pantallas sin sesión, y el formulario del reporte (ahí el botón estorbaría
// sobre las firmas y los botones de avanzar).
const SIN_CHAT = ['/login', '/firmar', '/verificar', '/restablecer', '/aviso-privacidad', '/nuevo'];

const SUGERENCIAS: Record<'supervisor' | 'tecnico', string[]> = {
  supervisor: [
    '¿Qué servicios hay hoy y quién está asignado?',
    '¿Qué servicios de esta semana siguen sin reporte?',
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

// Texto de la respuesta con los enlaces a reportes como vínculos. Son <a>
// normales (recarga completa) a propósito: las listas de reportes abren el
// detalle al cargar, y así funciona aunque ya se esté en esa pantalla.
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
  supervisor: 'Estoy aquí para ayudarte con información de reportes, servicios y almacén, y para armar cotizaciones.',
  tecnico: 'Estoy aquí para ayudarte con tus servicios, reportes y material, y a preparar tu trabajo.',
};
const SEGUNDOS_BIENVENIDA = 5;
const K_BIENVENIDA = 'asistenteBienvenida';

const K_CHARLA = 'asistenteCharla';
const K_VOZ = 'asistenteVoz';

// Lo que se lee en voz alta no debe llevar los signos de formato ni rutas.
function paraVoz(t: string): string {
  return t.replace(ENLACE, '$1').replace(/\*\*/g, '').replace(/^\s*[-•]\s*/gm, '').replace(/[#_`]/g, '');
}

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
  const reconocedor = useRef<any>(null);
  const fin = useRef<HTMLDivElement>(null);
  const mensajesRef = useRef<Mensaje[]>([]);
  mensajesRef.current = mensajes;

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
    } catch { /* modo privado */ }
    const w = window as any;
    setPuedeDictar(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem(K_CHARLA, JSON.stringify(mensajes.slice(-30))); } catch { /* modo privado */ }
    fin.current?.scrollIntoView({ block: 'end' });
  }, [mensajes, pensando]);

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

  const decir = useCallback((t: string) => {
    const voz = window.speechSynthesis;
    if (!voz) return;
    voz.cancel();
    const u = new SpeechSynthesisUtterance(paraVoz(t));
    const voces = voz.getVoices();
    const elegida = voces.find((v) => v.lang === 'es-MX') || voces.find((v) => v.lang.startsWith('es-US')) || voces.find((v) => v.lang.startsWith('es'));
    if (elegida) u.voice = elegida;
    u.lang = elegida?.lang || 'es-MX';
    voz.speak(u);
  }, []);

  const enviar = useCallback(async (pregunta: string) => {
    const p = pregunta.trim();
    if (!p || pensando) return;
    callar();
    // iPhone solo deja hablar si la voz se «estrena» dentro del toque del
    // usuario; la respuesta llega después, fuera de ese toque.
    if (leer) { try { window.speechSynthesis?.speak(new SpeechSynthesisUtterance('')); } catch { /* sin voz */ } }
    const charla: Mensaje[] = [...mensajesRef.current.filter((m) => !m.error), { rol: 'user', texto: p }];
    setMensajes(charla);
    setTexto('');
    setPensando(true);
    try {
      const r = await fetch('/api/asistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensajes: charla.map(({ rol, texto }) => ({ rol, texto })) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMensajes([...charla, { rol: 'assistant', texto: d.error || 'El asistente no pudo responder.', error: true }]);
      } else {
        setMensajes([...charla, { rol: 'assistant', texto: d.respuesta }]);
        if (typeof d.restantes === 'number') setRestantes(d.restantes);
        if (leer) decir(d.respuesta);
      }
    } catch {
      setMensajes([...charla, { rol: 'assistant', texto: 'Sin conexión. Revisa tu señal e intenta de nuevo.', error: true }]);
    } finally {
      setPensando(false);
    }
  }, [pensando, leer, callar, decir]);

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

  const cambiarVoz = () => {
    const nuevo = !leer;
    setLeer(nuevo);
    if (!nuevo) callar();
    try { localStorage.setItem(K_VOZ, nuevo ? '1' : '0'); } catch { /* modo privado */ }
  };

  const cerrar = () => { setAbierto(false); callar(); reconocedor.current?.stop(); };

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

  return (
    <div
      role="dialog"
      aria-label="Asistente"
      className="fixed z-[90] inset-0 sm:inset-auto sm:right-4 sm:bottom-4 sm:w-[400px] sm:h-[600px] sm:max-h-[calc(100dvh-2rem)] flex flex-col bg-surface sm:rounded-2xl sm:border sm:border-line-strong sm:shadow-glow print:hidden"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center gap-2 px-4 h-14 border-b border-line shrink-0">
        <Sparkles size={18} className="text-teal" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] leading-tight">{NOMBRE}</div>
          <div className="text-[11.5px] text-muted leading-tight">
            {rol === 'supervisor' ? 'Consulta y arma borradores de cotización' : 'Solo consulta · no modifica nada'}
          </div>
        </div>
        <button
          type="button" onClick={cambiarVoz}
          aria-pressed={leer} aria-label={leer ? 'Dejar de leer las respuestas en voz alta' : 'Leer las respuestas en voz alta'}
          title={leer ? 'Voz activada' : 'Voz desactivada'}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition active:scale-90 ${leer ? 'bg-teal/15 text-teal' : 'text-muted hover:text-ink'}`}
        >
          {leer ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        {mensajes.length > 0 && (
          <button
            type="button" onClick={() => { callar(); setMensajes([]); }}
            aria-label="Borrar la conversación" title="Borrar la conversación"
            className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink transition active:scale-90"
          >
            <Trash2 size={17} />
          </button>
        )}
        <button
          type="button" onClick={cerrar} aria-label="Cerrar el asistente"
          className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink transition active:scale-90"
        >
          <X size={20} />
        </button>
      </div>

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

      {avisoVoz && (
        <div role="alert" className="shrink-0 px-4 py-2 text-[12.5px] text-amber border-t border-line">{avisoVoz}</div>
      )}
      <form
        onSubmit={(e) => { e.preventDefault(); enviar(texto); }}
        className="shrink-0 border-t border-line px-3 py-2.5 flex items-end gap-2"
      >
        {puedeDictar && (
          <button
            type="button" onClick={dictar} disabled={pensando}
            aria-label={escuchando ? 'Dejar de escuchar' : 'Preguntar hablando'}
            className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition active:scale-90 disabled:opacity-40 ${escuchando ? 'bg-red text-white animate-pulse' : 'border border-line-strong bg-surface-2 text-ink/85 hover:text-teal'}`}
          >
            {escuchando ? <Square size={16} fill="currentColor" /> : <Mic size={19} />}
          </button>
        )}
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(texto); } }}
          rows={1}
          maxLength={1200}
          placeholder={escuchando ? 'Te escucho…' : 'Escribe tu pregunta'}
          aria-label="Tu pregunta"
          className="flex-1 min-h-[44px] max-h-32 resize-none rounded-2xl border border-line-strong bg-surface-2 px-3.5 py-2.5 text-[15px] outline-none focus:border-teal/60"
        />
        <button
          type="submit" disabled={pensando || !texto.trim()} aria-label="Enviar"
          className="w-11 h-11 shrink-0 rounded-full bg-teal text-inkOnAccent flex items-center justify-center transition hover:brightness-110 active:scale-90 disabled:opacity-40"
        >
          <SendHorizontal size={18} />
        </button>
      </form>
      {restantes !== null && restantes <= 5 && (
        <div className="shrink-0 px-4 pb-2 text-[11.5px] text-muted text-center">
          {restantes === 0 ? 'Llegaste al tope de preguntas de hoy.' : `Te quedan ${restantes} preguntas hoy.`}
        </div>
      )}
    </div>
  );
}
