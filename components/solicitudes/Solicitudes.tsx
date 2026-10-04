'use client';

import EstadoVacio from '@/components/EstadoVacio';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, CalendarDays, Bell, Download, ChevronRight, Inbox } from 'lucide-react';
import { AvatarTecnico } from '@/components/AvatarTecnico';
import { useMiId } from '@/lib/perfiles';
import {
  Solicitud, TIPO_LABEL, ESTADO_SOLICITUD, listarSolicitudes, puedoAprobarPersonal, recordatorioCorte,
  corteDe, fechaBonita, duracionTexto,
} from '@/lib/solicitudesPersonal';
import { hoyLocal, sumarDias } from '@/lib/fechaHoy';
import FormSolicitud from './FormSolicitud';
import DetalleSolicitud from './DetalleSolicitud';

// Horas extra, vacaciones y permisos. El técnico ve las suyas; quien tiene
// el permiso de autorizar ve además la bandeja de todos y el resumen de
// horas extra del corte de pago.

type Vista = 'autorizar' | 'todas' | 'mias';

// 4.5 → «4 h 30 min»
const horasFmt = (h: number) => duracionTexto(Math.round(h * 60));
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function resumenLinea(s: Solicitud): string {
  if (s.tipo === 'horas_extra') return `${duracionTexto(Math.round((s.horas || 0) * 60))} · ${fechaBonita(s.fecha)}${s.cliente_nombre ? ` · ${s.cliente_nombre}` : ''}`;
  return `${Number(s.dias)} día(s) · ${fechaBonita(s.fecha_inicio)}${s.fecha_fin !== s.fecha_inicio ? ` al ${fechaBonita(s.fecha_fin)}` : ''}`;
}

export default function Solicitudes({ nombre }: { nombre: string }) {
  const miId = useMiId();
  const [lista, setLista] = useState<Solicitud[] | null>(null);
  const [aprobador, setAprobador] = useState(false);
  const [vista, setVista] = useState<Vista>('mias');
  const [error, setError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState<null | 'horas_extra' | 'ausencia'>(null);
  const [corrigiendo, setCorrigiendo] = useState<Solicitud | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ corte: string; faltan: number } | null>(null);
  const [corteActual, setCorteActual] = useState('');
  const [hoyLocalSeguro, setHoyLocalSeguro] = useState('');

  const cargar = useCallback(async () => {
    try {
      const puede = await puedoAprobarPersonal();
      setAprobador(puede);
      setLista(await listarSolicitudes({ soloMias: !puede }));
      setError(null);
    } catch (e: any) {
      setLista([]);
      setError(String(e?.message || '').includes('solicitudes_personal') ? 'Falta correr el SQL de solicitudes en Supabase.' : 'No se pudieron cargar las solicitudes.');
    }
  }, []);

  useEffect(() => {
    cargar();
    setAviso(recordatorioCorte());
    setCorteActual(corteDe(hoyLocal()));
    setHoyLocalSeguro(hoyLocal());
    const t = setInterval(cargar, 60000);
    return () => clearInterval(t);
  }, [cargar]);

  useEffect(() => { if (aprobador) setVista('autorizar'); }, [aprobador]);

  const mias = (lista || []).filter((s) => s.solicitante_id === miId);
  const porAutorizar = (lista || []).filter((s) => s.estado === 'pendiente' && s.solicitante_id !== miId);
  const visibles = vista === 'autorizar' ? porAutorizar : vista === 'todas' ? lista || [] : mias;
  const abiertaSol = (lista || []).find((s) => s.id === abierta) || null;

  // Horas extra del corte actual por persona (autorizadas y por autorizar).
  const resumenCorte = useMemo(() => {
    const m = new Map<string, { id: string; nombre: string; aprobadas: number; pendientes: number }>();
    for (const s of lista || []) {
      if (s.tipo !== 'horas_extra' || s.corte_pago !== corteActual) continue;
      if (s.estado !== 'aprobada' && s.estado !== 'pendiente' && s.estado !== 'correccion') continue;
      const r = m.get(s.solicitante_id) || { id: s.solicitante_id, nombre: s.solicitante?.full_name || '—', aprobadas: 0, pendientes: 0 };
      if (s.estado === 'aprobada') r.aprobadas += Number(s.horas || 0); else r.pendientes += Number(s.horas || 0);
      m.set(s.solicitante_id, r);
    }
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [lista, corteActual]);

  async function excelCorte() {
    const ExcelJS = (await import('exceljs')).default;
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('Horas extra');
    hoja.columns = [
      { header: 'Folio', key: 'folio', width: 10 }, { header: 'Persona', key: 'persona', width: 26 },
      { header: 'Fecha', key: 'fecha', width: 12 }, { header: 'De', key: 'de', width: 8 }, { header: 'A', key: 'a', width: 8 },
      { header: 'Horas', key: 'horas', width: 8 }, { header: 'Cliente', key: 'cliente', width: 26 },
      { header: 'Actividades', key: 'act', width: 50 }, { header: 'Estado', key: 'estado', width: 16 }, { header: 'Autorizó', key: 'aut', width: 22 },
    ];
    hoja.getRow(1).font = { bold: true };
    for (const s of (lista || []).filter((x) => x.tipo === 'horas_extra' && x.corte_pago === corteActual && x.estado !== 'cancelada')) {
      hoja.addRow({ folio: s.folio, persona: s.solicitante?.full_name, fecha: s.fecha, de: s.hora_inicio?.slice(0, 5), a: s.hora_fin?.slice(0, 5), horas: Number(s.horas), cliente: s.cliente_nombre, act: (s.actividades || '').replace(/\n/g, ' · '), estado: ESTADO_SOLICITUD[s.estado].label.replace('✓ ', ''), aut: s.revisado_nombre || '' });
    }
    const buf = await libro.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a'); a.href = url; a.download = `horas-extra-corte-${corteActual}.xlsx`; a.click(); URL.revokeObjectURL(url);
  }

  const proximoPago = corteActual === hoyLocalSeguro ? corteDe(sumarDias(corteActual, 1)) : corteActual;
  const pendCorte = porAutorizar.filter((s) => s.tipo === 'horas_extra' && s.corte_pago && aviso && s.corte_pago <= aviso.corte).length;

  return (
    <div>
      {/* Próximo día de pago: siempre visible; en ámbar cuando ya toca mandar
          o autorizar horas para el cierre de nómina. */}
      {corteActual && (
        <div className={`mb-4 rounded-2xl border px-4 py-3.5 flex items-center gap-3.5 ${aviso ? 'bg-amber/10 border-amber/40' : 'bg-surface border-line'}`}>
          <span className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 leading-none ${aviso ? 'bg-amber/15 text-amber' : 'bg-teal/12 text-teal'}`}>
            <span className="text-[17px] font-display font-bold">{Number((aviso?.corte || proximoPago).slice(8, 10))}</span>
            <span className="text-[9.5px] font-semibold uppercase tracking-wide mt-0.5">{MESES_CORTOS[Number((aviso?.corte || proximoPago).slice(5, 7)) - 1]}</span>
          </span>
          <div className="min-w-0 flex-1">
            <p className={`text-[11px] font-semibold uppercase tracking-wider ${aviso ? 'text-amber' : 'text-muted'}`}>
              {aviso ? <span className="inline-flex items-center gap-1"><Bell size={12} /> Cierre de nómina</span> : 'Próximo día de pago'}
            </p>
            <p className="text-[14.5px] font-semibold first-letter:uppercase">{fechaBonita(aviso?.corte || proximoPago)}</p>
            <p className="text-[12.5px] text-ink/70 leading-snug">
              {aviso
                ? aprobador
                  ? pendCorte > 0 ? `${pendCorte} solicitud(es) de horas extra por autorizar.` : 'No hay horas extra pendientes para este pago.'
                  : `Faltan ${aviso.faltan === 1 ? '1 día hábil' : `${aviso.faltan} días hábiles`}: manda tus horas extra para que entren.`
                : 'Las horas extra que mandes entran en este pago.'}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-6">
        <button type="button" onClick={() => setNuevo('horas_extra')}
          className="group text-left rounded-2xl bg-surface border border-line-strong p-4 active:scale-[0.98] transition-all flex flex-col justify-between gap-3 min-h-[124px] hover:border-teal/60 hover:-translate-y-0.5 active:bg-teal/10">
          <span className="w-11 h-11 rounded-xl bg-teal/15 text-teal flex items-center justify-center"><Clock size={21} strokeWidth={2.3} /></span>
          <span>
            <span className="block font-display font-bold text-[16px] leading-tight">Horas extra</span>
            <span className="block text-[12px] text-muted leading-snug mt-0.5">Tiempo trabajado fuera de tu horario</span>
          </span>
        </button>
        <button type="button" onClick={() => setNuevo('ausencia')}
          className="group text-left rounded-2xl bg-surface border border-line-strong p-4 active:scale-[0.98] transition-all flex flex-col justify-between gap-3 min-h-[124px] hover:border-amber/60 hover:-translate-y-0.5 active:bg-amber/10">
          <span className="w-11 h-11 rounded-xl bg-amber/15 text-amber flex items-center justify-center"><CalendarDays size={21} strokeWidth={2.3} /></span>
          <span>
            <span className="block font-display font-bold text-[16px] leading-tight">Vacaciones o permiso</span>
            <span className="block text-[12px] text-muted leading-snug mt-0.5">Días libres o ausencias</span>
          </span>
        </button>
      </div>

      {aprobador && resumenCorte.length > 0 && (
        <div className="mb-5 rounded-2xl bg-surface border border-line p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[13.5px] font-semibold">Horas extra del pago del {fechaBonita(corteActual)}</p>
            <button type="button" onClick={excelCorte} className="h-8 px-3 rounded-full bg-surface-2 border border-line text-[12.5px] font-semibold flex items-center gap-1.5"><Download size={13} /> Excel</button>
          </div>
          <div className="divide-y divide-line">
            {resumenCorte.map((r) => (
              <div key={r.id} className="flex items-center gap-2.5 py-2">
                <AvatarTecnico id={r.id} nombre={r.nombre} size={28} />
                <span className="flex-1 min-w-0 text-[13.5px] truncate">{r.nombre}</span>
                <span className="text-[13px] font-semibold text-teal tabular-nums">{horasFmt(r.aprobadas)} autorizadas</span>
                {r.pendientes > 0 && <span className="text-[12px] text-amber tabular-nums">+{horasFmt(r.pendientes)} por autorizar</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {aprobador && (
        <div className="flex gap-1.5 mb-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {([['autorizar', `Por autorizar ${porAutorizar.length}`], ['todas', 'Todas'], ['mias', `Mías ${mias.length}`]] as [Vista, string][]).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setVista(k)}
              className={`shrink-0 h-9 px-3.5 rounded-full text-[13px] font-semibold border transition-colors ${vista === k ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface border-line text-ink/75'}`}>{l}</button>
          ))}
        </div>
      )}

      {error && <p className="text-[13px] text-red font-semibold mb-3">{error}</p>}
      {lista === null && <p className="text-[13px] text-muted text-center py-6">Cargando…</p>}
      {lista && visibles.length === 0 && !error && (
        vista === 'autorizar' ? (
          <EstadoVacio
            icono={<Inbox size={24} strokeWidth={1.8} />}
            titulo="No hay solicitudes por autorizar"
            detalle="Las horas extra, vacaciones y permisos que pida el personal llegan aquí."
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-line-strong p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-3">Mis solicitudes</p>
            <p className="text-[14px] font-semibold mb-3">Todavía no tienes solicitudes. Así funciona:</p>
            <ol className="flex flex-col gap-3">
              {[
                ['Llénala y fírmala', 'Horas extra con sus evidencias, o los días que necesitas.'],
                ['La autorizan', 'Quien autoriza la firma, te pide una corrección o la rechaza. Te llega aviso.'],
                ['Queda archivada', 'Puedes bajarla en PDF cuando quieras.'],
              ].map(([t, d], k) => (
                <li key={k} className="flex gap-3">
                  <span className="w-7 h-7 rounded-full bg-teal/15 text-teal text-[13px] font-bold flex items-center justify-center shrink-0">{k + 1}</span>
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-semibold">{t}</span>
                    <span className="block text-[12.5px] text-muted leading-snug">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )
      )}

      {visibles.length > 0 && vista === 'mias' && (
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Mis solicitudes · {visibles.length}</p>
      )}

      <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-2">
        {visibles.map((s) => {
          const est = ESTADO_SOLICITUD[s.estado];
          const Icono = s.tipo === 'horas_extra' ? Clock : CalendarDays;
          return (
            <button key={s.id} type="button" onClick={() => setAbierta(s.id)}
              className={`w-full text-left rounded-2xl bg-surface border p-3.5 flex items-center gap-3 hover:border-line-strong transition-colors ${s.estado === 'correccion' && s.solicitante_id === miId ? 'border-amber/50' : 'border-line'}`}>
              {vista === 'mias' ? (
                <span className="w-10 h-10 rounded-xl bg-teal/12 text-teal flex items-center justify-center shrink-0"><Icono size={18} /></span>
              ) : (
                <AvatarTecnico id={s.solicitante_id} nombre={s.solicitante?.full_name || '—'} size={40} />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold truncate">{vista === 'mias' ? TIPO_LABEL[s.tipo] : `${s.solicitante?.full_name || '—'}`}</span>
                <span className="block text-[12.5px] text-muted truncate">
                  <span className="font-mono font-semibold text-teal whitespace-nowrap">{s.folio}</span>
                  {vista !== 'mias' && ` · ${TIPO_LABEL[s.tipo]}`} · {resumenLinea(s)}
                </span>
              </span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${est.cls}`}>{est.label}</span>
              <ChevronRight size={15} className="text-faint shrink-0" />
            </button>
          );
        })}
      </div>

      {nuevo && <FormSolicitud tipo={nuevo} nombre={nombre} onClose={() => setNuevo(null)} onListo={() => { setNuevo(null); cargar(); }} />}
      {corrigiendo && (
        <FormSolicitud tipo={corrigiendo.tipo === 'horas_extra' ? 'horas_extra' : 'ausencia'} inicial={corrigiendo} nombre={nombre}
          onClose={() => setCorrigiendo(null)} onListo={() => { setCorrigiendo(null); cargar(); }} />
      )}
      {abiertaSol && (
        <DetalleSolicitud
          s={abiertaSol}
          esAprobador={aprobador}
          esMia={abiertaSol.solicitante_id === miId}
          miNombre={nombre}
          onClose={() => setAbierta(null)}
          onCambio={() => { setAbierta(null); cargar(); }}
          onCorregir={() => { setCorrigiendo(abiertaSol); setAbierta(null); }}
        />
      )}
    </div>
  );
}
