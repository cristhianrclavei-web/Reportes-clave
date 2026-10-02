'use client';

import { useEffect, useRef, useState } from 'react';
import { X, FileText, Check, MessageSquareWarning, Ban, Pencil, Clock, CalendarDays } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import SignaturePad, { SignaturePadHandle } from '@/components/SignaturePad';
import { showToast } from '@/components/Toast';
import { AvatarTecnico } from '@/components/AvatarTecnico';
import {
  Solicitud, TIPO_LABEL, ESTADO_SOLICITUD, MOTIVOS_PERMISO, fechaBonita, duracionTexto,
  resolverSolicitud, cancelarSolicitud, urlsEvidencias,
} from '@/lib/solicitudesPersonal';

const labelCls = 'block text-[10.5px] font-semibold uppercase tracking-wider text-muted mb-0.5';
const ACCION: Record<string, string> = { corregida: 'Corrigió y reenvió', editada: 'Modificó', cancelada: 'Canceló', aprobada: 'Autorizó', rechazada: 'Rechazó', correccion: 'Pidió corrección' };

function fechaHora(iso: string | null) {
  return iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

export default function DetalleSolicitud({
  s, esAprobador, esMia, miNombre, onClose, onCambio, onCorregir,
}: {
  s: Solicitud;
  esAprobador: boolean;
  esMia: boolean;
  miNombre: string;
  onClose: () => void;
  onCambio: () => void;
  onCorregir: () => void;
}) {
  const [fotos, setFotos] = useState<string[]>([]);
  const [modo, setModo] = useState<null | 'aprobar' | 'correccion' | 'rechazar'>(null);
  const [comentario, setComentario] = useState('');
  const [nombre, setNombre] = useState(miNombre);
  const [firma, setFirma] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firmaRef = useRef<SignaturePadHandle>(null);
  const est = ESTADO_SOLICITUD[s.estado];
  const puedeResolver = esAprobador && !esMia && s.estado === 'pendiente';

  useEffect(() => { urlsEvidencias(s.fotos).then(setFotos).catch(() => {}); }, [s.fotos]);

  async function resolver() {
    if (!modo) return;
    if (modo === 'aprobar' && !firma) { showToast('Firma para autorizar', 'error'); return; }
    if (modo !== 'aprobar' && !comentario.trim()) { showToast('Escribe el motivo', 'error'); return; }
    setBusy(true);
    try {
      await resolverSolicitud(s, modo, comentario.trim(), firma || undefined, nombre);
      showToast(modo === 'aprobar' ? 'Solicitud autorizada' : modo === 'rechazar' ? 'Solicitud rechazada' : 'Se pidió la corrección', 'success');
      onCambio();
    } catch (e: any) {
      showToast(e?.message || 'No se pudo', 'error');
      setBusy(false);
    }
  }

  async function cancelar() {
    setBusy(true);
    try { await cancelarSolicitud(s.id); showToast('Solicitud cancelada', 'success'); onCambio(); }
    catch (e: any) { showToast(e?.message || 'No se pudo', 'error'); setBusy(false); }
  }

  const nombreSol = s.solicitante?.full_name || 'Solicitante';
  const motivoLabel = MOTIVOS_PERMISO.find((m) => m.valor === s.motivo_tipo)?.label;

  return (
    <ModalOverlay onClose={() => !busy && onClose()}>
      <div className="glass-strong rounded-3xl w-full max-w-xl p-5 lg:p-6 max-h-[94vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-mono font-semibold text-teal">{s.folio}</p>
            <h2 className="font-display font-bold text-[20px] leading-tight">{TIPO_LABEL[s.tipo]}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Cerrar" className="w-10 h-10 -mr-1 -mt-1 flex items-center justify-center text-muted"><X size={19} /></button>
        </div>
        <span className={`inline-block mt-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full ${est.cls}`}>{est.label}</span>

        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-surface-2/40 p-3">
          <AvatarTecnico id={s.solicitante_id} nombre={nombreSol} size={44} />
          <div className="min-w-0">
            <p className="text-[10.5px] uppercase tracking-wider text-muted">Solicita</p>
            <p className="text-[15px] font-semibold truncate">{nombreSol}</p>
            <p className="text-[12px] text-muted">{fechaHora(s.created_at)}</p>
          </div>
        </div>

        {s.tipo === 'horas_extra' ? (
          <div className="mt-4">
            <div className="rounded-xl bg-teal/10 border border-teal/30 px-4 py-3 flex items-center gap-3 mb-3">
              <Clock size={20} className="text-teal" />
              <div>
                <p className="text-[18px] font-bold text-teal leading-tight">{duracionTexto(Math.round((s.horas || 0) * 60))}</p>
                <p className="text-[13px] text-muted ">{fechaBonita(s.fecha)} · {s.hora_inicio?.slice(0, 5)} a {s.hora_fin?.slice(0, 5)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><span className={labelCls}>Cliente</span><p className="text-[14px]">{s.cliente_nombre || '—'}</p></div>
              <div><span className={labelCls}>Corte de pago</span><p className="text-[14px] ">{fechaBonita(s.corte_pago)}</p></div>
              {s.proyecto && <div className="col-span-2"><span className={labelCls}>Proyecto</span><p className="text-[14px]">{s.proyecto}</p></div>}
            </div>
            <span className={labelCls}>Actividades</span>
            <ol className="list-decimal pl-5 text-[14px] space-y-1 mb-3">
              {(s.actividades || '').split('\n').filter(Boolean).map((a, i) => <li key={i}>{a}</li>)}
            </ol>
          </div>
        ) : (
          <div className="mt-4">
            <div className="rounded-xl bg-teal/10 border border-teal/30 px-4 py-3 flex items-center gap-3 mb-3">
              <CalendarDays size={20} className="text-teal" />
              <div>
                <p className="text-[18px] font-bold text-teal leading-tight">{Number(s.dias)} día(s){s.medio_dia ? ' (medio día)' : ''}</p>
                <p className="text-[13px] text-muted ">{fechaBonita(s.fecha_inicio)}{s.fecha_fin !== s.fecha_inicio ? ` al ${fechaBonita(s.fecha_fin)}` : ''}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><span className={labelCls}>Regresa</span><p className="text-[14px] ">{fechaBonita(s.fecha_regreso)}</p></div>
              {s.tipo === 'permiso' && <div><span className={labelCls}>Goce de sueldo</span><p className="text-[14px]">{s.goce_sueldo === true ? 'Con goce' : s.goce_sueldo === false ? 'Sin goce' : 'A decidir'}</p></div>}
              {motivoLabel && <div><span className={labelCls}>Tipo de permiso</span><p className="text-[14px]">{motivoLabel}</p></div>}
              {s.cubre_nombre && <div><span className={labelCls}>Cubre</span><p className="text-[14px]">{s.cubre_nombre}</p></div>}
              {s.motivo && <div className="col-span-2"><span className={labelCls}>{s.tipo === 'permiso' ? 'Motivo' : 'Comentario'}</span><p className="text-[14px]">{s.motivo}</p></div>}
            </div>
          </div>
        )}

        {s.nota && <p className="text-[13.5px] mb-3"><span className="text-muted">Nota: </span>{s.nota}</p>}

        {fotos.length > 0 && (
          <div className="mb-3">
            <span className={labelCls}>Evidencias</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {fotos.map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt="" className="w-20 h-20 object-cover rounded-lg border border-line" /></a>)}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="rounded-xl border border-line p-2.5">
            <span className={labelCls}>Firma del solicitante</span>
            <img src={s.firma_solicitante} alt="Firma" className="h-16 w-full object-contain bg-white rounded-lg mt-1" />
          </div>
          <div className="rounded-xl border border-line p-2.5">
            <span className={labelCls}>Autoriza</span>
            {s.firma_autoriza ? (
              <>
                <img src={s.firma_autoriza} alt="Firma" className="h-16 w-full object-contain bg-white rounded-lg mt-1" />
                <p className="text-[12px] text-muted mt-1">{s.revisado_nombre} · {fechaHora(s.revisado_en)}</p>
              </>
            ) : <p className="text-[12.5px] text-muted mt-2">Pendiente</p>}
          </div>
        </div>

        {s.comentario_revision && s.estado !== 'aprobada' && (
          <div className={`mt-3 rounded-xl px-3.5 py-2.5 text-[13px] ${s.estado === 'rechazada' ? 'bg-red/10 border border-red/30' : 'bg-amber/10 border border-amber/30'}`}>
            <b>{s.revisado_nombre}:</b> {s.comentario_revision}
          </div>
        )}

        {s.historial.length > 0 && (
          <div className="mt-4">
            <span className={labelCls}>Historial</span>
            <ul className="text-[12.5px] text-muted mt-1 space-y-0.5">
              <li>Enviada · {fechaHora(s.created_at)}</li>
              {s.historial.map((h, i) => <li key={i}>{ACCION[h.accion] || h.accion} · {fechaHora(h.en)}{h.comentario ? ` · «${h.comentario}»` : ''}</li>)}
            </ul>
          </div>
        )}

        {/* Acciones de quien autoriza */}
        {puedeResolver && (
          <div className="mt-5">
            {!modo ? (
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => setModo('aprobar')} className="min-h-[46px] rounded-xl bg-teal text-inkOnAccent text-[13.5px] font-semibold flex items-center justify-center gap-1.5"><Check size={16} /> Autorizar</button>
                <button type="button" onClick={() => setModo('correccion')} className="min-h-[46px] rounded-xl bg-amber/15 text-amber text-[13.5px] font-semibold flex items-center justify-center gap-1.5"><MessageSquareWarning size={16} /> Corrección</button>
                <button type="button" onClick={() => setModo('rechazar')} className="min-h-[46px] rounded-xl border border-red/40 text-red text-[13.5px] font-semibold flex items-center justify-center gap-1.5"><Ban size={16} /> Rechazar</button>
              </div>
            ) : (
              <div className="rounded-xl border border-line p-3">
                {modo === 'aprobar' ? (
                  <>
                    <p className="text-[13px] mb-2">Firma para autorizar. Queda en el PDF.</p>
                    <input className="w-full min-h-[44px] px-3 rounded-xl bg-surface-2 border border-line text-[14.5px] mb-2" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre" />
                    <div className="rounded-xl overflow-hidden border border-line mb-2"><SignaturePad ref={firmaRef} titulo="Firma de autorización" onCambio={setFirma} /></div>
                    <input className="w-full min-h-[44px] px-3 rounded-xl bg-surface-2 border border-line text-[14.5px] mb-2" value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Comentario (opcional)" />
                  </>
                ) : (
                  <textarea rows={3} className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-line text-[14.5px] mb-2" value={comentario} onChange={(e) => setComentario(e.target.value)}
                    placeholder={modo === 'correccion' ? '¿Qué debe corregir?' : '¿Por qué se rechaza?'} />
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={busy} onClick={() => { setModo(null); setComentario(''); }} className="min-h-[44px] rounded-xl border border-line text-[13.5px] font-semibold">Volver</button>
                  <button type="button" disabled={busy} onClick={resolver}
                    className={`min-h-[44px] rounded-xl text-[13.5px] font-semibold disabled:opacity-50 ${modo === 'rechazar' ? 'bg-red text-white' : modo === 'correccion' ? 'bg-amber text-inkOnAccent' : 'bg-teal text-inkOnAccent'}`}>
                    {busy ? 'Guardando…' : modo === 'aprobar' ? 'Firmar y autorizar' : modo === 'correccion' ? 'Pedir corrección' : 'Rechazar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Acciones del solicitante */}
        {esMia && (s.estado === 'pendiente' || s.estado === 'correccion') && (
          <div className="grid grid-cols-2 gap-2 mt-5">
            <button type="button" disabled={busy} onClick={cancelar} className="min-h-[44px] rounded-xl border border-line text-red text-[13.5px] font-semibold">Cancelar solicitud</button>
            <button type="button" disabled={busy} onClick={onCorregir} className="min-h-[44px] rounded-xl bg-teal text-inkOnAccent text-[13.5px] font-semibold flex items-center justify-center gap-1.5"><Pencil size={15} /> {s.estado === 'correccion' ? 'Corregir' : 'Modificar'}</button>
          </div>
        )}

        <a href={`/api/solicitudes/${s.id}/pdf`} target="_blank" rel="noopener noreferrer"
          className="mt-3 min-h-[44px] rounded-xl bg-surface-2 border border-line text-[13.5px] font-semibold flex items-center justify-center gap-2">
          <FileText size={16} /> Descargar PDF
        </a>
      </div>
    </ModalOverlay>
  );
}
