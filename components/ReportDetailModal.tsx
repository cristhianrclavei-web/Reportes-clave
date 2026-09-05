'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabaseClient';
import SignaturePad, { SignaturePadHandle } from './SignaturePad';
import { listarMisServicios, vincularReporteAServicio, Servicio, filtrarSiguienteDiaPorGrupo } from '@/lib/serviciosProgramados';

export type ReportDetail = {
  id: string;
  created_at: string;
  empresa_cliente: string;
  fecha: string;
  tipo_servicio: string | null;
  sub_tipo_servicio: string | null;
  data: any;
  profiles?: any;
};

export function techName(profiles: any): string {
  if (!profiles) return 'Técnico';
  if (Array.isArray(profiles)) return profiles[0]?.full_name || 'Técnico';
  return profiles.full_name || 'Técnico';
}

export default function ReportDetailModal({ report, onClose }: { report: ReportDetail; onClose: () => void }) {
  const [fotoUrls, setFotoUrls] = useState<{ url: string; caption: string }[] | null>(null);
  const [loadingFotos, setLoadingFotos] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [sharing, setSharing] = useState(false);

  const [servicioVinculadoId, setServicioVinculadoId] = useState<string | null>(report.data?.servicioProgramadoId || null);
  const [serviciosDisponibles, setServiciosDisponibles] = useState<Servicio[]>([]);
  const [servicioParaVincular, setServicioParaVincular] = useState('');
  const [vinculando, setVinculando] = useState(false);
  const [errorVinculo, setErrorVinculo] = useState<string | null>(null);

  useEffect(() => {
    if (servicioVinculadoId) return; // ya está enlazado, no hace falta cargar opciones
    listarMisServicios()
      .then((lista) => setServiciosDisponibles(filtrarSiguienteDiaPorGrupo(lista.filter((s) => !s.report_id))))
      .catch(() => {});
  }, [servicioVinculadoId]);

  async function handleVincularServicio() {
    if (!servicioParaVincular) return;
    setVinculando(true);
    setErrorVinculo(null);
    try {
      await vincularReporteAServicio(servicioParaVincular, report.id);
      const supabase = createClient();
      const { error } = await supabase
        .from('reports')
        .update({ data: { ...report.data, servicioProgramadoId: servicioParaVincular } })
        .eq('id', report.id);
      if (error) throw error;
      setServicioVinculadoId(servicioParaVincular);
    } catch (e: any) {
      setErrorVinculo(e?.message || 'No se pudo vincular el servicio.');
    } finally {
      setVinculando(false);
    }
  }

  const [revision, setRevision] = useState({
    nombre: report.data?.firmaRevisionNombre as string | undefined,
    data: report.data?.firmaRevisionData as string | undefined,
    fecha: report.data?.firmaRevisionFecha as string | undefined,
  });
  const [canApproveReview, setCanApproveReview] = useState(false);
  const [canManageBilling, setCanManageBilling] = useState(false);
  const [servicioConcluido, setServicioConcluido] = useState(Boolean(report.data?.servicioConcluido));
  const [marcandoConcluido, setMarcandoConcluido] = useState(false);
  const [showApproveSig, setShowApproveSig] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const approveSigRef = useRef<SignaturePadHandle>(null);

  const [factura, setFactura] = useState({
    estado: report.data?.facturaEstado as 'pendiente' | 'facturado' | 'en_proceso' | null | undefined,
    archivoPath: report.data?.facturaArchivo?.path as string | undefined,
    archivoNombre: report.data?.facturaArchivo?.nombre as string | undefined,
    archivoFecha: report.data?.facturaArchivo?.fecha as string | undefined,
    nota: report.data?.facturaNota as string | undefined,
    notaFecha: report.data?.facturaNotaFecha as string | undefined,
  });
  const [facturaUrl, setFacturaUrl] = useState<string | null>(null);
  const [showFacturaNota, setShowFacturaNota] = useState(false);
  const [notaTexto, setNotaTexto] = useState('');
  const [subiendoFactura, setSubiendoFactura] = useState(false);
  const [facturaError, setFacturaError] = useState<string | null>(null);
  const facturaInputRef = useRef<HTMLInputElement>(null);

  async function updateReportData(patch: Record<string, any>) {
    const supabase = createClient();
    const newData = { ...report.data, ...patch };
    const { error } = await supabase.from('reports').update({ data: newData }).eq('id', report.id);
    if (error) throw error;
    return newData;
  }

  async function handleMarcarFinalizado() {
    setMarcandoConcluido(true);
    try {
      await updateReportData({
        servicioConcluido: true,
        fechaConcluido: report.data?.fechaConcluido || new Date().toISOString().slice(0, 10),
        facturaEstado: report.data?.facturaEstado || 'pendiente',
      });
      setServicioConcluido(true);
    } catch (e: any) {
      alert('No se pudo marcar como finalizado: ' + (e?.message || 'error desconocido'));
    } finally {
      setMarcandoConcluido(false);
    }
  }

  async function handleSubirFactura(file: File) {
    if (file.type !== 'application/pdf') {
      setFacturaError('El archivo debe ser un PDF.');
      return;
    }
    setSubiendoFactura(true);
    setFacturaError(null);
    try {
      const supabase = createClient();
      const path = `${report.id}/factura-${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage.from('facturas').upload(path, file, { contentType: 'application/pdf' });
      if (upErr) throw upErr;
      const fecha = new Date().toLocaleDateString('es-MX');
      await updateReportData({
        facturaEstado: 'facturado',
        facturaArchivo: { path, nombre: file.name, fecha },
        facturaNota: null,
      });
      setFactura((f) => ({ ...f, estado: 'facturado', archivoPath: path, archivoNombre: file.name, archivoFecha: fecha }));
    } catch (e: any) {
      setFacturaError(e?.message || 'No se pudo subir la factura.');
    } finally {
      setSubiendoFactura(false);
    }
  }

  async function handleGuardarNotaFactura() {
    if (!notaTexto.trim()) {
      setFacturaError('Escribe el motivo.');
      return;
    }
    setSubiendoFactura(true);
    setFacturaError(null);
    try {
      const fecha = new Date().toLocaleDateString('es-MX');
      await updateReportData({ facturaEstado: 'en_proceso', facturaNota: notaTexto.trim(), facturaNotaFecha: fecha });
      setFactura((f) => ({ ...f, estado: 'en_proceso', nota: notaTexto.trim(), notaFecha: fecha }));
      setShowFacturaNota(false);
      setNotaTexto('');
    } catch (e: any) {
      setFacturaError(e?.message || 'No se pudo guardar la nota.');
    } finally {
      setSubiendoFactura(false);
    }
  }

  async function handleVerFactura() {
    if (!factura.archivoPath) return;
    const supabase = createClient();
    const { data } = await supabase.storage.from('facturas').createSignedUrl(factura.archivoPath, 3600);
    if (data?.signedUrl) setFacturaUrl(data.signedUrl);
  }

  function diasSinFacturar(): number | null {
    if (factura.estado === 'facturado') return null;
    const desde = report.data?.fechaConcluido || report.fecha;
    if (!desde) return null;
    const ms = Date.now() - new Date(desde + 'T00:00:00').getTime();
    const dias = Math.floor(ms / 86400000);
    return dias >= 0 ? dias : null;
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

  async function handleApproveReview() {
    if (!approveSigRef.current || approveSigRef.current.isEmpty()) {
      setApproveError('Falta la firma.');
      return;
    }
    setApproving(true);
    setApproveError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user!.id).single();
      const nombre = profile?.full_name || user?.email || 'Revisor';
      const firmaData = approveSigRef.current.getDataURL();
      const fecha = new Date().toLocaleDateString('es-MX');

      const newData = {
        ...report.data,
        revisionEstado: 'aprobado',
        firmaRevisionNombre: nombre,
        firmaRevisionData: firmaData,
        firmaRevisionFecha: fecha,
      };
      const { error } = await supabase.from('reports').update({ data: newData }).eq('id', report.id);
      if (error) throw error;

      setRevision({ nombre, data: firmaData || undefined, fecha });
      setShowApproveSig(false);
    } catch (e: any) {
      setApproveError(e?.message || 'No se pudo guardar la firma. Intenta de nuevo.');
    } finally {
      setApproving(false);
    }
  }

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
            `📎 Reporte de servicio — ${report.empresa_cliente} (${report.fecha})\n\n` +
              `El archivo "${filename}" ya se descargó a tu celular (revisa tu carpeta de Descargas o Archivos).\n\n` +
              `Para enviarlo: en este chat de WhatsApp toca el clip 📎 → Documento → busca "${filename}" → envíalo.`
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
      <div onClick={(e) => e.stopPropagation()} className="glass-strong rounded-3xl max-w-xl lg:max-w-2xl w-full p-6 lg:p-8 mt-4 mb-8 shadow-glow">
        {servicioVinculadoId ? (
          <a
            href={`/dashboard/servicios/${servicioVinculadoId}`}
            className="inline-block text-[12px] text-teal underline mb-2"
          >
            🗂️ Ver servicio programado relacionado
          </a>
        ) : serviciosDisponibles.length > 0 ? (
          <div className="mb-3 p-3 rounded-xl bg-surface-2 border border-line">
            <p className="text-[11px] uppercase tracking-wider text-muted mb-1.5">Vincular a un servicio asignado</p>
            <div className="flex gap-2 flex-wrap items-center">
              <select
                value={servicioParaVincular}
                onChange={(e) => setServicioParaVincular(e.target.value)}
                className="flex-1 min-w-[160px] px-2.5 py-2 rounded-lg bg-surface border border-line text-[12.5px] focus:border-teal focus:outline-none"
              >
                <option value="">-- Selecciona uno --</option>
                {serviciosDisponibles.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.proyecto}{s.dias_totales > 1 ? ` · Día ${s.numero_dia}/${s.dias_totales}` : ` · ${s.fecha.split('-').reverse().join('/')}`}
                  </option>
                ))}
              </select>
              <button
                onClick={handleVincularServicio}
                disabled={!servicioParaVincular || vinculando}
                className="text-xs bg-teal text-inkOnAccent rounded-full px-3.5 py-2 font-semibold active:scale-95 transition-transform disabled:opacity-50"
              >
                {vinculando ? 'Vinculando...' : 'Vincular'}
              </button>
            </div>
            {errorVinculo && <p className="text-red text-[11px] mt-1.5">{errorVinculo}</p>}
          </div>
        ) : null}
        <div className="flex justify-between items-center mb-5 flex-wrap gap-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="font-display font-semibold text-xl tracking-wide">{report.empresa_cliente}</h2>
            {revision.data ? (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-teal/15 text-teal border border-teal/30">✓ Completado</span>
            ) : (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber/15 text-amber border border-amber/30">Pendiente de revisión</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.open(`/api/reports/${report.id}/pdf?t=${Date.now()}`, '_blank', 'noopener,noreferrer')}
              className="text-xs bg-teal text-inkOnAccent rounded-full px-3.5 py-2 font-semibold active:scale-95 transition-transform"
            >
              Ver PDF
            </button>
            <button
              onClick={() => { window.location.href = `/api/reports/${report.id}/xlsx?t=${Date.now()}`; }}
              className="text-xs bg-teal-dark text-white rounded-full px-3.5 py-2 font-semibold active:scale-95 transition-transform"
            >
              Descargar Excel
            </button>
            <button
              onClick={handleVerFotos}
              className="text-xs bg-amber text-inkOnAccent rounded-full px-3.5 py-2 font-semibold active:scale-95 transition-transform"
            >
              Fotos {(report.data?.fotos?.length || 0) > 0 ? `(${report.data.fotos.length})` : ''}
            </button>
            <div className="relative">
              <button
                onClick={() => setShareMenuOpen((v) => !v)}
                disabled={sharing}
                className="text-xs text-white rounded-full px-3.5 py-2 font-semibold active:scale-95 transition-transform disabled:opacity-60"
                style={{ backgroundColor: '#25D366' }}
              >
                {sharing ? 'Preparando...' : 'Compartir'}
              </button>
              {shareMenuOpen && (
                <div className="absolute right-0 top-full mt-2 glass-strong rounded-2xl p-1.5 flex flex-col gap-1 z-10 min-w-[140px] shadow-glow">
                  <button onClick={() => handleShare('pdf')} className="text-left text-xs px-3 py-2 rounded-xl hover:bg-white/10 active:scale-95 transition-transform">
                    Como PDF
                  </button>
                  <button onClick={() => handleShare('xlsx')} className="text-left text-xs px-3 py-2 rounded-xl hover:bg-white/10 active:scale-95 transition-transform">
                    Como Excel
                  </button>
                </div>
              )}
            </div>
            <button onClick={onClose} className="text-ink/60 text-xl leading-none active:scale-90 transition-transform">
              ✕
            </button>
          </div>
        </div>

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

        {(report.data?.actividades || []).length > 0 && (
          <div className="mt-4">
            <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Descripción de actividades realizadas</div>
            <ol className="list-decimal pl-5 text-[13.5px] font-medium space-y-1">
              {report.data.actividades.map((a: string, i: number) => (
                <li key={i}>{a}</li>
              ))}
            </ol>
          </div>
        )}

        {(report.data?.casoPuntos || []).length > 0 && (
          <div className="mt-4 p-4 bg-surface-2 rounded-2xl border border-line">
            <div className="text-[11px] uppercase tracking-wider font-bold text-teal mb-3">Caso de problema en equipo o instalación</div>
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
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
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
          <Detail label="Firma ing." value={report.data?.firmaIngNombre} />
          <Detail label="Firma cliente" value={report.data?.firmaClienteNombre} />
        </div>

        {report.data?.firmaIngData && (
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Firma · Ing. responsable</div>
            <img src={report.data.firmaIngData} alt="Firma ingeniero" className="w-full max-w-[300px] rounded-xl border border-line bg-surface-2" />
          </div>
        )}
        {report.data?.firmaClienteData && (
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Firma · Cliente</div>
            <img src={report.data.firmaClienteData} alt="Firma cliente" className="w-full max-w-[300px] rounded-xl border border-line bg-surface-2" />
          </div>
        )}

        {/* Revisión final — Ing. Everardo Sánchez */}
        <div className="mt-5 p-4 bg-surface-2 rounded-2xl border border-line">
          <div className="text-[11px] uppercase tracking-wider font-bold text-teal mb-3">Revisión final</div>

          {revision.data ? (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-teal text-lg leading-none">✓</span>
                <span className="text-[14px] font-semibold">Aprobado por {revision.nombre}</span>
              </div>
              <p className="text-[12px] text-muted mb-2">{revision.fecha}</p>
              <img src={revision.data} alt="Firma de revisión" className="w-full max-w-[300px] rounded-xl border border-line bg-surface" />
            </div>
          ) : (
            <div>
              <p className="text-[13px] text-ink/80 mb-3">
                Este reporte está <b>pendiente de firma del Ing. Everardo Sánchez</b>. No se considera completado hasta que la revisión final quede firmada.
              </p>

              {canApproveReview && !showApproveSig && (
                <button
                  onClick={() => setShowApproveSig(true)}
                  className="text-xs bg-teal text-inkOnAccent rounded-full px-4 py-2 font-semibold active:scale-95 transition-transform"
                >
                  Revisar y firmar
                </button>
              )}

              {canApproveReview && showApproveSig && (
                <div>
                  <div className="rounded-xl overflow-hidden border border-line mb-2">
                    <SignaturePad ref={approveSigRef} height={130} />
                  </div>
                  {approveError && <p className="text-red text-[12px] mb-2">{approveError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowApproveSig(false)}
                      className="text-xs border border-line-strong text-ink/80 rounded-full px-4 py-2 active:scale-95 transition-transform"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleApproveReview}
                      disabled={approving}
                      className="text-xs bg-teal text-inkOnAccent rounded-full px-4 py-2 font-semibold active:scale-95 transition-transform disabled:opacity-60"
                    >
                      {approving ? 'Guardando...' : 'Confirmar aprobación'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Facturación */}
        {servicioConcluido ? (
          <div className="mt-4 p-4 bg-surface-2 rounded-2xl border border-line">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] uppercase tracking-wider font-bold text-teal">Facturación</div>
              {factura.estado !== 'facturado' && diasSinFacturar() !== null && diasSinFacturar()! > 0 && (
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-red/15 text-red">
                  {diasSinFacturar()} día{diasSinFacturar() === 1 ? '' : 's'} sin facturar
                </span>
              )}
            </div>

            {factura.estado === 'facturado' ? (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-teal text-lg leading-none">✓</span>
                  <span className="text-[14px] font-semibold">Facturado</span>
                </div>
                <p className="text-[12px] text-muted mb-2.5">{factura.archivoNombre} · {factura.archivoFecha}</p>
                {facturaUrl ? (
                  <a href={facturaUrl} target="_blank" rel="noopener noreferrer" className="text-xs bg-teal text-inkOnAccent rounded-full px-4 py-2 font-semibold inline-block">
                    Abrir factura
                  </a>
                ) : (
                  <button onClick={handleVerFactura} className="text-xs bg-teal text-inkOnAccent rounded-full px-4 py-2 font-semibold active:scale-95 transition-transform">
                    Ver factura (PDF)
                  </button>
                )}
              </div>
            ) : (
              <div>
                {factura.estado === 'en_proceso' && (
                  <div className="mb-3 p-3 rounded-xl bg-red/10 border border-red/25">
                    <p className="text-[12px] font-semibold text-red mb-1">En proceso — no se pudo facturar</p>
                    <p className="text-[12px] text-ink/80">{factura.nota}</p>
                    <p className="text-[11px] text-muted mt-1">{factura.notaFecha}</p>
                  </div>
                )}

                {!canManageBilling ? (
                  <p className="text-[12px] text-muted">
                    {factura.estado === 'en_proceso' ? 'Pendiente de resolver.' : 'Aún no se ha facturado.'} Solo Ing. Everardo Sánchez, Lic. María Clara Zepeda o Lic. Julio Gómez pueden gestionar la facturación.
                  </p>
                ) : (
                  <>
                    {facturaError && <p className="text-red text-[12px] mb-2">{facturaError}</p>}

                    <input
                      ref={facturaInputRef}
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleSubirFactura(f); }}
                    />

                    {!showFacturaNota ? (
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => facturaInputRef.current?.click()}
                          disabled={subiendoFactura}
                          className="text-xs bg-teal text-inkOnAccent rounded-full px-4 py-2 font-semibold active:scale-95 transition-transform disabled:opacity-60"
                        >
                          {subiendoFactura ? 'Subiendo...' : '📄 Facturar (subir PDF)'}
                        </button>
                        <button
                          onClick={() => setShowFacturaNota(true)}
                          className="text-xs border border-line-strong text-ink/80 rounded-full px-4 py-2 active:scale-95 transition-transform"
                        >
                          No se puede facturar
                        </button>
                      </div>
                    ) : (
                      <div>
                        <label className="text-[11px] uppercase tracking-wider text-muted block mb-1.5">¿Por qué no se puede facturar?</label>
                        <textarea
                          value={notaTexto}
                          onChange={(e) => setNotaTexto(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[13px] min-h-[70px]"
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => { setShowFacturaNota(false); setNotaTexto(''); }}
                            className="text-xs border border-line-strong text-ink/80 rounded-full px-4 py-2 active:scale-95 transition-transform"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={handleGuardarNotaFactura}
                            disabled={subiendoFactura}
                            className="text-xs bg-amber text-inkOnAccent rounded-full px-4 py-2 font-semibold active:scale-95 transition-transform disabled:opacity-60"
                          >
                            {subiendoFactura ? 'Guardando...' : 'Guardar nota'}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 p-4 rounded-2xl bg-surface-2 border border-line">
            <p className="text-[12px] text-muted mb-2.5">
              Servicio/proyecto sin finalizar — la facturación se habilita cuando el servicio quede marcado como concluido.
            </p>
            {canManageBilling && (
              <button
                onClick={handleMarcarFinalizado}
                disabled={marcandoConcluido}
                className="text-xs bg-teal text-inkOnAccent rounded-full px-4 py-2 font-semibold active:scale-95 transition-transform disabled:opacity-60"
              >
                {marcandoConcluido ? 'Guardando...' : '✓ Marcar servicio como finalizado'}
              </button>
            )}
          </div>
        )}

        {(report.data?.equipos || []).length > 0 && (
          <div className="mt-4">
            <div className="text-[11px] uppercase tracking-wider text-muted mb-2">Equipo instalado</div>
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
          </div>
        )}

        {loadingFotos && <p className="text-[13px] text-muted mt-4">Cargando fotos...</p>}
        {fotoUrls !== null && !loadingFotos && (
          <div className="mt-5 pt-4 border-t border-dashed border-line-strong">
            <div className="text-[11px] uppercase tracking-wider text-muted mb-2.5">Fotos de evidencia</div>
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
          </div>
        )}
      </div>
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
