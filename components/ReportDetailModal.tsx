'use client';

import SubTabs from '@/components/SubTabs';
import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabaseClient';
import { vincularReporteAServicio, Servicio, listarServiciosVinculables } from '@/lib/serviciosProgramados';
import { eliminarReporte } from '@/lib/eliminarReporte';
import { registrarAccionGlobal } from '@/lib/auditoriaGlobal';
import { Check, X, CircleX, FileText, FileSpreadsheet, Share2, Trash2, Unlock, LockKeyhole, MessageSquareWarning, Camera, FolderKanban, ClipboardCheck } from 'lucide-react';
import { solicitarCorreccion, habilitarCorreccion, cancelarCorreccion, aplicarCorreccion } from '@/lib/correcciones';
import { showToast } from '@/components/Toast';
import FacturacionSection from '@/components/FacturacionSection';
import RevisionFinalSection, { Revision } from '@/components/RevisionFinalSection';
import { hoyLocal } from '@/lib/fechaHoy';

export type ReportDetail = {
  id: string;
  created_at: string;
  empresa_cliente: string;
  fecha: string;
  tipo_servicio: string | null;
  sub_tipo_servicio: string | null;
  data: any;
  profiles?: any;
  // Quien creó el reporte. Se usa para avisarle cuando su solicitud de
  // corrección se autoriza o se cierra.
  created_by?: string | null;
  correccion_habilitada?: boolean;
  correccion_solicitada?: boolean;
  correccion_motivo?: string | null;
  correccion_solicitada_en?: string | null;
  correccion_por?: string | null;
  correccion_en?: string | null;
};

export function techName(profiles: any): string {
  if (!profiles) return 'Técnico';
  if (Array.isArray(profiles)) return profiles[0]?.full_name || 'Técnico';
  return profiles.full_name || 'Técnico';
}

export default function ReportDetailModal({
  report,
  onClose,
  canDelete = false,
  onDeleted,
  onUpdated,
  esSupervisor = false,
}: {
  report: ReportDetail;
  onClose: () => void;
  canDelete?: boolean;
  onDeleted?: (reportId: string) => void;
  // Igual que onDeleted: avisa hacia arriba cuando algo del reporte cambia
  // (firma de revisión, facturación, corrección, vínculo con servicio) para
  // que la lista actualice su copia sin esperar una recarga de la página.
  onUpdated?: (reportId: string, patch: Partial<ReportDetail>) => void;
  esSupervisor?: boolean;
}) {
  const [eliminando, setEliminando] = useState(false);
  const [pestana, setPestana] = useState<'reporte' | 'fotos' | 'gestion'>('reporte');
  const [fotoUrls, setFotoUrls] = useState<{ url: string; caption: string }[] | null>(null);
  const [loadingFotos, setLoadingFotos] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [sharing, setSharing] = useState(false);

  const [servicioVinculadoId, setServicioVinculadoId] = useState<string | null>(report.data?.servicioProgramadoId || null);
  const [serviciosDisponibles, setServiciosDisponibles] = useState<Servicio[]>([]);
  const [servicioParaVincular, setServicioParaVincular] = useState('');
  const [vinculando, setVinculando] = useState(false);
  const [errorVinculo, setErrorVinculo] = useState<string | null>(null);

  // --- Corrección autorizada ---
  const [correccionHabilitada, setCorreccionHabilitada] = useState(!!report.correccion_habilitada);
  const [correccionSolicitada, setCorreccionSolicitada] = useState(!!report.correccion_solicitada);
  const [showSolicitud, setShowSolicitud] = useState(false);
  const [motivoSolicitud, setMotivoSolicitud] = useState('');
  const [procesandoCorreccion, setProcesandoCorreccion] = useState(false);
  const [fotosCorreccion, setFotosCorreccion] = useState<{ file: File; previewUrl: string }[]>([]);
  const [servicioCorreccionId, setServicioCorreccionId] = useState<string | null>(report.data?.servicioProgramadoId || null);
  const fotoCorreccionRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (servicioVinculadoId) return; // ya está enlazado, no hace falta cargar opciones
    // Aquí sí entran los días ya pasados: un reporte capturado al día
    // siguiente debe poder vincularse al servicio que le corresponde.
    listarServiciosVinculables()
      .then(setServiciosDisponibles)
      .catch(() => {});
  }, [servicioVinculadoId]);

  // Cuando hay corrección habilitada el técnico puede reasignar el servicio,
  // así que se cargan las opciones aunque el reporte ya tenga uno vinculado.
  useEffect(() => {
    if (!correccionHabilitada) return;
    listarServiciosVinculables()
      .then(setServiciosDisponibles)
      .catch(() => {});
  }, [correccionHabilitada, report.id]);

  async function handleSolicitarCorreccion() {
    if (!motivoSolicitud.trim()) {
      alert('Escribe brevemente qué hay que corregir para que el supervisor sepa qué autorizar.');
      return;
    }
    setProcesandoCorreccion(true);
    try {
      await solicitarCorreccion(report, motivoSolicitud);
      setCorreccionSolicitada(true);
      onUpdated?.(report.id, { correccion_solicitada: true });
      showToast('Solicitud enviada al supervisor', 'success');
      setShowSolicitud(false);
      setMotivoSolicitud('');
    } catch (e: any) {
      alert('No se pudo enviar la solicitud: ' + (e?.message || 'error'));
    } finally {
      setProcesandoCorreccion(false);
    }
  }

  async function handleHabilitarCorreccion() {
    if (!confirm('¿Autorizar al técnico a corregir este reporte?\n\nSolo podrá agregar fotos y cambiar el servicio vinculado. Quedará registrado en Actividad con tu nombre.')) return;
    setProcesandoCorreccion(true);
    try {
      await habilitarCorreccion(report);
      setCorreccionHabilitada(true);
      setCorreccionSolicitada(false);
      onUpdated?.(report.id, { correccion_habilitada: true, correccion_solicitada: false });
      showToast('Corrección autorizada', 'success');
    } catch (e: any) {
      alert('No se pudo autorizar: ' + (e?.message || 'error'));
    } finally {
      setProcesandoCorreccion(false);
    }
  }

  async function handleCancelarCorreccion() {
    setProcesandoCorreccion(true);
    try {
      await cancelarCorreccion(report);
      setCorreccionHabilitada(false);
      setCorreccionSolicitada(false);
      onUpdated?.(report.id, { correccion_habilitada: false, correccion_solicitada: false });
      showToast('Permiso de corrección cerrado', 'success');
    } catch (e: any) {
      alert('No se pudo cerrar el permiso: ' + (e?.message || 'error'));
    } finally {
      setProcesandoCorreccion(false);
    }
  }

  async function handleAplicarCorreccion() {
    setProcesandoCorreccion(true);
    try {
      const supabase = createClient();
      const nuevasFotos: { path: string; caption: string }[] = [];

      for (let i = 0; i < fotosCorreccion.length; i++) {
        const f = fotosCorreccion[i].file;
        const ext = f.name.split('.').pop() || 'jpg';
        const path = `${report.id}/correccion-${Date.now()}-${i}.${ext}`;
        const { error } = await supabase.storage.from('evidencias').upload(path, f, {
          contentType: f.type || 'image/jpeg',
        });
        // Si una foto no se puede guardar hay que detenerse: aplicar la
        // corrección sin ella dejaría al técnico creyendo que la subió, y el
        // permiso se consume de todos modos.
        if (error) {
          throw new Error(`No se pudo guardar la foto ${i + 1}: ${error.message}`);
        }
        nuevasFotos.push({ path, caption: '' });
      }

      await aplicarCorreccion(report, {
        nuevasFotos,
        nuevoServicioId: servicioCorreccionId,
        servicioAnteriorId: report.data?.servicioProgramadoId || null,
      });

      // El modal trabaja sobre una copia del reporte; sin actualizarla, las
      // fotos recién subidas no aparecen hasta recargar la pantalla.
      const fotosPrevias: any[] = report.data?.fotos || [];
      report.data = {
        ...report.data,
        fotos: [...fotosPrevias, ...nuevasFotos],
        servicioProgramadoId: servicioCorreccionId,
      };

      setCorreccionHabilitada(false);
      setFotosCorreccion([]);
      setServicioVinculadoId(servicioCorreccionId);
      onUpdated?.(report.id, { data: report.data, correccion_habilitada: false });
      showToast(
        nuevasFotos.length > 0
          ? `Corrección aplicada · ${nuevasFotos.length} foto(s) agregada(s)`
          : 'Corrección aplicada',
        'success'
      );
      // Vuelve a pedir las URLs firmadas para que se vean las nuevas.
      if (fotoUrls !== null) await handleVerFotos();
    } catch (e: any) {
      alert('No se pudo aplicar la corrección: ' + (e?.message || 'error'));
    } finally {
      setProcesandoCorreccion(false);
    }
  }

  async function handleVincularServicio() {
    if (!servicioParaVincular) return;
    setVinculando(true);
    setErrorVinculo(null);
    try {
      await vincularReporteAServicio(servicioParaVincular, report.id);
      await updateReportData({ servicioProgramadoId: servicioParaVincular });
      setServicioVinculadoId(servicioParaVincular);
    } catch (e: any) {
      setErrorVinculo(e?.message || 'No se pudo vincular el servicio.');
    } finally {
      setVinculando(false);
    }
  }

  const [revision, setRevision] = useState<Revision>({
    nombre: report.data?.firmaRevisionNombre,
    data: report.data?.firmaRevisionData,
    fecha: report.data?.firmaRevisionFecha,
  });
  const [canApproveReview, setCanApproveReview] = useState(false);
  const [canManageBilling, setCanManageBilling] = useState(false);
  const [servicioConcluido, setServicioConcluido] = useState(Boolean(report.data?.servicioConcluido));
  const [marcandoConcluido, setMarcandoConcluido] = useState(false);

  function handleRevisionAprobada(r: Revision) {
    setRevision(r);
    onUpdated?.(report.id, {
      data: {
        ...report.data,
        firmaRevisionNombre: r.nombre,
        firmaRevisionData: r.data,
        firmaRevisionFecha: r.fecha,
      },
    });
  }


  async function updateReportData(patch: Record<string, any>) {
    const supabase = createClient();
    const newData = { ...report.data, ...patch };
    const { error } = await supabase.from('reports').update({ data: newData }).eq('id', report.id);
    if (error) throw error;
    onUpdated?.(report.id, { data: newData });
    return newData;
  }

  async function handleEliminarReporte() {
    const folio = report.data?.claveFormato ? ` (folio ${report.data.claveFormato})` : '';
    if (!confirm(`¿Eliminar el reporte de «${report.empresa_cliente}»${folio}?\n\nSe borrarán también sus fotos de evidencia y su factura si la tiene. Si está vinculado a un servicio programado, el servicio NO se elimina, solo se desvincula.`)) return;
    if (!confirm('Esta acción es PERMANENTE y quedará registrada en Actividad con tu nombre. ¿Confirmar eliminación?')) return;
    setEliminando(true);
    try {
      await eliminarReporte(report);
      onDeleted?.(report.id);
      onClose();
    } catch (e: any) {
      alert('No se pudo eliminar el reporte: ' + (e?.message || 'error desconocido'));
    } finally {
      setEliminando(false);
    }
  }

  async function handleMarcarFinalizado() {
    setMarcandoConcluido(true);
    try {
      await updateReportData({
        servicioConcluido: true,
        fechaConcluido: report.data?.fechaConcluido || hoyLocal(),
        facturaEstado: report.data?.facturaEstado || 'pendiente',
      });
      setServicioConcluido(true);
      registrarAccionGlobal('marco_finalizado', 'reporte', report.id, `Marcó como finalizado el reporte de «${report.empresa_cliente}»${report.data?.claveFormato ? ` (folio ${report.data.claveFormato})` : ''}`);
    } catch (e: any) {
      alert('No se pudo marcar como finalizado: ' + (e?.message || 'error desconocido'));
    } finally {
      setMarcandoConcluido(false);
    }
  }





  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await supabase.from('profiles').select('can_approve_review, can_manage_billing').eq('id', data.user.id).single();
      setCanApproveReview(Boolean(profile?.can_approve_review));
      setCanManageBilling(Boolean(profile?.can_manage_billing));
    });
  }, []);


  async function handleVerFotos() {
    const raw: any[] = report.data?.fotos || [];
    const items = raw.map((f) => (typeof f === 'string' ? { path: f, caption: '' } : { path: f.path, caption: f.caption || '' }));
    if (items.length === 0) {
      setFotoUrls([]);
      return;
    }
    setLoadingFotos(true);
    const supabase = createClient();
    const { data, error } = await supabase.storage.from('evidencias').createSignedUrls(items.map((it) => it.path), 3600);
    setLoadingFotos(false);
    if (error || !data) {
      setFotoUrls([]);
      return;
    }
    setFotoUrls(data.map((d, i) => ({ url: d.signedUrl || '', caption: items[i].caption })).filter((d) => d.url));
  }

  async function handleShare(format: 'pdf' | 'xlsx') {
    setShareMenuOpen(false);
    setSharing(true);
    try {
      const res = await fetch(`/api/reports/${report.id}/${format}?t=${Date.now()}`);
      if (!res.ok) throw new Error(`No se pudo generar el archivo (código ${res.status})`);
      const blob = await res.blob();
      const ext = format === 'pdf' ? 'pdf' : 'xlsx';
      const mime =
        format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const cleanName = report.empresa_cliente.replace(/[^a-z0-9]+/gi, '-');
      const filename = `reporte-${report.fecha}-${cleanName}.${ext}`;
      const file = new File([blob], filename, { type: mime });

      const nav = navigator as any;
      let shared = false;

      if (nav.canShare && nav.canShare({ files: [file] })) {
        try {
          await nav.share({
            files: [file],
            title: `Reporte · ${report.empresa_cliente}`,
            text: `Reporte de servicio — ${report.empresa_cliente} (${report.fecha})`,
          });
          shared = true;
        } catch (shareErr: any) {
          if (shareErr?.name === 'AbortError') {
            setSharing(false);
            return;
          }
          shared = false;
        }
      }

      if (!shared) {
        alert(
          `Este celular no permite adjuntar archivos Excel directo a WhatsApp.\n\n` +
            `Vamos a descargar el archivo y luego abrir WhatsApp para que tú mismo lo adjuntes ahí con el clip 📎 → Documento.`
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        window.open(
          `https://wa.me/?text=${encodeURIComponent(
            `Reporte de servicio — ${report.empresa_cliente} (${report.fecha})\n\n` +
              `El archivo "${filename}" ya se descargó a tu celular (revisa tu carpeta de Descargas o Archivos).\n\n` +
              `Para enviarlo: en este chat de WhatsApp toca el clip → Documento → busca "${filename}" → envíalo.`
          )}`,
          '_blank'
        );
      }
    } catch (err: any) {
      alert('No se pudo compartir el archivo: ' + (err?.message || err?.name || String(err)));
    } finally {
      setSharing(false);
    }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex justify-center items-start overflow-y-auto p-4">
      <div onClick={(e) => e.stopPropagation()} className="relative glass-strong rounded-3xl max-w-xl lg:max-w-2xl w-full p-6 lg:p-8 mt-4 mb-8 shadow-glow">
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-3.5 right-3.5 z-10 text-ink/60 hover:text-ink active:scale-90 transition-transform"
        >
          <CircleX size={26} strokeWidth={1.8} />
        </button>
        {/* Solicitud pendiente: va arriba de todo porque pide una decisión */}
        {esSupervisor && correccionSolicitada && !correccionHabilitada && (
          <div className="mb-5 p-4 rounded-2xl bg-amber/12 border-2 border-amber/40">
            <p className="font-display font-semibold text-[15px] text-amber mb-1 flex items-center gap-2">
              <MessageSquareWarning size={18} strokeWidth={2.5} />
              {techName(report.profiles) || 'El técnico'} pidió corregir este reporte
            </p>
            {report.correccion_solicitada_en && (
              <p className="text-[12.5px] text-muted mb-2">
                {new Date(report.correccion_solicitada_en).toLocaleString('es-MX', {
                  day: '2-digit', month: 'short', hour: '2-digit', hour12: false, minute: '2-digit',
                })}
              </p>
            )}
            {report.correccion_motivo && (
              <p className="text-[13.5px] text-ink/85 leading-relaxed mb-3 italic">«{report.correccion_motivo}»</p>
            )}
            <p className="text-[13px] text-muted leading-relaxed mb-3">
              Podrá agregar fotos y cambiar el servicio vinculado. Queda registrado en Actividad.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleCancelarCorreccion}
                disabled={procesandoCorreccion}
                className="flex-1 min-h-[48px] rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium active:scale-95 transition-transform disabled:opacity-60"
              >
                Rechazar
              </button>
              <button
                onClick={handleHabilitarCorreccion}
                disabled={procesandoCorreccion}
                className="flex-1 min-h-[48px] rounded-xl bg-amber text-inkOnAccent text-[14.5px] font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
              >
                <Unlock size={16} strokeWidth={2.5} />
                {procesandoCorreccion ? 'Autorizando...' : 'Autorizar'}
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mb-5 flex-wrap gap-2 pr-8">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="font-display font-semibold text-xl tracking-wide">{report.empresa_cliente}</h2>
            {revision.data ? (
              <span className="text-[12.5px] font-semibold px-2.5 py-1 rounded-full bg-teal/15 text-teal border border-teal/30 flex items-center gap-1.5"><Check size={13} strokeWidth={3} />Completado</span>
            ) : (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber/15 text-amber border border-amber/30">Pendiente de revisión</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => window.open(`/api/reports/${report.id}/pdf?t=${Date.now()}`, '_blank', 'noopener,noreferrer')}
              className="min-h-[38px] flex items-center gap-1.5 text-[12.5px] bg-teal text-inkOnAccent rounded-full px-3.5 py-2 font-semibold active:scale-95 transition-transform shadow-glow-teal"
            >
              <FileText size={15} strokeWidth={2.4} />
              Ver PDF
            </button>
            <button
              onClick={() => { window.location.href = `/api/reports/${report.id}/xlsx?t=${Date.now()}`; }}
              className="min-h-[38px] flex items-center gap-1.5 text-[12.5px] bg-teal-dark text-white rounded-full px-3.5 py-2 font-semibold active:scale-95 transition-transform"
            >
              <FileSpreadsheet size={15} strokeWidth={2.4} />
              Descargar Excel
            </button>
            <div className="relative">
              <button
                onClick={() => setShareMenuOpen((v) => !v)}
                disabled={sharing}
                className="min-h-[38px] flex items-center gap-1.5 text-[12.5px] text-white rounded-full px-3.5 py-2 font-semibold active:scale-95 transition-transform disabled:opacity-60"
                style={{ backgroundColor: '#25D366' }}
              >
                <Share2 size={15} strokeWidth={2.4} />
                {sharing ? 'Preparando...' : 'Compartir'}
              </button>
              {shareMenuOpen && (
                <div className="absolute right-0 top-full mt-2 glass-strong rounded-2xl p-1.5 flex flex-col gap-1 z-10 min-w-[150px] shadow-glow">
                  <button onClick={() => handleShare('pdf')} className="flex items-center gap-2 text-left text-[12.5px] font-medium px-3 py-2 rounded-xl hover:bg-white/10 active:scale-95 transition-transform">
                    <FileText size={14} strokeWidth={2.4} className="text-teal" />
                    Como PDF
                  </button>
                  <button onClick={() => handleShare('xlsx')} className="flex items-center gap-2 text-left text-[12.5px] font-medium px-3 py-2 rounded-xl hover:bg-white/10 active:scale-95 transition-transform">
                    <FileSpreadsheet size={14} strokeWidth={2.4} className="text-teal" />
                    Como Excel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tres pestañas: lo que se hizo, la evidencia y la gestión
            (vínculo, revisión, facturación, correcciones). Antes era una sola
            columna muy larga. */}
        <SubTabs
          activa={pestana}
          onCambiar={(k) => {
            setPestana(k);
            if (k === 'fotos' && fotoUrls === null && !loadingFotos) handleVerFotos();
          }}
          opciones={[
            { k: 'reporte', label: 'Reporte', Icono: FileText },
            { k: 'fotos', label: `Fotos${(report.data?.fotos?.length || 0) > 0 ? ` (${report.data.fotos.length})` : ''}`, Icono: Camera },
            { k: 'gestion', label: 'Revisión', Icono: ClipboardCheck },
          ]}
          className="mb-1"
        />

        {pestana === 'reporte' && (<>
        <Section title="Datos generales">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
            <Detail label="Clave de formato" value={report.data?.claveFormato} />
            <Detail label="Fecha" value={report.fecha} />
            <Detail label="Ing a cargo" value={report.data?.ingACargo} />
            <Detail label="Personal adicional" value={(report.data?.personal || []).join(', ')} />
            <Detail label="Técnico (cuenta)" value={techName(report.profiles)} />
            <Detail
              label="Tipo"
              value={`${report.tipo_servicio || '—'}${report.sub_tipo_servicio ? ' · ' + report.sub_tipo_servicio : ''}${report.tipo_servicio === 'Otro' && report.data?.tipoServicioOtroTexto ? ' · ' + report.data.tipoServicioOtroTexto : ''}`}
            />
            <Detail label="Orden de compra" value={report.data?.ordCompra} />
            <Detail label="Hora llegada / salida" value={`${report.data?.horaLlegada || '—'} - ${report.data?.horaSalida || '—'}`} />
            <Detail label="Contacto/Usuario" value={report.data?.contactoUsuario} />
            <Detail label="Puesto/Área" value={report.data?.puestoArea} />
            <Detail label="Vehículo" value={report.data?.vehiculo} />
            <Detail label="Placas" value={report.data?.placas} />
            <Detail label="Manejado por" value={report.data?.manejadoPor} />
            <Detail label="Lista de conceptos" value={report.data?.listaConceptos} />
          </div>
        </Section>

        {(report.data?.actividades || []).length > 0 && (
          <Section title="Descripción de actividades realizadas">
            <ol className="list-decimal marker:text-teal marker:font-bold pl-5 text-[13.5px] font-medium space-y-1.5">
              {report.data.actividades.map((a: string, i: number) => (
                <li key={i}>{a}</li>
              ))}
            </ol>
          </Section>
        )}

        {(report.data?.casoPuntos || []).length > 0 && (
          <Section title="Caso de problema en equipo o instalación">
            {report.data.casoPuntos.map((p: any, i: number) => (
              <div key={i} className="mb-3 last:mb-0 pb-3 last:pb-0 border-b last:border-b-0 border-line">
                <div className="text-xs font-bold text-teal mb-1.5">Punto {i + 1}</div>
                <div className="grid grid-cols-1 gap-1.5 text-[13px]">
                  {p.definicion && <div><span className="text-muted">Definición: </span>{p.definicion}</div>}
                  {p.descripcion && <div><span className="text-muted">Descripción: </span>{p.descripcion}</div>}
                  {p.analisis && <div><span className="text-muted">Análisis: </span>{p.analisis}</div>}
                  {p.plan && <div><span className="text-muted">Plan: </span>{p.plan}</div>}
                  {p.resultados && <div><span className="text-muted">Resultados: </span>{p.resultados}</div>}
                  {p.pasosFuturos && <div><span className="text-muted">Pasos futuros: </span>{p.pasosFuturos}</div>}
                </div>
              </div>
            ))}
          </Section>
        )}

        <Section title="Sistema y observaciones">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
            <Detail
              label="Sistema de seguridad"
              value={[...(report.data?.sistemaSeguridad || [])]
                .map((s: string) => (s === 'Otra' && report.data?.seguridadOtraTexto ? `Otra: ${report.data.seguridadOtraTexto}` : s))
                .join(', ')}
            />
            <Detail label="Observaciones" value={report.data?.observaciones} />
            {report.data?.tuberia && Object.keys(report.data.tuberia).length > 0 && (
              <Detail
                label="Tubería"
                value={Object.entries(report.data.tuberia as Record<string, { medida: string; metros: string; especifica?: string }>)
                  .map(([t, v]) => `${t}${t === 'Otra' && v.especifica ? ` (${v.especifica})` : ''}: ${v.medida || '—'} · ${v.metros || '—'} m`)
                  .join(' / ')}
              />
            )}
            {(() => {
              const cablesList: any[] = report.data?.cables || [report.data?.cable1, report.data?.cable2].filter(Boolean);
              return cablesList.map((c, i) => (
                <Detail key={i} label={`Cable ${i + 1}`} value={`${c.tipo || '—'} / cal. ${c.calibre || '—'} / ${c.metros || '—'} m`} />
              ));
            })()}
          </div>
        </Section>

        {(report.data?.firmaIngData || report.data?.firmaIngNombre || report.data?.firmaClienteData || report.data?.firmaClienteNombre) && (
          <Section title="Firmas">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(report.data?.firmaIngData || report.data?.firmaIngNombre) && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Ing. responsable</div>
                  {report.data?.firmaIngNombre && <div className="text-[14px] font-semibold mb-1.5">{report.data.firmaIngNombre}</div>}
                  {report.data?.firmaIngData && (
                    <img src={report.data.firmaIngData} alt="Firma ingeniero" className="w-full max-w-[260px] rounded-xl border border-line bg-surface" />
                  )}
                </div>
              )}
              {(report.data?.firmaClienteData || report.data?.firmaClienteNombre) && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Cliente</div>
                  {report.data?.firmaClienteNombre && <div className="text-[14px] font-semibold mb-1.5">{report.data.firmaClienteNombre}</div>}
                  {report.data?.firmaClienteData && (
                    <img src={report.data.firmaClienteData} alt="Firma cliente" className="w-full max-w-[260px] rounded-xl border border-line bg-surface" />
                  )}
                </div>
              )}
            </div>
          </Section>
        )}

        </>)}

        {pestana === 'gestion' && (<>
        <div className="mt-4" />
        {/* Vínculo con el servicio programado: lo primero del reporte, porque
            determina a qué trabajo pertenece. */}
        {servicioVinculadoId ? (
          <a
            href={`/dashboard/servicios/${servicioVinculadoId}`}
            className="inline-flex items-center gap-2 text-[13.5px] text-teal font-medium mb-4 min-h-[40px]"
          >
            <FolderKanban size={16} strokeWidth={2.4} />
            Ver el servicio programado relacionado
          </a>
        ) : (
          <div className="mb-4 p-4 rounded-2xl bg-amber/12 border-2 border-amber/40">
            <p className="font-display font-semibold text-[14.5px] text-amber mb-1 flex items-center gap-2">
              <FolderKanban size={17} strokeWidth={2.5} />
              Este reporte no está vinculado a ningún servicio
            </p>
            <p className="text-[12.5px] text-ink/80 mb-2.5 leading-relaxed">
              Vincúlalo para que el servicio programado quede marcado como atendido.
            </p>
            {serviciosDisponibles.length > 0 ? (
              <>
                <select
                  value={servicioParaVincular}
                  onChange={(e) => setServicioParaVincular(e.target.value)}
                  className="w-full px-3 min-h-[48px] mb-2.5 rounded-xl bg-surface border border-line text-[14.5px] focus:border-teal focus:outline-none"
                >
                  <option value="">Elegir servicio…</option>
                  {serviciosDisponibles.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.proyecto}{s.dias_totales > 1 ? ` · Día ${s.numero_dia} de ${s.dias_totales}` : ''} · {s.fecha.split('-').reverse().join('/')}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleVincularServicio}
                  disabled={!servicioParaVincular || vinculando}
                  className="w-full min-h-[48px] rounded-xl bg-teal text-inkOnAccent text-[14.5px] font-semibold active:scale-95 transition-transform disabled:opacity-50"
                >
                  {vinculando ? 'Vinculando...' : 'Vincular a este servicio'}
                </button>
              </>
            ) : (
              <p className="text-[12.5px] text-muted">
                No hay servicios programados sin reporte disponibles para vincular.
              </p>
            )}
            {errorVinculo && <p className="text-red text-[12.5px] mt-2">{errorVinculo}</p>}
          </div>
        )}
        <RevisionFinalSection
          reportId={report.id}
          empresaCliente={report.empresa_cliente}
          claveFormato={report.data?.claveFormato}
          reportData={report.data}
          revision={revision}
          puedeAprobar={canApproveReview}
          onAprobada={handleRevisionAprobada}
        />

        <FacturacionSection
          reportId={report.id}
          empresaCliente={report.empresa_cliente}
          claveFormato={report.data?.claveFormato}
          fechaReporte={report.fecha}
          fechaConcluido={report.data?.fechaConcluido}
          datosFactura={{
            estado: report.data?.facturaEstado,
            archivoPath: report.data?.facturaArchivo?.path,
            archivoNombre: report.data?.facturaArchivo?.nombre,
            archivoFecha: report.data?.facturaArchivo?.fecha,
            nota: report.data?.facturaNota,
            notaFecha: report.data?.facturaNotaFecha,
          }}
          servicioConcluido={servicioConcluido}
          puedeFacturar={canManageBilling}
          marcandoConcluido={marcandoConcluido}
          onMarcarFinalizado={handleMarcarFinalizado}
          onGuardarDatos={updateReportData}
        />

        </>)}

        {pestana === 'reporte' && (<>
        {(report.data?.equipos || []).length > 0 && (
          <Section title="Equipo instalado">
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr className="bg-surface-2 text-muted text-[11px] uppercase tracking-wide">
                    <th className="text-left px-3 py-2">Cant.</th>
                    <th className="text-left px-3 py-2">Descripción</th>
                    <th className="text-left px-3 py-2">Modelo</th>
                    <th className="text-left px-3 py-2">Marca</th>
                    <th className="text-left px-3 py-2">Serie</th>
                  </tr>
                </thead>
                <tbody>
                  {report.data.equipos.map((e: any, i: number) => (
                    <tr key={i} className="border-t border-line">
                      <td className="px-3 py-2">{e.cant}</td>
                      <td className="px-3 py-2">{e.desc}</td>
                      <td className="px-3 py-2">{e.modelo}</td>
                      <td className="px-3 py-2">{e.marca}</td>
                      <td className="px-3 py-2 font-mono">{e.serie}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        </>)}

        {pestana === 'fotos' && (<>
        {loadingFotos && <p className="text-[13px] text-muted mt-4">Cargando fotos...</p>}
        {fotoUrls !== null && !loadingFotos && (
          <Section title="Fotos de evidencia">
            {fotoUrls.length === 0 ? (
              <p className="text-[13px] text-muted">Este reporte no tiene fotos de evidencia.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                {fotoUrls.map((f, i) => (
                  <div key={i}>
                    <a href={f.url} target="_blank" rel="noopener noreferrer">
                      <img src={f.url} alt={`Evidencia ${i + 1}`} className="w-full h-[180px] object-cover rounded-xl border border-line" />
                    </a>
                    {f.caption && <p className="text-[12px] text-ink/80 mt-1.5">{f.caption}</p>}
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        </>)}

        {pestana === 'gestion' && (<>
        {/* --- Corrección autorizada --- */}
        {esSupervisor && correccionHabilitada && (
          <div className="mt-5 p-4 rounded-2xl bg-amber/10 border border-amber/30">
            <p className="font-display font-semibold text-[14.5px] text-amber mb-1 flex items-center gap-2">
              <Unlock size={16} strokeWidth={2.5} />
              Corrección autorizada
            </p>
            <p className="text-[13px] text-muted leading-relaxed mb-3">
              El permiso se cierra solo cuando el técnico aplique los cambios.
            </p>
            <button
              onClick={handleCancelarCorreccion}
              disabled={procesandoCorreccion}
              className="w-full min-h-[48px] rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
            >
              <LockKeyhole size={16} strokeWidth={2.5} />
              {procesandoCorreccion ? 'Cerrando...' : 'Cerrar permiso sin corregir'}
            </button>
          </div>
        )}

        {!esSupervisor && !correccionHabilitada && correccionSolicitada && (
          <div className="mt-5 p-4 rounded-2xl bg-amber/10 border border-amber/30">
            <p className="text-[14px] font-semibold text-amber mb-1 flex items-center gap-2">
              <MessageSquareWarning size={16} strokeWidth={2.5} />
              Solicitud enviada
            </p>
            <p className="text-[13px] text-muted leading-relaxed">
              Espera a que un supervisor la autorice.
            </p>
          </div>
        )}

        {!esSupervisor && !correccionHabilitada && !correccionSolicitada && (
          <div className="mt-5">
            {!showSolicitud ? (
              <button
                onClick={() => setShowSolicitud(true)}
                className="w-full min-h-[48px] rounded-xl border border-dashed border-amber/50 text-amber text-[14px] font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <MessageSquareWarning size={16} strokeWidth={2.4} />
                Solicitar corrección al supervisor
              </button>
            ) : (
              <div className="p-4 rounded-2xl bg-surface-2 border border-line">
                <p className="font-display font-semibold text-[14.5px] mb-1">Solicitar corrección</p>
                <p className="text-[13px] text-muted leading-relaxed mb-3">
                  Explica qué hay que corregir.
                </p>
                <textarea
                  value={motivoSolicitud}
                  onChange={(e) => setMotivoSolicitud(e.target.value)}
                  placeholder="Ej. Vinculé el reporte al servicio equivocado, es el de Casther y no el de HSMC."
                  className="w-full px-3 py-2.5 mb-3 rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[14px] min-h-[80px]"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowSolicitud(false); setMotivoSolicitud(''); }}
                    className="flex-1 min-h-[48px] rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium active:scale-95 transition-transform"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSolicitarCorreccion}
                    disabled={procesandoCorreccion}
                    className="flex-1 min-h-[48px] rounded-xl bg-amber text-inkOnAccent text-[14.5px] font-semibold active:scale-95 transition-transform disabled:opacity-60"
                  >
                    {procesandoCorreccion ? 'Enviando...' : 'Enviar solicitud'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {!esSupervisor && correccionHabilitada && (
          <div className="mt-5 p-4 rounded-2xl bg-amber/10 border border-amber/30">
            <p className="font-display font-semibold text-[14.5px] text-amber mb-1 flex items-center gap-2">
              <Unlock size={16} strokeWidth={2.5} />
              Corrección autorizada
            </p>
            <p className="text-[13px] text-muted leading-relaxed mb-3.5">
              Al guardar, el reporte vuelve a quedar fijo.
            </p>

            <label className="text-[13px] text-ink/80 block mb-1.5">Servicio vinculado</label>
            <select
              value={servicioCorreccionId || ''}
              onChange={(e) => setServicioCorreccionId(e.target.value || null)}
              className="w-full px-3 min-h-[48px] mb-3.5 rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[14.5px]"
            >
              <option value="">Sin servicio vinculado</option>
              {serviciosDisponibles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.proyecto}{s.dias_totales > 1 ? ` · Día ${s.numero_dia} de ${s.dias_totales}` : ''}
                </option>
              ))}
            </select>

            <label className="text-[13px] text-ink/80 block mb-1.5">Fotos adicionales</label>
            <input
              ref={fotoCorreccionRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                setFotosCorreccion((prev) => [...prev, ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
                if (fotoCorreccionRef.current) fotoCorreccionRef.current.value = '';
              }}
            />
            {fotosCorreccion.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                {fotosCorreccion.map((f, i) => (
                  <div key={i} className="relative">
                    <img src={f.previewUrl} className="w-full h-[80px] object-cover rounded-lg border border-line" />
                    <button
                      aria-label="Quitar foto"
                      onClick={() => setFotosCorreccion((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-1 right-1 w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center"
                    >
                      <X size={15} strokeWidth={2.6} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => fotoCorreccionRef.current?.click()}
              className="w-full min-h-[48px] mb-3 rounded-xl border border-dashed border-teal/50 text-teal text-[14.5px] font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              <Camera size={16} strokeWidth={2.3} />
              Agregar fotos
            </button>

            <button
              onClick={handleAplicarCorreccion}
              disabled={procesandoCorreccion}
              className="w-full min-h-[48px] rounded-xl bg-teal text-inkOnAccent text-[14.5px] font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
            >
              <Check size={16} strokeWidth={3} />
              {procesandoCorreccion ? 'Guardando...' : 'Guardar corrección'}
            </button>
          </div>
        )}

        {canDelete && (
          <div className="mt-6 pt-4 border-t border-dashed border-red/30">
            <button
              onClick={handleEliminarReporte}
              disabled={eliminando}
              className="w-full min-h-[48px] rounded-xl border border-red/40 text-red text-[14.5px] font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
            >
              {eliminando ? 'Eliminando...' : <><Trash2 size={16} strokeWidth={2.4} />Eliminar este reporte</>}
            </button>
            <p className="text-[11px] text-muted mt-1.5 text-center">Acción permanente. Quedará registrada en Actividad.</p>
          </div>
        )}
        </>)}
      </div>
    </div>
  );
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 p-4 bg-surface-2 rounded-2xl border border-line">
      {title && <div className="text-[11px] uppercase tracking-wider font-bold text-teal mb-3">{title}</div>}
      {children}
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">{label}</div>
      <div className="text-[14px] font-semibold">{value}</div>
    </div>
  );
}
