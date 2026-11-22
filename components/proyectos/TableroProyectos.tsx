'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Briefcase, Search } from 'lucide-react';
import SupervisorShell from '@/components/SupervisorShell';
import TableroKanban, { InterruptorTablero, useVistaTablero } from '@/components/TableroKanban';
import EstadoVacio from '@/components/EstadoVacio';
import { showToast } from '@/components/Toast';
import PestanasProyectos from '@/components/proyectos/PestanasProyectos';
import { ChipEtapa } from '@/components/proyectos/EtapasProyecto';
import { columnasEtapa } from '@/components/proyectos/ProyectosDelCliente';
import { normalizar } from '@/lib/clientesCatalogo';
import { usePerfiles } from '@/lib/perfiles';
import { cambiarEtapaProyecto, listarTodosProyectos, type ProyectoConCliente } from '@/lib/proyectos';
import { SISTEMAS, cortoSistema, llevaSolar, nombreEtapa, type Etapa, type SistemaClave } from '@/lib/proyectosEtapas';

// Todos los proyectos de todos los clientes, por etapa. Se filtran por
// sistema (p. ej. solo los de paneles solares) y por nombre o cliente.

const DIA = 86400000;

export default function TableroProyectos({ userName }: { userName: string }) {
  const perfiles = usePerfiles();
  const [proyectos, setProyectos] = useState<ProyectoConCliente[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useVistaTablero('proyectos-todos');
  const [sistema, setSistema] = useState<SistemaClave | 'todos'>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [verCancelados, setVerCancelados] = useState(false);

  async function cargar() {
    setError(null);
    try {
      setProyectos(await listarTodosProyectos());
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar los proyectos.');
    }
  }
  useEffect(() => { cargar(); }, []);

  const visibles = useMemo(() => {
    const q = normalizar(busqueda);
    return (proyectos || []).filter((p) => (sistema === 'todos' || p.sistemas.includes(sistema))
      && (verCancelados || p.etapa !== 'cancelado')
      && (!q || normalizar(`${p.nombre} ${p.cliente}`).includes(q)));
  }, [proyectos, sistema, busqueda, verCancelados]);

  const conSolar = sistema === 'solar' || (sistema === 'todos' && visibles.some((p) => llevaSolar(p.sistemas)));
  const columnas = columnasEtapa(conSolar).filter((c) => verCancelados || c.clave !== 'cancelado');
  const diasEnEtapa = (p: ProyectoConCliente) => (p.etapa_desde ? Math.floor((Date.now() - Date.parse(p.etapa_desde)) / DIA) : null);

  const tarjeta = (p: ProyectoConCliente) => {
    const dias = diasEnEtapa(p);
    const responsable = p.responsable_id ? perfiles[p.responsable_id]?.full_name : null;
    return (
      <Link href={`/dashboard/proyectos/${p.cliente_id}/${p.id}`} draggable={false} className="group block px-3 pt-3 pb-1.5">
        <strong className="block text-[14px] font-semibold leading-snug group-hover:text-teal">{p.nombre}</strong>
        <span className="block text-[12.5px] text-muted truncate">{p.cliente}</span>
        <span className="block text-[11.5px] text-teal font-medium truncate mt-0.5">{p.sistemas.map(cortoSistema).join(' · ')}</span>
        <span className="flex flex-wrap gap-x-2 text-[11px] text-faint mt-0.5">
          {dias !== null && <span>{dias === 0 ? 'Hoy' : `${dias} d`} en la etapa</span>}
          {responsable && <span className="truncate">{responsable}</span>}
        </span>
      </Link>
    );
  };

  return (
    <SupervisorShell active="proyectos" title="Proyectos" userName={userName} wrapperClassName="max-w-2xl lg:max-w-[1500px] mx-auto pb-16 lg:px-8 2xl:px-10">
      <PestanasProyectos actual="tablero" />
      <div className="flex flex-col lg:flex-row lg:items-center gap-2 mb-4" data-tour="filtros-tablero">
        <label className="relative flex-1 lg:max-w-sm">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar proyecto o cliente"
            className="w-full min-h-[44px] pl-9 pr-3 rounded-xl border border-line bg-surface text-[14.5px] focus:outline-none focus:border-teal" />
        </label>
        <div className="flex gap-1 overflow-x-auto">
          {(['todos', ...SISTEMAS.map((s) => s.clave)] as const).map((s) => (
            <button key={s} type="button" aria-pressed={sistema === s} onClick={() => setSistema(s)}
              className={`min-h-[40px] px-3 rounded-full border text-[13px] font-semibold whitespace-nowrap ${sistema === s ? 'bg-teal text-inkOnAccent border-teal' : 'border-line bg-surface text-muted'}`}>
              {s === 'todos' ? 'Todos' : cortoSistema(s)}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <label className="flex items-center gap-2 text-[13px] text-muted">
          <input type="checkbox" checked={verCancelados} onChange={(e) => setVerCancelados(e.target.checked)} className="w-4 h-4 accent-teal" /> Cancelados
        </label>
        <InterruptorTablero vista={vista} onCambiar={setVista} />
      </div>

      {error && <div className="rounded-xl bg-red/10 text-red text-[14px] px-4 py-3 mb-4">{error} <button type="button" onClick={cargar} className="underline font-semibold">Reintentar</button></div>}
      {proyectos === null && !error && <p className="text-[14px] text-muted">Cargando…</p>}
      {proyectos && visibles.length === 0 && (
        <EstadoVacio icono={<Briefcase size={26} strokeWidth={2} />} titulo={proyectos.length === 0 ? 'Todavía no hay proyectos' : 'Ningún proyecto con ese filtro'}
          detalle={proyectos.length === 0 ? 'Se crean desde la ficha de cada cliente («Nuevo proyecto»).' : 'Cambia el sistema o la búsqueda.'} />
      )}

      {proyectos && visibles.length > 0 && vista === 'tablero' && (
        <TableroKanban<ProyectoConCliente, Etapa>
          columnas={columnas}
          items={visibles}
          columnaDe={(p) => p.etapa}
          keyFn={(p) => p.id}
          tarjeta={tarjeta}
          puedeMover={(p, destino) => (destino === 'tramite_cfe' && !llevaSolar(p.sistemas) ? 'El trámite de CFE es solo para proyectos con paneles solares.' : true)}
          onMover={async (p, destino) => {
            await cambiarEtapaProyecto(p, destino);
            setProyectos((lista) => (lista || []).map((x) => (x.id === p.id ? { ...x, etapa: destino, etapa_desde: new Date().toISOString() } : x)));
            showToast(`${p.nombre}: ${nombreEtapa(destino, p.sistemas)}`, 'success');
          }}
          onAviso={(t, tipo) => showToast(t, tipo)}
        />
      )}

      {proyectos && visibles.length > 0 && vista === 'lista' && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 lg:grid-cols-2 xl:grid-cols-3">
          {visibles.map((p) => (
            <Link key={p.id} href={`/dashboard/proyectos/${p.cliente_id}/${p.id}`} className="glass rounded-2xl p-3.5 hover:border-teal/60">
              <span className="flex items-center gap-2">
                <span className="flex-1 min-w-0 text-[15px] font-semibold truncate">{p.nombre}</span>
                <ChipEtapa etapa={p.etapa} sistemas={p.sistemas} />
              </span>
              <span className="block text-[13px] text-muted truncate mt-0.5">{p.cliente} · {p.sistemas.map(cortoSistema).join(' · ')}</span>
            </Link>
          ))}
        </div>
      )}
    </SupervisorShell>
  );
}
