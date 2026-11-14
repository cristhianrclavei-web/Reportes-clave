'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, MapPin, MessageSquareText } from 'lucide-react';
import { createClient } from '@/lib/supabaseClient';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import { horaActualMexico } from '@/lib/horaMexico';
import { fechaCorta, inicioVentana } from '@/lib/coberturaReportes';
import {
  MOTIVOS_VISITA, enlaceReporteDeVisita, errorDeJustificacion, textoHorario, visitasPendientes,
  type MotivoVisita, type VisitaExigible,
} from '@/lib/visitasExigibles';
import { cargarVisitas, faltaElParche, justificarVisita } from '@/lib/visitasExigiblesDatos';

// Visitas que el rastreo del teléfono detectó con un cliente y que no tienen
// reporte ni levantamiento. Va junto al aviso de «días sin reporte»: el día
// puede estar cubierto con un reporte y aun así faltar el de otro cliente.
//
// La fecha de hoy se lee en el efecto, nunca en el render (Vercel corre en UTC).
export default function AvisoVisitasSinReporte() {
  const [pendientes, setPendientes] = useState<VisitaExigible[]>([]);
  const [justificando, setJustificando] = useState<VisitaExigible | null>(null);
  const [motivo, setMotivo] = useState<MotivoVisita | ''>('');
  const [detalle, setDetalle] = useState('');
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        // getSession es local: no depende de la red para saber quién es.
        const { data } = await createClient().auth.getSession();
        const usuario = data.session?.user;
        if (!usuario) return;
        const { fecha: hoy, horaMin } = horaActualMexico();
        const visitas = await cargarVisitas(inicioVentana(hoy), hoy, usuario.id);
        if (!cancelado) setPendientes(visitasPendientes(visitas, hoy, horaMin));
      } catch (error: any) {
        // Es un aviso de apoyo: si no carga (sin señal, o la base todavía sin
        // el parche) la pantalla sigue igual. El recordatorio también llega
        // por notificación.
        if (!faltaElParche(error)) console.error('No se pudieron leer las visitas sin reporte:', error?.message);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  if (pendientes.length === 0) return null;

  function abrir(visita: VisitaExigible) {
    setJustificando(visita);
    setMotivo('');
    setDetalle('');
    setErrorFormulario(null);
  }

  async function guardar() {
    if (!justificando) return;
    const problema = errorDeJustificacion(motivo, detalle);
    if (problema || !motivo) {
      setErrorFormulario(problema || 'Elige el motivo.');
      return;
    }
    setErrorFormulario(null);
    setGuardando(true);
    try {
      await justificarVisita(justificando.id, motivo, detalle);
      setPendientes((prev) => prev.filter((v) => v.id !== justificando.id));
      setJustificando(null);
      showToast('Justificación enviada. Tu supervisor la revisará.', 'success');
    } catch (error: any) {
      setErrorFormulario(error?.message || 'No se pudo guardar. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  const motivoElegido = MOTIVOS_VISITA.find((m) => m.valor === motivo);

  return (
    <>
      <div className="mb-4 p-4 rounded-2xl bg-amber/12 border-2 border-amber/40">
        <p className="text-[14px] font-semibold text-amber mb-0.5 flex items-center gap-2">
          <MapPin size={17} strokeWidth={2.4} className="shrink-0" />
          {pendientes.length === 1 ? 'Falta el reporte de 1 visita' : `Faltan reportes de ${pendientes.length} visitas`}
        </p>
        <p className="text-[12.5px] text-ink/80 leading-relaxed mb-3">
          El rastreo del teléfono te ubica con estos clientes. Haz el reporte (o el levantamiento), o justifica la visita.
        </p>
        <ul className="flex flex-col gap-2">
          {pendientes.map((visita) => (
            <li key={visita.id} className="p-2.5 rounded-xl bg-surface border border-line">
              <p className="text-[13.5px] font-semibold leading-snug">{visita.cliente}</p>
              <p className="text-[12.5px] text-muted">
                {fechaCorta(visita.fecha)} · {textoHorario(visita)}
              </p>
              {visita.justificacion_estado === 'rechazada' && (
                <p className="text-[12px] text-red font-semibold mt-0.5">
                  Tu supervisor rechazó la justificación: hace falta el reporte.
                </p>
              )}
              {visita.cerca_con_registro && (
                <p className="text-[12px] text-muted mt-0.5">
                  Ese día sí hay reporte de un cliente vecino: {visita.cerca_con_registro}.
                </p>
              )}
              <span className="flex gap-1.5 mt-2">
                <Link
                  href={enlaceReporteDeVisita(visita)}
                  className="px-2.5 py-1.5 rounded-lg bg-teal text-white text-[12.5px] font-semibold flex items-center gap-1"
                >
                  <FileText size={14} strokeWidth={2.4} /> Reporte
                </Link>
                <button
                  type="button"
                  onClick={() => abrir(visita)}
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
            <p className="font-display font-semibold text-[17px] mb-1">Justificar la visita</p>
            <p className="text-[13px] text-muted mb-4 leading-relaxed">
              {justificando.cliente} · {fechaCorta(justificando.fecha)} · {textoHorario(justificando)}. Tu supervisor la revisa; si la rechaza, la visita vuelve a pedir reporte.
            </p>
            <div className="flex flex-col gap-2 mb-3">
              {MOTIVOS_VISITA.map((m) => (
                <label
                  key={m.valor}
                  className={`p-3 rounded-xl border cursor-pointer flex items-start gap-2.5 ${
                    motivo === m.valor ? 'border-teal bg-teal/10' : 'border-line bg-surface'
                  }`}
                >
                  <input
                    type="radio"
                    name="motivo-visita"
                    value={m.valor}
                    checked={motivo === m.valor}
                    onChange={() => { setMotivo(m.valor); setErrorFormulario(null); }}
                    className="mt-1 accent-teal"
                  />
                  <span>
                    <span className="text-[14px] font-semibold block">{m.label}</span>
                    <span className="text-[12px] text-muted">{m.detalle}</span>
                  </span>
                </label>
              ))}
            </div>
            <label htmlFor="detalle-visita" className="text-[13px] text-ink/75 block mb-1.5">
              {motivoElegido ? motivoElegido.pregunta : 'Explica qué pasó'} (obligatorio)
            </label>
            <textarea
              id="detalle-visita"
              value={detalle}
              onChange={(e) => { setDetalle(e.target.value); setErrorFormulario(null); }}
              rows={3}
              maxLength={500}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[15px]"
            />
            {errorFormulario && <p className="text-[13px] text-red font-semibold mt-1.5">{errorFormulario}</p>}
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setJustificando(null)}
                disabled={guardando}
                className="flex-1 min-h-[48px] rounded-xl bg-surface-2 border border-line font-semibold text-[14px]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardar}
                disabled={guardando}
                className="flex-1 min-h-[48px] rounded-xl bg-teal text-white font-semibold text-[14px] disabled:opacity-50"
              >
                {guardando ? 'Guardando…' : 'Enviar'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </>
  );
}
