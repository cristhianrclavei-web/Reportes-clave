'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, RotateCcw, Check, Video, SwitchCamera, Play } from 'lucide-react';
import {
  VideoGrabado, VIDEO_MAX_SEG, VIDEO_BITS_POR_SEG, AUDIO_BITS_POR_SEG, VIDEO_MAX_BYTES_RESPALDO,
  mimeParaGrabar, extensionDeVideo, duracionCorta, pesoTexto, portadaDeVideo,
} from '@/lib/videoEvidencia';

// Grabadora de video a pantalla completa. Graba con la cámara dentro de la
// app para que el video salga ya comprimido (720p, ~1 Mbps): 30 s pesan
// unos 4 MB en vez de los 60–130 MB que entrega la cámara del teléfono.
//
//   1. Vista de la cámara → botón rojo para grabar (se detiene sola a los
//      30 s).
//   2. Revisión: se reproduce lo grabado; «Repetir» o «Usar video».
//
// Si el teléfono no deja grabar aquí (permiso negado, navegador viejo) se
// ofrece su propia cámara como respaldo, con tope de peso y de duración.

type Paso = 'preparando' | 'lista' | 'grabando' | 'revisando' | 'sin_camara';

export default function GrabadorVideo({ onListo, onCerrar }: { onListo: (v: VideoGrabado) => void; onCerrar: () => void }) {
  const [paso, setPaso] = useState<Paso>('preparando');
  const [seg, setSeg] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [frontal, setFrontal] = useState(false);
  const [resultado, setResultado] = useState<(VideoGrabado & { url: string }) | null>(null);
  const [procesando, setProcesando] = useState(false);

  const vistaRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const trozosRef = useRef<Blob[]>([]);
  const inicioRef = useRef(0);
  const posterRef = useRef<Blob | null>(null);
  const relojRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const respaldoRef = useRef<HTMLInputElement>(null);

  function soltarCamara() {
    if (relojRef.current) { clearInterval(relojRef.current); relojRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function abrirCamara(usarFrontal: boolean) {
    soltarCamara();
    setPaso('preparando');
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || !mimeParaGrabar()) { setPaso('sin_camara'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: usarFrontal ? 'user' : 'environment', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } },
        audio: true,
      });
      streamRef.current = stream;
      if (vistaRef.current) {
        vistaRef.current.srcObject = stream;
        await vistaRef.current.play().catch(() => {});
      }
      setPaso('lista');
    } catch {
      setPaso('sin_camara');
    }
  }

  useEffect(() => {
    abrirCamara(false);
    // Sin la página detrás moviéndose mientras se graba.
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previo;
      try { recRef.current?.state !== 'inactive' && recRef.current?.stop(); } catch { /* ya detenida */ }
      soltarCamara();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // La portada es un cuadro del propio video. Se toma al empezar y, si no se
  // pudo, otra vez al detener (de forma síncrona: la cámara se suelta justo
  // después).
  function tomarPortada() {
    const v = vistaRef.current;
    if (!v || !v.videoWidth) return;
    try {
      const escala = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(v.videoWidth * escala);
      c.height = Math.round(v.videoHeight * escala);
      c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
      const [, base64] = c.toDataURL('image/jpeg', 0.8).split(',');
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      posterRef.current = new Blob([bytes], { type: 'image/jpeg' });
    } catch { /* se intenta de nuevo al detener */ }
  }

  function empezar() {
    const stream = streamRef.current;
    const mime = mimeParaGrabar();
    if (!stream || !mime) return;
    trozosRef.current = [];
    posterRef.current = null;
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: VIDEO_BITS_POR_SEG, audioBitsPerSecond: AUDIO_BITS_POR_SEG });
    rec.ondataavailable = (e) => { if (e.data.size > 0) trozosRef.current.push(e.data); };
    rec.onstop = async () => {
      const dur = Math.min(VIDEO_MAX_SEG, Math.max(1, Math.round((Date.now() - inicioRef.current) / 1000)));
      const tipo = (rec.mimeType || mime).split(';')[0];
      const blob = new Blob(trozosRef.current, { type: tipo });
      soltarCamara();
      if (blob.size === 0) {
        setError('No se grabó nada. Inténtalo de nuevo.');
        abrirCamara(frontal);
        return;
      }
      const video = new File([blob], `video.${extensionDeVideo(tipo)}`, { type: tipo });
      // Sin portada de la cámara, se saca del propio video ya grabado.
      let portada: Blob | null = posterRef.current;
      if (!portada) portada = await portadaDeVideo(video).then((r) => r.poster).catch(() => null);
      if (!portada) {
        setError('No se pudo preparar el video. Inténtalo de nuevo.');
        abrirCamara(frontal);
        return;
      }
      setResultado({ video, poster: new File([portada], 'portada.jpg', { type: 'image/jpeg' }), dur, url: URL.createObjectURL(blob) });
      setPaso('revisando');
    };
    recRef.current = rec;
    inicioRef.current = Date.now();
    rec.start(1000);
    setSeg(0);
    setPaso('grabando');
    setTimeout(tomarPortada, 350);
    relojRef.current = setInterval(() => {
      const t = (Date.now() - inicioRef.current) / 1000;
      setSeg(Math.floor(t));
      if (t >= VIDEO_MAX_SEG) detener();
    }, 250);
  }

  function detener() {
    if (relojRef.current) { clearInterval(relojRef.current); relojRef.current = null; }
    if (!posterRef.current) tomarPortada();
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  }

  function repetir() {
    if (resultado) URL.revokeObjectURL(resultado.url);
    setResultado(null);
    abrirCamara(frontal);
  }

  function usar() {
    if (!resultado) return;
    const { url, ...v } = resultado;
    URL.revokeObjectURL(url);
    onListo(v);
  }

  // Respaldo: la cámara del teléfono. Sale sin comprimir, así que se limita.
  async function alElegirRespaldo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > VIDEO_MAX_BYTES_RESPALDO) {
      setError(`Ese video pesa ${pesoTexto(file.size)}. Graba uno más corto (unos ${Math.round(VIDEO_MAX_SEG / 2)} segundos) o baja la calidad de la cámara.`);
      return;
    }
    setProcesando(true);
    setError(null);
    try {
      const { poster, dur } = await portadaDeVideo(file);
      if (dur > VIDEO_MAX_SEG + 5) { setError(`El video dura ${duracionCorta(dur)}; el máximo son ${VIDEO_MAX_SEG} segundos.`); return; }
      onListo({ video: file, poster, dur: Math.round(dur) });
    } catch {
      setError('No se pudo leer ese video. Intenta grabarlo de nuevo.');
    } finally {
      setProcesando(false);
    }
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[210] bg-black text-white flex flex-col" role="dialog" aria-label="Grabar video">
      {/* Encabezado */}
      <div className="relative z-10 flex items-center gap-3 px-4 pb-3" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="w-11 h-11 rounded-full bg-white/12 flex items-center justify-center active:scale-90 transition-transform">
          <X size={22} strokeWidth={2.4} />
        </button>
        <div className="flex-1 min-w-0">
          {paso === 'grabando' ? (
            <>
              <p className="font-display font-bold text-[17px] tabular-nums flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                {duracionCorta(seg)} <span className="text-white/55 font-medium text-[14px]">/ {duracionCorta(VIDEO_MAX_SEG)}</span>
              </p>
              <div className="h-1 rounded-full bg-white/20 mt-1.5 overflow-hidden">
                <div className="h-full bg-red-500 transition-[width] duration-200" style={{ width: `${Math.min(100, (seg / VIDEO_MAX_SEG) * 100)}%` }} />
              </div>
            </>
          ) : (
            <p className="font-display font-semibold text-[16px]">
              {paso === 'revisando' ? 'Revisa el video' : `Video de evidencia · hasta ${VIDEO_MAX_SEG} s`}
            </p>
          )}
        </div>
        {paso === 'lista' && (
          <button type="button" onClick={() => { const f = !frontal; setFrontal(f); abrirCamara(f); }} aria-label="Cambiar de cámara" className="w-11 h-11 rounded-full bg-white/12 flex items-center justify-center active:scale-90 transition-transform">
            <SwitchCamera size={20} strokeWidth={2.2} />
          </button>
        )}
      </div>

      {/* Imagen */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden">
        <video
          ref={vistaRef}
          muted
          playsInline
          autoPlay
          className={`max-w-full max-h-full ${paso === 'lista' || paso === 'grabando' || paso === 'preparando' ? '' : 'hidden'}`}
        />
        {paso === 'preparando' && <p className="absolute text-[14px] text-white/70">Abriendo la cámara…</p>}
        {paso === 'revisando' && resultado && (
          <video src={resultado.url} controls playsInline autoPlay loop className="max-w-full max-h-full" />
        )}
        {paso === 'sin_camara' && (
          <div className="max-w-sm px-6 text-center">
            <span className="mx-auto w-14 h-14 rounded-2xl bg-white/12 flex items-center justify-center mb-4"><Video size={26} strokeWidth={2} /></span>
            <p className="font-display font-bold text-[19px] mb-2">No se pudo abrir la cámara aquí</p>
            <p className="text-[14px] text-white/70 leading-relaxed mb-5">
              Revisa que la app tenga permiso de cámara y micrófono. También puedes grabar con la cámara del teléfono: que no pase de {VIDEO_MAX_SEG} segundos.
            </p>
            <input ref={respaldoRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={alElegirRespaldo} />
            <div className="flex flex-col gap-2.5">
              <button type="button" onClick={() => abrirCamara(frontal)} className="min-h-[50px] rounded-2xl bg-white text-black font-semibold text-[15px] active:scale-95 transition-transform">Intentar de nuevo</button>
              <button type="button" onClick={() => respaldoRef.current?.click()} disabled={procesando} className="min-h-[50px] rounded-2xl border border-white/35 font-semibold text-[15px] active:scale-95 transition-transform disabled:opacity-60">
                {procesando ? 'Leyendo el video…' : 'Usar la cámara del teléfono'}
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="absolute bottom-4 inset-x-4 text-center text-[13.5px] bg-red-600/90 rounded-xl px-3 py-2.5">{error}</p>
        )}
      </div>

      {/* Controles */}
      <div className="relative z-10 px-6 pt-4 flex items-center justify-center gap-4" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}>
        {paso === 'lista' && (
          <button type="button" onClick={empezar} aria-label="Empezar a grabar" className="w-[76px] h-[76px] rounded-full border-4 border-white flex items-center justify-center active:scale-95 transition-transform">
            <span className="w-[58px] h-[58px] rounded-full bg-red-500" />
          </button>
        )}
        {paso === 'grabando' && (
          <button type="button" onClick={detener} aria-label="Detener" className="w-[76px] h-[76px] rounded-full border-4 border-white flex items-center justify-center active:scale-95 transition-transform">
            <span className="w-7 h-7 rounded-md bg-red-500" />
          </button>
        )}
        {paso === 'revisando' && resultado && (
          <div className="w-full max-w-md">
            <p className="text-center text-[13px] text-white/65 mb-3 flex items-center justify-center gap-1.5">
              <Play size={12} fill="currentColor" />
              {duracionCorta(resultado.dur)} · {pesoTexto(resultado.video.size)}
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" onClick={repetir} className="min-h-[54px] rounded-2xl border border-white/35 font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-95 transition-transform">
                <RotateCcw size={18} strokeWidth={2.4} />Repetir
              </button>
              <button type="button" onClick={usar} className="min-h-[54px] rounded-2xl bg-white text-black font-display font-semibold text-[15.5px] flex items-center justify-center gap-2 active:scale-95 transition-transform">
                <Check size={19} strokeWidth={3} />Usar video
              </button>
            </div>
          </div>
        )}
        {(paso === 'preparando' || paso === 'sin_camara') && <div className="h-[76px]" />}
      </div>
    </div>,
    document.body,
  );
}
