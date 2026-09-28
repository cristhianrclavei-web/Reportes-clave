'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SupervisorShell from '@/components/SupervisorShell';
import ModalOverlay from '@/components/ModalOverlay';
import FacturaForm from '@/components/FacturaForm';
import { showToast } from '@/components/Toast';
import { hoyLocal } from '@/lib/fechaHoy';
import { importeConLetra } from '@/lib/numeroALetras';
import {
  Factura, EstadoFactura, MonedaFactura, FORMAS_PAGO, METODOS_PAGO, REGIMENES, USOS_CFDI,
  cambiarEstadoFactura, eliminarFactura, nombreOpcion, subirArchivoCfdi, urlArchivoCfdi,
} from '@/lib/facturas';
import { EstadoFacturaChip } from '../FacturasList';
import {
  FileText, Pencil, Stamp, BadgeCheck, Ban, Trash2, FileCode2, ChevronRight, X, Upload, Check, Building2, Receipt,
} from 'lucide-react';

type ReporteLigado = { id: string; fecha: string; folio: string | null; ing: string | null };

function money(n: number, moneda: MonedaFactura = 'MXN'): string {
  return (moneda === 'USD' ? 'USD ' : '') + '$' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fechaCorta(f?: string | null): string {
  const [y, m, d] = (f || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : f || '—';
}

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal-glow text-[15px] transition-colors placeholder:text-faint';
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5';

const PASOS: { e: EstadoFactura; label: string }[] = [
  { e: 'borrador', label: 'Prefactura' },
  { e: 'timbrada', label: 'Timbrada' },
  { e: 'pagada', label: 'Pagada' },
];

// Lee del XML del CFDI el UUID, serie/folio, fecha y total, para no
// capturarlos a mano y detectar si no coincide con la prefactura.
async function leerXmlCfdi(archivo: File) {
  const texto = await archivo.text();
  const doc = new DOMParser().parseFromString(texto, 'application/xml');
  const todos = Array.from(doc.getElementsByTagName('*'));
  const comp = todos.find((n) => n.localName === 'Comprobante');
  const tfd = todos.find((n) => n.localName === 'TimbreFiscalDigital');
  if (!comp || !tfd) return null;
  const serie = comp.getAttribute('Serie') || '';
  const folio = comp.getAttribute('Folio') || '';
  return {
    uuid: (tfd.getAttribute('UUID') || '').toUpperCase(),
    folio: `${serie}${folio}`,
    fecha: (tfd.getAttribute('FechaTimbrado') || comp.getAttribute('Fecha') || '').slice(0, 10),
    total: Number(comp.getAttribute('Total') || 0),
  };
}

export default function FacturaDetalle({
  facturaInicial,
  reportes,
  cotizacion,
  cliente,
  userName,
}: {
  facturaInicial: Factura;
  reportes: ReporteLigado[];
  cotizacion: { id: string; folio: string; fecha: string; total: number; moneda: MonedaFactura } | null;
  cliente: { id: string; nombre: string } | null;
  userName?: string;
}) {
  const router = useRouter();
  const [f, setF] = useState<Factura>(facturaInicial);
  const [editando, setEditando] = useState(false);
  const [modal, setModal] = useState<null | 'timbrar' | 'pagar' | 'cancelar' | 'eliminar'>(null);
  const [trabajando, setTrabajando] = useState(false);

  // Registrar timbrado
  const [folioFiscal, setFolioFiscal] = useState(f.folio_fiscal || '');
  const [uuid, setUuid] = useState(f.uuid_sat || '');
  const [fechaTimbrado, setFechaTimbrado] = useState(f.fecha_timbrado || hoyLocal());
  const [pdf, setPdf] = useState<File | null>(null);
  const [xml, setXml] = useState<File | null>(null);
  const [avisoXml, setAvisoXml] = useState<string | null>(null);
  const [fechaPago, setFechaPago] = useState(hoyLocal());

  async function actualizar(cambios: Partial<Factura>, mensaje: string) {
    setTrabajando(true);
    try {
      await cambiarEstadoFactura(f.id, cambios);
      setF((prev) => ({ ...prev, ...cambios }));
      showToast(mensaje, 'success');
      setModal(null);
      router.refresh();
    } catch (e: any) {
      showToast('No se pudo guardar: ' + (e?.message || 'error'), 'error');
    } finally {
      setTrabajando(false);
    }
  }

  async function alElegirXml(archivo: File | null) {
    setXml(archivo);
    setAvisoXml(null);
    if (!archivo) return;
    try {
      const datos = await leerXmlCfdi(archivo);
      if (!datos) {
        setAvisoXml('El XML no parece un CFDI timbrado (no trae TimbreFiscalDigital).');
        return;
      }
      if (datos.uuid) setUuid(datos.uuid);
      if (datos.folio) setFolioFiscal(datos.folio);
      if (datos.fecha) setFechaTimbrado(datos.fecha);
      if (Math.abs(datos.total - f.total) > 0.01) {
        setAvisoXml(`Ojo: el total del XML (${money(datos.total, f.moneda)}) no coincide con la prefactura (${money(f.total, f.moneda)}).`);
      }
    } catch {
      setAvisoXml('No se pudo leer el XML.');
    }
  }

  async function registrarTimbrado() {
    if (!uuid.trim()) {
      setAvisoXml('Falta el folio fiscal (UUID). Súbelo con el XML o captúralo.');
      return;
    }
    setTrabajando(true);
    try {
      const cambios: Partial<Factura> = {
        estado: 'timbrada',
        folio_fiscal: folioFiscal.trim() || null,
        uuid_sat: uuid.trim().toUpperCase(),
        fecha_timbrado: fechaTimbrado || null,
      };
      if (pdf) cambios.pdf_path = await subirArchivoCfdi(f.id, pdf, 'pdf');
      if (xml) cambios.xml_path = await subirArchivoCfdi(f.id, xml, 'xml');
      await actualizar(cambios, 'Factura registrada como timbrada');
    } catch (e: any) {
      showToast('No se pudo subir: ' + (e?.message || 'error'), 'error');
      setTrabajando(false);
    }
  }

  async function abrirArchivo(path: string | null) {
    if (!path) return;
    const url = await urlArchivoCfdi(path);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else showToast('No se pudo abrir el archivo', 'error');
  }

  async function borrar() {
    setTrabajando(true);
    try {
      await eliminarFactura(f.id);
      showToast('Prefactura eliminada', 'success');
      router.push('/dashboard/facturacion');
    } catch (e: any) {
      showToast('No se pudo eliminar: ' + (e?.message || 'error'), 'error');
      setTrabajando(false);
    }
  }

  const base =
    'min-h-[62px] w-full rounded-2xl flex flex-col items-center justify-center gap-1 text-[12px] font-semibold active:scale-95 transition-transform disabled:opacity-60';
  const secundario = `${base} bg-surface-2 border border-line text-ink/85 hover:border-teal/40`;
  const pasoActual = f.estado === 'cancelada' ? -1 : PASOS.findIndex((p) => p.e === f.estado);

  return (
    <SupervisorShell active="facturacion" title={f.folio} userName={userName} volver>
      {editando ? (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[14px] font-semibold">Editando prefactura</p>
            <button onClick={() => setEditando(false)} className="text-[13px] font-semibold text-muted flex items-center gap-1">
              <X size={15} /> Cancelar edición
            </button>
          </div>
          <FacturaForm modo="editar" facturaInicial={f} reportesIniciales={reportes.map((r) => r.id)} clienteInicial={cliente} />
        </>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Encabezado */}
          <div className="rounded-2xl bg-surface border border-line p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-muted font-semibold">Cliente</p>
                <p className="font-display font-bold text-[20px] leading-tight">{f.receptor_nombre}</p>
                <p className="text-[12.5px] text-muted font-mono">{f.receptor_rfc || 'Sin RFC'}</p>
              </div>
              <div className="text-right shrink-0">
                <EstadoFacturaChip estado={f.estado} />
                <p className="font-display font-bold text-[22px] text-teal mt-1">{money(f.total, f.moneda)}</p>
              </div>
            </div>

            {/* Avance */}
            {f.estado !== 'cancelada' ? (
              <div className="flex gap-1.5 mt-4">
                {PASOS.map((p, i) => (
                  <div key={p.e} className="flex-1">
                    <span className={`block h-1.5 rounded-full mb-1 ${i <= pasoActual ? 'bg-teal' : 'bg-line-strong'}`} />
                    <span className={`text-[11.5px] font-semibold ${i === pasoActual ? 'text-teal' : i < pasoActual ? 'text-ink/75' : 'text-muted'}`}>{p.label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-red font-semibold mt-3">Factura cancelada: sus reportes quedaron otra vez por facturar.</p>
            )}
          </div>

          {/* Acciones */}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            <button onClick={() => window.open(`/api/facturas/${f.id}/pdf?t=${Date.now()}`, '_blank', 'noopener,noreferrer')} className={`${base} bg-teal text-inkOnAccent shadow-glow-teal`}>
              <FileText size={19} strokeWidth={2.3} /> Prefactura
            </button>
            {f.estado === 'borrador' && (
              <>
                <button onClick={() => setEditando(true)} className={secundario}>
                  <Pencil size={19} strokeWidth={2.3} className="text-teal" /> Editar
                </button>
                <button onClick={() => setModal('timbrar')} className={secundario}>
                  <Stamp size={19} strokeWidth={2.3} className="text-teal" /> Registrar timbrado
                </button>
                <button onClick={() => setModal('eliminar')} className={secundario}>
                  <Trash2 size={19} strokeWidth={2.3} className="text-red" /> Eliminar
                </button>
              </>
            )}
            {f.estado === 'timbrada' && (
              <button onClick={() => setModal('pagar')} className={secundario}>
                <BadgeCheck size={19} strokeWidth={2.3} className="text-teal" /> Marcar pagada
              </button>
            )}
            {(f.estado === 'timbrada' || f.estado === 'pagada') && (
              <>
                {f.pdf_path && (
                  <button onClick={() => abrirArchivo(f.pdf_path)} className={secundario}>
                    <FileText size={19} strokeWidth={2.3} className="text-teal" /> CFDI PDF
                  </button>
                )}
                {f.xml_path && (
                  <button onClick={() => abrirArchivo(f.xml_path)} className={secundario}>
                    <FileCode2 size={19} strokeWidth={2.3} className="text-teal" /> CFDI XML
                  </button>
                )}
                <button onClick={() => setModal('cancelar')} className={secundario}>
                  <Ban size={19} strokeWidth={2.3} className="text-red" /> Cancelar
                </button>
              </>
            )}
          </div>

          {/* CFDI */}
          {(f.uuid_sat || f.fecha_pago) && (
            <div className="rounded-2xl bg-surface border border-line p-4 grid grid-cols-2 gap-3 text-[13.5px]">
              <Dato label="Folio del CFDI" valor={f.folio_fiscal || '—'} />
              <Dato label="Fecha de timbrado" valor={fechaCorta(f.fecha_timbrado)} />
              <div className="col-span-2"><Dato label="Folio fiscal (UUID)" valor={f.uuid_sat || '—'} mono /></div>
              {f.fecha_pago && <Dato label="Pagada el" valor={fechaCorta(f.fecha_pago)} />}
            </div>
          )}

          {/* Lo que cubre (solo en la app) */}
          <div className="rounded-2xl bg-surface border border-line p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-2">Qué cubre esta factura</p>
            {cliente && (
              <Link href={`/dashboard/proyectos/${cliente.id}`} className="flex items-center gap-2.5 py-2 text-[14px] hover:text-teal">
                <Building2 size={16} className="text-teal" /> <span className="flex-1">{cliente.nombre}</span> <ChevronRight size={16} className="text-muted" />
              </Link>
            )}
            {cotizacion && (
              <Link href={`/dashboard/cotizaciones/${cotizacion.id}`} className="flex items-center gap-2.5 py-2 text-[14px] border-t border-line hover:text-teal">
                <Receipt size={16} className="text-teal" />
                <span className="flex-1">Cotización <b className="font-mono">{cotizacion.folio}</b> · {money(cotizacion.total, cotizacion.moneda)}</span>
                <ChevronRight size={16} className="text-muted" />
              </Link>
            )}
            <div className="border-t border-line pt-2 mt-1">
              <p className="text-[12.5px] text-muted mb-1">{reportes.length} reporte(s) de servicio</p>
              {reportes.map((r) => (
                <Link key={r.id} href={`/dashboard/reportes?reporte=${r.id}`} className="flex items-center gap-3 py-1.5 text-[13.5px] hover:text-teal">
                  <span className="tabular-nums w-[84px]">{fechaCorta(r.fecha)}</span>
                  <span className="flex-1 truncate">{r.ing || '—'}</span>
                  <span className="font-mono text-[11.5px] text-teal">{r.folio || ''}</span>
                  <ChevronRight size={15} className="text-muted" />
                </Link>
              ))}
            </div>
          </div>

          {/* Datos fiscales y pago */}
          <div className="rounded-2xl bg-surface border border-line p-4 grid grid-cols-2 gap-3 text-[13.5px]">
            <Dato label="Régimen fiscal" valor={nombreOpcion(REGIMENES, f.receptor_regimen) || '—'} />
            <Dato label="C.P. fiscal" valor={f.receptor_cp || '—'} />
            <Dato label="Uso CFDI" valor={nombreOpcion(USOS_CFDI, f.uso_cfdi) || '—'} />
            <Dato label="Fecha de emisión" valor={fechaCorta(f.fecha)} />
            <Dato label="Forma de pago" valor={nombreOpcion(FORMAS_PAGO, f.forma_pago) || '—'} />
            <Dato label="Método de pago" valor={nombreOpcion(METODOS_PAGO, f.metodo_pago) || '—'} />
            <Dato label="Condiciones" valor={f.condiciones_pago || '—'} />
            <Dato label="Moneda" valor={f.moneda === 'USD' ? `USD · T.C. ${f.tipo_cambio}` : 'MXN'} />
          </div>

          {/* Conceptos */}
          <div className="rounded-2xl bg-surface border border-line p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-2">Conceptos</p>
            <div className="divide-y divide-line">
              {f.conceptos.map((c, i) => (
                <div key={i} className="py-2.5 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] leading-snug">{c.descripcion}</p>
                    <p className="text-[11.5px] text-muted mt-0.5">
                      {c.cantidad} × {money(c.valor_unitario, f.moneda)} · {c.unidad_clave} {c.unidad_nombre} · Clave {c.clave_prod_serv || '—'}
                      {c.objeto_imp === '01' ? ' · Sin IVA' : ''}
                    </p>
                  </div>
                  <span className="text-[14px] font-semibold tabular-nums">{money(c.importe, f.moneda)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-line mt-1 pt-3 flex flex-col gap-1 text-[14px]">
              <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="tabular-nums">{money(f.subtotal, f.moneda)}</span></div>
              <div className="flex justify-between"><span className="text-muted">IVA {f.iva_pct}%</span><span className="tabular-nums">{money(f.iva, f.moneda)}</span></div>
              <div className="flex justify-between font-display font-bold text-[17px]"><span>Total</span><span className="text-teal tabular-nums">{money(f.total, f.moneda)}</span></div>
              <p className="text-[11.5px] text-muted">{importeConLetra(f.total, f.moneda)}</p>
            </div>
          </div>

          {f.notas && (
            <div className="rounded-2xl bg-surface border border-line p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-1">Notas internas</p>
              <p className="text-[14px] whitespace-pre-wrap">{f.notas}</p>
            </div>
          )}
        </div>
      )}

      {/* ---------- Modales ---------- */}
      {modal === 'timbrar' && (
        <ModalOverlay onClose={() => !trabajando && setModal(null)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-5 shadow-glow max-h-[88vh] overflow-y-auto">
            <h2 className="font-display font-semibold text-[18px] mb-1">Registrar factura timbrada</h2>
            <p className="text-[12.5px] text-muted mb-4">Sube el XML y el PDF que generó el PAC. Del XML se leen el UUID, el folio y la fecha.</p>
            <ArchivoInput label="XML del CFDI" accept=".xml,application/xml,text/xml" archivo={xml} onChange={alElegirXml} />
            <ArchivoInput label="PDF del CFDI" accept="application/pdf" archivo={pdf} onChange={setPdf} />
            {avisoXml && <p className="text-[12.5px] text-amber mb-3">{avisoXml}</p>}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className={labelCls}>Folio del CFDI</label>
                <input className={inputCls} value={folioFiscal} onChange={(e) => setFolioFiscal(e.target.value)} placeholder="1738" />
              </div>
              <div>
                <label className={labelCls}>Fecha de timbrado</label>
                <input type="date" className={inputCls} value={fechaTimbrado} onChange={(e) => setFechaTimbrado(e.target.value)} />
              </div>
            </div>
            <label className={labelCls}>Folio fiscal (UUID)</label>
            <input className={`${inputCls} font-mono text-[13px] uppercase mb-4`} value={uuid} onChange={(e) => setUuid(e.target.value.toUpperCase())} placeholder="5E5FD813-3DCF-42AD-…" />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setModal(null)} disabled={trabajando} className="min-h-[48px] rounded-2xl border border-line-strong font-semibold text-[14px]">Cancelar</button>
              <button onClick={registrarTimbrado} disabled={trabajando} className="min-h-[48px] rounded-2xl bg-teal text-inkOnAccent font-semibold text-[14px] disabled:opacity-60">
                {trabajando ? 'Guardando…' : 'Registrar'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {modal === 'pagar' && (
        <ModalOverlay onClose={() => !trabajando && setModal(null)}>
          <div className="glass-strong rounded-3xl max-w-sm w-full p-5 shadow-glow">
            <h2 className="font-display font-semibold text-[18px] mb-3">Marcar como pagada</h2>
            <label className={labelCls}>Fecha de pago</label>
            <input type="date" className={`${inputCls} mb-4`} value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setModal(null)} className="min-h-[48px] rounded-2xl border border-line-strong font-semibold text-[14px]">Cancelar</button>
              <button onClick={() => actualizar({ estado: 'pagada', fecha_pago: fechaPago }, 'Factura marcada como pagada')} disabled={trabajando} className="min-h-[48px] rounded-2xl bg-teal text-inkOnAccent font-semibold text-[14px] disabled:opacity-60">
                Confirmar
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {(modal === 'cancelar' || modal === 'eliminar') && (
        <ModalOverlay onClose={() => !trabajando && setModal(null)}>
          <div className="glass-strong rounded-3xl max-w-sm w-full p-5 shadow-glow">
            <h2 className="font-display font-semibold text-[18px] mb-2">{modal === 'cancelar' ? '¿Cancelar la factura?' : '¿Eliminar la prefactura?'}</h2>
            <p className="text-[13.5px] text-ink/80 mb-4 leading-relaxed">
              {modal === 'cancelar'
                ? 'Queda registrada como cancelada y sus reportes vuelven a quedar por facturar. Recuerda cancelar también el CFDI en el portal del PAC.'
                : 'Se borra la prefactura y sus reportes vuelven a quedar por facturar. No se puede deshacer.'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setModal(null)} className="min-h-[48px] rounded-2xl border border-line-strong font-semibold text-[14px]">No</button>
              <button
                onClick={() => (modal === 'cancelar' ? actualizar({ estado: 'cancelada' }, 'Factura cancelada') : borrar())}
                disabled={trabajando}
                className="min-h-[48px] rounded-2xl bg-red text-white font-semibold text-[14px] disabled:opacity-60"
              >
                {modal === 'cancelar' ? 'Sí, cancelar' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </SupervisorShell>
  );
}

function Dato({ label, valor, mono }: { label: string; valor: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] uppercase tracking-wider text-muted font-semibold">{label}</p>
      <p className={`font-medium break-words ${mono ? 'font-mono text-[12.5px]' : ''}`}>{valor}</p>
    </div>
  );
}

function ArchivoInput({
  label,
  accept,
  archivo,
  onChange,
}: {
  label: string;
  accept: string;
  archivo: File | null;
  onChange: (f: File | null) => void;
}) {
  return (
    <label className="mb-3 flex items-center gap-3 rounded-xl border border-dashed border-line-strong px-3.5 py-3 cursor-pointer hover:border-teal/50">
      <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${archivo ? 'bg-teal text-inkOnAccent' : 'bg-surface-2 text-teal'}`}>
        {archivo ? <Check size={17} strokeWidth={2.6} /> : <Upload size={17} strokeWidth={2.3} />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13.5px] font-semibold">{label}</span>
        <span className="block text-[12px] text-muted truncate">{archivo ? archivo.name : 'Toca para elegir el archivo'}</span>
      </span>
      <input type="file" accept={accept} className="hidden" onChange={(e) => onChange(e.target.files?.[0] || null)} />
    </label>
  );
}
