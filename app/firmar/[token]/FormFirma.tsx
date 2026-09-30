'use client';

import { useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import SignaturePad, { SignaturePadHandle } from '@/components/SignaturePad';
import { MARCA } from '@/lib/marca';

export default function FormFirma({ token }: { token: string }) {
  const [nombre, setNombre] = useState('');
  const [firma, setFirma] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const padRef = useRef<SignaturePadHandle>(null);

  const puede = nombre.trim().length >= 3 && !!firma && !enviando;

  async function enviar() {
    if (!puede) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch('/api/firmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, nombre: nombre.trim(), firma }),
      });
      const cuerpo = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(cuerpo?.error || 'No se pudo guardar la firma.');
      setListo(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar la firma. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  if (listo) {
    return (
      <div className="rounded-3xl bg-teal/10 border border-teal/30 p-6 text-center">
        <CheckCircle2 size={34} className="mx-auto text-teal mb-2" />
        <p className="font-display font-bold text-[20px]">¡Gracias, firma recibida!</p>
        <p className="text-[14px] text-ink/75 mt-1">{MARCA.nombre} ya tiene tu firma en el reporte. Ya puedes cerrar esta página.</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-surface border border-line p-5">
      <p className="text-[12px] uppercase tracking-wider text-teal font-semibold mb-3">Firma de conformidad</p>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">Tu nombre completo</label>
      <input
        type="text"
        className="w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal-glow text-[15px] mb-3"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre y apellido"
        autoComplete="name"
      />
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">Firma</label>
      <div className="rounded-xl overflow-hidden border border-line">
        <SignaturePad ref={padRef} titulo="Tu firma" onCambio={setFirma} />
      </div>
      <p className="text-[12px] text-muted mt-3 leading-relaxed">
        Al firmar confirmas que recibiste el servicio descrito arriba. La firma se agrega al reporte con la fecha y hora de hoy.
      </p>
      {error && <p className="text-[13px] text-red font-semibold mt-3">{error}</p>}
      <button
        type="button"
        onClick={enviar}
        disabled={!puede}
        className="w-full mt-4 min-h-[48px] rounded-2xl bg-teal text-inkOnAccent font-semibold text-[15px] disabled:opacity-45 active:scale-[0.98] transition-transform"
      >
        {enviando ? 'Enviando…' : 'Firmar reporte'}
      </button>
    </div>
  );
}
