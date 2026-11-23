'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, MessageSquareWarning } from 'lucide-react';
import SignaturePad, { type SignaturePadHandle } from '@/components/SignaturePad';

// Aprobar con firma o pedir cambios con un comentario. El servidor valida
// todo otra vez (aprobacion_remota_responder).
export default function FormAprobar({ token, aprobador }: { token: string; aprobador: string }) {
  const [modo, setModo] = useState<'aprobar' | 'cambios'>('aprobar');
  const [firma, setFirma] = useState<string | null>(null);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<'aprobada' | 'cambios' | null>(null);
  const padRef = useRef<SignaturePadHandle>(null);

  async function enviar() {
    setError(null);
    if (modo === 'aprobar' && !firma) {
      setError('Falta tu firma.');
      return;
    }
    if (modo === 'cambios' && comentario.trim().length < 3) {
      setError('Escribe qué hay que cambiar.');
      return;
    }
    if (comentario.trim().length > 600) {
      setError('El comentario es muy largo (máximo 600 letras).');
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch('/api/aprobar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, aprobar: modo === 'aprobar', firma: modo === 'aprobar' ? firma : null, comentario: comentario.trim() || null }),
      });
      const cuerpo = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(cuerpo?.error || 'No se pudo guardar.');
      setListo(modo === 'aprobar' ? 'aprobada' : 'cambios');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  if (listo) {
    return (
      <div className="rounded-3xl bg-teal/10 border border-teal/30 p-6 text-center">
        <CheckCircle2 size={34} className="mx-auto text-teal mb-2" />
        <p className="font-display font-bold text-[20px]">{listo === 'aprobada' ? '¡Cotización aprobada!' : 'Listo, pediste cambios'}</p>
        <p className="text-[14px] text-ink/75 mt-1">
          {listo === 'aprobada' ? 'Tu firma quedó en la cotización y ya se puede enviar al cliente.' : 'Ya le avisamos a quien la armó. Te mandará el enlace otra vez cuando la corrija.'}
          {' '}Ya puedes cerrar esta página.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-surface border border-line p-5">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 border border-line p-1 mb-4" role="tablist">
        {(['aprobar', 'cambios'] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={modo === m} onClick={() => { setModo(m); setError(null); }}
            className={`min-h-[42px] rounded-lg text-[14px] font-semibold ${modo === m ? 'bg-teal text-inkOnAccent' : 'text-muted'}`}>
            {m === 'aprobar' ? 'Aprobar' : 'Pedir cambios'}
          </button>
        ))}
      </div>

      {modo === 'aprobar' ? (
        <>
          <p className="text-[13px] text-ink/80 mb-3">Firmas como <b>{aprobador}</b>. Revisa la cotización antes de firmar.</p>
          <div className="rounded-xl overflow-hidden border border-line">
            <SignaturePad ref={padRef} titulo="Tu firma" onCambio={setFirma} />
          </div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted mt-3 mb-1.5">Comentario (opcional)</label>
        </>
      ) : (
        <p className="flex items-start gap-2 text-[13px] text-ink/80 mb-3">
          <MessageSquareWarning size={17} className="text-amber shrink-0 mt-px" />
          Escribe qué hay que corregir. La cotización sigue en borrador y le llega el aviso a quien la armó.
        </p>
      )}
      <textarea
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        maxLength={600}
        placeholder={modo === 'aprobar' ? 'Algo que deba saber quien la envía' : 'Ej. Cambiar la batería por la de 200 Ah y agregar la tierra física'}
        className="w-full min-h-[80px] px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]"
      />
      {error && <p className="text-[13px] text-red font-semibold mt-3">{error}</p>}
      <button type="button" onClick={enviar} disabled={enviando}
        className={`w-full mt-4 min-h-[50px] rounded-2xl font-semibold text-[15px] disabled:opacity-50 active:scale-[0.98] transition-transform ${modo === 'aprobar' ? 'bg-teal text-inkOnAccent' : 'bg-amber text-inkOnAccent'}`}>
        {enviando ? 'Enviando…' : modo === 'aprobar' ? 'Firmar y aprobar' : 'Pedir cambios'}
      </button>
    </div>
  );
}
