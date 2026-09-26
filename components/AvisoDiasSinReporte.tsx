'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabaseClient';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import { horaActualMexico } from '@/lib/horaMexico';
import { sumarDias } from '@/lib/fechaHoy';
import {
  HORA_CORTE_MIN, INICIO_COBERTURA, MOTIVOS, MotivoJustificacion, fechaCorta, inicioVentana,
} from '@/lib/coberturaReportes';
import { CalendarX, FileText, MessageSquareText } from 'lucide-react';

function diaSemana(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'long' });
}

// Días sin reporte ni justificación del técnico en sesión. Es el respaldo
// del recordatorio push (6pm / 9am): aunque no haya activado las
// notificaciones, aquí ve lo que le falta y lo resuelve.
//
// La fecha de hoy se lee en el efecto, nunca en el render (ver
// feedback de hidratación: Vercel corre en UTC).
export default function AvisoDiasSinReporte() {
  const [pendientes, setPendientes] = useState<string[]>([]);
  const [justificando, setJustificando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState<MotivoJustificacion | ''>('');
  const [detalle, setDetalle] = useState('');
  const [guardando, setGuardando] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { fecha: hoy, horaMin } = horaActualMexico();
      const hasta = horaMin >= HORA_CORTE_MIN ? hoy : sumarDias(hoy, -1);
      const desde = inicioVentana(hoy);
      if (hasta < INICIO_COBERTURA || desde > hasta) return;

      const { data, error } = await supabase.rpc('dias_sin_reporte', {
        p_desde: desde,
        p_hasta: hasta,
        p_tecnico: user.id,
      });
      if (error) {
        console.error('No se pudieron leer los días sin reporte:', error.message);
        return;
      }
      const fechas = ((data as any[]) || []).map((r) => r.fecha as string).sort().reverse();
      setPendientes(fechas);

      // Al llegar desde la notificación, se lleva la vista al aviso.
      if (fechas.length > 0 && new URLSearchParams(window.location.search).has('pendientes')) {
        setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
      }
    })();
  }, []);

  if (pendientes.length === 0) return null;

  function abrir(fecha: string) {
    setJustificando(fecha);
    setMotivo('');
    setDetalle('');
  }

  async function guardar() {
    if (!justificando || !motivo) return;
    if (motivo === 'otro' && detalle.trim().length < 3) {
      showToast('Especifica el motivo.', 'error');
      return;
    }
    setGuardando(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No hay sesión activa');
      const { error } = await supabase.from('justificaciones_dia').insert({
        tecnico_id: user.id,
        fecha: justificando,
        motivo,
        detalle: detalle.trim() || null,
      });
      // 23505 = ya existía una para ese día (p. ej. desde otro dispositivo):
      // el día ya está cubierto, que es lo que importa.
      if (error && error.code !== '23505') throw error;
      setPendientes((prev) => prev.filter((f) => f !== justificando));
      setJustificando(null);
      showToast('Día justificado.', 'success');
    } catch (e: any) {
      showToast('No se pudo guardar: ' + (e?.message || 'error'), 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <div ref={ref} className="mb-4 p-4 rounded-2xl bg-amber/12 border-2 border-amber/40 scroll-mt-20">
        <p className="text-[14px] font-semibold text-amber mb-0.5 flex items-center gap-2">
          <CalendarX size={17} strokeWidth={2.4} className="shrink-0" />
          {pendientes.length === 1 ? 'Falta reporte de 1 día' : `Faltan reportes de ${pendientes.length} días`}
        </p>
        <p className="text-[12.5px] text-ink/80 leading-relaxed mb-3">
          Haz el reporte, o si ese día no hubo servicio, justifícalo.
        </p>
        <ul className="flex flex-col gap-2">
          {pendientes.map((f) => (
            <li key={f} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-surface border border-line">
              <span className="text-[13.5px] font-semibold min-w-0">
                {fechaCorta(f)} <span className="text-muted font-normal capitalize">· {diaSemana(f)}</span>
              </span>
              <span className="flex gap-1.5 shrink-0">
                <Link
                  href={`/nuevo?fecha=${f}`}
                  className="px-2.5 py-1.5 rounded-lg bg-teal text-white text-[12.5px] font-semibold flex items-center gap-1"
                >
                  <FileText size={14} strokeWidth={2.4} /> Reporte
                </Link>
                <button
                  onClick={() => abrir(f)}
                  className="px-2.5 py-1.5 rounded-lg bg-surface-2 border border-line text-[12.5px] font-semibold flex items-center gap-1"
                >
                  <MessageSquareText size={14} strokeWidth={2.4} /> Justificar
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {justificando && (
        <ModalOverlay onClose={() => !guardando && setJustificando(null)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[92vh] overflow-y-auto">
            <p className="font-display font-semibold text-[17px] mb-1">
              Justificar el {fechaCorta(justificando)}
            </p>
            <p className="text-[13px] text-muted mb-4 leading-relaxed">
              Queda registrado en Actividad y ya no se te recordará este día.
            </p>
            <div className="flex flex-col gap-2 mb-3">
              {MOTIVOS.map((m) => (
                <label
                  key={m.valor}
                  className={`p-3 rounded-xl border cursor-pointer flex items-start gap-2.5 ${
                    motivo === m.valor ? 'border-teal bg-teal/10' : 'border-line bg-surface'
                  }`}
                >
                  <input
                    type="radio"
                    name="motivo"
                    value={m.valor}
                    checked={motivo === m.valor}
                    onChange={() => setMotivo(m.valor)}
                    className="mt-1 accent-teal"
                  />
                  <span>
                    <span className="text-[14px] font-semibold block">{m.label}</span>
                    {m.detalle && <span className="text-[12px] text-muted">{m.detalle}</span>}
                  </span>
                </label>
              ))}
            </div>
            <label className="text-[13px] text-ink/75 block mb-1.5">
              {motivo === 'otro' ? 'Especifica el motivo (obligatorio)' : 'Comentario (opcional)'}
            </label>
            <textarea
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[15px] mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setJustificando(null)}
                disabled={guardando}
                className="flex-1 min-h-[48px] rounded-xl bg-surface-2 border border-line font-semibold text-[14px]"
              >
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={guardando || !motivo || (motivo === 'otro' && detalle.trim().length < 3)}
                className="flex-1 min-h-[48px] rounded-xl bg-teal text-white font-semibold text-[14px] disabled:opacity-50"
              >
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </>
  );
}
