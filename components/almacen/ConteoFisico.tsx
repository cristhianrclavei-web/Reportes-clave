'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, ChevronLeft, Search } from 'lucide-react';
import { showToast } from '@/components/Toast';
import { coincideBusqueda } from '@/lib/busqueda';
import {
  Articulo, Ubicacion, Conteo, ConteoItem, listarConteos, iniciarConteo, itemsDeConteo, guardarContado, cerrarConteo, cancelarConteo,
} from '@/lib/almacen';

// Conteo físico del inventario general: el almacenista cuenta (todo o una
// ubicación) sin ver lo que dice el sistema; al terminar ve las diferencias
// y, al cerrar, cada una se ajusta (sobra → ajuste, falta → merma).

const inputCls = 'w-full px-3.5 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px] placeholder:text-faint';

function fecha(iso: string | null) {
  return iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '';
}

export default function ConteoFisico({ articulos, ubicaciones, onCerrado }: { articulos: Articulo[]; ubicaciones: Ubicacion[]; onCerrado: () => void }) {
  const [conteos, setConteos] = useState<Conteo[] | null>(null);
  const [abierto, setAbierto] = useState<Conteo | null>(null);
  const [ubic, setUbic] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    listarConteos().then((c) => { setConteos(c); setError(null); }).catch(() => { setConteos([]); setError('Falta correr el SQL de ubicaciones y conteo.'); });
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function iniciar() {
    try {
      const id = await iniciarConteo(ubic || null, nota);
      setNota('');
      const lista = await listarConteos();
      setConteos(lista);
      setAbierto(lista.find((c) => c.id === id) || null);
    } catch (e: any) { showToast(e?.message || 'No se pudo iniciar', 'error'); }
  }

  if (abierto) {
    return <Contando conteo={abierto} articulos={articulos} ubicaciones={ubicaciones} onSalir={() => { setAbierto(null); cargar(); }} onCerrado={() => { setAbierto(null); cargar(); onCerrado(); }} />;
  }

  const abiertos = (conteos || []).filter((c) => c.estado === 'abierto');
  const cerrados = (conteos || []).filter((c) => c.estado !== 'abierto');
  const nombreUbic = (id: string | null) => (id ? ubicaciones.find((u) => u.id === id)?.nombre || 'Ubicación' : 'Todo el almacén');

  return (
    <div>
      <p className="text-[13px] text-muted mb-3 leading-relaxed">
        Cuenta lo que hay físicamente. La app no te muestra lo registrado mientras cuentas; al terminar ves las diferencias y se ajusta el inventario con el folio del conteo.
      </p>
      {error && <p className="text-[13px] text-red font-semibold mb-3">{error}</p>}
      <div className="rounded-2xl bg-surface border border-line p-3 mb-4">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-muted mb-2">Nuevo conteo</p>
        <select className={`${inputCls} mb-2`} value={ubic} onChange={(e) => setUbic(e.target.value)}>
          <option value="">Todo el almacén</option>
          {ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
        <input className={`${inputCls} mb-2`} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional): conteo mensual de octubre" />
        <button type="button" onClick={iniciar} className="w-full min-h-[44px] rounded-xl bg-teal text-inkOnAccent text-[14px] font-semibold flex items-center justify-center gap-2"><ClipboardCheck size={16} /> Empezar a contar</button>
      </div>
      {abiertos.map((c) => (
        <button key={c.id} type="button" onClick={() => setAbierto(c)} className="w-full rounded-2xl bg-amber/10 border border-amber/30 p-3.5 mb-2 text-left">
          <p className="text-[14px] font-semibold">{c.folio} · {nombreUbic(c.ubicacion_id)} · en curso</p>
          <p className="text-[12.5px] text-muted">Iniciado {fecha(c.created_at)} · toca para continuar</p>
        </button>
      ))}
      {cerrados.length > 0 && (
        <div className="mt-3">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted mb-2">Anteriores</p>
          <div className="rounded-2xl bg-surface border border-line divide-y divide-line">
            {cerrados.map((c) => (
              <div key={c.id} className="px-3.5 py-2.5 text-[13px] flex justify-between gap-2">
                <span>{c.folio} · {nombreUbic(c.ubicacion_id)}</span>
                <span className="text-muted">{c.estado === 'cerrado' ? `Cerrado ${fecha(c.cerrado_en)}` : 'Cancelado'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Contando({ conteo, articulos, ubicaciones, onSalir, onCerrado }: {
  conteo: Conteo; articulos: Articulo[]; ubicaciones: Ubicacion[]; onSalir: () => void; onCerrado: () => void;
}) {
  const [items, setItems] = useState<ConteoItem[] | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [buscar, setBuscar] = useState('');
  const [revisando, setRevisando] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const art = useMemo(() => Object.fromEntries(articulos.map((a) => [a.id, a])), [articulos]);

  useEffect(() => {
    itemsDeConteo(conteo.id).then((l) => {
      setItems(l);
      setValores(Object.fromEntries(l.filter((i) => i.contado !== null).map((i) => [i.id, String(i.contado)])));
    }).catch(() => setItems([]));
  }, [conteo.id]);

  async function guardar(it: ConteoItem) {
    const v = valores[it.id];
    const num = v === undefined || v === '' ? null : Math.max(0, Number(v));
    if (num === it.contado) return;
    try {
      await guardarContado(it.id, num, it.nota || '');
      setItems((p) => (p || []).map((x) => (x.id === it.id ? { ...x, contado: num } : x)));
    } catch { showToast('No se guardó; revisa la conexión', 'error'); }
  }

  const lista = (items || [])
    .filter((i) => art[i.articulo_id])
    .filter((i) => !buscar.trim() || coincideBusqueda(`${art[i.articulo_id].descripcion} ${art[i.articulo_id].marca || ''}`, buscar))
    .sort((a, b) => art[a.articulo_id].descripcion.localeCompare(art[b.articulo_id].descripcion));
  const contados = (items || []).filter((i) => i.contado !== null).length;
  const diferencias = (items || []).filter((i) => i.contado !== null && Number(i.contado) !== Number(i.esperado));

  async function cerrar() {
    setCerrando(true);
    try {
      const n = await cerrarConteo(conteo.id);
      showToast(n ? `Conteo cerrado: ${n} ajuste(s) al inventario` : 'Conteo cerrado: todo cuadró', 'success');
      onCerrado();
    } catch (e: any) { showToast(e?.message || 'No se pudo cerrar', 'error'); setCerrando(false); }
  }

  return (
    <div>
      <button type="button" onClick={onSalir} className="text-[13.5px] font-semibold text-teal flex items-center gap-1 mb-3"><ChevronLeft size={16} /> Conteos</button>
      <h2 className="font-display font-bold text-[19px]">{conteo.folio} · {conteo.ubicacion_id ? ubicaciones.find((u) => u.id === conteo.ubicacion_id)?.nombre : 'Todo el almacén'}</h2>
      <p className="text-[13px] text-muted mb-3">{contados} de {(items || []).length} contados. Se guarda solo al salir de cada campo.</p>

      {!revisando ? (
        <>
          <div className="relative mb-2">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input className={`${inputCls} pl-9`} value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar artículo" />
          </div>
          <div className="rounded-2xl bg-surface border border-line divide-y divide-line mb-3">
            {items === null && <p className="text-[13px] text-muted p-4">Cargando…</p>}
            {lista.map((it) => {
              const a = art[it.articulo_id];
              return (
                <div key={it.id} className="flex items-center gap-2 px-3.5 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium truncate">{a.descripcion}</span>
                    <span className="block text-[11.5px] text-muted truncate">{[a.marca, a.modelo].filter(Boolean).join(' ')}{a.ubicacion_id && !conteo.ubicacion_id ? ` · ${ubicaciones.find((u) => u.id === a.ubicacion_id)?.nombre || ''}` : ''}</span>
                  </span>
                  <input type="number" inputMode="decimal" min={0} placeholder="—" value={valores[it.id] ?? ''}
                    onChange={(e) => setValores({ ...valores, [it.id]: e.target.value })} onBlur={() => guardar(it)}
                    className={`w-20 px-2 py-2 rounded-lg border text-[15px] text-center ${it.contado !== null ? 'bg-teal/10 border-teal/40' : 'bg-surface-2 border-line'}`} />
                  <span className="text-[12px] text-muted w-8 shrink-0">{a.unidad}</span>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={async () => { await cancelarConteo(conteo.id); onSalir(); }} className="min-h-[46px] rounded-xl border border-line text-[13.5px] font-semibold text-red">Cancelar conteo</button>
            <button type="button" disabled={contados === 0} onClick={() => setRevisando(true)} className="min-h-[46px] rounded-xl bg-teal text-inkOnAccent text-[13.5px] font-semibold disabled:opacity-50">Terminar y revisar</button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[13.5px] font-semibold mb-2">{diferencias.length ? `${diferencias.length} diferencia(s) contra lo registrado` : 'Todo lo contado cuadra con lo registrado'}</p>
          <div className="rounded-2xl bg-surface border border-line divide-y divide-line mb-2">
            {diferencias.map((it) => {
              const a = art[it.articulo_id];
              const d = Number(it.contado) - Number(it.esperado);
              return (
                <div key={it.id} className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-[13.5px]">
                  <span className="min-w-0 truncate">{a?.descripcion}</span>
                  <span className="shrink-0 text-muted">registrado {Number(it.esperado)} · contado {Number(it.contado)} <b className={d > 0 ? 'text-teal' : 'text-red'}>{d > 0 ? `+${d}` : d}</b></span>
                </div>
              );
            })}
          </div>
          <p className="text-[12px] text-muted mb-3">Lo que no contaste no se ajusta. Al cerrar, cada diferencia queda en Movimientos como ajuste (sobra) o merma (falta) con el folio {conteo.folio}.</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setRevisando(false)} className="min-h-[46px] rounded-xl border border-line text-[13.5px] font-semibold">Seguir contando</button>
            <button type="button" disabled={cerrando} onClick={cerrar} className="min-h-[46px] rounded-xl bg-teal text-inkOnAccent text-[13.5px] font-semibold disabled:opacity-50">{cerrando ? 'Cerrando…' : 'Cerrar y ajustar'}</button>
          </div>
        </>
      )}
    </div>
  );
}
