'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, FileUp, Plus, Trash2 } from 'lucide-react';
import { showToast } from '@/components/Toast';
import { confirmar } from '@/lib/dialogos';
import { hoyLocal } from '@/lib/fechaHoy';
import type { Proyecto } from '@/lib/proyectos';
import { METODOS_PAGO, cobrado, type PagoProyecto } from '@/lib/solar';
import { agregarPago, borrarPago, listarPagos, urlArchivo, validarPago, type NuevoPago } from '@/lib/solarDatos';
import { TituloSeccion } from './ContenidoLista';

// Pagos del proyecto (anticipo, avances, finiquito) con su comprobante, y
// cuánto falta contra el monto del proyecto.

const CAMPO = 'w-full px-3 min-h-[44px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14.5px]';
const ETIQUETA = 'block text-[12px] text-muted mb-1';
const ERROR = 'block text-red font-semibold text-[12px] mt-0.5';

const dinero = (n: number, m: 'MXN' | 'USD') => new Intl.NumberFormat('es-MX', { style: 'currency', currency: m }).format(n || 0);

export default function PagosProyecto({ proyecto }: { proyecto: Proyecto }) {
  const [pagos, setPagos] = useState<PagoProyecto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ fecha: hoyLocal(), monto: '', moneda: proyecto.moneda, metodo: 'transferencia' as PagoProyecto['metodo'], concepto: '', referencia: '' });
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errores, setErrores] = useState<ReturnType<typeof validarPago>>({});
  const [guardando, setGuardando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  async function cargar() {
    setError(null);
    try {
      setPagos(await listarPagos(proyecto.id));
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar los pagos.');
    }
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [proyecto.id]);

  async function guardar() {
    const p: NuevoPago = { fecha: f.fecha, monto: Number(f.monto.replace(/[$,\s]/g, '')), moneda: f.moneda, metodo: f.metodo, concepto: f.concepto, referencia: f.referencia || null };
    const faltas = validarPago(p);
    setErrores(faltas);
    if (Object.keys(faltas).length > 0) return;
    setGuardando(true);
    try {
      await agregarPago(proyecto.id, p, archivo);
      setF({ ...f, monto: '', concepto: '', referencia: '' });
      setArchivo(null);
      setAbierto(false);
      showToast('Pago registrado', 'success');
      cargar();
    } catch (e: any) {
      showToast(e?.message || 'No se pudo registrar el pago.', 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(p: PagoProyecto) {
    if (!(await confirmar(`¿Borrar el pago «${p.concepto}» de ${dinero(p.monto, p.moneda)}?`, { tono: 'peligro', textoAceptar: 'Borrar' }))) return;
    try {
      await borrarPago(p);
      cargar();
    } catch (e: any) {
      showToast(e?.message || 'No se pudo borrar.', 'error');
    }
  }

  async function abrir(path: string) {
    try {
      window.open(await urlArchivo(path), '_blank', 'noopener');
    } catch (e: any) {
      showToast(e?.message || 'No se pudo abrir el comprobante.', 'error');
    }
  }

  const total = pagos ? cobrado(pagos, proyecto.moneda) : 0;
  const monto = proyecto.monto || 0;
  const porcentaje = monto > 0 ? Math.min(100, (total / monto) * 100) : 0;

  return (
    <section className="glass rounded-2xl p-4 mb-4" data-tour="pagos-proyecto">
      <TituloSeccion titulo="Pagos" cuenta={pagos?.length}
        accion={!abierto && <button type="button" onClick={() => setAbierto(true)} className="min-h-[36px] px-3 rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold flex items-center gap-1"><Plus size={14} /> Pago</button>} />
      {error && <p className="rounded-xl bg-red/10 text-red text-[14px] px-3 py-2 mb-2">{error} <button type="button" onClick={cargar} className="underline font-semibold">Reintentar</button></p>}
      {pagos === null && !error && <p className="text-[13.5px] text-muted">Cargando…</p>}
      {pagos && (
        <div className="mb-3">
          <p className="text-[14px]">
            Cobrado <b className="font-mono">{dinero(total, proyecto.moneda)}</b>
            {monto > 0 && <> de <b className="font-mono">{dinero(monto, proyecto.moneda)}</b> · falta <b className="font-mono">{dinero(Math.max(0, monto - total), proyecto.moneda)}</b></>}
          </p>
          {monto > 0 && <div className="h-2 rounded-full bg-surface-2 overflow-hidden mt-1.5"><div className="h-full bg-teal rounded-full" style={{ width: `${porcentaje}%` }} /></div>}
          {monto === 0 && <p className="text-[12px] text-muted">Pon el monto del proyecto (Editar) para ver cuánto falta.</p>}
        </div>
      )}
      {pagos && pagos.length === 0 && !abierto && <p className="text-[13.5px] text-muted">Sin pagos registrados.</p>}
      <div className="grid gap-1.5">
        {pagos?.map((p) => (
          <div key={p.id} className="rounded-xl bg-surface-2 border border-line p-2.5 flex items-center gap-2">
            <span className="flex-1 min-w-0">
              <span className="block text-[14px] font-semibold truncate">{p.concepto}</span>
              <span className="block text-[12px] text-muted truncate">
                {new Date(`${p.fecha}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })} · {METODOS_PAGO.find((m) => m.clave === p.metodo)?.nombre}{p.referencia ? ` · ${p.referencia}` : ''}
              </span>
            </span>
            <b className="font-mono text-[14px]">{dinero(p.monto, p.moneda)}</b>
            {p.comprobante_path && <button type="button" onClick={() => abrir(p.comprobante_path!)} aria-label="Ver comprobante" className="w-9 h-9 flex items-center justify-center text-muted hover:text-teal"><ExternalLink size={15} /></button>}
            <button type="button" onClick={() => quitar(p)} aria-label={`Borrar el pago ${p.concepto}`} className="w-9 h-9 flex items-center justify-center text-faint hover:text-red"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      {abierto && (
        <div className="rounded-xl border border-line p-3 mt-3 grid grid-cols-2 gap-2">
          <label className="col-span-2"><span className={ETIQUETA}>Concepto</span>
            <input className={CAMPO} value={f.concepto} maxLength={120} placeholder="Anticipo 50 %" onChange={(e) => setF({ ...f, concepto: e.target.value })} />
            {errores.concepto && <span className={ERROR}>{errores.concepto}</span>}</label>
          <label><span className={ETIQUETA}>Monto</span>
            <input className={CAMPO} inputMode="decimal" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} />
            {errores.monto && <span className={ERROR}>{errores.monto}</span>}</label>
          <label><span className={ETIQUETA}>Moneda</span>
            <select className={CAMPO} value={f.moneda} onChange={(e) => setF({ ...f, moneda: e.target.value as 'MXN' | 'USD' })}><option value="MXN">MXN</option><option value="USD">USD</option></select></label>
          <label><span className={ETIQUETA}>Fecha</span>
            <input type="date" className={CAMPO} value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
            {errores.fecha && <span className={ERROR}>{errores.fecha}</span>}</label>
          <label><span className={ETIQUETA}>Forma de pago</span>
            <select className={CAMPO} value={f.metodo} onChange={(e) => setF({ ...f, metodo: e.target.value as PagoProyecto['metodo'] })}>
              {METODOS_PAGO.map((m) => <option key={m.clave} value={m.clave}>{m.nombre}</option>)}
            </select></label>
          <label className="col-span-2"><span className={ETIQUETA}>Referencia (opcional)</span>
            <input className={CAMPO} value={f.referencia} maxLength={120} placeholder="Folio de transferencia, número de cheque…" onChange={(e) => setF({ ...f, referencia: e.target.value })} /></label>
          <div className="col-span-2">
            <input ref={entrada} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
            <button type="button" onClick={() => entrada.current?.click()} className="min-h-[42px] px-3 rounded-xl border border-dashed border-line text-[13.5px] font-semibold flex items-center gap-2">
              <FileUp size={16} /> {archivo ? archivo.name : 'Comprobante (opcional)'}
            </button>
          </div>
          <div className="col-span-2 flex gap-2">
            <button type="button" onClick={() => { setAbierto(false); setErrores({}); }} disabled={guardando} className="flex-1 min-h-[44px] rounded-xl border border-line-strong font-semibold text-[14px]">Cancelar</button>
            <button type="button" onClick={guardar} disabled={guardando} className="flex-1 min-h-[44px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[14px] disabled:opacity-60">{guardando ? 'Guardando…' : 'Registrar pago'}</button>
          </div>
        </div>
      )}
    </section>
  );
}
