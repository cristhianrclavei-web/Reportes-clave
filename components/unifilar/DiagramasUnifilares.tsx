'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Cable, ChevronRight, Search, Sun } from 'lucide-react';
import EstadoVacio from '@/components/EstadoVacio';
import { catalogoEnCache, listarCatalogoClientes, normalizar, type ClienteCatalogo } from '@/lib/clientesCatalogo';
import { NOMBRE_CIRCUITO, type Panel } from '@/lib/lazos';
import type { LazoResumen } from '@/lib/lazosDatos';
import { NOMBRE_TIPO_SISTEMA, kwpTotal, redondear, type Unifilar } from '@/lib/unifilar';
import { listarUnifilares } from '@/lib/unifilaresDatos';

// «Diagramas unifilares» en Diagramas y planos: los de detección (uno por
// circuito: lazo, voceo, estrobos) y los fotovoltaicos, juntos y por
// cliente. Solo para consultar y abrir: los de detección se crean en el
// proyecto o desde el servicio, y los fotovoltaicos en el proyecto solar.

type Filtro = 'todos' | 'deteccion' | 'fotovoltaico';

export default function DiagramasUnifilares({ lazos, paneles, esSupervisor, clienteId, proyectoId }: {
  lazos: LazoResumen[];
  paneles: Panel[];
  esSupervisor: boolean;
  clienteId: string | null;
  proyectoId: string | null;
}) {
  const [fv, setFv] = useState<Unifilar[]>([]);
  const [errorFv, setErrorFv] = useState<string | null>(null);
  const [clientes, setClientes] = useState<ClienteCatalogo[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    setClientes(catalogoEnCache());
    listarCatalogoClientes().then(setClientes).catch(() => {});
    listarUnifilares().then((r) => setFv(r.unifilares)).catch((e) => setErrorFv(e?.message || 'No se pudieron cargar los unifilares fotovoltaicos.'));
  }, [esSupervisor]);

  const nombreCliente = (id: string | null) => (id ? clientes.find((c) => c.id === id)?.nombre || 'Cliente' : 'Sin cliente');
  const nombrePanel = (id: string | null | undefined) => paneles.find((p) => p.id === id)?.nombre || null;
  const enAlcance = (x: { cliente_id: string | null; proyecto_id?: string | null }) =>
    (!clienteId || x.cliente_id === clienteId) && (!proyectoId || x.proyecto_id === proyectoId);

  const grupos = useMemo(() => {
    const q = normalizar(busqueda);
    const porCliente = new Map<string, { deteccion: LazoResumen[]; fv: Unifilar[] }>();
    const meter = (cliente: string | null) => {
      const clave = cliente || '';
      if (!porCliente.has(clave)) porCliente.set(clave, { deteccion: [], fv: [] });
      return porCliente.get(clave)!;
    };
    if (filtro !== 'fotovoltaico') {
      for (const l of lazos.filter(enAlcance)) {
        if (q && !normalizar(`${l.codigo} ${l.nombre} ${nombreCliente(l.cliente_id)} ${nombrePanel(l.panel_id) || ''}`).includes(q)) continue;
        meter(l.cliente_id).deteccion.push(l);
      }
    }
    if (filtro !== 'deteccion') {
      for (const u of fv.filter(enAlcance)) {
        if (q && !normalizar(`${u.nombre} ${nombreCliente(u.cliente_id)}`).includes(q)) continue;
        meter(u.cliente_id).fv.push(u);
      }
    }
    return [...porCliente.entries()].sort((a, b) => nombreCliente(a[0] || null).localeCompare(nombreCliente(b[0] || null), 'es'));
    // nombreCliente y enAlcance dependen de clientes, clienteId y proyectoId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lazos, fv, filtro, busqueda, clientes, clienteId, proyectoId, paneles]);

  const totalDeteccion = lazos.filter(enAlcance).length;
  const totalFv = fv.filter(enAlcance).length;

  return (
    <div data-tour="diagramas-unifilares">
      <p className="text-[14px] text-muted leading-snug mb-3">
        Diagramas de detección (un unifilar por circuito: lazo, voceo y estrobos) y fotovoltaicos para CFE. Aquí se consultan y se abren para corregir;
        {esSupervisor ? ' los de detección se agregan en el proyecto y los fotovoltaicos en el proyecto solar (pestaña Solar → «Crear el unifilar»).' : ' los de detección se agregan desde tu servicio.'}
      </p>
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <label className="relative flex-1 sm:max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar diagrama, cliente o panel"
            className="w-full min-h-[44px] pl-9 pr-3 rounded-xl border border-line bg-surface text-[14px] focus:outline-none focus:border-teal" />
        </label>
        {
          <div className="flex gap-1">
            {([['todos', `Todos · ${totalDeteccion + totalFv}`], ['deteccion', `Detección · ${totalDeteccion}`], ['fotovoltaico', `Fotovoltaicos · ${totalFv}`]] as const).map(([clave, texto]) => (
              <button key={clave} type="button" aria-pressed={filtro === clave} onClick={() => setFiltro(clave)}
                className={`min-h-[42px] px-3 rounded-full border text-[13px] font-semibold whitespace-nowrap ${filtro === clave ? 'bg-teal text-inkOnAccent border-teal' : 'border-line bg-surface text-muted'}`}>
                {texto}
              </button>
            ))}
          </div>
        }
      </div>
      {errorFv && <p className="rounded-xl bg-amber/10 text-amber text-[13px] px-3 py-2 mb-3">{errorFv}</p>}

      {grupos.length === 0 && (
        <EstadoVacio icono={<Cable size={26} strokeWidth={2} />} titulo={busqueda ? 'Ningún diagrama con esa búsqueda' : 'Todavía no hay diagramas unifilares'}
          detalle={esSupervisor ? 'Se crean dentro de cada proyecto.' : 'Se crean desde tu servicio, en «Planos y diagramas del sitio».'} />
      )}

      {grupos.map(([cliente, { deteccion, fv: fotovoltaicos }]) => (
        <section key={cliente || 'sin-cliente'} className="mb-5">
          {!clienteId && <h2 className="font-display font-bold text-[17px] mb-2">{nombreCliente(cliente || null)}</h2>}
          <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-2 xl:grid-cols-3 gap-2">
            {deteccion.map((l) => (
              <Link key={l.id} href={`/lazos/${l.id}`} className="rounded-2xl border border-line bg-surface p-3 flex items-center gap-3 hover:border-teal/60">
                <span className="w-10 h-10 rounded-xl bg-red/10 text-red flex items-center justify-center shrink-0"><Cable size={19} /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[14.5px] font-semibold truncate">{l.codigo} · {l.nombre}</span>
                  <span className="block text-[12.5px] text-muted truncate">
                    {NOMBRE_CIRCUITO[l.tipo]} · {l.dispositivos} {l.dispositivos === 1 ? 'dispositivo' : 'dispositivos'}{nombrePanel(l.panel_id) ? ` · ${nombrePanel(l.panel_id)}` : ''}
                    {l.fallaAbierta ? ' · falla a tierra abierta' : ''}
                  </span>
                </span>
                <ChevronRight size={17} className="text-faint shrink-0" />
              </Link>
            ))}
            {fotovoltaicos.map((u) => (
              <Link key={u.id} href={`/unifilares/${u.id}`} className="rounded-2xl border border-line bg-surface p-3 flex items-center gap-3 hover:border-teal/60">
                <span className="w-10 h-10 rounded-xl bg-amber/15 text-amber flex items-center justify-center shrink-0"><Sun size={19} /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[14.5px] font-semibold truncate">{u.nombre}</span>
                  <span className="block text-[12.5px] text-muted truncate">Fotovoltaico · {NOMBRE_TIPO_SISTEMA[u.tipo]} · {redondear(kwpTotal(u.datos))} kWp</span>
                </span>
                <ChevronRight size={17} className="text-faint shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
