'use client';

import { useEffect, useState } from 'react';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import {
  crearAviso, listarAvisosDeServicio, listarFestivos, festivoDe, festivosEnCache,
  CAUSAS, CausaAviso, etiquetaCausa, Aviso, Festivo,
} from '@/lib/avisos';
import { TriangleAlert, CalendarClock, Check, X } from 'lucide-react';

// El técnico avisa de un problema con un día ANTES de que llegue: el cliente
// no va a estar, es festivo, falta material. Distinto del retraso, que se
// registra cuando ya está en el sitio.
export default function AvisoServicio({
  servicioId,
  fechaServicio,
  estado,
}: {
  servicioId: string;
  fechaServicio: string;
  estado: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [festivos, setFestivos] = useState<Festivo[]>(() => festivosEnCache());

  const [causa, setCausa] = useState<CausaAviso | ''>('');
  const [comentario, setComentario] = useState('');
  const [fechaPropuesta, setFechaPropuesta] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    listarAvisosDeServicio(servicioId).then(setAvisos).catch(() => {});
    listarFestivos().then(setFestivos).catch(() => {});
  }, [servicioId]);

  const festivoDelDia = festivoDe(fechaServicio, festivos);
  const festivoPropuesto = festivoDe(fechaPropuesta, festivos);
  const pendientes = avisos.filter((a) => a.estado === 'pendiente');

  // Ya cerrado no tiene caso avisar: el día pasó.
  if (estado === 'concluido') return null;

  const faltaExplicar = causa === 'otro' && !comentario.trim();
  const puedeEnviar = causa !== '' && !faltaExplicar && !guardando;

  async function enviar() {
    if (!puedeEnviar) return;
    setGuardando(true);
    try {
      await crearAviso({
        servicioId,
        causa: causa as CausaAviso,
        comentario,
        fechaPropuesta: fechaPropuesta || null,
      });
      showToast('Aviso enviado al supervisor', 'success');
      setAbierto(false);
      setCausa(''); setComentario(''); setFechaPropuesta('');
      listarAvisosDeServicio(servicioId).then(setAvisos).catch(() => {});
    } catch (e: any) {
      showToast(e?.message || 'No se pudo enviar', 'error');
    } finally {
      setGuardando(false);
    }
  }

  const campo = 'w-full px-3.5 min-h-[48px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]';

  return (
    <>
      {/* Si el día cae en festivo se dice aquí, sin esperar a que alguien lo
          note. Es la mitad del problema resuelta sin que nadie haga nada. */}
      {festivoDelDia && pendientes.length === 0 && (
        <div className="mb-3 p-3.5 rounded-2xl bg-amber/10 border border-amber/25">
          <p className="text-[13.5px] text-amber font-semibold flex items-start gap-2">
            <CalendarClock size={16} strokeWidth={2.5} className="shrink-0 mt-0.5" />
            <span>Este día es {festivoDelDia.nombre}</span>
          </p>
          <p className="text-[12.5px] text-ink/75 mt-1.5">
            {festivoDelDia.tipo === 'oficial'
              ? 'Es asueto de ley. Si el cliente no abre, avisa para reprogramarlo.'
              : 'Muchos clientes cierran ese día aunque no sea obligatorio.'}
          </p>
        </div>
      )}

      {pendientes.length > 0 && (
        <div className="mb-3 p-3.5 rounded-2xl bg-amber/10 border border-amber/25">
          <p className="text-[13.5px] text-amber font-semibold flex items-start gap-2">
            <TriangleAlert size={16} strokeWidth={2.5} className="shrink-0 mt-0.5" />
            <span>Avisaste sobre este día</span>
          </p>
          {pendientes.map((a) => (
            <p key={a.id} className="text-[12.5px] text-ink/75 mt-1.5">
              {etiquetaCausa(a.causa)}
              {a.comentario ? ` — ${a.comentario}` : ''}
              {a.fecha_propuesta ? ` · propusiste el ${a.fecha_propuesta}` : ''}
            </p>
          ))}
          <p className="text-[12px] text-muted mt-2">Esperando respuesta del supervisor.</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="w-full min-h-[48px] mb-3 rounded-2xl bg-surface-2 border border-line text-[14.5px] font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
      >
        <TriangleAlert size={16} strokeWidth={2.4} className="text-amber" />
        Avisar de un problema con este día
      </button>

      {abierto && (
        <ModalOverlay onClose={() => !guardando && setAbierto(false)}>
          <div className="glass-strong rounded-3xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-1">
              <h2 className="font-display font-bold text-[19px] tracking-wide">Avisar de un problema</h2>
              <button
                onClick={() => setAbierto(false)}
                disabled={guardando}
                aria-label="Cerrar"
                className="w-10 h-10 -mr-1 -mt-1 flex items-center justify-center text-muted shrink-0"
              >
                <X size={19} strokeWidth={2.5} />
              </button>
            </div>
            <p className="text-[13px] text-muted mb-5">
              Para el día {fechaServicio}. Le llega al supervisor de inmediato.
            </p>

            <label className="block text-[11px] uppercase tracking-wider text-faint mb-2">
              ¿Qué pasa?
            </label>
            <div className="space-y-2 mb-5">
              {CAUSAS.map((c) => (
                <button
                  key={c.valor}
                  type="button"
                  onClick={() => setCausa(c.valor)}
                  className={`w-full min-h-[48px] px-3.5 rounded-xl border text-left text-[14.5px] flex items-center justify-between gap-2 transition-colors ${
                    causa === c.valor
                      ? 'bg-teal/12 border-teal text-ink'
                      : 'bg-surface-2 border-line text-ink/80'
                  }`}
                >
                  <span>{c.label}</span>
                  {causa === c.valor && <Check size={17} strokeWidth={2.8} className="text-teal shrink-0" />}
                </button>
              ))}
            </div>

            <label className="block text-[11px] uppercase tracking-wider text-faint mb-2">
              Detalle {causa === 'otro' ? '(obligatorio)' : '(opcional)'}
            </label>
            <textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              rows={3}
              placeholder="Qué supiste y cómo"
              className={`${campo} py-3 mb-1 resize-none`}
            />
            <p className={`text-[12.5px] mb-5 ${faltaExplicar ? 'text-red' : 'text-muted'}`}>
              {faltaExplicar
                ? 'Cuando la razón es «otra», hay que decir cuál.'
                : 'La lista sirve para contar; el detalle, para entender.'}
            </p>

            <label className="block text-[11px] uppercase tracking-wider text-faint mb-2">
              ¿Propones otra fecha? (opcional)
            </label>
            <input
              type="date"
              value={fechaPropuesta}
              onChange={(e) => setFechaPropuesta(e.target.value)}
              min={fechaServicio}
              className={campo}
            />
            {festivoPropuesto ? (
              <p className="text-[12.5px] text-amber mt-2">
                Ojo: el {fechaPropuesta} también es {festivoPropuesto.nombre}.
              </p>
            ) : (
              <p className="text-[12.5px] text-muted mt-2">
                Si no sabes cuándo sí se podrá, déjalo vacío. Avisar ya sirve.
              </p>
            )}

            <div className="flex flex-col-reverse sm:flex-row gap-2.5 mt-6">
              <button
                onClick={() => setAbierto(false)}
                disabled={guardando}
                className="flex-1 min-h-[52px] rounded-2xl bg-surface-2 border border-line font-display font-semibold text-[15.5px] tracking-wide active:scale-[0.98] transition-transform"
              >
                Cancelar
              </button>
              <button
                onClick={enviar}
                disabled={!puedeEnviar}
                className={`flex-1 min-h-[52px] rounded-2xl font-display font-semibold text-[15.5px] tracking-wide active:scale-[0.98] transition-transform ${
                  puedeEnviar ? 'bg-teal text-inkOnAccent shadow-glow-teal' : 'bg-surface-2 text-faint'
                }`}
              >
                {guardando ? 'Enviando...' : 'Enviar aviso'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </>
  );
}
