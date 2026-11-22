'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cable, ChevronRight, CircuitBoard, Map as IconoPlano, Plus } from 'lucide-react';
import { showToast } from '@/components/Toast';
import FormPanel from '@/components/lazos/FormPanel';
import NuevoPlano from '@/components/lazos/NuevoPlano';
import { NuevoLazo } from '@/app/lazos/LazosList';
import { createClient } from '@/lib/supabaseClient';
import { catalogoEnCache, listarCatalogoClientes } from '@/lib/clientesCatalogo';
import { listarLazos, listarPaneles, type LazoResumen } from '@/lib/lazosDatos';
import { listarPlanos, type PlanoResumen } from '@/lib/planosDatos';
import { moverAProyecto } from '@/lib/proyectoContenido';
import { nombreSistema } from '@/lib/proyectosEtapas';
import type { Panel } from '@/lib/lazos';

// Dentro del servicio del técnico: los planos, paneles y circuitos del sitio
// y los botones para agregar. Lo nuevo queda en el proyecto del servicio; si
// el servicio no tiene proyecto (un mantenimiento), en la instalación
// existente del cliente, que se crea sola la primera vez.

async function instalacionDelCliente(clienteId: string, sistema: string): Promise<string> {
  const { data, error } = await createClient().rpc('instalacion_del_cliente', { p_cliente: clienteId, p_sistema: sistema });
  if (error || !data) throw new Error('No se pudo preparar la instalación del cliente. Revisa tu señal e intenta de nuevo.');
  return data as string;
}

export default function DiagramasDelServicio({ clienteId, proyectoId }: { clienteId: string | null | undefined; proyectoId: string | null | undefined }) {
  const [lazos, setLazos] = useState<LazoResumen[]>([]);
  const [paneles, setPaneles] = useState<Panel[]>([]);
  const [planos, setPlanos] = useState<PlanoResumen[]>([]);
  const [nombreCliente, setNombreCliente] = useState('');
  const [cargado, setCargado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<'lazo' | 'plano' | 'panel' | null>(null);
  const [obraLazo, setObraLazo] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);

  useEffect(() => {
    if (!clienteId) return;
    let vigente = true;
    const cliente = catalogoEnCache().find((c) => c.id === clienteId);
    if (cliente) setNombreCliente(cliente.nombre);
    listarCatalogoClientes().then((l) => { if (vigente) setNombreCliente(l.find((c) => c.id === clienteId)?.nombre || ''); }).catch(() => {});
    Promise.all([listarLazos(), listarPaneles(), listarPlanos()])
      .then(([l, p, pl]) => {
        if (!vigente) return;
        // Lo del proyecto del servicio; sin proyecto, todo lo del cliente.
        const delSitio = (x: { cliente_id: string; proyecto_id?: string | null }) => x.cliente_id === clienteId && (!proyectoId || x.proyecto_id === proyectoId);
        setLazos(l.lazos.filter(delSitio));
        setPaneles(p.paneles.filter(delSitio));
        setPlanos(pl.planos.filter(delSitio));
        setCargado(true);
      })
      .catch((e) => { if (vigente) setError(e?.message || 'No se pudieron cargar los planos del sitio.'); });
    return () => { vigente = false; };
  }, [clienteId, proyectoId]);

  if (!clienteId) return null;
  const cliente = { id: clienteId, nombre: nombreCliente || 'Cliente' };
  const obra = (sistema: string) => (proyectoId ? Promise.resolve(proyectoId) : instalacionDelCliente(clienteId, sistema));

  async function nuevoCircuito() {
    setPreparando(true);
    try {
      setObraLazo(await obra('deteccion'));
      setAbierto('lazo');
    } catch (e: any) {
      showToast(e?.message || 'No se pudo preparar el circuito.', 'error');
    } finally {
      setPreparando(false);
    }
  }

  const BOTON = 'min-h-[44px] px-3 rounded-xl border border-line bg-surface text-[13.5px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60';

  return (
    <section className="mb-5" data-tour="diagramas-servicio">
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted mb-2">Planos y diagramas del sitio</p>
      {error && <p className="text-[13px] text-amber bg-amber/10 rounded-xl px-3 py-2 mb-2">{error}</p>}
      {cargado && (
        <div className="flex flex-col gap-2 mb-2">
          {planos.map((p) => (
            <Link key={p.id} href={`/lazos/plano/${p.id}`} className="rounded-2xl border border-line bg-surface p-3 flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-sky-500/15 text-sky-500 flex items-center justify-center shrink-0"><IconoPlano size={19} /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-[14.5px] font-semibold truncate">{p.nombre}</span>
                <span className="block text-[12.5px] text-muted">Plano · {nombreSistema(p.sistema || 'deteccion')}</span>
              </span>
              <ChevronRight size={18} className="text-muted shrink-0" />
            </Link>
          ))}
          {paneles.map((p) => (
            <Link key={p.id} href={`/lazos/panel/${p.id}`} className="rounded-2xl border border-line bg-surface p-3 flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-red/10 text-red flex items-center justify-center shrink-0"><CircuitBoard size={19} /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-[14.5px] font-semibold truncate">{p.nombre}</span>
                <span className="block text-[12.5px] text-muted">Panel · {lazos.filter((l) => l.panel_id === p.id).length} circuitos</span>
              </span>
              <ChevronRight size={18} className="text-muted shrink-0" />
            </Link>
          ))}
          {lazos.filter((l) => !l.panel_id).map((l) => (
            <Link key={l.id} href={`/lazos/${l.id}`} className="rounded-2xl border border-line bg-surface p-3 flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-teal/15 text-teal flex items-center justify-center shrink-0"><Cable size={19} /></span>
              <span className="flex-1 min-w-0 text-[14.5px] font-semibold truncate">{l.codigo} · {l.nombre}</span>
              <ChevronRight size={18} className="text-muted shrink-0" />
            </Link>
          ))}
          {planos.length + paneles.length + lazos.length === 0 && (
            <p className="text-[13px] text-muted">Todavía no hay planos ni diagramas de este sitio.</p>
          )}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <button type="button" className={BOTON} disabled={preparando} onClick={nuevoCircuito}><Plus size={15} /> Circuito</button>
        <button type="button" className={BOTON} onClick={() => setAbierto('plano')}><Plus size={15} /> Plano</button>
        <button type="button" className={BOTON} onClick={() => setAbierto('panel')}><Plus size={15} /> Panel</button>
      </div>
      {!proyectoId && <p className="text-[11.5px] text-muted mt-1.5">Este servicio no es de una obra: lo que agregues queda en la instalación existente del cliente.</p>}

      {abierto === 'lazo' && obraLazo && (
        <NuevoLazo clienteInicial={cliente} lazosExistentes={lazos} paneles={paneles} proyectoId={obraLazo}
          onCerrar={() => setAbierto(null)} onCreado={(id) => { window.location.href = `/lazos/${id}`; }} />
      )}
      {abierto === 'plano' && (
        <NuevoPlano clienteInicial={cliente} proyectoId={proyectoId || null} resolverProyecto={proyectoId ? undefined : (s) => instalacionDelCliente(clienteId, s)}
          onCerrar={() => setAbierto(null)} onCreado={(id) => { window.location.href = `/lazos/plano/${id}`; }} />
      )}
      {abierto === 'panel' && (
        <FormPanel clienteInicial={cliente} esSupervisor={false} onCerrar={() => setAbierto(null)}
          onGuardado={async (panel) => {
            if (!panel) return;
            try {
              await moverAProyecto({ tipo: 'panel', id: panel.id }, await obra('deteccion'));
            } catch (e: any) {
              showToast(e?.message || 'El panel se creó, pero no quedó en el proyecto.', 'error');
            }
            window.location.href = `/lazos/panel/${panel.id}`;
          }} />
      )}
    </section>
  );
}
