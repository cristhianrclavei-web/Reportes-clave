'use client';

import { useState } from 'react';
import { PenLine, Copy, Check } from 'lucide-react';
import { createClient } from '@/lib/supabaseClient';
import { MARCA } from '@/lib/marca';
import { fechaDMA } from '@/lib/etiquetaMantenimiento';
import { showToast } from '@/components/Toast';

// Firma del cliente pendiente (no estaba al terminar el servicio): genera el
// enlace público /firmar/<token> para mandarlo por WhatsApp. El mismo enlace
// se reutiliza mientras esté vigente (vence a los 7 días).
export default function FirmaPendiente({ report }: { report: { id: string; fecha: string; empresa_cliente: string; data: any } }) {
  const ausente = report.data?.clienteAusente;
  const [enlace, setEnlace] = useState<{ url: string; vence: string } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  // Reportes que se guardaron sin firma pero sin marcar «el cliente no
  // está» (p. ej. los anteriores a esta función): la opción queda discreta.
  const [abierto, setAbierto] = useState(Boolean(report.data?.firmaPendiente || ausente));

  async function obtenerEnlace() {
    if (enlace) return enlace;
    setCargando(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('crear_enlace_firma', { p_report_id: report.id });
      if (error) throw error;
      const e = { url: `${MARCA.appUrl.replace(/\/$/, '')}/firmar/${data.token}`, vence: String(data.venceEn).slice(0, 10) };
      setEnlace(e);
      return e;
    } catch (e: any) {
      showToast(e?.message || 'No se pudo generar el enlace de firma', 'error');
      return null;
    } finally {
      setCargando(false);
    }
  }

  function mensaje(url: string) {
    return `Hola, le comparto el reporte de servicio de ${MARCA.nombre} del ${fechaDMA(report.fecha)} (${report.empresa_cliente}, folio ${report.id.slice(0, 8).toUpperCase()}) para su firma de conformidad: ${url}`;
  }

  async function porWhatsApp() {
    // La ventana se abre antes de esperar a la red: si se abre después, el
    // navegador del celular la bloquea por no venir directo del toque.
    const ventana = window.open('', '_blank');
    const e = await obtenerEnlace();
    if (!e) { ventana?.close(); return; }
    const url = `https://wa.me/?text=${encodeURIComponent(mensaje(e.url))}`;
    if (ventana) ventana.location.href = url;
    else window.location.href = url;
  }

  async function copiar() {
    const e = await obtenerEnlace();
    if (!e) return;
    try {
      await navigator.clipboard.writeText(mensaje(e.url));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      showToast('No se pudo copiar; mantén presionado el enlace para copiarlo', 'error');
    }
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="flex items-center gap-1.5 text-[13px] font-semibold text-teal py-1">
        <PenLine size={15} /> Pedir la firma del cliente por enlace
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-amber/40 bg-amber/5 p-4">
      <div className="flex items-start gap-2.5">
        <PenLine size={18} className="text-amber shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold">Firma del cliente pendiente</p>
          {ausente ? (
            <p className="text-[12.5px] text-muted leading-snug">
              {ausente.motivo || 'El cliente no estaba'}
              {ausente.recibioNombre ? ` · Recibió: ${ausente.recibioNombre}${ausente.recibioPuesto ? ` (${ausente.recibioPuesto})` : ''}` : ''}
            </p>
          ) : (
            <p className="text-[12.5px] text-muted leading-snug">Este reporte no tiene la firma del cliente.</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <button type="button" onClick={porWhatsApp} disabled={cargando}
          className="min-h-[44px] rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold active:scale-95 transition-transform disabled:opacity-60">
          {cargando ? 'Generando…' : 'Enviar por WhatsApp'}
        </button>
        <button type="button" onClick={copiar} disabled={cargando}
          className="min-h-[44px] rounded-xl bg-surface-2 border border-line text-[13px] font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-transform disabled:opacity-60">
          {copiado ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar enlace</>}
        </button>
      </div>
      {enlace && (
        <p className="text-[11.5px] text-muted mt-2 break-all">
          {enlace.url} · vence el {fechaDMA(enlace.vence)}. Cuando el cliente firme te llega un aviso y la firma aparece en el PDF.
        </p>
      )}
    </div>
  );
}
