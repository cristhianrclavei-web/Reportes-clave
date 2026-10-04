'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AutocompletarCliente from '@/components/AutocompletarCliente';
import CampoNumero from '@/components/CampoNumero';
import { showToast } from '@/components/Toast';
import AvisoBorrador from '@/components/AvisoBorrador';
import { useBorradorFormulario } from '@/lib/useBorradorFormulario';
import { hoyLocal } from '@/lib/fechaHoy';
import { catalogoEnCache } from '@/lib/clientesCatalogo';
import { importeConLetra } from '@/lib/numeroALetras';
import {
  Concepto, CotizacionVinculable, Factura, FacturaInput, MonedaFactura, ReporteVinculable,
  CLAVES_PROD_SERV, FORMAS_PAGO, METODOS_PAGO, REGIMENES, UNIDADES, USOS_CFDI,
  actualizarFactura, calcularTotalesFactura, conceptoVacio, crearFactura, datosFiscalesCliente,
  lineasDeCotizacion, vinculablesDeCliente,
} from '@/lib/facturas';
import { Plus, Trash2, Check, FileText, Receipt, Info } from 'lucide-react';

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal-glow text-[15px] transition-colors placeholder:text-faint';
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5';
const cardCls = 'glass rounded-2xl p-4';

function Titulo({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <p className="font-display font-semibold text-[13px] uppercase tracking-wider text-teal mb-3.5 flex items-center gap-2">
      <span className="w-5 h-5 rounded-full bg-teal/15 text-teal text-[11px] flex items-center justify-center">{n}</span>
      {children}
    </p>
  );
}

function money(n: number, moneda: MonedaFactura = 'MXN'): string {
  return (moneda === 'USD' ? 'USD ' : '') + '$' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fechaCorta(f: string): string {
  const [y, m, d] = (f || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : f || '—';
}

// Formulario para armar una factura (prefactura). En orden: a quién, sus
// datos fiscales, qué se factura (reportes y cotización), los conceptos y
// las condiciones de pago. Los reportes y la cotización solo quedan ligados
// en la app; no salen en el PDF.
export default function FacturaForm({
  modo,
  facturaInicial,
  reportesIniciales = [],
  clienteInicial,
}: {
  modo: 'crear' | 'editar';
  facturaInicial?: Factura;
  reportesIniciales?: string[];
  clienteInicial?: { id: string; nombre: string } | null;
}) {
  const router = useRouter();
  const f0 = facturaInicial;

  const [clienteNombre, setClienteNombre] = useState(clienteInicial?.nombre || '');
  const [clienteId, setClienteId] = useState<string | null>(f0?.cliente_id || clienteInicial?.id || null);

  const [receptorNombre, setReceptorNombre] = useState(f0?.receptor_nombre || '');
  const [rfc, setRfc] = useState(f0?.receptor_rfc || '');
  const [regimen, setRegimen] = useState(f0?.receptor_regimen || '601');
  const [cp, setCp] = useState(f0?.receptor_cp || '');
  const [usoCfdi, setUsoCfdi] = useState(f0?.uso_cfdi || 'G03');
  const [guardarEnCliente, setGuardarEnCliente] = useState(true);

  const [reportes, setReportes] = useState<ReporteVinculable[]>([]);
  const [cotizaciones, setCotizaciones] = useState<CotizacionVinculable[]>([]);
  const [cargandoVinculos, setCargandoVinculos] = useState(false);
  const [seleccionados, setSeleccionados] = useState<string[]>(reportesIniciales);
  const [cotizacionId, setCotizacionId] = useState<string | null>(f0?.cotizacion_id || null);

  const [conceptos, setConceptos] = useState<Concepto[]>(f0?.conceptos?.length ? f0.conceptos : [conceptoVacio()]);
  const [fecha, setFecha] = useState(f0?.fecha || hoyLocal());
  const [moneda, setMoneda] = useState<MonedaFactura>(f0?.moneda || 'MXN');
  const [tipoCambio, setTipoCambio] = useState(String(f0?.tipo_cambio || ''));
  const [formaPago, setFormaPago] = useState(f0?.forma_pago || '03');
  const [metodoPago, setMetodoPago] = useState(f0?.metodo_pago || 'PUE');
  const [condiciones, setCondiciones] = useState(f0?.condiciones_pago || 'CONTADO');
  const [ivaPct, setIvaPct] = useState(f0?.iva_pct ?? 16);
  const [notas, setNotas] = useState(f0?.notas || '');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // Borrador automático (solo al armar una prefactura nueva): lo capturado
  // se guarda en el dispositivo y se recupera si la página se recarga.
  const datosBorrador = {
    clienteNombre, clienteId, receptorNombre, rfc, regimen, cp, usoCfdi, seleccionados, cotizacionId,
    conceptos, fecha, moneda, tipoCambio, formaPago, metodoPago, condiciones, ivaPct, notas,
  };
  // Al recuperar un borrador no se vuelven a traer los datos fiscales del
  // cliente: pisarían lo que ya se había corregido a mano.
  const fiscalesDelBorrador = useRef(false);
  function aplicarBorrador(d: typeof datosBorrador) {
    fiscalesDelBorrador.current = true;
    setClienteNombre(d.clienteNombre); setClienteId(d.clienteId);
    setReceptorNombre(d.receptorNombre); setRfc(d.rfc); setRegimen(d.regimen); setCp(d.cp); setUsoCfdi(d.usoCfdi);
    setSeleccionados(d.seleccionados); setCotizacionId(d.cotizacionId);
    setConceptos(d.conceptos?.length ? d.conceptos : [conceptoVacio()]);
    setFecha(d.fecha); setMoneda(d.moneda); setTipoCambio(d.tipoCambio);
    setFormaPago(d.formaPago); setMetodoPago(d.metodoPago); setCondiciones(d.condiciones);
    setIvaPct(d.ivaPct); setNotas(d.notas);
  }
  const borrador = useBorradorFormulario({
    clave: modo === 'crear' ? `factura:nueva${clienteInicial?.id ? `:${clienteInicial.id}` : ''}` : `factura:${f0?.id || 'editar'}`,
    datos: datosBorrador,
    hayDatos: modo === 'crear' && !guardando && Boolean(clienteNombre.trim() || notas.trim() || conceptos.some((c) => c.descripcion.trim())),
    aplicar: aplicarBorrador,
  });
  function descartarBorrador() {
    aplicarBorrador({
      clienteNombre: clienteInicial?.nombre || '', clienteId: clienteInicial?.id || null,
      receptorNombre: '', rfc: '', regimen: '601', cp: '', usoCfdi: 'G03',
      seleccionados: reportesIniciales, cotizacionId: null, conceptos: [conceptoVacio()],
      fecha: hoyLocal(), moneda: 'MXN', tipoCambio: '', formaPago: '03', metodoPago: 'PUE',
      condiciones: 'CONTADO', ivaPct: 16, notas: '',
    });
    fiscalesDelBorrador.current = false;
    borrador.limpiar();
  }

  // Nombre del cliente al editar (la factura guarda el id).
  useEffect(() => {
    if (clienteNombre || !clienteId) return;
    const c = catalogoEnCache().find((x) => x.id === clienteId);
    if (c) setClienteNombre(c.nombre);
    else datosFiscalesCliente(clienteId).then((d) => d && setClienteNombre(d.nombre));
  }, [clienteId, clienteNombre]);

  // Al elegir cliente: sus reportes y cotizaciones, y sus datos fiscales si
  // ya se habían guardado (solo al crear, para no pisar lo capturado).
  useEffect(() => {
    if (!clienteId) {
      setReportes([]);
      setCotizaciones([]);
      return;
    }
    let vivo = true;
    setCargandoVinculos(true);
    vinculablesDeCliente(clienteId)
      .then((v) => {
        if (!vivo) return;
        setReportes(v.reportes);
        setCotizaciones(v.cotizaciones);
      })
      .finally(() => vivo && setCargandoVinculos(false));
    if (modo === 'crear' && fiscalesDelBorrador.current) {
      fiscalesDelBorrador.current = false;
    } else if (modo === 'crear') {
      datosFiscalesCliente(clienteId).then((d) => {
        if (!vivo || !d) return;
        setReceptorNombre(d.razon_social || d.nombre.toUpperCase());
        setRfc(d.rfc || '');
        if (d.regimen_fiscal) setRegimen(d.regimen_fiscal);
        setCp(d.cp_fiscal || '');
        if (d.uso_cfdi) setUsoCfdi(d.uso_cfdi);
      });
    }
    return () => {
      vivo = false;
    };
  }, [clienteId, modo]);

  const totales = useMemo(() => calcularTotalesFactura(conceptos, ivaPct), [conceptos, ivaPct]);

  function cambiarConcepto(i: number, c: Partial<Concepto>) {
    setConceptos((prev) => prev.map((x, j) => (j === i ? { ...x, ...c } : x)));
  }

  async function usarConceptosCotizacion() {
    if (!cotizacionId) return;
    const lineas = await lineasDeCotizacion(cotizacionId);
    if (!lineas.length) {
      showToast('La cotización no tiene partidas', 'error');
      return;
    }
    const vacios = conceptos.every((c) => !c.descripcion.trim());
    setConceptos((prev) => (vacios ? lineas : [...prev, ...lineas]));
    const cot = cotizaciones.find((c) => c.id === cotizacionId);
    if (cot) setMoneda(cot.moneda);
    showToast(`${lineas.length} concepto(s) agregados de ${cot?.folio || 'la cotización'}`, 'success');
  }

  function alternarReporte(id: string) {
    setSeleccionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const faltantes = useMemo(() => {
    const f: string[] = [];
    if (!clienteId) f.push('elegir un cliente registrado');
    if (!receptorNombre.trim()) f.push('razón social');
    if (rfc.trim() && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(rfc.trim())) f.push('RFC válido (12 o 13 caracteres)');
    if (cp.trim() && !/^\d{5}$/.test(cp.trim())) f.push('código postal fiscal de 5 dígitos');
    if (!conceptos.some((c) => c.descripcion.trim() && c.cantidad > 0)) f.push('al menos un concepto');
    if (moneda === 'USD' && !(Number(tipoCambio) > 0)) f.push('tipo de cambio');
    return f;
  }, [clienteId, receptorNombre, rfc, cp, conceptos, moneda, tipoCambio]);

  async function guardar() {
    if (faltantes.length) {
      setAviso('Falta: ' + faltantes.join(', '));
      return;
    }
    setGuardando(true);
    setAviso(null);
    const input: FacturaInput = {
      cliente_id: clienteId,
      cotizacion_id: cotizacionId,
      fecha,
      receptor_nombre: receptorNombre,
      receptor_rfc: rfc,
      receptor_regimen: regimen,
      receptor_cp: cp,
      uso_cfdi: usoCfdi,
      moneda,
      tipo_cambio: Number(tipoCambio) || 0,
      forma_pago: formaPago,
      metodo_pago: metodoPago,
      condiciones_pago: condiciones,
      conceptos,
      iva_pct: ivaPct,
      notas,
      reportes: seleccionados,
      guardarEnCliente,
    };
    try {
      if (modo === 'crear') {
        const id = await crearFactura(input);
        await borrador.limpiar();
        showToast('Prefactura guardada', 'success');
        router.push(`/dashboard/facturacion/${id}`);
      } else if (f0) {
        await actualizarFactura(f0.id, input);
        showToast('Cambios guardados', 'success');
        router.push(`/dashboard/facturacion/${f0.id}`);
        router.refresh();
      }
    } catch (e: any) {
      setAviso('No se pudo guardar: ' + (e?.message || 'error'));
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      {borrador.recuperadoEn && (
        <AvisoBorrador que="la prefactura" guardadoEn={borrador.recuperadoEn} onDescartar={descartarBorrador} />
      )}
      {/* 1. Cliente */}
      <div className={cardCls}>
        <Titulo n={1}>Cliente</Titulo>
        <AutocompletarCliente
          value={clienteNombre}
          className={inputCls}
          soloSugerir
          placeholder="Busca el cliente…"
          onChange={(nombre, id) => {
            setClienteNombre(nombre);
            if (id !== clienteId) {
              setClienteId(id);
              setSeleccionados([]);
              setCotizacionId(null);
            }
          }}
        />
        {clienteNombre.trim() && !clienteId && (
          <p className="text-[12.5px] text-amber mt-2">Elige un cliente de la lista (debe estar registrado en Clientes).</p>
        )}
      </div>

      {/* 2. Datos fiscales */}
      <div className={cardCls}>
        <Titulo n={2}>Datos fiscales del receptor</Titulo>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={labelCls}>Razón social</label>
            <input className={inputCls} value={receptorNombre} onChange={(e) => setReceptorNombre(e.target.value)} placeholder="Como aparece en su constancia fiscal" />
          </div>
          <div>
            <label className={labelCls}>RFC</label>
            <input className={`${inputCls} uppercase font-mono`} value={rfc} onChange={(e) => setRfc(e.target.value.toUpperCase())} maxLength={13} />
          </div>
          <div>
            <label className={labelCls}>C.P. fiscal</label>
            <input className={inputCls} inputMode="numeric" value={cp} onChange={(e) => setCp(e.target.value.replace(/\D/g, '').slice(0, 5))} />
          </div>
          <div>
            <label className={labelCls}>Régimen fiscal</label>
            <select className={inputCls} value={regimen} onChange={(e) => setRegimen(e.target.value)}>
              {REGIMENES.map((o) => <option key={o.clave} value={o.clave}>({o.clave}) {o.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Uso CFDI</label>
            <select className={inputCls} value={usoCfdi} onChange={(e) => setUsoCfdi(e.target.value)}>
              {USOS_CFDI.map((o) => <option key={o.clave} value={o.clave}>({o.clave}) {o.nombre}</option>)}
            </select>
          </div>
        </div>
        {clienteId && (
          <label className="flex items-center gap-2 mt-3 text-[13px] text-ink/80 cursor-pointer">
            <input type="checkbox" checked={guardarEnCliente} onChange={(e) => setGuardarEnCliente(e.target.checked)} className="accent-teal w-4 h-4" />
            Guardar estos datos en el cliente para la próxima factura
          </label>
        )}
      </div>

      {/* 3. Qué se factura */}
      <div className={cardCls}>
        <Titulo n={3}>Reportes y cotización</Titulo>
        <p className="text-[12.5px] text-muted mb-3 flex items-start gap-1.5">
          <Info size={14} className="shrink-0 mt-0.5" />
          Solo quedan ligados en la app para saber qué cubre la factura; no aparecen en el PDF.
        </p>
        {!clienteId ? (
          <p className="text-[13px] text-muted">Elige primero el cliente.</p>
        ) : cargandoVinculos ? (
          <p className="text-[13px] text-muted">Cargando…</p>
        ) : (
          <>
            <p className={labelCls}>Reportes de servicio {seleccionados.length > 0 && <span className="text-teal normal-case">· {seleccionados.length} elegido(s)</span>}</p>
            {reportes.length === 0 ? (
              <p className="text-[13px] text-muted mb-4">Este cliente no tiene reportes.</p>
            ) : (
              <div className="max-h-[280px] overflow-y-auto rounded-xl border border-line divide-y divide-line mb-4">
                {reportes.map((r) => {
                  const enOtra = r.factura_id && r.factura_id !== f0?.id;
                  const sel = seleccionados.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      disabled={Boolean(enOtra) && !sel}
                      onClick={() => alternarReporte(r.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-[13.5px] transition-colors disabled:opacity-50 ${sel ? 'bg-teal/8' : 'hover:bg-surface-2'}`}
                    >
                      <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${sel ? 'bg-teal border-teal text-inkOnAccent' : 'border-line-strong'}`}>
                        {sel && <Check size={13} strokeWidth={3} />}
                      </span>
                      <span className="tabular-nums w-[84px] shrink-0">{fechaCorta(r.fecha)}</span>
                      <span className="flex-1 min-w-0 truncate">{r.ing || '—'}</span>
                      {enOtra ? (
                        <span className="text-[11px] font-semibold text-amber shrink-0">En {r.factura_folio}</span>
                      ) : (
                        <span className="font-mono text-[11.5px] text-teal shrink-0">{r.folio || ''}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <p className={labelCls}>Cotización</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <select className={inputCls} value={cotizacionId || ''} onChange={(e) => setCotizacionId(e.target.value || null)}>
                <option value="">Sin cotización</option>
                {cotizaciones.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.folio} · {fechaCorta(c.fecha)} · {money(c.total, c.moneda)}
                  </option>
                ))}
              </select>
              {cotizacionId && (
                <button
                  type="button"
                  onClick={usarConceptosCotizacion}
                  className="shrink-0 min-h-[46px] px-4 rounded-xl border border-teal/50 text-teal text-[13.5px] font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                >
                  <Receipt size={16} strokeWidth={2.3} /> Usar sus conceptos
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* 4. Conceptos */}
      <div className={cardCls}>
        <Titulo n={4}>Conceptos</Titulo>
        <datalist id="claves-prod-serv">
          {CLAVES_PROD_SERV.map((o) => <option key={o.clave} value={o.clave}>{o.nombre}</option>)}
        </datalist>
        <div className="flex flex-col gap-3">
          {conceptos.map((c, i) => {
            const importe = Math.round(c.cantidad * c.valor_unitario * 100) / 100;
            return (
              <div key={i} className="rounded-xl border border-line bg-surface-2/50 p-3">
                <div className="flex items-start gap-2">
                  <span className="text-[12px] font-bold text-teal mt-2.5 w-5 shrink-0">{i + 1}.</span>
                  <textarea
                    className={`${inputCls} min-h-[56px]`}
                    placeholder="Descripción del concepto"
                    value={c.descripcion}
                    onChange={(e) => cambiarConcepto(i, { descripcion: e.target.value })}
                  />
                  <button
                    type="button"
                    aria-label="Quitar concepto"
                    onClick={() => setConceptos((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : [conceptoVacio()]))}
                    className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-muted hover:text-red hover:bg-red/10"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 pl-7">
                  <div>
                    <label className={labelCls}>Cantidad</label>
                    <CampoNumero className={inputCls} min={0} step="any" value={c.cantidad} onValor={(n) => cambiarConcepto(i, { cantidad: n })} />
                  </div>
                  <div>
                    <label className={labelCls}>Valor unitario</label>
                    <CampoNumero className={inputCls} min={0} step="any" value={c.valor_unitario} onValor={(n) => cambiarConcepto(i, { valor_unitario: n })} />
                  </div>
                  <div>
                    <label className={labelCls}>Unidad SAT</label>
                    <select
                      className={inputCls}
                      value={c.unidad_clave}
                      onChange={(e) => {
                        const u = UNIDADES.find((x) => x.clave === e.target.value)!;
                        cambiarConcepto(i, { unidad_clave: u.clave, unidad_nombre: u.nombre });
                      }}
                    >
                      {UNIDADES.map((o) => <option key={o.clave} value={o.clave}>{o.clave} · {o.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Clave prod./serv.</label>
                    <input
                      className={`${inputCls} font-mono`}
                      list="claves-prod-serv"
                      inputMode="numeric"
                      placeholder="72151703"
                      value={c.clave_prod_serv}
                      onChange={(e) => cambiarConcepto(i, { clave_prod_serv: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 mt-2.5 pl-7">
                  <label className="flex items-center gap-2 text-[13px] text-ink/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={c.objeto_imp === '02'}
                      onChange={(e) => cambiarConcepto(i, { objeto_imp: e.target.checked ? '02' : '01' })}
                      className="accent-teal w-4 h-4"
                    />
                    Lleva IVA
                  </label>
                  <span className="text-[14px] font-semibold tabular-nums">{money(importe, moneda)}</span>
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setConceptos((prev) => [...prev, conceptoVacio()])}
          className="mt-3 w-full min-h-[46px] rounded-xl border border-dashed border-line-strong text-[14px] font-semibold text-teal flex items-center justify-center gap-1.5"
        >
          <Plus size={17} strokeWidth={2.4} /> Agregar concepto
        </button>
      </div>

      {/* 5. Pago */}
      <div className={cardCls}>
        <Titulo n={5}>Pago</Titulo>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Fecha de emisión</label>
            <input type="date" className={inputCls} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Moneda</label>
            <div className="flex gap-2">
              <select className={inputCls} value={moneda} onChange={(e) => setMoneda(e.target.value as MonedaFactura)}>
                <option value="MXN">MXN · Peso mexicano</option>
                <option value="USD">USD · Dólar</option>
              </select>
              {moneda === 'USD' && (
                <input className={`${inputCls} w-28`} type="number" step="any" placeholder="T. cambio" value={tipoCambio} onChange={(e) => setTipoCambio(e.target.value)} />
              )}
            </div>
          </div>
          <div>
            <label className={labelCls}>Forma de pago</label>
            <select className={inputCls} value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
              {FORMAS_PAGO.map((o) => <option key={o.clave} value={o.clave}>({o.clave}) {o.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Método de pago</label>
            <select className={inputCls} value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
              {METODOS_PAGO.map((o) => <option key={o.clave} value={o.clave}>({o.clave}) {o.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Condiciones de pago</label>
            <input className={inputCls} value={condiciones} onChange={(e) => setCondiciones(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>IVA</label>
            <select className={inputCls} value={ivaPct} onChange={(e) => setIvaPct(Number(e.target.value))}>
              <option value={16}>16%</option>
              <option value={8}>8% (región fronteriza)</option>
              <option value={0}>0%</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Notas internas (no salen en el PDF)</label>
            <textarea className={`${inputCls} min-h-[64px]`} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Totales y guardar */}
      <div className="rounded-2xl bg-surface border border-teal/40 p-4">
        <div className="flex flex-col gap-1.5 text-[14px]">
          <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="tabular-nums">{money(totales.subtotal, moneda)}</span></div>
          <div className="flex justify-between"><span className="text-muted">IVA {ivaPct}%</span><span className="tabular-nums">{money(totales.iva, moneda)}</span></div>
          <div className="flex justify-between text-[17px] font-display font-bold"><span>Total</span><span className="text-teal tabular-nums">{money(totales.total, moneda)}</span></div>
          <p className="text-[11.5px] text-muted mt-1">{importeConLetra(totales.total, moneda)}</p>
        </div>
        {aviso && <p className="text-[13px] text-amber mt-3">{aviso}</p>}
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="mt-4 w-full min-h-[52px] rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15px] tracking-wide shadow-glow-teal flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
        >
          <FileText size={18} strokeWidth={2.3} />
          {guardando ? 'Guardando…' : modo === 'crear' ? 'Guardar prefactura' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}
