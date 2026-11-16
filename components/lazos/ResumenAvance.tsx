'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { contar, cuentaVacia, leerAvance, porcentajes, resumenPorLazo, sumar, type AvancePlano, type Cuenta } from '@/lib/avancePlano';
import { ordenarPorNivel, type EquipoPlano } from '@/lib/planos';
import { planosDelCliente } from '@/lib/planosDatos';

// Resumen del avance de toda la obra del cliente: por nivel (un plano por
// nivel) y por lazo (SLC 1, SLC 2…). El plano abierto va con lo que se ve en
// pantalla, aunque tenga marcas sin subir.

type Fila = { clave: string; nombre: string; cuenta: Cuenta };

function Tabla({ titulo, filas }: { titulo: string; filas: Fila[] }) {
  const total = filas.reduce((suma, f) => sumar(suma, f.cuenta), cuentaVacia());
  return (
    <div className="mt-4">
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint mb-1.5">{titulo}</p>
      <div className="rounded-2xl border border-line overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_52px_64px_64px_40px] gap-1 px-3 py-1.5 bg-surface-2 text-[11px] font-semibold uppercase text-faint">
          <span>Nombre</span><span className="text-right">Equipos</span><span className="text-right">Probado</span><span className="text-right">Avance</span><span className="text-right">✕</span>
        </div>
        {[...filas, ...(filas.length > 1 ? [{ clave: 'total', nombre: 'Total', cuenta: total }] : [])].map((f) => {
          const p = porcentajes(f.cuenta);
          return (
            <div key={f.clave} className={`grid grid-cols-[minmax(0,1fr)_52px_64px_64px_40px] gap-1 items-center px-3 min-h-[44px] border-t border-line text-[13.5px] ${f.clave === 'total' ? 'font-bold bg-surface-2/60' : ''}`}>
              <span className="break-words leading-tight">{f.nombre}</span>
              <span className="text-right font-mono">{f.cuenta.total}</span>
              <span className="text-right font-mono">{p.probado}%</span>
              <span className="text-right font-mono">{p.avance}%</span>
              <span className={`text-right font-mono ${f.cuenta.bloqueados ? 'text-red font-semibold' : 'text-muted'}`}>{f.cuenta.bloqueados}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ResumenAvance({ clienteId, planoActual, lazoDe, onCerrar }: {
  clienteId: string;
  planoActual: { id: string; equipos: EquipoPlano[]; avance: AvancePlano };
  lazoDe: (e: EquipoPlano) => { id: string; nombre: string } | null;
  onCerrar: () => void;
}) {
  const [planos, setPlanos] = useState<{ id: string; nombre: string; equipos: EquipoPlano[]; avance: AvancePlano }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    planosDelCliente(clienteId)
      .then((r) => setPlanos(ordenarPorNivel(r.planos).map((p) => (p.id === planoActual.id
        ? { id: p.id, nombre: p.nombre, equipos: planoActual.equipos, avance: planoActual.avance }
        : { id: p.id, nombre: p.nombre, equipos: p.sembrado.equipos, avance: leerAvance(p.avance) }))))
      .catch((e) => setError(e?.message || 'No se pudo cargar el resumen.'));
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Por lazo: se juntan los equipos de todos los planos (cada id de equipo es único por plano).
  const porLazo = planos ? (() => {
    const filas = new Map<string, Fila>();
    for (const p of planos) {
      for (const r of resumenPorLazo(p.equipos, p.avance, lazoDe)) {
        const previa = filas.get(r.id);
        filas.set(r.id, { clave: r.id, nombre: r.nombre, cuenta: previa ? sumar(previa.cuenta, r.cuenta) : r.cuenta });
      }
    }
    return [...filas.values()].sort((a, b) => (a.clave === 'sin' ? 1 : b.clave === 'sin' ? -1 : a.nombre.localeCompare(b.nombre, 'es', { numeric: true })));
  })() : [];

  return (
    <ModalOverlay onClose={onCerrar}>
      <div className="glass-strong rounded-3xl max-w-lg w-full p-5 max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display font-bold text-[21px]">Avance de la obra</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-surface-2"><X size={20} /></button>
        </div>
        <p className="text-[12.5px] text-muted">Probado y avance sin contar lo que no se puede instalar (✕).</p>
        {error && <p className="text-red font-semibold text-[13px] mt-3">{error}</p>}
        {!planos && !error && <p className="flex items-center gap-2 text-[14px] text-muted mt-4"><Loader2 size={16} className="animate-spin" /> Cargando los planos…</p>}
        {planos && (
          <>
            <Tabla titulo="Por nivel" filas={planos.map((p) => ({ clave: p.id, nombre: p.nombre, cuenta: contar(p.equipos, p.avance) }))} />
            <Tabla titulo="Por lazo" filas={porLazo} />
          </>
        )}
      </div>
    </ModalOverlay>
  );
}
