'use client';

// Pedir la aprobación de una cotización por WhatsApp a quien tiene permiso de
// aprobar (supabase/patch_cotizacion_aprobacion_remota.sql). Se elige a la
// persona, la app arma su enlace y con otro toque se abre WhatsApp: el enlace
// se crea antes porque WhatsApp se bloquea si no se abre justo al tocar.

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, Copy, Loader2, MessageCircle, MessageSquareWarning, Send } from 'lucide-react';
import { createClient } from '@/lib/supabaseClient';
import { showToast } from '@/components/Toast';
import { MARCA } from '@/lib/marca';

type Aprobador = { id: string; full_name: string };
type Solicitud = {
  id: string;
  aprobador_id: string;
  pedido_en: string;
  vence_en: string;
  respondido_en: string | null;
  resultado: 'aprobada' | 'cambios' | null;
  comentario: string | null;
};

const fecha = (iso: string) => new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

// `soloHistorial`: ya aprobada, solo se ve a quién se le pidió y qué contestó.
export default function PedirAprobacion({ cotizacion, soloHistorial = false }: { cotizacion: { id: string; folio: string; empresa: string }; soloHistorial?: boolean }) {
  const [aprobadores, setAprobadores] = useState<Aprobador[]>([]);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [yo, setYo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState<string | null>(null);
  const [enlace, setEnlace] = useState<{ aprobador: string; url: string } | null>(null);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [{ data: sesion }, rAprob, rSol] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('profiles').select('id, full_name').eq('can_approve_cotizacion', true).eq('activo', true).order('full_name'),
      supabase.from('cotizacion_aprobaciones').select('id, aprobador_id, pedido_en, vence_en, respondido_en, resultado, comentario').eq('cotizacion_id', cotizacion.id).order('pedido_en', { ascending: false }),
    ]);
    setYo(sesion.user?.id || null);
    if (rAprob.error || rSol.error) {
      const texto = rSol.error?.message || rAprob.error?.message || '';
      setError(/does not exist|schema cache/i.test(texto) ? 'Falta correr supabase/patch_cotizacion_aprobacion_remota.sql en la base.' : 'No se pudo cargar quién aprueba. Revisa tu señal.');
      return;
    }
    setError(null);
    setAprobadores((rAprob.data || []) as Aprobador[]);
    setSolicitudes((rSol.data || []) as Solicitud[]);
  }, [cotizacion.id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function crearEnlace(a: Aprobador) {
    setCreando(a.id);
    setEnlace(null);
    try {
      const { data, error: e } = await createClient().rpc('pedir_aprobacion_cotizacion', { p_cotizacion: cotizacion.id, p_aprobador: a.id });
      if (e) throw new Error(e.code === 'P0001' ? e.message : 'No se pudo crear el enlace. Revisa tu señal e intenta de nuevo.');
      setEnlace({ aprobador: a.full_name, url: `${window.location.origin}/aprobar/${(data as { token: string }).token}` });
      cargar();
    } catch (err: any) {
      showToast(err?.message || 'No se pudo crear el enlace.', 'error');
    } finally {
      setCreando(null);
    }
  }

  async function copiar(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      showToast('Enlace copiado', 'success');
    } catch {
      showToast('No se pudo copiar; mantén presionado el enlace para copiarlo.', 'error');
    }
  }

  const nombreDe = (id: string) => aprobadores.find((a) => a.id === id)?.full_name || 'Aprobador';
  const otros = soloHistorial ? [] : aprobadores.filter((a) => a.id !== yo);
  const mensaje = enlace
    ? `Hola ${enlace.aprobador.split(' ').find((p) => !/^ing\.?$/i.test(p)) || ''}, ¿me ayudas a revisar y aprobar la cotización ${cotizacion.folio} de ${MARCA.nombre} para ${cotizacion.empresa}? Aquí la ves y la firmas: ${enlace.url}`
    : '';

  if (error) return <p className="text-[12.5px] text-red mt-3">{error}</p>;
  if (otros.length === 0 && solicitudes.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-line">
      {otros.length > 0 && (
        <>
          <p className="text-[13px] font-semibold mb-1">Pedir aprobación por WhatsApp</p>
          <p className="text-[12.5px] text-muted mb-2.5">Le llega un enlace para ver el PDF y firmar desde su celular, sin entrar a la app.</p>
          <div className="flex flex-wrap gap-2">
            {otros.map((a) => (
              <button key={a.id} type="button" onClick={() => crearEnlace(a)} disabled={creando !== null}
                className={`min-h-[44px] px-3.5 rounded-xl border text-[13.5px] font-semibold flex items-center gap-1.5 disabled:opacity-60 ${enlace?.aprobador === a.full_name ? 'border-teal bg-teal/10 text-teal' : 'border-line-strong'}`}>
                {creando === a.id ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} strokeWidth={2.4} />} {a.full_name}
              </button>
            ))}
          </div>
        </>
      )}

      {enlace && (
        <div className="mt-3 rounded-xl border border-teal/40 bg-teal/5 p-3">
          <p className="text-[13px] mb-2">Enlace listo para <b>{enlace.aprobador}</b> (vence en 7 días, sirve una vez).</p>
          <div className="flex flex-wrap gap-2">
            <a href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`} target="_blank" rel="noopener noreferrer"
              className="flex-1 min-w-[180px] min-h-[46px] rounded-xl bg-[#25D366] text-white font-semibold text-[14px] flex items-center justify-center gap-2">
              <MessageCircle size={17} strokeWidth={2.4} /> Mandar por WhatsApp
            </a>
            <button type="button" onClick={() => copiar(enlace.url)} className="min-h-[46px] px-3.5 rounded-xl border border-line-strong text-[13.5px] font-semibold flex items-center gap-1.5">
              <Copy size={15} /> Copiar enlace
            </button>
          </div>
        </div>
      )}

      {solicitudes.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {solicitudes.map((s) => {
            const vencida = !s.respondido_en && new Date(s.vence_en).getTime() < Date.now();
            return (
              <li key={s.id} className="text-[12.5px] flex items-start gap-2">
                {s.resultado === 'aprobada' ? <CheckCircle2 size={15} className="text-teal shrink-0 mt-px" />
                  : s.resultado === 'cambios' ? <MessageSquareWarning size={15} className="text-amber shrink-0 mt-px" />
                  : <Clock size={15} className="text-muted shrink-0 mt-px" />}
                <span className="min-w-0">
                  <b>{nombreDe(s.aprobador_id)}</b>
                  {s.resultado === 'aprobada' ? ' aprobó' : s.resultado === 'cambios' ? ' pidió cambios' : vencida ? ': el enlace venció' : ': sin responder'}
                  <span className="text-muted"> · enviado {fecha(s.pedido_en)}</span>
                  {s.comentario && <span className="block text-ink/85 mt-0.5">«{s.comentario}»</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
