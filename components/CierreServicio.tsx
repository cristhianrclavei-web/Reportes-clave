'use client';

import { useState } from 'react';
import { CheckCircle2, CircleDashed, Ban, Clock, Camera } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { Servicio, CierreServicio } from '@/lib/serviciosProgramados';
import { MOTIVOS, MARGEN_MIN, desfaseSalida, ResultadoCierre } from '@/lib/eficiencia';
import { formatMinutos } from '@/lib/kpis';

// Preguntas al técnico para medir la eficiencia del servicio (lib/eficiencia.ts):
//   - al cerrar, siempre: ¿cómo quedó el trabajo?
//   - solo si hubo desviación: ¿por qué llegó tarde / se pasó / no terminó?
// Al técnico no se le dice qué motivos cuentan en contra: la lista es una sola.

function ListaMotivos({
  donde, valor, onChange, comentario, onComentario,
}: {
  donde: 'llegada' | 'cierre';
  valor: string | null;
  onChange: (clave: string) => void;
  comentario: string;
  onComentario: (v: string) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        {MOTIVOS.filter((m) => m[donde]).map((m) => (
          <button
            key={m.clave}
            type="button"
            onClick={() => onChange(m.clave)}
            aria-pressed={valor === m.clave}
            className={`min-h-[44px] px-3.5 rounded-xl border text-left text-[14px] transition-colors ${
              valor === m.clave ? 'border-teal bg-teal/12 font-semibold' : 'border-line bg-surface-2/60'
            }`}
          >
            {m.texto}
          </button>
        ))}
      </div>
      <textarea
        value={comentario}
        onChange={(e) => onComentario(e.target.value)}
        placeholder={valor === 'otro' ? 'Cuéntanos qué pasó' : 'Comentario (opcional)'}
        className="w-full px-3 py-2.5 mt-2 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[13.5px] min-h-[60px]"
      />
    </>
  );
}

// «Otro» sin explicación no dice nada: ahí el comentario es obligatorio.
function motivoCompleto(motivo: string | null, comentario: string): boolean {
  return !!motivo && (motivo !== 'otro' || comentario.trim().length >= 3);
}

// Llegó más de 15 min después de lo acordado. Se pregunta después de marcar
// la llegada (que puede ser automática por GPS) y no se puede saltar.
export function ModalMotivoLlegada({
  minutos, busy, onGuardar,
}: {
  minutos: number;
  busy: boolean;
  onGuardar: (motivo: string, comentario: string) => void;
}) {
  const [motivo, setMotivo] = useState<string | null>(null);
  const [comentario, setComentario] = useState('');
  return (
    <ModalOverlay onClose={() => {}}>
      <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-2.5 mb-1.5">
          <span className="w-9 h-9 rounded-full bg-amber/15 flex items-center justify-center shrink-0">
            <Clock size={18} strokeWidth={2.4} className="text-amber" />
          </span>
          <p className="font-display font-bold text-[17px] leading-tight">Llegaste {formatMinutos(minutos)} después de la hora acordada</p>
        </div>
        <p className="text-[13.5px] text-muted mb-3.5">¿Qué pasó? Así queda registrado el motivo y no solo el retraso.</p>
        <ListaMotivos donde="llegada" valor={motivo} onChange={setMotivo} comentario={comentario} onComentario={setComentario} />
        <button
          type="button"
          disabled={busy || !motivoCompleto(motivo, comentario)}
          onClick={() => onGuardar(motivo!, comentario)}
          className="w-full min-h-[50px] mt-3 rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15px] active:scale-95 transition-transform disabled:opacity-50"
        >
          {busy ? 'Guardando...' : 'Guardar motivo'}
        </button>
      </div>
    </ModalOverlay>
  );
}

const OPCIONES: { clave: ResultadoCierre; Icono: any; color: string }[] = [
  { clave: 'terminado', Icono: CheckCircle2, color: 'text-teal' },
  { clave: 'pendiente', Icono: CircleDashed, color: 'text-amber' },
  { clave: 'no_realizado', Icono: Ban, color: 'text-red' },
];

// Cierre del día. El resultado es obligatorio aunque el servicio no tenga
// tareas: es la única forma de saber si salir antes fue porque se acabó.
export function ModalCierre({
  servicio, totalTareas, tareasPendientes, ahora, busy, sinFotos = false, onTomarFoto, onCancelar, onConfirmar,
}: {
  // El día no tiene ninguna foto: se avisa antes de cerrar, que es cuando
  // todavía se puede tomar.
  sinFotos?: boolean;
  onTomarFoto?: () => void;
  servicio: Servicio;
  totalTareas: number;
  tareasPendientes: number;
  ahora: number;
  busy: boolean;
  onCancelar: () => void;
  onConfirmar: (cierre: CierreServicio) => void;
}) {
  const esUltimoDia = servicio.numero_dia >= servicio.dias_totales;
  // En un proyecto de varios días lo que se responde es por el día de hoy.
  const textos: Record<ResultadoCierre, string> = esUltimoDia
    ? { terminado: 'Trabajo terminado', pendiente: 'Quedó trabajo pendiente', no_realizado: 'No se pudo realizar' }
    : { terminado: 'Se cumplió lo planeado para hoy', pendiente: 'Quedó pendiente trabajo de hoy', no_realizado: 'Hoy no se pudo trabajar' };

  // Con todas las tareas completas la respuesta ya se sabe; se deja marcada.
  const [resultado, setResultado] = useState<ResultadoCierre | null>(totalTareas > 0 && tareasPendientes === 0 ? 'terminado' : null);
  const [motivoResultado, setMotivoResultado] = useState<string | null>(null);
  const [comentarioResultado, setComentarioResultado] = useState('');
  const [motivoSalida, setMotivoSalida] = useState<string | null>(null);
  const [comentarioSalida, setComentarioSalida] = useState('');

  const desfase = desfaseSalida({ ...servicio, hora_fin: new Date(ahora).toISOString() });
  const sePaso = desfase !== null && desfase > MARGEN_MIN;
  const saleAntes = desfase !== null && desfase < -MARGEN_MIN;

  const pideMotivoResultado = resultado !== null && resultado !== 'terminado';
  const listo = resultado !== null
    && (!pideMotivoResultado || motivoCompleto(motivoResultado, comentarioResultado))
    && (!sePaso || motivoCompleto(motivoSalida, comentarioSalida));

  return (
    <ModalOverlay onClose={() => !busy && onCancelar()}>
      <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[90vh] overflow-y-auto">
        <p className="font-display font-bold text-[18px] tracking-wide mb-1">¿Cómo quedó el trabajo?</p>
        <p className="text-[13px] text-muted mb-3.5">
          {totalTareas === 0
            ? 'Este servicio no tiene lista de tareas: tu respuesta es lo que queda registrado.'
            : tareasPendientes > 0
              ? `Hay ${tareasPendientes} de ${totalTareas} tarea(s) sin completar${esUltimoDia ? '' : '; siguen disponibles el siguiente día'}.`
              : 'Todas las tareas están completas.'}
        </p>

        {sinFotos && onTomarFoto && (
          <div className="mb-3.5 p-3 rounded-xl bg-amber/10 border border-amber/30">
            <p className="text-[13px] text-ink/85 leading-snug mb-2">No registraste ninguna foto de evidencia en este servicio. Una vez cerrado ya no se pueden agregar.</p>
            <button type="button" onClick={onTomarFoto} className="min-h-[42px] px-3.5 rounded-xl bg-amber text-inkOnAccent text-[13.5px] font-semibold inline-flex items-center gap-2 active:scale-95 transition-transform">
              <Camera size={16} strokeWidth={2.5} />
              Tomar foto ahora
            </button>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {OPCIONES.map(({ clave, Icono, color }) => (
            <button
              key={clave}
              type="button"
              onClick={() => setResultado(clave)}
              aria-pressed={resultado === clave}
              className={`min-h-[52px] px-3.5 rounded-2xl border flex items-center gap-3 text-left text-[14.5px] font-semibold transition-colors ${
                resultado === clave ? 'border-teal bg-teal/12' : 'border-line bg-surface-2/60'
              }`}
            >
              <Icono size={20} strokeWidth={2.3} className={`${color} shrink-0`} />
              {textos[clave]}
            </button>
          ))}
        </div>

        {saleAntes && resultado === 'terminado' && (
          <p className="text-[12.5px] text-teal mt-3">Cierras {formatMinutos(-desfase!)} antes de lo programado con el trabajo terminado. Queda como tiempo a favor.</p>
        )}

        {pideMotivoResultado && (
          <div className="mt-4">
            <p className="text-[11px] uppercase tracking-wider text-muted mb-1.5">¿Por qué no se terminó?</p>
            <ListaMotivos donde="cierre" valor={motivoResultado} onChange={setMotivoResultado} comentario={comentarioResultado} onComentario={setComentarioResultado} />
          </div>
        )}

        {sePaso && (
          <div className="mt-4">
            <p className="text-[11px] uppercase tracking-wider text-muted mb-1.5">
              Cierras {formatMinutos(desfase!)} después de lo programado. ¿Por qué?
            </p>
            <ListaMotivos donde="cierre" valor={motivoSalida} onChange={setMotivoSalida} comentario={comentarioSalida} onComentario={setComentarioSalida} />
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCancelar} disabled={busy} className="flex-1 min-h-[50px] rounded-2xl border border-line-strong text-ink/80 text-[14.5px] font-semibold active:scale-95 transition-transform disabled:opacity-60">
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy || !listo}
            onClick={() => onConfirmar({
              resultado: resultado!,
              resultadoMotivo: pideMotivoResultado ? motivoResultado : null,
              resultadoComentario: pideMotivoResultado ? comentarioResultado : '',
              salidaMotivo: sePaso ? motivoSalida : null,
              salidaComentario: sePaso ? comentarioSalida : '',
            })}
            className="flex-1 min-h-[50px] rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15px] active:scale-95 transition-transform disabled:opacity-50"
          >
            {busy ? 'Cerrando...' : 'Concluir'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
