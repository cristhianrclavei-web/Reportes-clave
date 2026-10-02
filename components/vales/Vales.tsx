'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, AlertTriangle, PackageX, ClipboardList } from 'lucide-react';
import { showToast } from '@/components/Toast';
import NuevoVale from './NuevoVale';
import ValeDetalle from './ValeDetalle';
import {
  Vale, AltaSolicitada, ETIQUETA_ESTADO, valeVencido, listarVales, listarAltasPendientes, resolverAlta,
} from '@/lib/vales';

// Vales de almacén: la lista del técnico (los suyos + «Pedir al almacén») y
// la bandeja del almacenista (todos, con lo que requiere su acción arriba y
// lo que los técnicos pidieron que no está en inventario).

function fecha(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

function Tarjeta({ v, onAbrir, verTecnico }: { v: Vale; onAbrir: () => void; verTecnico?: boolean }) {
  const est = ETIQUETA_ESTADO[v.estado];
  const vencido = valeVencido(v);
  return (
    <button type="button" onClick={onAbrir}
      className={`w-full text-left rounded-2xl bg-surface border p-3.5 active:scale-[0.99] transition-transform ${vencido ? 'border-red/40' : 'border-line'}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="text-[11.5px] font-mono font-semibold text-teal">{v.folio}</span>
          <span className="block text-[14.5px] font-semibold leading-tight truncate">{v.cliente_nombre}</span>
        </span>
        <span className={`text-[11.5px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${est.cls}`}>{est.label}</span>
      </div>
      <p className="text-[12.5px] text-muted mt-1 truncate">
        {verTecnico ? `${v.tecnico} · ` : ''}{v.items.length} artículo(s): {v.items.slice(0, 2).map((i) => i.articulo?.descripcion).join(', ')}{v.items.length > 2 ? '…' : ''}
      </p>
      <div className="flex flex-wrap gap-1.5 mt-1.5 text-[11.5px] font-semibold">
        {vencido && <span className="px-2 py-0.5 rounded-full bg-red/12 text-red flex items-center gap-1"><AlertTriangle size={11} /> Vencido desde {fecha(v.fecha_limite)}</span>}
        {v.extension_estado === 'pendiente' && <span className="px-2 py-0.5 rounded-full bg-amber/15 text-amber">Pide más días</span>}
        <span className="text-faint font-normal">{fecha(v.created_at)}</span>
      </div>
    </button>
  );
}

type Grupo = { titulo: string; vales: Vale[] };

export default function Vales({ modo }: { modo: 'tecnico' | 'almacen' }) {
  const [vales, setVales] = useState<Vale[] | null>(null);
  const [altas, setAltas] = useState<AltaSolicitada[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [verCerrados, setVerCerrados] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [v, a] = await Promise.all([
        listarVales({ soloMios: modo === 'tecnico' }),
        modo === 'almacen' ? listarAltasPendientes() : Promise.resolve([] as AltaSolicitada[]),
      ]);
      setVales(v);
      setAltas(a);
      setError(null);
    } catch (e: any) {
      setError(e?.message?.includes('almacen_vales') ? 'Falta correr el SQL de vales en Supabase.' : 'No se pudieron cargar los vales.');
      setVales([]);
    }
  }, [modo]);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 60000);
    const alVolver = () => document.visibilityState === 'visible' && cargar();
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver); };
  }, [cargar]);

  const grupos: Grupo[] = useMemo(() => {
    const l = vales || [];
    const activos = (estados: Vale['estado'][]) => l.filter((v) => estados.includes(v.estado));
    if (modo === 'almacen') {
      return [
        { titulo: 'Por entregar', vales: activos(['solicitado']) },
        { titulo: 'Devoluciones por confirmar', vales: activos(['devolucion_por_confirmar']) },
        { titulo: 'Piden más días', vales: l.filter((v) => v.extension_estado === 'pendiente' && (v.estado === 'en_uso' || v.estado === 'por_firmar')) },
        { titulo: 'Fuera del almacén', vales: activos(['por_firmar', 'en_uso']).sort((a, b) => Number(valeVencido(b)) - Number(valeVencido(a))) },
      ];
    }
    return [
      { titulo: 'Por firmar de recibido', vales: activos(['por_firmar']) },
      { titulo: 'En tu resguardo', vales: activos(['en_uso']).sort((a, b) => Number(valeVencido(b)) - Number(valeVencido(a))) },
      { titulo: 'Esperando al almacén', vales: activos(['solicitado', 'devolucion_por_confirmar']) },
    ];
  }, [vales, modo]);

  const cerrados = (vales || []).filter((v) => ['cerrado', 'rechazado', 'cancelado'].includes(v.estado));
  const valeAbierto = (vales || []).find((v) => v.id === abierto) || null;
  const vencidos = (vales || []).filter((v) => valeVencido(v)).length;

  async function atenderAlta(a: AltaSolicitada, estado: 'atendida' | 'descartada') {
    try {
      await resolverAlta(a.id, estado, null, '');
      showToast(estado === 'atendida' ? 'Marcada como atendida' : 'Descartada', 'success');
      cargar();
    } catch (e: any) {
      showToast(e?.message || 'No se pudo', 'error');
    }
  }

  return (
    <div>
      {modo === 'tecnico' && (
        <button type="button" onClick={() => setNuevo(true)}
          className="w-full min-h-[50px] mb-4 rounded-2xl bg-teal text-inkOnAccent font-semibold text-[15px] shadow-glow-teal flex items-center justify-center gap-2 active:scale-[0.98]">
          <Plus size={19} strokeWidth={2.6} /> Pedir al almacén
        </button>
      )}

      {vencidos > 0 && (
        <div className="rounded-2xl px-4 py-2.5 mb-3 bg-red/10 border border-red/30 text-[13px] text-red font-semibold flex items-center gap-2">
          <AlertTriangle size={16} /> {vencidos} vale(s) con plazo vencido{modo === 'tecnico' ? ': devuélvelos o pide más días' : ''}.
        </div>
      )}

      {modo === 'almacen' && altas.length > 0 && (
        <div className="rounded-2xl border border-amber/40 bg-amber/5 p-3.5 mb-4">
          <p className="text-[13px] font-semibold text-amber flex items-center gap-1.5 mb-2"><PackageX size={15} /> Piden cosas que no están en inventario ({altas.length})</p>
          <p className="text-[12px] text-muted mb-2">Si las tienes, dalas de alta en «Catálogo» y registra su entrada; después márcalas como atendidas.</p>
          <div className="flex flex-col gap-2">
            {altas.map((a) => (
              <div key={a.id} className="rounded-xl bg-surface border border-line px-3 py-2.5">
                <p className="text-[13.5px] font-semibold">{a.cantidad} {a.unidad} · {a.descripcion}</p>
                <p className="text-[12px] text-muted">{a.tecnico}{a.contexto ? ` · ${a.contexto}` : ''} · {fecha(a.created_at)}</p>
                <div className="flex gap-4 mt-1.5 text-[12.5px] font-semibold">
                  <button type="button" onClick={() => atenderAlta(a, 'atendida')} className="text-teal">Ya lo registré</button>
                  <button type="button" onClick={() => atenderAlta(a, 'descartada')} className="text-muted">No lo tenemos</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-[13px] text-red font-semibold mb-3">{error}</p>}
      {vales === null && <p className="text-[13px] text-muted py-6 text-center">Cargando vales…</p>}

      {grupos.filter((g) => g.vales.length > 0).map((g) => (
        <div key={g.titulo} className="mb-4">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted mb-2">{g.titulo} ({g.vales.length})</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            {g.vales.map((v) => <Tarjeta key={`${g.titulo}-${v.id}`} v={v} verTecnico={modo === 'almacen'} onAbrir={() => setAbierto(v.id)} />)}
          </div>
        </div>
      ))}

      {vales && grupos.every((g) => g.vales.length === 0) && (
        <div className="flex flex-col items-center py-10 text-center text-muted">
          <ClipboardList size={28} className="mb-2" />
          <p className="text-[14px]">{modo === 'tecnico' ? 'No tienes vales abiertos.' : 'No hay vales pendientes.'}</p>
        </div>
      )}

      {cerrados.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setVerCerrados(!verCerrados)} className="text-[13px] font-semibold text-teal py-1">
            {verCerrados ? 'Ocultar' : 'Ver'} cerrados ({cerrados.length})
          </button>
          {verCerrados && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 mt-2">
              {cerrados.map((v) => <Tarjeta key={v.id} v={v} verTecnico={modo === 'almacen'} onAbrir={() => setAbierto(v.id)} />)}
            </div>
          )}
        </div>
      )}

      {nuevo && <NuevoVale onClose={() => setNuevo(false)} onCreado={() => { setNuevo(false); cargar(); }} />}
      {valeAbierto && (
        <ValeDetalle vale={valeAbierto} modo={modo} onClose={() => setAbierto(null)} onCambio={() => { cargar(); }} />
      )}
    </div>
  );
}
