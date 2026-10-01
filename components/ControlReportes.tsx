'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BellRing, ChevronDown, Link2, CheckCircle2, X } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import { hoyLocal, sumarDias, fechaLocal } from '@/lib/fechaHoy';
import { HORA_CORTE_MIN, inicioVentana, mensajePendiente, fechaCorta, MOTIVOS, MotivoJustificacion } from '@/lib/coberturaReportes';
import { notificar } from '@/lib/push';
import { cargarControl, ServicioPendiente, justificarPorTecnico } from '@/lib/controlReportes';
import { buscarReportesParaVincular, vincularReporteAServicio, ReporteParaVincular, cancelarServicio } from '@/lib/serviciosProgramados';

// Control de reportes: por técnico, lo que debe entregar y qué tan puntual
// es. Lo que debe sale de dos fuentes: servicios ya pasados sin reporte
// ligado y días hábiles sin reporte ni justificación (misma regla que los
// avisos automáticos). La puntualidad se mide con los reportes que entregó:
// cuántos los hizo el mismo día del servicio.

type Pendiente =
  | { tipo: 'servicio'; fecha: string; servicio: ServicioPendiente }
  | { tipo: 'dia'; fecha: string };

type ReporteBase = { id: string; fecha: string; created_at: string; created_by?: string | null };

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function diasEntre(desde: string, hasta: string): number {
  return Math.round((fechaLocal(hasta).getTime() - fechaLocal(desde).getTime()) / 86400000);
}

export default function ControlReportes({ reportes, onAbrirReporte }: { reportes: ReporteBase[]; onAbrirReporte: (id: string) => void }) {
  const [hoy, setHoy] = useState('');
  const [minutos, setMinutos] = useState(0);
  const [periodo, setPeriodo] = useState<7 | 30>(7);
  const [datos, setDatos] = useState<Awaited<ReturnType<typeof cargarControl>> | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [avisados, setAvisados] = useState<Set<string>>(new Set());
  const [ligando, setLigando] = useState<ServicioPendiente | null>(null);
  const [justificando, setJustificando] = useState<{ tecnicoId: string; nombre: string; fecha: string } | null>(null);
  const [cancelando, setCancelando] = useState<ServicioPendiente | null>(null);

  useEffect(() => {
    const ahora = new Date();
    setHoy(hoyLocal(ahora));
    setMinutos(ahora.getHours() * 60 + ahora.getMinutes());
  }, []);

  const cargar = useCallback(async () => {
    if (!hoy) return;
    setCargando(true);
    try {
      setDatos(await cargarControl(inicioVentana(hoy), hoy));
      setError(null);
    } catch {
      setError('No se pudo cargar el control de reportes. Revisa la conexión.');
    } finally {
      setCargando(false);
    }
  }, [hoy]);

  useEffect(() => { cargar(); }, [cargar]);

  // Un día ya se debe si pasó, o si es hoy y ya son las 18:00.
  const vencido = useCallback((f: string) => f < hoy || (f === hoy && minutos >= HORA_CORTE_MIN), [hoy, minutos]);

  const filas = useMemo(() => {
    if (!datos) return [];
    const desdePeriodo = sumarDias(hoy, -(periodo - 1));
    return datos.tecnicos.map((t) => {
      const servicios: Pendiente[] = datos.servicios
        .filter((s) => s.tecnicoIds.includes(t.id) && vencido(s.fecha))
        .map((s) => ({ tipo: 'servicio' as const, fecha: s.fecha, servicio: s }));
      const fechasServicio = new Set(servicios.map((p) => p.fecha));
      // Un día con servicio pendiente ya aparece como servicio: no se repite.
      const dias: Pendiente[] = datos.cobertura
        .filter((c) => c.tecnico_id === t.id && c.estado === 'sin_reporte' && vencido(c.fecha) && !fechasServicio.has(c.fecha))
        .map((c) => ({ tipo: 'dia' as const, fecha: c.fecha }));
      const pendientes = [...servicios, ...dias].sort((a, b) => a.fecha.localeCompare(b.fecha));

      // Puntualidad: reportes que entregó en el periodo (por fecha de servicio).
      const suyos = reportes.filter((r) => r.created_by === t.id && r.fecha >= desdePeriodo && r.fecha <= hoy);
      let mismoDia = 0, atrasoTotal = 0, tarde = 0;
      for (const r of suyos) {
        const entregado = hoyLocal(new Date(r.created_at));
        const d = diasEntre(r.fecha, entregado);
        if (d <= 0) mismoDia++;
        else { tarde++; atrasoTotal += d; }
      }
      return {
        ...t,
        pendientes,
        masAntiguo: pendientes[0] ? diasEntre(pendientes[0].fecha, hoy) : 0,
        entregados: suyos.length,
        pctMismoDia: suyos.length ? Math.round((mismoDia / suyos.length) * 100) : null,
        atrasoPromedio: tarde ? Math.round((atrasoTotal / tarde) * 10) / 10 : 0,
      };
    }).sort((a, b) => b.pendientes.length - a.pendientes.length || b.masAntiguo - a.masAntiguo || a.nombre.localeCompare(b.nombre, 'es'));
  }, [datos, reportes, hoy, periodo, vencido]);

  const totales = useMemo(() => {
    const pend = filas.reduce((n, f) => n + f.pendientes.length, 0);
    const conPend = filas.filter((f) => f.pendientes.length).length;
    const ent = filas.reduce((n, f) => n + f.entregados, 0);
    const mismo = filas.reduce((n, f) => n + Math.round(((f.pctMismoDia || 0) / 100) * f.entregados), 0);
    return { pend, conPend, pct: ent ? Math.round((mismo / ent) * 100) : null, ent };
  }, [filas]);

  async function recordar(f: (typeof filas)[number]) {
    const fechas = [...new Set(f.pendientes.map((p) => p.fecha))];
    const m = mensajePendiente('manana', fechas);
    await notificar({ usuarios: [f.id], tipo: 'reporte_pendiente', titulo: m.titulo, mensaje: `Tu supervisor te lo recuerda. ${m.cuerpo}`, url: '/mis-reportes', tag: 'reporte-pendiente' });
    setAvisados((p) => new Set(p).add(f.id));
    showToast(`Recordatorio enviado a ${f.nombre}`, 'success');
  }

  const alternar = (id: string) => setAbiertos((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  if (!hoy) return null;
  const conPendientes = filas.filter((f) => f.pendientes.length > 0);
  const alDia = filas.filter((f) => f.pendientes.length === 0);

  return (
    <div className="px-4 lg:px-0 pt-2">
      <p className="text-[13px] text-muted mb-4 leading-relaxed max-w-2xl">
        Lo que cada técnico debe entregar: servicios ya pasados sin reporte y días hábiles sin reporte ni justificación (últimos 30 días). La puntualidad cuenta los reportes hechos el mismo día del servicio.
      </p>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className={`rounded-2xl px-3 py-2.5 border ${totales.pend ? 'bg-red/10 border-red/25' : 'bg-teal/10 border-teal/25'}`}>
          <p className={`text-[22px] font-bold tabular-nums leading-none ${totales.pend ? 'text-red' : 'text-teal'}`}>{totales.pend}</p>
          <p className="text-[11.5px] font-semibold mt-1 text-muted">Pendientes</p>
        </div>
        <div className="rounded-2xl px-3 py-2.5 border bg-surface border-line">
          <p className="text-[22px] font-bold tabular-nums leading-none">{totales.conPend}<span className="text-[13px] text-muted">/{filas.length}</span></p>
          <p className="text-[11.5px] font-semibold mt-1 text-muted">Técnicos con pendientes</p>
        </div>
        <div className="rounded-2xl px-3 py-2.5 border bg-surface border-line">
          <p className="text-[22px] font-bold tabular-nums leading-none">{totales.pct === null ? '—' : `${totales.pct}%`}</p>
          <p className="text-[11.5px] font-semibold mt-1 text-muted">El mismo día ({periodo} días)</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-[12px] text-muted mr-1">Puntualidad de los últimos</span>
        {([7, 30] as const).map((p) => (
          <button key={p} type="button" onClick={() => setPeriodo(p)}
            className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium border ${periodo === p ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line'}`}>
            {p} días
          </button>
        ))}
      </div>

      {error && <p className="text-[13px] text-red font-semibold mb-3">{error}</p>}
      {cargando && !datos && <p className="text-[13px] text-muted py-6 text-center">Cargando…</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 items-start">
        {conPendientes.map((f) => {
          const abierto = abiertos.has(f.id);
          return (
            <div key={f.id} className="rounded-2xl bg-surface border border-red/30 px-3.5 py-3">
              <button type="button" onClick={() => alternar(f.id)} className="w-full text-left">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[14.5px] font-semibold truncate">{f.nombre}</p>
                  <span className="text-[12px] font-bold px-2 py-0.5 rounded-full bg-red/12 text-red shrink-0">{f.pendientes.length} pendiente{f.pendientes.length > 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-1 text-[12px] text-muted">
                  <span>
                    {f.masAntiguo > 0 ? `El más antiguo: hace ${f.masAntiguo} día${f.masAntiguo > 1 ? 's' : ''}` : 'De hoy'}
                    {f.pctMismoDia !== null ? ` · ${f.pctMismoDia}% el mismo día` : ''}
                  </span>
                  <ChevronDown size={16} className={`shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {abierto && (
                <div className="mt-2.5">
                  <Puntualidad f={f} periodo={periodo} />
                  <div className="flex flex-col mt-2">
                    {f.pendientes.map((p) => (
                      <div key={`${p.tipo}-${p.tipo === 'servicio' ? p.servicio.id : p.fecha}`} className="border-t border-line py-2 flex items-start gap-2">
                        <span className="text-[12px] text-muted w-[62px] shrink-0 tabular-nums">{DIAS[fechaLocal(p.fecha).getDay()]} {fechaCorta(p.fecha).slice(0, 5)}</span>
                        <div className="flex-1 min-w-0">
                          {p.tipo === 'servicio' ? (
                            <>
                              <p className="text-[13px] font-medium truncate">{p.servicio.proyecto}{p.servicio.dias_totales > 1 ? ` · día ${p.servicio.numero_dia}/${p.servicio.dias_totales}` : ''}</p>
                              <p className={`text-[11.5px] ${p.servicio.estado === 'programado' ? 'text-amber' : 'text-red'}`}>
                                {p.servicio.estado === 'programado' ? 'Sin actividad registrada: ¿se hizo? Reprográmalo o elimínalo si no' : 'Servicio sin reporte ligado'}
                              </p>
                              <div className="flex gap-3 mt-1 text-[12px] font-semibold">
                                {p.servicio.estado !== 'programado' && (
                                  <button type="button" onClick={() => setLigando(p.servicio)} className="text-teal flex items-center gap-1"><Link2 size={13} /> Ligar reporte</button>
                                )}
                                {p.servicio.estado === 'programado' && (
                                  <button type="button" onClick={() => setCancelando(p.servicio)} className="text-red">Cancelar servicio</button>
                                )}
                                <Link href={`/dashboard/servicios/${p.servicio.id}`} className="text-teal">Ver servicio</Link>
                              </div>
                            </>
                          ) : (
                            <>
                              <p className="text-[13px] font-medium">Día sin reporte ni justificación</p>
                              <p className="text-[11.5px] text-muted">Sin servicio programado ese día</p>
                              <button type="button" onClick={() => setJustificando({ tecnicoId: f.id, nombre: f.nombre, fecha: p.fecha })}
                                className="text-[12px] font-semibold text-teal mt-1">Dar por justificado</button>
                            </>
                          )}
                        </div>
                        <span className="text-[11px] font-semibold text-red shrink-0">{diasEntre(p.fecha, hoy) === 0 ? 'hoy' : `${diasEntre(p.fecha, hoy)} d`}</span>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => recordar(f)} disabled={avisados.has(f.id)}
                    className="mt-2 w-full min-h-[42px] rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]">
                    <BellRing size={15} /> {avisados.has(f.id) ? 'Recordatorio enviado' : 'Recordarle todo'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {datos && conPendientes.length === 0 && (
        <div className="rounded-2xl bg-teal/10 border border-teal/25 px-4 py-4 text-center text-[14px] text-teal font-semibold flex items-center justify-center gap-2">
          <CheckCircle2 size={18} /> Todos los técnicos están al día
        </div>
      )}

      {alDia.length > 0 && (
        <div className="mt-4">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted mb-2">Al día</p>
          <div className="rounded-2xl bg-surface border border-line divide-y divide-line">
            {alDia.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2 px-3.5 py-2.5">
                <span className="text-[13.5px] font-medium truncate">{f.nombre}</span>
                <span className="text-[12px] text-muted shrink-0">
                  {f.entregados} reporte{f.entregados === 1 ? '' : 's'}
                  {f.pctMismoDia !== null ? ` · ${f.pctMismoDia}% el mismo día` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {justificando && (
        <Justificar dato={justificando} onClose={() => setJustificando(null)} onListo={() => { setJustificando(null); cargar(); }} />
      )}
      {cancelando && (
        <CancelarServicio servicio={cancelando} onClose={() => setCancelando(null)} onListo={() => { setCancelando(null); cargar(); }} />
      )}
      {ligando && (
        <LigarReporte servicio={ligando} onClose={() => setLigando(null)} onAbrir={onAbrirReporte}
          onListo={() => { setLigando(null); cargar(); }} />
      )}
    </div>
  );
}

function Puntualidad({ f, periodo }: { f: { entregados: number; pctMismoDia: number | null; atrasoPromedio: number }; periodo: number }) {
  if (f.entregados === 0) return <p className="text-[12px] text-muted">Sin reportes entregados en los últimos {periodo} días.</p>;
  const pct = f.pctMismoDia || 0;
  return (
    <div>
      <div className="flex justify-between text-[12px] text-muted mb-1">
        <span>{f.entregados} entregados ({periodo} días)</span>
        <span>{pct}% el mismo día{f.atrasoPromedio ? ` · atraso prom. ${f.atrasoPromedio} d` : ''}</span>
      </div>
      <div className="h-1.5 rounded-full bg-line overflow-hidden">
        <div className={`h-full ${pct >= 80 ? 'bg-teal' : pct >= 50 ? 'bg-amber' : 'bg-red'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function LigarReporte({ servicio, onClose, onListo, onAbrir }: {
  servicio: ServicioPendiente; onClose: () => void; onListo: () => void; onAbrir: (id: string) => void;
}) {
  const [opciones, setOpciones] = useState<ReporteParaVincular[] | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  useEffect(() => {
    buscarReportesParaVincular(servicio.id).then(setOpciones).catch(() => setOpciones([]));
  }, [servicio.id]);

  async function ligar(id: string) {
    setGuardando(id);
    try {
      await vincularReporteAServicio(servicio.id, id);
      showToast('Reporte ligado al servicio', 'success');
      onListo();
    } catch (e: any) {
      showToast(e?.message || 'No se pudo ligar', 'error');
      setGuardando(null);
    }
  }

  return (
    <ModalOverlay onClose={() => !guardando && onClose()}>
      <div className="glass-strong rounded-3xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="font-display font-bold text-[19px] tracking-wide">Ligar reporte</h2>
          <button onClick={onClose} aria-label="Cerrar" className="w-10 h-10 -mr-1 -mt-1 flex items-center justify-center text-muted"><X size={19} /></button>
        </div>
        <p className="text-[13px] text-muted mb-4">{servicio.proyecto} · {fechaCorta(servicio.fecha)}. Reportes de sus técnicos de 2 días antes a 2 después que no están ligados a otro servicio.</p>
        {opciones === null && <p className="text-[13px] text-muted">Buscando…</p>}
        {opciones && opciones.length === 0 && <p className="text-[13px] text-muted">No hay reportes para ligar: el técnico todavía no lo hace.</p>}
        <div className="flex flex-col gap-2">
          {opciones?.map((r) => (
            <div key={r.id} className="rounded-xl border border-line bg-surface-2/60 p-3">
              <p className="text-[14px] font-semibold">{r.empresa_cliente}</p>
              <p className="text-[12px] text-muted">{fechaCorta(r.fecha)} · {r.tecnico} · folio {r.claveFormato}</p>
              <div className="flex gap-4 mt-2 text-[12.5px] font-semibold">
                <button type="button" onClick={() => ligar(r.id)} disabled={!!guardando} className="text-teal disabled:opacity-50">{guardando === r.id ? 'Ligando…' : 'Ligar a este servicio'}</button>
                <button type="button" onClick={() => { onClose(); onAbrir(r.id); }} className="text-muted">Ver reporte</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ModalOverlay>
  );
}

function Modal({ titulo, subtitulo, onClose, children }: { titulo: string; subtitulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <ModalOverlay onClose={onClose}>
      <div className="glass-strong rounded-3xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="font-display font-bold text-[19px] tracking-wide">{titulo}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="w-10 h-10 -mr-1 -mt-1 flex items-center justify-center text-muted"><X size={19} /></button>
        </div>
        <p className="text-[13px] text-muted mb-4">{subtitulo}</p>
        {children}
      </div>
    </ModalOverlay>
  );
}

const chipCls = (sel: boolean) =>
  `px-3 py-1.5 rounded-full text-[12.5px] font-medium mr-1.5 mb-1.5 inline-block cursor-pointer border ${sel ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 text-ink/80 border-line'}`;
const inputCls = 'w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px] placeholder:text-faint';

function Justificar({ dato, onClose, onListo }: { dato: { tecnicoId: string; nombre: string; fecha: string }; onClose: () => void; onListo: () => void }) {
  const [motivo, setMotivo] = useState<MotivoJustificacion>('sin_servicio');
  const [detalle, setDetalle] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await justificarPorTecnico({ tecnicoId: dato.tecnicoId, fecha: dato.fecha, motivo, detalle });
      showToast('Día justificado', 'success');
      onListo();
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar.');
      setGuardando(false);
    }
  }
  return (
    <Modal titulo="Dar por justificado" subtitulo={`${dato.nombre} · ${fechaCorta(dato.fecha)}. Queda registrado que tú lo justificaste.`} onClose={() => !guardando && onClose()}>
      {MOTIVOS.map((m) => (
        <span key={m.valor} className={chipCls(motivo === m.valor)} onClick={() => setMotivo(m.valor)}>{m.label}</span>
      ))}
      <input className={`${inputCls} mt-1`} value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder={motivo === 'otro' ? 'Escribe el motivo' : 'Detalle (opcional)'} />
      {error && <p className="text-[13px] text-red font-semibold mt-2">{error}</p>}
      <button type="button" onClick={guardar} disabled={guardando}
        className="w-full mt-4 min-h-[48px] rounded-2xl bg-teal text-inkOnAccent font-semibold text-[15px] disabled:opacity-50">
        {guardando ? 'Guardando…' : 'Justificar día'}
      </button>
    </Modal>
  );
}

const MOTIVOS_CANCELACION = ['El cliente canceló', 'El cliente no estaba', 'No llegó el equipo o material', 'Se reprogramó por fuera de la app', 'No se hizo'];

function CancelarServicio({ servicio, onClose, onListo }: { servicio: ServicioPendiente; onClose: () => void; onListo: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await cancelarServicio(servicio.id, motivo);
      showToast('Servicio cancelado', 'success');
      onListo();
    } catch (e: any) {
      setError(e?.message || 'No se pudo cancelar.');
      setGuardando(false);
    }
  }
  return (
    <Modal titulo="Cancelar servicio" subtitulo={`${servicio.proyecto} · ${fechaCorta(servicio.fecha)}. Queda en el historial con el motivo y ya no exige reporte.`} onClose={() => !guardando && onClose()}>
      {MOTIVOS_CANCELACION.map((m) => (
        <span key={m} className={chipCls(motivo === m)} onClick={() => setMotivo(m)}>{m}</span>
      ))}
      <input className={`${inputCls} mt-1`} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Otro motivo" />
      {error && <p className="text-[13px] text-red font-semibold mt-2">{error}</p>}
      <button type="button" onClick={guardar} disabled={guardando || !motivo.trim()}
        className="w-full mt-4 min-h-[48px] rounded-2xl bg-red text-white font-semibold text-[15px] disabled:opacity-50">
        {guardando ? 'Cancelando…' : 'Cancelar servicio'}
      </button>
    </Modal>
  );
}
