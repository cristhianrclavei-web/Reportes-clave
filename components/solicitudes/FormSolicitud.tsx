'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Clock, Camera, Images, Plus, CalendarDays, AlertTriangle } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import SignaturePad, { SignaturePadHandle } from '@/components/SignaturePad';
import AutocompletarCliente from '@/components/AutocompletarCliente';
import { showToast } from '@/components/Toast';
import AvisoBorrador from '@/components/AvisoBorrador';
import { useBorradorFormulario } from '@/lib/useBorradorFormulario';
import { createClient } from '@/lib/supabaseClient';
import { hoyLocal } from '@/lib/fechaHoy';
import { listarFestivos, Festivo } from '@/lib/avisos';
import {
  Solicitud, TipoSolicitud, DatosSolicitud, MOTIVOS_PERMISO, TIPO_LABEL,
  minutosEntre, duracionTexto, corteDe, fechaBonita, diasSolicitados, diaDeRegreso,
  crearSolicitud, actualizarSolicitud, subirEvidencia, urlsEvidencias,
} from '@/lib/solicitudesPersonal';

// Formulario de horas extra o de vacaciones/permiso. Sirve para crear y
// para corregir (con `inicial`). La firma del solicitante es obligatoria.

const inputCls = 'w-full min-h-[46px] px-3.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px] placeholder:text-faint';
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5';

type Foto = { path?: string; file?: File; url: string };

export default function FormSolicitud({
  tipo: tipoInicial, inicial, nombre, onClose, onListo,
}: {
  tipo: 'horas_extra' | 'ausencia';
  inicial?: Solicitud | null;
  nombre: string;
  onClose: () => void;
  onListo: () => void;
}) {
  const esHoras = tipoInicial === 'horas_extra';
  const s = inicial;
  const [tipo, setTipo] = useState<TipoSolicitud>(s?.tipo || (esHoras ? 'horas_extra' : 'vacaciones'));

  // Horas extra
  const [fecha, setFecha] = useState(s?.fecha || '');
  const [inicio, setInicio] = useState(s?.hora_inicio?.slice(0, 5) || '');
  const [fin, setFin] = useState(s?.hora_fin?.slice(0, 5) || '');
  const [actividades, setActividades] = useState<string[]>(s?.actividades ? s.actividades.split('\n') : ['']);
  const [cliente, setCliente] = useState(s?.cliente_nombre || '');
  const [clienteId, setClienteId] = useState<string | null>(s?.cliente_id || null);
  const [servicioId, setServicioId] = useState<string | null>(s?.servicio_id || null);
  const [proyecto, setProyecto] = useState(s?.proyecto || '');
  const [servicios, setServicios] = useState<{ id: string; proyecto: string; cliente_id: string | null }[]>([]);

  // Vacaciones / permiso
  const [fInicio, setFInicio] = useState(s?.fecha_inicio || '');
  const [fFin, setFFin] = useState(s?.fecha_fin || '');
  const [medioDia, setMedioDia] = useState(s?.medio_dia || false);
  const [dias, setDias] = useState(s?.dias != null ? String(s.dias) : '');
  const [diasManual, setDiasManual] = useState(s?.dias != null);
  const [goce, setGoce] = useState<boolean | null>(s?.goce_sueldo ?? null);
  const [motivoTipo, setMotivoTipo] = useState(s?.motivo_tipo || (esHoras ? '' : 'personal'));
  const [motivo, setMotivo] = useState(s?.motivo || '');
  const [cubre, setCubre] = useState(s?.cubre_nombre || '');
  const [festivos, setFestivos] = useState<Festivo[]>([]);

  // Comunes
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [nota, setNota] = useState(s?.nota || '');
  const [firma, setFirma] = useState<string | null>(s?.firma_solicitante || null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firmaRef = useRef<SignaturePadHandle>(null);

  // Borrador automático (solo en solicitudes nuevas): si la página se recarga
  // o se cierra la ventana, lo capturado —fotos y firma incluidas— se recupera.
  const datosBorrador = {
    tipo, fecha, inicio, fin, actividades, cliente, clienteId, servicioId, proyecto,
    fInicio, fFin, medioDia, dias, diasManual, goce, motivoTipo, motivo, cubre, nota, firma,
    archivos: fotos.map((f) => f.file).filter((f): f is File => !!f),
  };
  function aplicarBorrador(d: typeof datosBorrador) {
    setTipo(d.tipo); setFecha(d.fecha); setInicio(d.inicio); setFin(d.fin);
    setActividades(d.actividades?.length ? d.actividades : ['']);
    setCliente(d.cliente); setClienteId(d.clienteId); setServicioId(d.servicioId); setProyecto(d.proyecto);
    setFInicio(d.fInicio); setFFin(d.fFin); setMedioDia(d.medioDia); setDias(d.dias); setDiasManual(d.diasManual);
    setGoce(d.goce); setMotivoTipo(d.motivoTipo); setMotivo(d.motivo); setCubre(d.cubre); setNota(d.nota); setFirma(d.firma);
    setFotos((d.archivos || []).map((file) => ({ file, url: URL.createObjectURL(file) })));
  }
  const borrador = useBorradorFormulario({
    clave: s ? `solicitud:${s.id}` : `solicitud:${tipoInicial}`,
    datos: datosBorrador,
    hayDatos: !s && !guardando && Boolean(
      actividades.some((a) => a.trim()) || motivo.trim() || nota.trim() || firma || fotos.length || inicio || fin || fInicio || fFin,
    ),
    aplicar: aplicarBorrador,
  });
  function descartarBorrador() {
    aplicarBorrador({
      tipo: esHoras ? 'horas_extra' : 'vacaciones', fecha: hoyLocal(), inicio: '', fin: '', actividades: [''],
      cliente: '', clienteId: null, servicioId: null, proyecto: '', fInicio: '', fFin: '', medioDia: false,
      dias: '', diasManual: false, goce: null, motivoTipo: esHoras ? '' : 'personal', motivo: '', cubre: '',
      nota: '', firma: null, archivos: [],
    });
    borrador.limpiar();
  }
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!s) setFecha(hoyLocal());
    if (!esHoras) listarFestivos().then(setFestivos).catch(() => {});
    if (s?.fotos?.length) urlsEvidencias(s.fotos).then((urls) => setFotos(s.fotos.map((p, i) => ({ path: p, url: urls[i] || '' }))));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Servicios de ese día (los que la persona puede ver) para ligar las horas.
  useEffect(() => {
    if (!esHoras || !fecha) return;
    createClient().from('servicios_programados').select('id, proyecto, cliente_id').eq('fecha', fecha).neq('estado', 'cancelado')
      .then(({ data }) => setServicios((data as any[]) || []));
  }, [esHoras, fecha]);

  const minutos = minutosEntre(inicio, fin);
  const cruzaMedianoche = !!inicio && !!fin && fin <= inicio;
  const corte = fecha ? corteDe(fecha) : '';

  const diasAuto = useMemo(() => diasSolicitados(fInicio, fFin, festivos, medioDia), [fInicio, fFin, festivos, medioDia]);
  useEffect(() => { if (!diasManual) setDias(diasAuto ? String(diasAuto) : ''); }, [diasAuto, diasManual]);
  const regreso = fFin ? diaDeRegreso(fFin, festivos) : '';

  function agregarFotos(lista: FileList | null) {
    if (!lista) return;
    const nuevas = Array.from(lista).slice(0, 8 - fotos.length).map((file) => ({ file, url: URL.createObjectURL(file) }));
    setFotos((p) => [...p, ...nuevas]);
  }

  function faltantes(): string[] {
    const f: string[] = [];
    if (tipo === 'horas_extra') {
      if (!fecha) f.push('fecha');
      if (!inicio || !fin) f.push('hora de inicio y de fin');
      if (minutos > 16 * 60) f.push('revisar las horas (más de 16 h)');
      if (!actividades.some((a) => a.trim())) f.push('actividades realizadas');
      if (!cliente.trim() && !servicioId) f.push('cliente o servicio');
    } else {
      if (!fInicio || !fFin) f.push('fechas');
      if (fFin && fInicio && fFin < fInicio) f.push('la fecha final es antes que la inicial');
      if (!(Number(dias) > 0)) f.push('días');
      if (tipo === 'permiso' && !motivo.trim()) f.push('motivo');
    }
    if (!firma) f.push('tu firma');
    return f;
  }

  async function enviar() {
    const f = faltantes();
    if (f.length) { setError('Falta: ' + f.join(', ')); return; }
    setGuardando(true);
    setError(null);
    try {
      const paths: string[] = [];
      for (const x of fotos) paths.push(x.path || (await subirEvidencia(x.file!)));
      const comun = { fotos: paths, nota: nota.trim() || null, firma_solicitante: firma! };
      const datos: DatosSolicitud = tipo === 'horas_extra'
        ? {
            tipo, fecha, hora_inicio: inicio, hora_fin: fin, horas: Math.round((minutos / 60) * 100) / 100,
            actividades: actividades.map((a) => a.trim()).filter(Boolean).join('\n'),
            cliente_id: clienteId, cliente_nombre: cliente.trim() || servicios.find((x) => x.id === servicioId)?.proyecto || null,
            servicio_id: servicioId, proyecto: proyecto.trim() || null, corte_pago: corte, ...comun,
          }
        : {
            tipo, fecha_inicio: fInicio, fecha_fin: fFin, dias: Number(dias), medio_dia: fInicio === fFin && medioDia,
            goce_sueldo: tipo === 'vacaciones' ? true : goce, motivo_tipo: tipo === 'permiso' ? motivoTipo : null,
            motivo: motivo.trim() || null, cubre_nombre: cubre.trim() || null, fecha_regreso: regreso || null, ...comun,
          };
      if (s) {
        const { tipo: _t, ...resto } = datos;
        await actualizarSolicitud(s, resto, nombre);
        showToast('Solicitud corregida y reenviada', 'success');
      } else {
        await crearSolicitud(datos, nombre);
        await borrador.limpiar();
        showToast('Solicitud enviada para autorizar', 'success');
      }
      onListo();
    } catch (e: any) {
      setError(e?.message?.includes('solicitudes_personal') ? 'Falta correr el SQL de solicitudes' : e?.message || 'No se pudo enviar');
      setGuardando(false);
    }
  }

  return (
    <ModalOverlay onClose={() => !guardando && onClose()}>
      <div className="glass-strong rounded-3xl w-full max-w-xl p-5 lg:p-6 max-h-[94vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display font-bold text-[20px] leading-tight">
              {s ? `Corregir ${s.folio}` : esHoras ? 'Solicitar horas extra' : 'Vacaciones o permiso'}
            </h2>
            <p className="text-[13px] text-muted">Llega a quien autoriza para que la firme.</p>
          </div>
          <button type="button" onClick={onClose} disabled={guardando} aria-label="Cerrar" className="w-10 h-10 -mr-1 -mt-1 flex items-center justify-center text-muted"><X size={19} /></button>
        </div>
        {borrador.recuperadoEn && (
          <div className="mb-4">
            <AvisoBorrador que="la solicitud" guardadoEn={borrador.recuperadoEn} onDescartar={descartarBorrador} />
          </div>
        )}

        {s?.estado === 'correccion' && s.comentario_revision && (
          <div className="mb-4 rounded-xl bg-amber/10 border border-amber/30 px-3.5 py-2.5 text-[13px]">
            <b className="text-amber">Corrección pedida por {s.revisado_nombre || 'quien autoriza'}:</b> {s.comentario_revision}
          </div>
        )}

        {tipo === 'horas_extra' ? (
          <>
            <div className="grid grid-cols-3 gap-2 mb-1">
              <div className="col-span-3 sm:col-span-1">
                <label className={labelCls}>Fecha</label>
                <input type="date" className={inputCls} value={fecha} onChange={(e) => { setFecha(e.target.value); setServicioId(null); }} />
              </div>
              <div>
                <label className={labelCls}>Empezó</label>
                <input type="time" className={inputCls} value={inicio} onChange={(e) => setInicio(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Terminó</label>
                <input type="time" className={inputCls} value={fin} onChange={(e) => setFin(e.target.value)} />
              </div>
            </div>
            {minutos > 0 && (
              <div className="mt-2 mb-4 rounded-xl bg-teal/10 border border-teal/30 px-3.5 py-2.5 flex items-center gap-2.5">
                <Clock size={18} className="text-teal shrink-0" />
                <span className="text-[14px]"><b className="text-teal text-[16px]">{duracionTexto(minutos)}</b> de horas extra{cruzaMedianoche ? ' (terminó al día siguiente)' : ''}</span>
              </div>
            )}
            {corte && <p className="text-[12.5px] text-muted mb-4 -mt-2">Entra en el pago del <b className="text-ink">{fechaBonita(corte)}</b>.</p>}

            <label className={labelCls}>Servicio de ese día (si fue en uno)</label>
            <select className={`${inputCls} mb-3`} value={servicioId || ''} onChange={(e) => {
              const id = e.target.value || null;
              setServicioId(id);
              const sv = servicios.find((x) => x.id === id);
              if (sv && !cliente) { setCliente(sv.proyecto); setClienteId(sv.cliente_id); }
            }}>
              <option value="">{servicios.length ? 'Ninguno / otro' : 'No hay servicios ese día'}</option>
              {servicios.map((x) => <option key={x.id} value={x.id}>{x.proyecto}</option>)}
            </select>
            <label className={labelCls}>Cliente</label>
            <div className="mb-3">
              <AutocompletarCliente soloSugerir value={cliente} onChange={(nm, id) => { setCliente(nm); setClienteId(id); }} className={inputCls} placeholder="Para qué cliente" />
            </div>
            <label className={labelCls}>Proyecto o trabajo (opcional)</label>
            <input className={`${inputCls} mb-4`} value={proyecto} onChange={(e) => setProyecto(e.target.value)} placeholder="Ej. Instalación de 12 cámaras, etapa 2" />

            <label className={labelCls}>Actividades que se hicieron</label>
            <div className="flex flex-col gap-2 mb-2">
              {actividades.map((a, i) => (
                <div key={i} className="flex gap-2">
                  <span className="w-6 pt-3 text-[13px] text-muted text-right shrink-0">{i + 1}.</span>
                  <textarea rows={2} className={`${inputCls} py-2.5 min-h-[56px]`} value={a}
                    onChange={(e) => setActividades(actividades.map((x, j) => (j === i ? e.target.value : x)))} placeholder="Qué hiciste" />
                  {actividades.length > 1 && (
                    <button type="button" onClick={() => setActividades(actividades.filter((_, j) => j !== i))} aria-label="Quitar" className="text-muted shrink-0 w-8"><X size={16} /></button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setActividades([...actividades, ''])} className="text-[13px] font-semibold text-teal flex items-center gap-1.5 mb-4 min-h-[32px]"><Plus size={14} /> Otra actividad</button>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-1.5 mb-4">
              {(['vacaciones', 'permiso'] as const).map((k) => (
                <button key={k} type="button" onClick={() => setTipo(k)}
                  className={`min-h-[44px] rounded-xl border text-[14px] font-semibold ${tipo === k ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line'}`}>{TIPO_LABEL[k]}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className={labelCls}>Desde</label>
                <input type="date" className={inputCls} value={fInicio} onChange={(e) => { setFInicio(e.target.value); if (!fFin || fFin < e.target.value) setFFin(e.target.value); }} />
              </div>
              <div>
                <label className={labelCls}>Hasta</label>
                <input type="date" className={inputCls} min={fInicio || undefined} value={fFin} onChange={(e) => setFFin(e.target.value)} />
              </div>
            </div>
            {fInicio && fInicio === fFin && (
              <label className="flex items-center gap-2.5 mb-2 text-[13.5px] min-h-[36px]">
                <input type="checkbox" className="w-5 h-5 accent-teal" checked={medioDia} onChange={(e) => setMedioDia(e.target.checked)} /> Solo medio día
              </label>
            )}
            {fInicio && fFin && (
              <div className="mb-4 rounded-xl bg-teal/10 border border-teal/30 px-3.5 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="flex items-center gap-2"><CalendarDays size={17} className="text-teal" />
                  <input type="number" min={0.5} step={0.5} value={dias} onChange={(e) => { setDias(e.target.value); setDiasManual(true); }}
                    className="w-16 px-2 py-1 rounded-lg bg-surface border border-line text-[15px] font-bold text-center" />
                  <span className="text-[14px]">día(s)</span>
                </span>
                {regreso && <span className="text-[13px] text-muted">Regresa el <b className="text-ink">{fechaBonita(regreso)}</b></span>}
                <span className="basis-full text-[11.5px] text-muted">Se cuentan de lunes a sábado, sin domingos ni días festivos. Puedes ajustarlo.</span>
              </div>
            )}
            {tipo === 'permiso' && (
              <>
                <label className={labelCls}>Motivo</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {MOTIVOS_PERMISO.map((m) => (
                    <button key={m.valor} type="button" onClick={() => setMotivoTipo(m.valor)}
                      className={`px-3 py-1.5 rounded-full text-[13px] font-medium border ${motivoTipo === m.valor ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line'}`}>{m.label}</button>
                  ))}
                </div>
                <textarea rows={2} className={`${inputCls} py-2.5 mb-3`} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Explica brevemente" />
                <label className={labelCls}>¿Con goce de sueldo?</label>
                <div className="grid grid-cols-3 gap-1.5 mb-4">
                  {([[true, 'Con goce'], [false, 'Sin goce'], [null, 'Que lo decidan']] as const).map(([v, l]) => (
                    <button key={l} type="button" onClick={() => setGoce(v)}
                      className={`min-h-[40px] rounded-xl border text-[13px] font-semibold ${goce === v ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line'}`}>{l}</button>
                  ))}
                </div>
              </>
            )}
            {tipo === 'vacaciones' && (
              <>
                <label className={labelCls}>Comentario (opcional)</label>
                <input className={`${inputCls} mb-3`} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. viaje familiar" />
              </>
            )}
            <label className={labelCls}>¿Quién cubre tus pendientes? (opcional)</label>
            <input className={`${inputCls} mb-4`} value={cubre} onChange={(e) => setCubre(e.target.value)} placeholder="Nombre del compañero" />
          </>
        )}

        {/* Evidencias */}
        <label className={labelCls}>{tipo === 'horas_extra' ? 'Evidencias (fotos del trabajo)' : 'Comprobante (opcional: receta, cita, etc.)'}</label>
        <input ref={camara} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { agregarFotos(e.target.files); e.target.value = ''; }} />
        <input ref={galeria} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { agregarFotos(e.target.files); e.target.value = ''; }} />
        {fotos.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {fotos.map((f, i) => (
              <div key={i} className="relative">
                <img src={f.url} alt="" className="w-16 h-16 object-cover rounded-lg border border-line" />
                <button type="button" aria-label="Quitar" onClick={() => setFotos(fotos.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red text-white flex items-center justify-center"><X size={13} /></button>
              </div>
            ))}
          </div>
        )}
        {fotos.length < 8 && (
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button type="button" onClick={() => camara.current?.click()} className="min-h-[44px] rounded-xl border border-dashed border-teal/50 text-teal text-[13.5px] font-medium flex items-center justify-center gap-2"><Camera size={16} /> Tomar foto</button>
            <button type="button" onClick={() => galeria.current?.click()} className="min-h-[44px] rounded-xl border border-dashed border-teal/50 text-teal text-[13.5px] font-medium flex items-center justify-center gap-2"><Images size={16} /> Galería</button>
          </div>
        )}

        <label className={labelCls}>Nota (opcional)</label>
        <input className={`${inputCls} mb-4`} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Algo más que deba saber quien autoriza" />

        <label className={labelCls}>Tu firma</label>
        <div className="rounded-xl overflow-hidden border border-line mb-3">
          <SignaturePad ref={firmaRef} titulo={`Firma de ${nombre || 'solicitante'}`} inicial={firma} onCambio={setFirma} />
        </div>

        {error && <p className="text-[13px] text-red font-semibold mb-3 flex items-start gap-1.5"><AlertTriangle size={15} className="shrink-0 mt-0.5" /> {error}</p>}
        <button type="button" onClick={enviar} disabled={guardando}
          className="w-full min-h-[50px] rounded-2xl bg-teal text-inkOnAccent font-semibold text-[15px] disabled:opacity-50">
          {guardando ? 'Enviando…' : s ? 'Reenviar corregida' : 'Enviar para autorizar'}
        </button>
      </div>
    </ModalOverlay>
  );
}
