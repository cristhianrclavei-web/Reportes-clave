'use client';

import { useEffect, useState } from 'react';
import { showToast } from '@/components/Toast';
import { listarAvisosPendientes, resolverAviso, etiquetaCausa, AvisoPendiente } from '@/lib/avisos';
import { reprogramarDia } from '@/lib/serviciosProgramados';
import { TriangleAlert, CalendarCheck, X } from 'lucide-react';

// Los avisos que dejaron los técnicos sobre días que todavía no llegan.
//
// El supervisor resuelve DESDE AQUÍ. Si tuviera que entrar al proyecto, buscar
// el día y reprogramar a mano, lo dejaría para después — y el día llegaría
// igual. Por eso la fecha que propuso el técnico trae su propio botón.
export default function AvisosPendientes() {
  const [avisos, setAvisos] = useState<AvisoPendiente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState<string | null>(null);

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    try {
      setAvisos(await listarAvisosPendientes());
    } catch {
      /* si falla, la sección simplemente no aparece */
    } finally {
      setCargando(false);
    }
  }

  async function aceptarFecha(a: AvisoPendiente) {
    if (!a.servicio || !a.fecha_propuesta) return;
    setTrabajando(a.id);
    try {
      await reprogramarDia(a.servicio.id, a.fecha_propuesta);
      await resolverAviso(a.id, 'atendido', `Reprogramado al ${a.fecha_propuesta}`);
      setAvisos((prev) => prev.filter((x) => x.id !== a.id));
      showToast(`«${a.servicio.proyecto}» movido al ${a.fecha_propuesta}`, 'success');
    } catch (e: any) {
      showToast(e?.message || 'No se pudo reprogramar', 'error');
    } finally {
      setTrabajando(null);
    }
  }

  async function marcar(a: AvisoPendiente, estado: 'atendido' | 'descartado') {
    setTrabajando(a.id);
    try {
      await resolverAviso(
        a.id,
        estado,
        estado === 'atendido' ? 'Atendido por fuera de la app' : 'Sin cambios',
      );
      setAvisos((prev) => prev.filter((x) => x.id !== a.id));
      showToast(estado === 'atendido' ? 'Marcado como atendido' : 'Aviso descartado', 'success');
    } catch (e: any) {
      showToast(e?.message || 'No se pudo guardar', 'error');
    } finally {
      setTrabajando(null);
    }
  }

  if (cargando || avisos.length === 0) return null;

  return (
    <div className="rounded-2xl bg-amber/10 border border-amber/25 p-4 mb-5">
      <p className="text-[13.5px] font-semibold text-amber flex items-center gap-2 mb-1">
        <TriangleAlert size={16} strokeWidth={2.5} className="shrink-0" />
        {avisos.length === 1
          ? 'Un técnico avisó de un problema con un día'
          : `${avisos.length} avisos sobre días programados`}
      </p>
      <p className="text-[12.5px] text-ink/70 mb-4">
        Son días que todavía no llegan. Atenderlos ahora evita el viaje perdido.
      </p>

      <div className="space-y-3">
        {avisos.map((a) => {
          const ocupado = trabajando === a.id;
          return (
            <div key={a.id} className="rounded-xl bg-surface border border-line p-3.5">
              <div className="flex justify-between items-baseline gap-2 mb-1">
                <span className="font-display font-semibold text-[15px] tracking-wide truncate">
                  {a.servicio?.proyecto || 'Servicio'}
                </span>
                <span className="text-[12.5px] text-muted shrink-0">{a.servicio?.fecha}</span>
              </div>

              <p className="text-[13.5px] text-ink/85">{etiquetaCausa(a.causa)}</p>
              {a.comentario && (
                <p className="text-[13px] text-muted mt-1">«{a.comentario}»</p>
              )}
              <p className="text-[12px] text-faint mt-1.5">Avisó {a.tecnico}</p>

              <div className="flex flex-wrap gap-2 mt-3">
                {a.fecha_propuesta && (
                  <button
                    onClick={() => aceptarFecha(a)}
                    disabled={ocupado}
                    className="flex-1 min-w-[160px] min-h-[46px] px-3 rounded-xl bg-teal text-inkOnAccent font-display font-semibold text-[14px] tracking-wide flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform disabled:opacity-60"
                  >
                    <CalendarCheck size={16} strokeWidth={2.5} />
                    Mover al {a.fecha_propuesta}
                  </button>
                )}
                <button
                  onClick={() => marcar(a, 'atendido')}
                  disabled={ocupado}
                  className="flex-1 min-w-[110px] min-h-[46px] px-3 rounded-xl bg-surface-2 border border-line text-[14px] font-medium active:scale-[0.98] transition-transform disabled:opacity-60"
                >
                  Ya lo resolví
                </button>
                <button
                  onClick={() => marcar(a, 'descartado')}
                  disabled={ocupado}
                  aria-label="Descartar aviso"
                  title="Descartar: el día sigue igual"
                  className="min-w-[46px] min-h-[46px] rounded-xl bg-surface-2 border border-line text-muted flex items-center justify-center active:scale-95 transition-transform disabled:opacity-60"
                >
                  <X size={17} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
