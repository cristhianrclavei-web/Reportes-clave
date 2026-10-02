'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Search, Plus } from 'lucide-react';
import { showToast } from '@/components/Toast';
import { coincideBusqueda } from '@/lib/busqueda';
import { Articulo, Sistema, Ubicacion } from '@/lib/almacen';
import { EquipoInstalado, listarEquiposSinRegistro, listarEquiposResueltos, resolverEquipo, textoEquipo } from '@/lib/equiposInstalados';
import { ModalNuevoArticulo } from '@/components/almacen/EntradaAlmacenWizard';

// Almacén → «Instalados»: equipo que los técnicos pusieron en un reporte y
// que no está en el almacén. La alerta sigue hasta que el almacenista lo
// registra (lo liga a un artículo) o indica que no pasa por almacén.

const inputCls = 'w-full px-3.5 min-h-[44px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14.5px] placeholder:text-faint';

function fecha(iso: string | null) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
const nombreTec = (e: EquipoInstalado) => e.tecnico?.full_name?.split(' ').slice(0, 2).join(' ') || 'Técnico';

export default function EquiposSinRegistro({
  articulos, sistemas, ubicaciones, onCatalogoActualizado, onCambio,
}: {
  articulos: Articulo[];
  sistemas: Sistema[];
  ubicaciones: Ubicacion[];
  onCatalogoActualizado: () => Promise<void>;
  onCambio: () => void;
}) {
  const [pendientes, setPendientes] = useState<EquipoInstalado[] | null>(null);
  const [resueltos, setResueltos] = useState<EquipoInstalado[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([listarEquiposSinRegistro(), listarEquiposResueltos()]);
      setPendientes(p); setResueltos(r); setError(null);
    } catch {
      setPendientes([]); setError('Falta correr el SQL de equipos instalados.');
    }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div>
      <p className="text-[13px] text-muted mb-3 leading-relaxed">
        Equipo que un técnico anotó como instalado en su reporte y que no está en el almacén. Ligándolo a un artículo queda el historial de dónde se instaló.
      </p>
      {error && <p className="text-[13px] text-red font-semibold mb-3">{error}</p>}
      {pendientes === null && <p className="text-[13px] text-muted">Cargando…</p>}
      {pendientes && pendientes.length === 0 && !error && (
        <div className="rounded-2xl bg-teal/8 border border-teal/30 px-4 py-3 text-[13.5px] text-teal font-semibold flex items-center gap-2 mb-4">
          <Check size={16} /> Todo el equipo instalado está registrado.
        </div>
      )}
      <div className="flex flex-col gap-2.5 mb-5">
        {(pendientes || []).map((e) => (
          <div key={e.id} className="rounded-2xl bg-surface border border-amber/40 p-3.5">
            <p className="text-[12px] font-semibold text-amber flex items-center gap-1.5 mb-1">
              <AlertTriangle size={13} /> Equipo instalado sin registro en almacén · folio {e.folio || '—'}
            </p>
            <p className="text-[14.5px] font-semibold">{e.cantidad} × {textoEquipo(e)}</p>
            <p className="text-[12.5px] text-muted">
              {e.serie ? `Serie ${e.serie} · ` : ''}{e.cliente} · {nombreTec(e)} · {fecha(e.fecha)}
            </p>
            {abierto === e.id ? (
              <Resolver
                equipo={e}
                articulos={articulos}
                sistemas={sistemas}
                ubicaciones={ubicaciones}
                onCatalogoActualizado={onCatalogoActualizado}
                onCancelar={() => setAbierto(null)}
                onResuelto={() => { setAbierto(null); cargar(); onCambio(); }}
              />
            ) : (
              <button type="button" onClick={() => setAbierto(e.id)} className="mt-2 min-h-[40px] px-4 rounded-xl bg-teal text-inkOnAccent text-[13.5px] font-semibold">
                Registrar
              </button>
            )}
          </div>
        ))}
      </div>

      {resueltos.length > 0 && (
        <>
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted mb-2">Resueltos recientemente</p>
          <div className="rounded-2xl bg-surface border border-line divide-y divide-line">
            {resueltos.map((e) => (
              <div key={e.id} className="px-3.5 py-2.5">
                <p className="text-[13.5px] font-medium">{e.cantidad} × {textoEquipo(e)} <span className="text-muted font-normal">· folio {e.folio || '—'}</span></p>
                <p className="text-[12px] text-muted">
                  {e.estado === 'registrado'
                    ? `Ligado a: ${articulos.find((a) => a.id === e.articulo_id)?.descripcion || 'artículo'}`
                    : `No pasa por almacén${e.nota ? `: ${e.nota}` : ''}`}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Resolver({
  equipo, articulos, sistemas, ubicaciones, onCatalogoActualizado, onCancelar, onResuelto,
}: {
  equipo: EquipoInstalado;
  articulos: Articulo[];
  sistemas: Sistema[];
  ubicaciones: Ubicacion[];
  onCatalogoActualizado: () => Promise<void>;
  onCancelar: () => void;
  onResuelto: () => void;
}) {
  const [modo, setModo] = useState<'registrar' | 'no_aplica'>('registrar');
  const [buscar, setBuscar] = useState(equipo.modelo || equipo.descripcion || '');
  const [articuloId, setArticuloId] = useState<string | null>(null);
  const [movimientos, setMovimientos] = useState(true);
  const [nota, setNota] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const [busy, setBusy] = useState(false);

  const opciones = useMemo(() => {
    const q = buscar.trim();
    return articulos
      .filter((a) => a.activo)
      .filter((a) => !q || coincideBusqueda(`${a.descripcion} ${a.marca || ''} ${a.modelo || ''}`, q))
      .slice(0, 8);
  }, [articulos, buscar]);

  async function guardar() {
    setBusy(true);
    try {
      await resolverEquipo(equipo.id, modo === 'registrar'
        ? { estado: 'registrado', articuloId, movimientos, nota }
        : { estado: 'no_aplica', nota });
      showToast(modo === 'registrar' ? 'Equipo registrado' : 'Marcado como «no pasa por almacén»', 'success');
      onResuelto();
    } catch (e: any) {
      showToast(e?.message || 'No se pudo guardar', 'error');
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface-2/50 p-3">
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        {([['registrar', 'Ligar al almacén'], ['no_aplica', 'No pasa por almacén']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setModo(k)}
            className={`min-h-[40px] rounded-xl border text-[13px] font-semibold ${modo === k ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface border-line'}`}>{l}</button>
        ))}
      </div>

      {modo === 'registrar' ? (
        <>
          <div className="relative mb-2">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input className={`${inputCls} pl-9`} value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar en el catálogo" />
          </div>
          <div className="rounded-xl bg-surface border border-line divide-y divide-line mb-2 max-h-[240px] overflow-y-auto">
            {opciones.length === 0 && <p className="text-[12.5px] text-muted p-3">No hay coincidencias en el catálogo.</p>}
            {opciones.map((a) => (
              <label key={a.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer">
                <input type="radio" name={`art-${equipo.id}`} className="w-4 h-4 accent-teal" checked={articuloId === a.id} onChange={() => setArticuloId(a.id)} />
                <span className="min-w-0">
                  <span className="block text-[13.5px] truncate">{a.descripcion}</span>
                  <span className="block text-[11.5px] text-muted truncate">{[a.marca, a.modelo].filter(Boolean).join(' ') || a.unidad}</span>
                </span>
              </label>
            ))}
          </div>
          <button type="button" onClick={() => setNuevo(true)} className="text-[13px] font-semibold text-teal flex items-center gap-1.5 mb-3 min-h-[32px]">
            <Plus size={14} /> No está: darlo de alta en el catálogo
          </button>
          <label className="flex items-start gap-2.5 mb-3 text-[13px] cursor-pointer">
            <input type="checkbox" checked={movimientos} onChange={(e) => setMovimientos(e.target.checked)} className="w-5 h-5 accent-teal mt-0.5" />
            <span>
              Registrar entrada y salida por {equipo.cantidad}
              <span className="block text-[12px] text-muted">El inventario no cambia, pero el historial del artículo dice que se instaló en este servicio.</span>
            </span>
          </label>
          <input className={`${inputCls} mb-3`} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional): lo compró el técnico en la ferretería…" />
        </>
      ) : (
        <input className={`${inputCls} mb-3`} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="¿Por qué? Lo puso el cliente, garantía…" />
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancelar} className="min-h-[42px] rounded-xl border border-line text-[13px] font-semibold">Cancelar</button>
        <button type="button" onClick={guardar}
          disabled={busy || (modo === 'registrar' ? !articuloId : !nota.trim())}
          className="min-h-[42px] rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold disabled:opacity-50">
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>

      {nuevo && (
        <ModalNuevoArticulo
          sistemas={sistemas}
          ubicaciones={ubicaciones}
          sistemaSugerido={null}
          descripcionSugerida={equipo.descripcion || ''}
          avisoCreado="Artículo dado de alta — revisa y guarda el registro"
          onCancelar={() => setNuevo(false)}
          onCreado={async (a) => {
            setNuevo(false);
            await onCatalogoActualizado();
            setArticuloId(a.id);
            setBuscar(a.descripcion);
          }}
        />
      )}
    </div>
  );
}

