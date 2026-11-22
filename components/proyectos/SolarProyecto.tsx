'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, ExternalLink, FileUp, Loader2, Plus, Receipt, Sun, Trash2, Zap } from 'lucide-react';
import { showToast } from '@/components/Toast';
import { confirmar } from '@/lib/dialogos';
import { hoyLocal } from '@/lib/fechaHoy';
import type { Proyecto } from '@/lib/proyectos';
import type { ElementoContenido } from '@/lib/proyectoContenido';
import {
  ANOS_PROYECCION, DEGRADACION_ANUAL, DIAS_HABILES_ESPERADOS, ESTADOS_TRAMITE, INCREMENTO_TARIFA, NOMBRE_ESQUEMA, TARIFAS_CFE,
  consumoAnual, diasHabilesDesde, dimensionar, documentosRequeridos, gastoAnual, nombreDocumento, nombreEstadoTramite, precioKwh, precioPromedio,
  type DatosSolar, type Esquema, type EstadoTramite, type TramiteCfe,
} from '@/lib/solar';
import {
  agregarRecibo, borrarDocumentoTramite, borrarRecibo, guardarDatosSolar, guardarTramite, leerSolar, nuevaEntrada,
  subirDocumentoTramite, urlArchivo, validarRecibo, type NuevoRecibo, type TodoSolar,
} from '@/lib/solarDatos';
import { crearUnifilarDesdeProyecto } from '@/lib/unifilarDesdeProyecto';
import { NOMBRE_TIPO_SISTEMA, type TipoSistema } from '@/lib/unifilar';
import { TituloSeccion } from './ContenidoLista';

const CAMPO = 'w-full px-3 min-h-[44px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14.5px]';
const ETIQUETA = 'block text-[12px] text-muted mb-1';
const ERROR = 'block text-red font-semibold text-[12px] mt-0.5';
const TARJETA = 'glass rounded-2xl p-4 mb-4';

const pesos = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0);
const num = (n: number, d = 0) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: d, minimumFractionDigits: d }).format(n || 0);
const fechaCorta = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

async function abrir(path: string) {
  try {
    window.open(await urlArchivo(path), '_blank', 'noopener');
  } catch (e: any) {
    showToast(e?.message || 'No se pudo abrir el archivo.', 'error');
  }
}

export default function SolarProyecto({ proyecto, clienteNombre, unifilares, usuarioNombre, onEtapa, onCambio }: {
  proyecto: Proyecto;
  clienteNombre: string;
  unifilares: ElementoContenido[];
  usuarioNombre: string;
  // Al cambiar el medidor se ofrece pasar el proyecto a «Interconectado».
  onEtapa: () => void;
  onCambio: () => void;
}) {
  const [todo, setTodo] = useState<TodoSolar | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setError(null);
    try {
      setTodo(await leerSolar(proyecto.id));
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar lo solar del proyecto.');
    }
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [proyecto.id]);

  if (error) {
    return (
      <div className="rounded-xl bg-red/10 text-red text-[14px] px-4 py-3 mb-4">
        {error} <button type="button" onClick={cargar} className="underline font-semibold">Reintentar</button>
      </div>
    );
  }
  if (!todo) return <p className="text-[14px] text-muted py-6">Cargando…</p>;

  return (
    <div>
      <ServicioCfe datos={todo.datos} onGuardado={(datos) => setTodo({ ...todo, datos })} />
      <Recibos proyectoId={proyecto.id} todo={todo} onCambio={cargar} />
      <Dimensionamiento proyecto={proyecto} clienteNombre={clienteNombre} todo={todo} unifilares={unifilares}
        onGuardado={(datos) => setTodo({ ...todo, datos })} onUnifilar={onCambio} />
      <Tramite proyecto={proyecto} todo={todo} tieneUnifilar={unifilares.length > 0} usuarioNombre={usuarioNombre}
        onGuardado={(tramite) => setTodo({ ...todo, tramite })} onDocs={cargar} onEtapa={onEtapa} />
    </div>
  );
}

// ---------- Servicio de CFE ----------

function ServicioCfe({ datos, onGuardado }: { datos: DatosSolar; onGuardado: (d: DatosSolar) => void }) {
  const [d, setD] = useState(datos);
  const [guardando, setGuardando] = useState(false);
  const cambiado = JSON.stringify(d) !== JSON.stringify(datos);
  const errorRpu = d.rpu && !/^\d{12}$/.test(d.rpu.replace(/\s/g, '')) ? 'El RPU son 12 dígitos (viene en el recibo).' : null;

  async function guardar() {
    if (errorRpu) return;
    setGuardando(true);
    try {
      const limpio = { ...d, rpu: d.rpu ? d.rpu.replace(/\s/g, '') : null };
      await guardarDatosSolar(limpio);
      onGuardado(limpio);
      showToast('Datos del servicio guardados', 'success');
    } catch (e: any) {
      showToast(e?.message || 'No se pudo guardar.', 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className={TARJETA} data-tour="solar-servicio">
      <TituloSeccion titulo="Servicio de CFE" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <label className="col-span-2"><span className={ETIQUETA}>Titular (como viene en el recibo)</span>
          <input className={CAMPO} value={d.titular || ''} maxLength={160} onChange={(e) => setD({ ...d, titular: e.target.value || null })} /></label>
        <label><span className={ETIQUETA}>RPU (número de servicio)</span>
          <input className={`${CAMPO} ${errorRpu ? 'border-red' : ''}`} inputMode="numeric" value={d.rpu || ''} maxLength={20} onChange={(e) => setD({ ...d, rpu: e.target.value || null })} />
          {errorRpu && <span className={ERROR}>{errorRpu}</span>}</label>
        <label><span className={ETIQUETA}>Tarifa</span>
          <select className={CAMPO} value={d.tarifa || ''} onChange={(e) => setD({ ...d, tarifa: e.target.value || null })}>
            <option value="">Elegir</option>
            {TARIFAS_CFE.map((t) => <option key={t} value={t}>{t}</option>)}
          </select></label>
        <label className="col-span-2 lg:col-span-3"><span className={ETIQUETA}>Dirección del servicio</span>
          <input className={CAMPO} value={d.direccion_servicio || ''} maxLength={300} onChange={(e) => setD({ ...d, direccion_servicio: e.target.value || null })} /></label>
        <label className="col-span-2 lg:col-span-1"><span className={ETIQUETA}>Titular es</span>
          <select className={CAMPO} value={d.tipo_persona} onChange={(e) => setD({ ...d, tipo_persona: e.target.value as 'fisica' | 'moral' })}>
            <option value="fisica">Persona física</option><option value="moral">Persona moral (empresa)</option>
          </select></label>
      </div>
      {cambiado && (
        <button type="button" onClick={guardar} disabled={guardando} className="mt-3 min-h-[44px] px-4 rounded-xl bg-teal text-inkOnAccent font-semibold text-[14px] disabled:opacity-60">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      )}
    </section>
  );
}

// ---------- Recibos ----------

const RECIBO_VACIO = { periodo: '', fecha_inicio: '', fecha_fin: '', kwh: '', importe: '', precio: '' };

function Recibos({ proyectoId, todo, onCambio }: { proyectoId: string; todo: TodoSolar; onCambio: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState(RECIBO_VACIO);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errores, setErrores] = useState<ReturnType<typeof validarRecibo>>({});
  const [guardando, setGuardando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const recibos = todo.recibos;
  const anual = consumoAnual(recibos);
  const promedio = precioPromedio(recibos);
  const numero = (t: string) => (t.trim() === '' ? NaN : Number(t.replace(/[$,\s]/g, '')));

  async function guardar() {
    const r: NuevoRecibo = {
      periodo: f.periodo, fecha_inicio: f.fecha_inicio || null, fecha_fin: f.fecha_fin || null,
      kwh: numero(f.kwh), importe: numero(f.importe), precio_kwh_manual: f.precio.trim() ? numero(f.precio) : null,
    };
    const faltas = validarRecibo(r);
    setErrores(faltas);
    if (Object.keys(faltas).length > 0) return;
    setGuardando(true);
    try {
      await agregarRecibo(proyectoId, r, archivo);
      setF(RECIBO_VACIO);
      setArchivo(null);
      setAbierto(false);
      showToast('Recibo agregado', 'success');
      onCambio();
    } catch (e: any) {
      showToast(e?.message || 'No se pudo guardar el recibo.', 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(r: TodoSolar['recibos'][number]) {
    if (!(await confirmar(`¿Borrar el recibo «${r.periodo}»?`, { tono: 'peligro', textoAceptar: 'Borrar' }))) return;
    try {
      await borrarRecibo(r);
      onCambio();
    } catch (e: any) {
      showToast(e?.message || 'No se pudo borrar.', 'error');
    }
  }

  const precioCalculado = !f.precio.trim() && numero(f.kwh) > 0 && numero(f.importe) >= 0 ? numero(f.importe) / numero(f.kwh) : null;

  return (
    <section className={TARJETA} data-tour="solar-recibos">
      <TituloSeccion titulo="Recibos de CFE" cuenta={recibos.length}
        accion={!abierto && <button type="button" onClick={() => setAbierto(true)} className="min-h-[36px] px-3 rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold flex items-center gap-1"><Plus size={14} /> Recibo</button>} />
      {recibos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          <Dato titulo="Consumo al año" valor={`${num(anual)} kWh`} />
          <Dato titulo="Gasto al año" valor={pesos(gastoAnual(recibos))} />
          <Dato titulo="Precio del kWh" valor={promedio === null ? '—' : `$${num(promedio, 2)}`} />
        </div>
      )}
      {recibos.length === 0 && !abierto && <p className="text-[13.5px] text-muted">Captura los recibos del último año (consumo e importe de cada periodo). De ahí sale el precio del kWh y el tamaño del sistema.</p>}
      {recibos.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[13.5px]">
            <thead><tr className="text-left text-[11.5px] uppercase tracking-[0.06em] text-faint">
              <th className="py-1.5 font-semibold">Periodo</th><th className="py-1.5 font-semibold text-right">kWh</th>
              <th className="py-1.5 font-semibold text-right">Importe</th><th className="py-1.5 font-semibold text-right">$/kWh</th><th />
            </tr></thead>
            <tbody>
              {recibos.map((r) => {
                const p = precioKwh(r);
                return (
                  <tr key={r.id} className="border-t border-line">
                    <td className="py-2">
                      <span className="font-semibold">{r.periodo}</span>
                      {r.fecha_inicio && r.fecha_fin && <span className="block text-[11.5px] text-muted">{fechaCorta(r.fecha_inicio)} – {fechaCorta(r.fecha_fin)}</span>}
                    </td>
                    <td className="py-2 text-right font-mono">{num(r.kwh)}</td>
                    <td className="py-2 text-right font-mono">{pesos(r.importe)}</td>
                    <td className="py-2 text-right font-mono">{p === null ? '—' : num(p, 2)}{r.precio_kwh_manual ? '*' : ''}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {r.archivo_path && <button type="button" onClick={() => abrir(r.archivo_path!)} aria-label="Ver recibo" className="w-9 h-9 inline-flex items-center justify-center text-muted hover:text-teal"><ExternalLink size={15} /></button>}
                      <button type="button" onClick={() => quitar(r)} aria-label={`Borrar el recibo ${r.periodo}`} className="w-9 h-9 inline-flex items-center justify-center text-faint hover:text-red"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {recibos.some((r) => r.precio_kwh_manual) && <p className="text-[11.5px] text-muted mt-1">* Precio capturado a mano.</p>}
        </div>
      )}
      {abierto && (
        <div className="rounded-xl border border-line p-3 mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
          <label className="col-span-2"><span className={ETIQUETA}>Periodo</span>
            <input className={CAMPO} value={f.periodo} maxLength={40} placeholder="Ene–Feb 2026" onChange={(e) => setF({ ...f, periodo: e.target.value })} />
            {errores.periodo && <span className={ERROR}>{errores.periodo}</span>}</label>
          <label><span className={ETIQUETA}>Del (opcional)</span><input type="date" className={CAMPO} value={f.fecha_inicio} onChange={(e) => setF({ ...f, fecha_inicio: e.target.value })} /></label>
          <label><span className={ETIQUETA}>Al (opcional)</span><input type="date" className={CAMPO} value={f.fecha_fin} onChange={(e) => setF({ ...f, fecha_fin: e.target.value })} /></label>
          {errores.fechas && <span className={`${ERROR} col-span-2 lg:col-span-4`}>{errores.fechas}</span>}
          <label><span className={ETIQUETA}>Consumo (kWh)</span>
            <input className={CAMPO} inputMode="decimal" value={f.kwh} onChange={(e) => setF({ ...f, kwh: e.target.value })} />
            {errores.kwh && <span className={ERROR}>{errores.kwh}</span>}</label>
          <label><span className={ETIQUETA}>Importe pagado ($)</span>
            <input className={CAMPO} inputMode="decimal" value={f.importe} onChange={(e) => setF({ ...f, importe: e.target.value })} />
            {errores.importe && <span className={ERROR}>{errores.importe}</span>}</label>
          <label className="col-span-2"><span className={ETIQUETA}>Precio del kWh (vacío = importe ÷ kWh)</span>
            <input className={CAMPO} inputMode="decimal" value={f.precio} placeholder={precioCalculado !== null ? `Calculado: $${num(precioCalculado, 2)}` : ''} onChange={(e) => setF({ ...f, precio: e.target.value })} />
            {errores.precio && <span className={ERROR}>{errores.precio}</span>}</label>
          <div className="col-span-2 lg:col-span-4">
            <input ref={entrada} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
            <button type="button" onClick={() => entrada.current?.click()} className="min-h-[42px] px-3 rounded-xl border border-dashed border-line text-[13.5px] font-semibold flex items-center gap-2">
              <FileUp size={16} /> {archivo ? archivo.name : 'Foto o PDF del recibo (opcional)'}
            </button>
          </div>
          <div className="col-span-2 lg:col-span-4 flex gap-2">
            <button type="button" onClick={() => { setAbierto(false); setErrores({}); }} disabled={guardando} className="flex-1 min-h-[44px] rounded-xl border border-line-strong font-semibold text-[14px]">Cancelar</button>
            <button type="button" onClick={guardar} disabled={guardando} className="flex-1 min-h-[44px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[14px] disabled:opacity-60">{guardando ? 'Guardando…' : 'Agregar recibo'}</button>
          </div>
        </div>
      )}
    </section>
  );
}

function Dato({ titulo, valor, tono }: { titulo: string; valor: string; tono?: 'bien' | 'aviso' }) {
  return (
    <div className="rounded-xl bg-surface-2 border border-line p-2.5 min-w-0">
      <span className="block text-[11px] uppercase tracking-[0.05em] text-muted truncate">{titulo}</span>
      <b className={`block font-mono text-[15px] truncate ${tono === 'bien' ? 'text-teal' : tono === 'aviso' ? 'text-amber' : ''}`}>{valor}</b>
    </div>
  );
}

// ---------- Dimensionamiento ----------

function Dimensionamiento({ proyecto, clienteNombre, todo, unifilares, onGuardado, onUnifilar }: {
  proyecto: Proyecto;
  clienteNombre: string;
  todo: TodoSolar;
  unifilares: ElementoContenido[];
  onGuardado: (d: DatosSolar) => void;
  onUnifilar: () => void;
}) {
  const [d, setD] = useState(todo.datos);
  useEffect(() => setD(todo.datos), [todo.datos]);
  const [guardando, setGuardando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [tipoUnifilar, setTipoUnifilar] = useState<TipoSistema>('interconectado');
  const r = useMemo(() => dimensionar(d, todo.recibos), [d, todo.recibos]);
  const cambiado = JSON.stringify(d) !== JSON.stringify(todo.datos);
  const campoNum = (clave: keyof DatosSolar, etiqueta: string, ayuda?: string, entero = false) => (
    <label><span className={ETIQUETA}>{etiqueta}</span>
      <input className={CAMPO} inputMode="decimal" value={d[clave] == null ? '' : String(d[clave])}
        onChange={(e) => {
          const t = e.target.value.replace(',', '.');
          const v = t.trim() === '' ? null : entero ? Math.round(Number(t)) : Number(t);
          setD({ ...d, [clave]: v !== null && !Number.isFinite(v) ? d[clave] : v } as DatosSolar);
        }} />
      {ayuda && <span className="block text-[11px] text-muted mt-0.5">{ayuda}</span>}
    </label>
  );

  async function guardar() {
    if (!(d.hsp >= 2 && d.hsp <= 8)) { showToast('Las horas solares pico van de 2 a 8.', 'error'); return; }
    if (!(d.factor_perdidas >= 0.5 && d.factor_perdidas <= 1)) { showToast('El factor de pérdidas va de 0.5 a 1.', 'error'); return; }
    if (!(d.cobertura_pct >= 10 && d.cobertura_pct <= 150)) { showToast('La cobertura va de 10 % a 150 %.', 'error'); return; }
    setGuardando(true);
    try {
      await guardarDatosSolar(d);
      onGuardado(d);
      showToast('Dimensionamiento guardado', 'success');
    } catch (e: any) {
      showToast(e?.message || 'No se pudo guardar.', 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function crearUnifilar() {
    if (cambiado) await guardar();
    setCreando(true);
    try {
      const id = await crearUnifilarDesdeProyecto({ proyecto, clienteNombre, datos: d, modulos: r.modulos, kwp: r.kwp, tipo: tipoUnifilar });
      onUnifilar();
      window.location.href = `/unifilares/${id}`;
    } catch (e: any) {
      showToast(e?.message || 'No se pudo crear el unifilar.', 'error');
      setCreando(false);
    }
  }

  return (
    <section className={TARJETA} data-tour="solar-dimensionamiento">
      <TituloSeccion titulo="Dimensionamiento" />
      {todo.recibos.length === 0 && <p className="text-[13px] text-amber mb-2 flex items-center gap-1.5"><AlertTriangle size={15} /> Sin recibos: captura al menos uno para calcular.</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {campoNum('hsp', 'Horas solares pico', 'Guadalajara ≈ 5.5')}
        {campoNum('factor_perdidas', 'Factor de pérdidas', '0.8 = 20 % de pérdidas')}
        {campoNum('cobertura_pct', 'Cubrir del consumo (%)')}
        {campoNum('modulo_w', 'Watts del módulo')}
        {campoNum('modulos', 'Módulos', `Vacío = ${r.modulos} sugeridos`, true)}
        <label className="col-span-1 lg:col-span-2"><span className={ETIQUETA}>Inversor</span>
          <input className={CAMPO} value={d.inversor || ''} maxLength={120} placeholder="Marca, modelo y kW" onChange={(e) => setD({ ...d, inversor: e.target.value || null })} /></label>
        {campoNum('costo_sistema', 'Precio del sistema ($)', 'Para el retorno de inversión')}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
        <Dato titulo="Sistema" valor={`${num(r.kwp, 2)} kWp`} />
        <Dato titulo="Módulos" valor={`${r.modulos} × ${num(d.modulo_w || 0)} W`} />
        <Dato titulo="Producción al año" valor={`${num(r.produccionAnual)} kWh`} />
        <Dato titulo="Cubre del consumo" valor={`${num(r.coberturaReal)} %`} tono={r.coberturaReal >= 95 ? 'bien' : 'aviso'} />
        <Dato titulo="Ahorro al año" valor={pesos(r.ahorroAnual)} tono="bien" />
        <Dato titulo={`Ahorro en ${ANOS_PROYECCION} años`} valor={pesos(r.ahorro25)} />
        <Dato titulo="Retorno" valor={r.retornoAnos === null ? 'Pon el precio' : `${num(r.retornoAnos, 1)} años`} />
        <Dato titulo="Precio del kWh" valor={r.precioKwh === null ? '—' : `$${num(r.precioKwh, 2)}`} />
      </div>
      <p className="text-[11.5px] text-muted mt-2">
        Supuestos: la tarifa sube {INCREMENTO_TARIFA * 100} % al año y los módulos pierden {DEGRADACION_ANUAL * 100} % al año. Con medición neta, lo que se produce de más no se paga.
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        {cambiado && <button type="button" onClick={guardar} disabled={guardando} className="min-h-[44px] px-4 rounded-xl bg-teal text-inkOnAccent font-semibold text-[14px] disabled:opacity-60">{guardando ? 'Guardando…' : 'Guardar'}</button>}
        <Link href={`/dashboard/cotizaciones?proyecto=${proyecto.id}`} className="min-h-[44px] px-4 rounded-xl border border-line bg-surface-2 font-semibold text-[14px] flex items-center gap-1.5">
          <Receipt size={16} /> Cotizar este sistema
        </Link>
        <span className="flex items-stretch rounded-xl border border-line bg-surface-2 overflow-hidden">
        <select aria-label="Tipo de unifilar" value={tipoUnifilar} onChange={(e) => setTipoUnifilar(e.target.value as TipoSistema)}
          className="min-h-[44px] px-2.5 bg-transparent text-[13.5px] border-r border-line focus:outline-none">
          {(Object.keys(NOMBRE_TIPO_SISTEMA) as TipoSistema[]).map((t) => <option key={t} value={t}>{NOMBRE_TIPO_SISTEMA[t]}</option>)}
        </select>
        <button type="button" onClick={crearUnifilar} disabled={creando || r.modulos === 0} className="min-h-[44px] px-4 font-semibold text-[14px] flex items-center gap-1.5 disabled:opacity-50 hover:bg-surface">
          {creando ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />} {unifilares.length ? 'Otro unifilar' : 'Crear el unifilar'}
        </button>
        </span>
      </div>
      {unifilares.length > 0 && (
        <div className="mt-3 grid gap-1.5">
          {unifilares.map((u) => (
            <Link key={u.id} href={u.enlace} className="rounded-xl border border-line bg-surface-2 p-2.5 flex items-center gap-2 hover:border-teal/60">
              <Sun size={16} className="text-amber" /> <span className="flex-1 min-w-0 truncate text-[14px] font-semibold">{u.titulo}</span>
              <span className="text-[12px] text-muted">{u.detalle}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------- Trámite de interconexión ----------

function Tramite({ proyecto, todo, tieneUnifilar, usuarioNombre, onGuardado, onDocs, onEtapa }: {
  proyecto: Proyecto;
  todo: TodoSolar;
  tieneUnifilar: boolean;
  usuarioNombre: string;
  onGuardado: (t: TramiteCfe) => void;
  onDocs: () => void;
  onEtapa: () => void;
}) {
  const [t, setT] = useState(todo.tramite);
  useEffect(() => setT(todo.tramite), [todo.tramite]);
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const tipoParaSubir = useRef<string>('otro');
  const cambiado = JSON.stringify(t) !== JSON.stringify(todo.tramite);
  const requeridos = documentosRequeridos(todo.datos.tipo_persona);
  const docsPorTipo = (tipo: string) => todo.documentos.filter((d) => d.tipo === tipo);
  const listos = requeridos.filter((r) => docsPorTipo(r.tipo).length > 0 || (r.automatico === 'unifilar' && tieneUnifilar)).length;
  const transcurridos = t.fecha_entrega ? diasHabilesDesde(t.fecha_entrega, hoyLocal()) : null;
  const esperando = t.fecha_entrega && !['aprobado', 'contrato_firmado', 'medidor_cambiado', 'rechazado'].includes(t.estado);
  const errorFechas = t.fecha_entrega && t.fecha_medidor && t.fecha_medidor < t.fecha_entrega ? 'El cambio de medidor no puede ser antes de la entrega.' : null;

  async function guardar(conNota?: string) {
    if (errorFechas) { showToast(errorFechas, 'error'); return; }
    const anterior = todo.tramite.estado;
    let nuevo = t;
    if (t.estado !== anterior) nuevo = { ...nuevo, bitacora: [...nuevo.bitacora, nuevaEntrada(usuarioNombre, `Cambió a «${nombreEstadoTramite(t.estado)}»`, t.estado)] };
    if (conNota?.trim()) nuevo = { ...nuevo, bitacora: [...nuevo.bitacora, nuevaEntrada(usuarioNombre, conNota)] };
    setGuardando(true);
    try {
      await guardarTramite(nuevo);
      onGuardado(nuevo);
      setNota('');
      showToast('Trámite guardado', 'success');
      if (nuevo.estado === 'medidor_cambiado' && anterior !== 'medidor_cambiado' && proyecto.etapa !== 'terminado') {
        if (await confirmar('CFE ya cambió el medidor. ¿Pasar el proyecto a «Interconectado»?', { detalle: 'Recuerda volver a encender el sistema.', textoAceptar: 'Sí, interconectado' })) onEtapa();
      }
    } catch (e: any) {
      showToast(e?.message || 'No se pudo guardar el trámite.', 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function subir(archivo: File | undefined) {
    if (!archivo) return;
    const tipo = tipoParaSubir.current;
    setSubiendo(tipo);
    try {
      await subirDocumentoTramite(proyecto.id, tipo, archivo);
      showToast(`${nombreDocumento(tipo)}: subido`, 'success');
      onDocs();
    } catch (e: any) {
      showToast(e?.message || 'No se pudo subir.', 'error');
    } finally {
      setSubiendo(null);
      if (entrada.current) entrada.current.value = '';
    }
  }

  async function borrar(d: TodoSolar['documentos'][number]) {
    if (!(await confirmar(`¿Borrar «${d.archivo_nombre || nombreDocumento(d.tipo)}» del expediente?`, { tono: 'peligro', textoAceptar: 'Borrar' }))) return;
    try {
      await borrarDocumentoTramite(d);
      onDocs();
    } catch (e: any) {
      showToast(e?.message || 'No se pudo borrar.', 'error');
    }
  }

  const fecha = (clave: 'fecha_entrega' | 'fecha_aprobacion' | 'fecha_contrato' | 'fecha_medidor', etiqueta: string) => (
    <label><span className={ETIQUETA}>{etiqueta}</span>
      <input type="date" className={CAMPO} value={t[clave] || ''} onChange={(e) => setT({ ...t, [clave]: e.target.value || null })} /></label>
  );

  return (
    <section className={TARJETA} data-tour="solar-tramite">
      <TituloSeccion titulo="Trámite de interconexión CFE" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <label className="col-span-2"><span className={ETIQUETA}>Estado</span>
          <select className={CAMPO} value={t.estado} onChange={(e) => setT({ ...t, estado: e.target.value as EstadoTramite })}>
            {ESTADOS_TRAMITE.map((x) => <option key={x.clave} value={x.clave}>{x.nombre}</option>)}
          </select>
          <span className="block text-[11.5px] text-muted mt-0.5">{ESTADOS_TRAMITE.find((x) => x.clave === t.estado)?.ayuda}</span></label>
        <label className="col-span-2"><span className={ETIQUETA}>Esquema</span>
          <select className={CAMPO} value={t.esquema} onChange={(e) => setT({ ...t, esquema: e.target.value as Esquema })}>
            {(Object.keys(NOMBRE_ESQUEMA) as Esquema[]).map((x) => <option key={x} value={x}>{NOMBRE_ESQUEMA[x]}</option>)}
          </select></label>
        <label><span className={ETIQUETA}>Número de solicitud</span>
          <input className={CAMPO} value={t.numero_solicitud || ''} maxLength={60} onChange={(e) => setT({ ...t, numero_solicitud: e.target.value || null })} /></label>
        <label><span className={ETIQUETA}>Oficina / zona CFE</span>
          <input className={CAMPO} value={t.oficina || ''} maxLength={120} onChange={(e) => setT({ ...t, oficina: e.target.value || null })} /></label>
        {fecha('fecha_entrega', 'Entregada el')}
        {fecha('fecha_aprobacion', 'Aprobada el')}
        {fecha('fecha_contrato', 'Contrato firmado el')}
        {fecha('fecha_medidor', 'Medidor cambiado el')}
        <label className="col-span-2"><span className={ETIQUETA}>Número del medidor nuevo</span>
          <input className={CAMPO} value={t.numero_medidor || ''} maxLength={60} onChange={(e) => setT({ ...t, numero_medidor: e.target.value || null })} /></label>
        {errorFechas && <span className={`${ERROR} col-span-2 lg:col-span-4`}>{errorFechas}</span>}
      </div>
      {esperando && transcurridos !== null && (
        <p className={`mt-3 rounded-xl px-3 py-2 text-[13.5px] ${transcurridos > DIAS_HABILES_ESPERADOS ? 'bg-red/10 text-red font-semibold' : 'bg-teal/10'}`}>
          {transcurridos} de {DIAS_HABILES_ESPERADOS} días hábiles de referencia desde la entrega{transcurridos > DIAS_HABILES_ESPERADOS ? ': ya se pasó, conviene llamar o ir a la oficina.' : '.'}
        </p>
      )}
      {cambiado && (
        <button type="button" onClick={() => guardar()} disabled={guardando} className="mt-3 min-h-[44px] px-4 rounded-xl bg-teal text-inkOnAccent font-semibold text-[14px] disabled:opacity-60">
          {guardando ? 'Guardando…' : 'Guardar trámite'}
        </button>
      )}

      <div className="mt-5">
        <TituloSeccion titulo="Expediente" cuenta={listos} accion={<span className="text-[12px] text-muted">de {requeridos.length}</span>} />
        <input ref={entrada} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => subir(e.target.files?.[0])} />
        <div className="grid gap-1.5">
          {requeridos.map((r) => {
            const docs = docsPorTipo(r.tipo);
            const automatico = r.automatico === 'unifilar' && tieneUnifilar && docs.length === 0;
            const listo = docs.length > 0 || automatico;
            return (
              <div key={r.tipo} className="rounded-xl border border-line bg-surface-2 p-2.5">
                <div className="flex items-start gap-2.5">
                  <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${listo ? 'bg-teal text-inkOnAccent' : 'border border-line-strong'}`}>{listo && <Check size={12} strokeWidth={3} />}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-semibold">{r.nombre}</span>
                    <span className="block text-[12px] text-muted">{automatico ? 'Ya está en el proyecto (Unifilar FV). Descarga su PDF desde el unifilar.' : r.ayuda}</span>
                  </span>
                  <button type="button" disabled={subiendo !== null} onClick={() => { tipoParaSubir.current = r.tipo; entrada.current?.click(); }}
                    className="min-h-[36px] px-2.5 rounded-lg border border-line bg-surface text-[12.5px] font-semibold flex items-center gap-1 shrink-0 disabled:opacity-60">
                    {subiendo === r.tipo ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />} Subir
                  </button>
                </div>
                {docs.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 pl-7 mt-1.5 text-[13px]">
                    <button type="button" onClick={() => abrir(d.archivo_path)} className="flex-1 min-w-0 truncate text-left text-teal underline">{d.archivo_nombre || 'Archivo'}</button>
                    <button type="button" onClick={() => borrar(d)} aria-label="Borrar archivo" className="w-8 h-8 flex items-center justify-center text-faint hover:text-red"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        {todo.documentos.some((d) => !requeridos.some((r) => r.tipo === d.tipo)) && (
          <p className="text-[12px] text-muted mt-2">Hay archivos de otro tipo de persona; siguen guardados.</p>
        )}
      </div>

      <div className="mt-5">
        <TituloSeccion titulo="Bitácora" cuenta={t.bitacora.length} />
        <div className="grid gap-1.5 mb-2">
          {[...t.bitacora].reverse().map((b, i) => (
            <div key={i} className="text-[13px] rounded-lg bg-surface-2 px-3 py-2">
              <span className="text-muted">{new Date(b.en).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {b.por}</span>
              <span className="block">{b.texto}</span>
            </div>
          ))}
          {t.bitacora.length === 0 && <p className="text-[13px] text-muted">Anota aquí lo que pida o diga CFE (llamadas, observaciones, visitas).</p>}
        </div>
        <div className="flex gap-2">
          <input className={CAMPO} value={nota} maxLength={500} placeholder="CFE pidió corregir el croquis…" onChange={(e) => setNota(e.target.value)} />
          <button type="button" disabled={!nota.trim() || guardando} onClick={() => guardar(nota)} className="min-h-[44px] px-4 rounded-xl bg-teal text-inkOnAccent font-semibold text-[14px] shrink-0 disabled:opacity-50">Anotar</button>
        </div>
      </div>
    </section>
  );
}
