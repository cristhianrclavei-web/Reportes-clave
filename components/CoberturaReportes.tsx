'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Check, X, Minus, BellRing, FileText } from 'lucide-react';
import { createClient } from '@/lib/supabaseClient';
import { hoyLocal, sumarDias, fechaLocal } from '@/lib/fechaHoy';
import { INICIO_COBERTURA, HORA_CORTE_MIN, MOTIVOS, fechaCorta } from '@/lib/coberturaReportes';
import { notificar } from '@/lib/push';
import { showToast } from '@/components/Toast';

// Cobertura de reportes para el supervisor: por técnico y por día de la
// semana, si hubo reporte, justificación, si falta o si no se exige. La
// regla vive en SQL (cobertura_dias, mismas reglas que dias_sin_reporte, la
// que usan los avisos de las 18:00 y 9:00).

type Fila = {
  tecnico_id: string;
  tecnico: string | null;
  fecha: string;
  estado: 'reporte' | 'justificado' | 'sin_reporte' | 'no_exigible';
  festivo: string | null;
  motivo: string | null;
  detalle: string | null;
  justificado_en: string | null;
  reportes: string[];
};

// Lo que se pinta: el estado de la base, salvo días que todavía no cuentan.
type Vista = Fila['estado'] | 'futuro' | 'a_tiempo' | 'no_cuenta';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function lunesDe(fecha: string): string {
  const dia = fechaLocal(fecha).getDay();
  return sumarDias(fecha, dia === 0 ? -6 : 1 - dia);
}

function etiquetaSemana(lunes: string): string {
  const fin = sumarDias(lunes, 6);
  const [, m1, d1] = lunes.split('-').map(Number);
  const [, m2, d2] = fin.split('-').map(Number);
  return m1 === m2 ? `${d1} – ${d2} ${MESES[m2 - 1]}` : `${d1} ${MESES[m1 - 1]} – ${d2} ${MESES[m2 - 1]}`;
}

const ESTILO: Record<Vista, { cls: string; label: string }> = {
  reporte: { cls: 'bg-teal/15 text-teal border-teal/30', label: 'Con reporte' },
  justificado: { cls: 'bg-amber/15 text-amber border-amber/35', label: 'Justificado' },
  sin_reporte: { cls: 'bg-red/15 text-red border-red/35', label: 'Sin reporte' },
  no_exigible: { cls: 'bg-surface-2 text-faint border-line', label: 'No se exige' },
  a_tiempo: { cls: 'bg-transparent text-faint border-dashed border-line-strong', label: 'Hoy, aún a tiempo' },
  futuro: { cls: 'bg-transparent text-faint border-dashed border-line', label: 'Por venir' },
  no_cuenta: { cls: 'bg-transparent text-faint border-line', label: 'Antes del control' },
};

function Icono({ v, festivo }: { v: Vista; festivo?: boolean }) {
  if (v === 'reporte') return <Check size={15} strokeWidth={3} />;
  if (v === 'justificado') return <span className="text-[12px] font-bold">J</span>;
  if (v === 'sin_reporte') return <X size={15} strokeWidth={3} />;
  if (v === 'no_exigible') return festivo ? <span className="text-[11px] font-bold">F</span> : <Minus size={13} />;
  return null;
}

export default function CoberturaReportes({
  reportes,
  onAbrirReporte,
}: {
  reportes: { id: string; empresa_cliente: string }[];
  onAbrirReporte: (id: string) => void;
}) {
  // Fechas del reloj del navegador, ya montado (Vercel corre en UTC).
  const [hoy, setHoy] = useState('');
  const [minutos, setMinutos] = useState(0);
  const [lunes, setLunes] = useState('');
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<{ tecnico: string; fecha: string } | null>(null);
  const [avisados, setAvisados] = useState<Set<string>>(new Set());

  useEffect(() => {
    const ahora = new Date();
    const h = hoyLocal(ahora);
    setHoy(h);
    setMinutos(ahora.getHours() * 60 + ahora.getMinutes());
    setLunes(lunesDe(h));
  }, []);

  const dias = useMemo(() => (lunes ? Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i)) : []), [lunes]);

  useEffect(() => {
    if (!lunes) return;
    let cancelado = false;
    setCargando(true);
    setError(null);
    setSel(null);
    createClient()
      .rpc('cobertura_dias', { p_desde: lunes, p_hasta: sumarDias(lunes, 6) })
      .then(({ data, error }) => {
        if (cancelado) return;
        if (error) setError('No se pudo cargar la cobertura. Revisa la conexión.');
        setFilas((data as Fila[]) || []);
        setCargando(false);
      });
    return () => { cancelado = true; };
  }, [lunes]);

  function vista(f: Fila): Vista {
    if (f.fecha < INICIO_COBERTURA) return 'no_cuenta';
    if (f.fecha > hoy) return f.estado === 'reporte' || f.estado === 'justificado' || f.estado === 'no_exigible' ? f.estado : 'futuro';
    if (f.fecha === hoy && f.estado === 'sin_reporte' && minutos < HORA_CORTE_MIN) return 'a_tiempo';
    return f.estado;
  }

  // Técnicos con sus 7 días, en orden alfabético.
  const tecnicos = useMemo(() => {
    const mapa = new Map<string, { id: string; nombre: string; dias: Map<string, Fila> }>();
    for (const f of filas) {
      if (!mapa.has(f.tecnico_id)) mapa.set(f.tecnico_id, { id: f.tecnico_id, nombre: f.tecnico || 'Sin nombre', dias: new Map() });
      mapa.get(f.tecnico_id)!.dias.set(f.fecha, f);
    }
    return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [filas]);

  const totales = useMemo(() => {
    const t = { reporte: 0, justificado: 0, sin_reporte: 0 };
    for (const f of filas) {
      const v = vista(f);
      if (v === 'reporte' || v === 'justificado' || v === 'sin_reporte') t[v]++;
    }
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, hoy, minutos]);

  const seleccion = sel ? tecnicos.find((t) => t.id === sel.tecnico)?.dias.get(sel.fecha) : undefined;
  const nombreReporte = (id: string) => reportes.find((r) => r.id === id)?.empresa_cliente || 'Reporte';
  const etiquetaMotivo = (m: string | null) => MOTIVOS.find((x) => x.valor === m)?.label || m || '';

  async function recordar(f: Fila) {
    const clave = `${f.tecnico_id}|${f.fecha}`;
    await notificar({
      usuarios: [f.tecnico_id],
      tipo: 'reporte_pendiente',
      titulo: `Falta reporte del ${fechaCorta(f.fecha)}`,
      mensaje: 'Tu supervisor te recuerda hacer el reporte o justificar el día desde la app.',
      url: '/mis-reportes',
      tag: `pendiente-${f.fecha}`,
    });
    setAvisados((prev) => new Set(prev).add(clave));
    showToast(`Recordatorio enviado a ${f.tecnico || 'el técnico'}`, 'success');
  }

  if (!lunes) return null;

  return (
    <div className="px-4 lg:px-0 pt-2">
      <p className="text-[13px] text-muted mb-4 leading-relaxed max-w-2xl">
        Cada técnico debe tener cubierto con un reporte o una justificación cada día hábil, y los fines de semana en que tuvo servicio programado. Los festivos no se exigen.
      </p>

      {/* Semana */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <button type="button" onClick={() => setLunes(sumarDias(lunes, -7))} aria-label="Semana anterior"
          className="w-10 h-10 rounded-xl bg-surface-2 border border-line flex items-center justify-center active:scale-95">
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="font-display font-semibold text-[16px]">{etiquetaSemana(lunes)}</p>
          {lunes !== lunesDe(hoy) && (
            <button type="button" onClick={() => setLunes(lunesDe(hoy))} className="text-[12px] font-semibold text-teal">Ir a esta semana</button>
          )}
        </div>
        <button type="button" onClick={() => setLunes(sumarDias(lunes, 7))} disabled={lunes >= lunesDe(hoy)} aria-label="Semana siguiente"
          className="w-10 h-10 rounded-xl bg-surface-2 border border-line flex items-center justify-center active:scale-95 disabled:opacity-35">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-2xl bg-red/10 border border-red/25 px-3 py-2.5">
          <p className="text-[22px] font-bold text-red tabular-nums leading-none">{totales.sin_reporte}</p>
          <p className="text-[11.5px] text-red/90 font-semibold mt-1">Sin reporte</p>
        </div>
        <div className="rounded-2xl bg-amber/10 border border-amber/25 px-3 py-2.5">
          <p className="text-[22px] font-bold text-amber tabular-nums leading-none">{totales.justificado}</p>
          <p className="text-[11.5px] text-amber font-semibold mt-1">Justificados</p>
        </div>
        <div className="rounded-2xl bg-teal/10 border border-teal/25 px-3 py-2.5">
          <p className="text-[22px] font-bold text-teal tabular-nums leading-none">{totales.reporte}</p>
          <p className="text-[11.5px] text-teal font-semibold mt-1">Con reporte</p>
        </div>
      </div>

      {error && <p className="text-[13px] text-red font-semibold mb-3">{error}</p>}

      <div className={`rounded-2xl bg-surface border border-line overflow-x-auto transition-opacity ${cargando ? 'opacity-50' : ''}`}>
        <table className="w-full border-collapse min-w-[340px]">
          <thead>
            <tr>
              <th className="text-left text-[10.5px] uppercase tracking-wider text-muted font-semibold px-3 py-2.5 sticky left-0 bg-surface">Técnico</th>
              {dias.map((d, i) => (
                <th key={d} className={`text-[10.5px] font-semibold px-0.5 py-2.5 text-center ${d === hoy ? 'text-teal' : 'text-muted'}`}>
                  <span className="block uppercase tracking-wider">{DIAS[i]}</span>
                  <span className="block text-[12px] tabular-nums">{Number(d.slice(8))}</span>
                </th>
              ))}
              <th className="text-[10.5px] uppercase tracking-wider text-muted font-semibold px-2 py-2.5 text-center hidden sm:table-cell">Faltan</th>
            </tr>
          </thead>
          <tbody>
            {tecnicos.map((t) => {
              const faltan = dias.filter((d) => { const f = t.dias.get(d); return f && vista(f) === 'sin_reporte'; }).length;
              return (
                <tr key={t.id} className="border-t border-line">
                  <td className="px-3 py-2 sticky left-0 bg-surface">
                    <span className="block text-[13px] font-semibold leading-tight max-w-[110px] sm:max-w-none truncate">{t.nombre}</span>
                    {faltan > 0 && <span className="sm:hidden text-[11px] text-red font-semibold">Faltan {faltan}</span>}
                  </td>
                  {dias.map((d) => {
                    const f = t.dias.get(d);
                    if (!f) return <td key={d} />;
                    const v = vista(f);
                    const activa = sel?.tecnico === t.id && sel.fecha === d;
                    return (
                      <td key={d} className="px-0.5 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => setSel(activa ? null : { tecnico: t.id, fecha: d })}
                          title={`${ESTILO[v].label}${f.festivo ? ` · ${f.festivo}` : ''}`}
                          className={`w-8 h-8 sm:w-9 sm:h-9 mx-auto rounded-lg border flex items-center justify-center transition-transform active:scale-90 ${ESTILO[v].cls} ${activa ? 'ring-2 ring-teal ring-offset-1 ring-offset-surface' : ''}`}
                        >
                          <Icono v={v} festivo={!!f.festivo} />
                        </button>
                      </td>
                    );
                  })}
                  <td className="text-center hidden sm:table-cell">
                    <span className={`text-[14px] font-bold tabular-nums ${faltan ? 'text-red' : 'text-faint'}`}>{faltan}</span>
                  </td>
                </tr>
              );
            })}
            {!cargando && tecnicos.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-[13px] text-muted">No hay técnicos activos.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-[11.5px] text-muted">
        {(['reporte', 'justificado', 'sin_reporte', 'no_exigible', 'a_tiempo'] as Vista[]).map((v) => (
          <span key={v} className="flex items-center gap-1.5">
            <span className={`w-4 h-4 rounded border flex items-center justify-center ${ESTILO[v].cls}`} />
            {ESTILO[v].label}
          </span>
        ))}
        <span>F = festivo</span>
      </div>

      {seleccion && (() => {
        const v = vista(seleccion);
        return (
          <div className="mt-4 rounded-2xl bg-surface border border-line p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[15px] font-semibold">{seleccion.tecnico}</p>
                <p className="text-[12.5px] text-muted">{DIAS[(fechaLocal(seleccion.fecha).getDay() + 6) % 7]} {fechaCorta(seleccion.fecha)}</p>
              </div>
              <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-full border ${ESTILO[v].cls}`}>{ESTILO[v].label}</span>
            </div>

            {seleccion.festivo && <p className="text-[13px] mt-3">Festivo: <b>{seleccion.festivo}</b></p>}

            {v === 'justificado' && (
              <div className="mt-3 text-[13.5px]">
                <p><span className="text-muted">Motivo: </span><b>{etiquetaMotivo(seleccion.motivo)}</b></p>
                {seleccion.detalle && <p className="mt-1">{seleccion.detalle}</p>}
                {seleccion.justificado_en && (
                  <p className="text-[12px] text-muted mt-1">Registrado el {new Date(seleccion.justificado_en).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</p>
                )}
              </div>
            )}

            {seleccion.reportes.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5">
                {seleccion.reportes.map((id) => (
                  <button key={id} type="button" onClick={() => onAbrirReporte(id)}
                    className="flex items-center gap-2 text-left text-[13.5px] font-semibold text-teal py-1">
                    <FileText size={15} /> {nombreReporte(id)}
                  </button>
                ))}
              </div>
            )}

            {v === 'sin_reporte' && (
              <button
                type="button"
                onClick={() => recordar(seleccion)}
                disabled={avisados.has(`${seleccion.tecnico_id}|${seleccion.fecha}`)}
                className="mt-3 w-full min-h-[44px] rounded-xl bg-teal text-inkOnAccent text-[13.5px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
              >
                <BellRing size={16} />
                {avisados.has(`${seleccion.tecnico_id}|${seleccion.fecha}`) ? 'Recordatorio enviado' : 'Recordarle'}
              </button>
            )}
            {v === 'a_tiempo' && <p className="text-[12.5px] text-muted mt-3">Todavía no son las 6 de la tarde; el aviso automático le llega a esa hora si sigue pendiente.</p>}
          </div>
        );
      })()}
    </div>
  );
}
