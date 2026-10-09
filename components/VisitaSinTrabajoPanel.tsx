'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, CalendarClock, FileText, CheckCircle2 } from 'lucide-react';
import { Servicio, resolverVisitaSinTrabajo, reprogramarVisita } from '@/lib/serviciosProgramados';
import { textoMotivo } from '@/lib/motivosServicio';
import { TEXTO_VISITA } from '@/lib/visitaSinTrabajo';
import { showToast } from '@/components/Toast';
import SavingOverlay from '@/components/SavingOverlay';
import { useAvanceGuardado } from '@/lib/useAvanceGuardado';

// Visita sin trabajo, del lado del supervisor: ve lo que registró el técnico
// y decide si el día queda liberado del reporte o sí lo requiere. Desde aquí
// también se reprograma el servicio y se saca la hoja de visita.
//
// En un día concluido sin reporte que el técnico cerró de otra forma, deja
// liberarlo igual (p. ej. lo cerró como «pendiente» pero no se trabajó).

const TONO = {
  pendiente: { caja: 'bg-amber/10 border-amber/30', texto: 'text-amber' },
  liberado: { caja: 'bg-teal/10 border-teal/30', texto: 'text-teal' },
  rechazado: { caja: 'bg-red/10 border-red/30', texto: 'text-red' },
};

export default function VisitaSinTrabajoPanel({ servicio, onCambio }: { servicio: Servicio; onCambio: () => void }) {
  const router = useRouter();
  const [accion, setAccion] = useState<'liberado' | 'rechazado' | 'reprogramar' | null>(null);
  const [nota, setNota] = useState('');
  const [fecha, setFecha] = useState('');
  const [busy, setBusy] = useState(false);
  const { progreso, avance } = useAvanceGuardado();

  if (servicio.estado !== 'concluido') return null;
  const estado = servicio.visita_estado || null;
  // Con reporte ligado y sin visita registrada no hay nada que decidir.
  if (!estado && servicio.report_id) return null;

  async function resolver(decision: 'liberado' | 'rechazado') {
    setBusy(true);
    try {
      await resolverVisitaSinTrabajo(servicio.id, decision, nota);
      showToast(decision === 'liberado' ? 'Día liberado del reporte' : 'Se le avisó al técnico que sí requiere reporte', 'success');
      setAccion(null);
      setNota('');
      onCambio();
    } catch (e: any) {
      alert(e?.message || 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  async function reprogramar() {
    if (!fecha) return;
    setBusy(true);
    try {
      const nuevo = await reprogramarVisita(servicio.id, fecha, avance);
      showToast('Servicio reprogramado', 'success');
      router.push(`/dashboard/servicios/${nuevo.id}`);
    } catch (e: any) {
      alert(e?.message || 'No se pudo reprogramar');
      setBusy(false);
    }
  }

  const botonCls = 'min-h-[40px] px-3.5 rounded-full border text-[13px] font-semibold inline-flex items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-60';

  if (!estado) {
    return (
      <div className="mt-3">
        {accion !== 'liberado' ? (
          <button type="button" onClick={() => { setAccion('liberado'); setNota(''); }} className="text-[13px] font-semibold text-teal min-h-[40px] inline-flex items-center gap-1.5">
            <Ban size={15} strokeWidth={2.4} />
            No se trabajó: liberar este día del reporte
          </button>
        ) : (
          <div className="p-3 rounded-xl bg-surface-2 border border-line">
            <p className="text-[13px] text-ink/85 mb-2 leading-snug">El día deja de exigir reporte y queda registrado que tú lo liberaste.</p>
            <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Motivo (p. ej. el cliente no tenía el equipo)" className="w-full px-3 py-2 mb-2 rounded-lg bg-surface border border-line text-[13.5px]" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setAccion(null)} disabled={busy} className="flex-1 min-h-[42px] rounded-xl border border-line-strong text-[13.5px] font-medium">Cancelar</button>
              <button type="button" onClick={() => resolver('liberado')} disabled={busy || nota.trim().length < 3} className="flex-1 min-h-[42px] rounded-xl bg-teal text-inkOnAccent text-[13.5px] font-semibold disabled:opacity-50">{busy ? 'Guardando...' : 'Liberar'}</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const tono = TONO[estado];
  return (
    <div className={`mt-3 rounded-xl border p-3.5 ${tono.caja}`}>
      <SavingOverlay show={busy && accion === 'reprogramar'} pct={progreso.pct} label={progreso.etapa} />
      <p className={`text-[14px] font-semibold flex items-center gap-1.5 ${tono.texto}`}>
        {estado === 'liberado' ? <CheckCircle2 size={16} strokeWidth={2.5} /> : <Ban size={16} strokeWidth={2.5} />}
        {TEXTO_VISITA[estado]}
      </p>
      {servicio.resultado_motivo && (
        <p className="text-[13px] mt-1.5"><span className="text-muted">Motivo: </span><b>{textoMotivo(servicio.resultado_motivo)}</b></p>
      )}
      {servicio.resultado_comentario && <p className="text-[13px] text-ink/85 mt-1 leading-snug">«{servicio.resultado_comentario}»</p>}
      {(servicio.visita_firma_nombre || servicio.visita_firma) && (
        <p className="text-[12.5px] text-muted mt-1">
          Atendió: {servicio.visita_firma_nombre || 'sin nombre'}{servicio.visita_firma ? ' · con firma' : ' · sin firma'}
        </p>
      )}
      {servicio.visita_nota && estado !== 'pendiente' && (
        <p className="text-[12.5px] text-ink/80 mt-1.5">Nota de supervisión: {servicio.visita_nota}</p>
      )}
      {servicio.visita_revisada_en && estado !== 'pendiente' && (
        <p className="text-[11.5px] text-muted mt-1">Revisado el {new Date(servicio.visita_revisada_en).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</p>
      )}

      {accion === null && (
        <div className="flex flex-wrap gap-2 mt-3">
          {estado !== 'liberado' && !servicio.report_id && (
            <button type="button" onClick={() => { setAccion('liberado'); setNota(''); }} className={`${botonCls} bg-teal text-inkOnAccent border-teal`}>
              <CheckCircle2 size={15} strokeWidth={2.5} />
              Liberar del reporte
            </button>
          )}
          {estado !== 'rechazado' && (
            <button type="button" onClick={() => { setAccion('rechazado'); setNota(''); }} className={`${botonCls} border-line-strong text-ink/85 bg-surface`}>
              Sí requiere reporte
            </button>
          )}
          <button type="button" onClick={() => { setAccion('reprogramar'); setFecha(''); }} className={`${botonCls} border-line-strong text-ink/85 bg-surface`}>
            <CalendarClock size={15} strokeWidth={2.4} />
            Reprogramar
          </button>
          <button type="button" onClick={() => window.open(`/api/servicios/${servicio.id}/visita/pdf?t=${Date.now()}`, '_blank', 'noopener,noreferrer')} className={`${botonCls} border-line-strong text-ink/85 bg-surface`}>
            <FileText size={15} strokeWidth={2.4} />
            Hoja de visita
          </button>
        </div>
      )}

      {(accion === 'liberado' || accion === 'rechazado') && (
        <div className="mt-3 p-3 rounded-xl bg-surface border border-line">
          <p className="text-[13px] text-ink/85 mb-2 leading-snug">
            {accion === 'liberado'
              ? 'Este día deja de exigir reporte y se le avisa al técnico.'
              : 'El día vuelve a exigir reporte y se le avisa al técnico con tu explicación.'}
          </p>
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder={accion === 'liberado' ? 'Nota (opcional)' : '¿Por qué sí requiere reporte?'}
            className="w-full px-3 py-2 mb-2 rounded-lg bg-surface-2 border border-line text-[13.5px]"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => setAccion(null)} disabled={busy} className="flex-1 min-h-[42px] rounded-xl border border-line-strong text-[13.5px] font-medium">Cancelar</button>
            <button
              type="button"
              onClick={() => resolver(accion)}
              disabled={busy || (accion === 'rechazado' && nota.trim().length < 3)}
              className="flex-1 min-h-[42px] rounded-xl bg-teal text-inkOnAccent text-[13.5px] font-semibold disabled:opacity-50"
            >
              {busy ? 'Guardando...' : accion === 'liberado' ? 'Liberar' : 'Pedir reporte'}
            </button>
          </div>
        </div>
      )}

      {accion === 'reprogramar' && (
        <div className="mt-3 p-3 rounded-xl bg-surface border border-line">
          <p className="text-[13px] text-ink/85 mb-2 leading-snug">
            Se programa un servicio nuevo con el mismo cliente, técnicos, horario y las tareas que quedaron sin hacer. Este queda en el historial.
          </p>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full px-3 min-h-[44px] mb-2 rounded-lg bg-surface-2 border border-line text-[14px]" />
          <div className="flex gap-2">
            <button type="button" onClick={() => setAccion(null)} disabled={busy} className="flex-1 min-h-[42px] rounded-xl border border-line-strong text-[13.5px] font-medium">Cancelar</button>
            <button type="button" onClick={reprogramar} disabled={busy || !fecha} className="flex-1 min-h-[42px] rounded-xl bg-teal text-inkOnAccent text-[13.5px] font-semibold disabled:opacity-50">
              {busy ? 'Programando...' : 'Programar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
