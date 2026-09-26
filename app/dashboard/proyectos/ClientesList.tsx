'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SupervisorShell from '@/components/SupervisorShell';
import ModalOverlay from '@/components/ModalOverlay';
import EmptyIllustration from '@/components/EmptyIllustration';
import { showToast } from '@/components/Toast';
import { ClienteConResumen, listarClientesConResumen, crearCliente } from '@/lib/clientes';
import { DatosCliente, datosClienteVacios, validarDatosCliente } from '@/lib/clienteDatos';
import CamposCliente from '@/components/CamposCliente';
import ClienteAvatar, { fondoAvatar } from '@/components/ClienteAvatar';
import { Plus, Search, MapPin } from 'lucide-react';

export default function ClientesList({ userName }: { userName?: string }) {
  const router = useRouter();
  const [clientes, setClientes] = useState<ClienteConResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [showNuevo, setShowNuevo] = useState(false);
  const [datosNuevo, setDatosNuevo] = useState<DatosCliente>(datosClienteVacios());
  const [creando, setCreando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function cargar() {
    setLoading(true);
    try {
      setClientes(await listarClientesConResumen());
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar los clientes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  const filtrados = useMemo(() => {
    if (!search) return clientes;
    const q = search.toLowerCase();
    return clientes.filter((c) => `${c.nombre} ${c.direccion || ''} ${c.sistemas.join(' ')}`.toLowerCase().includes(q));
  }, [clientes, search]);

  const stats = useMemo(() => {
    const totalProyectos = clientes.reduce((acc, c) => acc + c.total_proyectos, 0);
    const conteoSistemas = new Map<string, number>();
    for (const c of clientes) {
      for (const s of c.sistemas) conteoSistemas.set(s, (conteoSistemas.get(s) || 0) + 1);
    }
    const sistemasTop = [...conteoSistemas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { totalProyectos, sistemasTop };
  }, [clientes]);

  async function handleCrear() {
    const errorDatos = validarDatosCliente(datosNuevo);
    if (errorDatos) {
      setMsg(errorDatos);
      return;
    }
    setCreando(true);
    setMsg(null);
    try {
      const id = await crearCliente(datosNuevo);
      showToast('Cliente creado', 'success');
      router.push(`/dashboard/proyectos/${id}`);
    } catch (e: any) {
      setMsg(e?.message || 'No se pudo crear');
      setCreando(false);
    }
  }

  return (
    <SupervisorShell active="proyectos" volver title="Clientes y proyectos" userName={userName}>
      {error && (
        <div className="mb-4 p-4 rounded-2xl bg-red/10 border border-red/30">
          <p className="text-[14px] font-semibold text-red mb-1">No se pudieron cargar los clientes</p>
          <p className="text-[13px] text-ink/80 leading-relaxed">{error}</p>
        </div>
      )}

      {!loading && clientes.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <div className="ambient-glow edge-highlight rounded-2xl border border-line bg-surface p-4">
            <p className="text-[26px] font-display font-bold leading-none tracking-tight">{clientes.length}</p>
            <p className="text-[11.5px] text-muted mt-1.5">{clientes.length === 1 ? 'Cliente' : 'Clientes'}</p>
          </div>
          <div className="ambient-glow edge-highlight rounded-2xl border border-line bg-surface p-4">
            <p className="text-[26px] font-display font-bold leading-none tracking-tight">{stats.totalProyectos}</p>
            <p className="text-[11.5px] text-muted mt-1.5">{stats.totalProyectos === 1 ? 'Proyecto' : 'Proyectos'}</p>
          </div>
          <div className="ambient-glow edge-highlight rounded-2xl border border-line bg-surface p-4 col-span-2">
            <p className="text-[11.5px] text-muted mb-2">Sistemas más frecuentes</p>
            {stats.sistemasTop.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {stats.sistemasTop.map(([s, n]) => (
                  <span key={s} className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-surface-2 border border-line whitespace-nowrap">
                    {s} <span className="text-faint">· {n}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] text-faint">Sin proyectos todavía</p>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2.5 mb-4">
        <div className="relative flex-1">
          <Search size={16} strokeWidth={2.4} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente, dirección o sistema..."
            className="w-full pl-10 pr-3.5 min-h-[48px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14.5px]"
          />
        </div>
        <button
          onClick={() => { setShowNuevo(true); setDatosNuevo(datosClienteVacios()); setMsg(null); }}
          className="shrink-0 min-h-[48px] px-4 rounded-xl bg-teal text-inkOnAccent font-display font-semibold text-[13.5px] flex items-center gap-1.5 transition-all duration-150 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:scale-95 shadow-glow-teal"
        >
          <Plus size={17} strokeWidth={2.4} />
          <span className="hidden sm:inline">Nuevo cliente</span>
        </button>
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl shrink-0 skeleton-shimmer" />
                <div className="min-w-0 flex-1">
                  <div className="h-3.5 w-3/4 rounded-full skeleton-shimmer mb-2" />
                  <div className="h-2.5 w-1/2 rounded-full skeleton-shimmer" />
                </div>
              </div>
              <div className="flex gap-1.5">
                <div className="h-5 w-14 rounded-full skeleton-shimmer" />
                <div className="h-5 w-10 rounded-full skeleton-shimmer" />
              </div>
              <div className="h-2.5 w-1/3 rounded-full skeleton-shimmer mt-3 pt-2.5 border-t border-dashed border-line" />
            </div>
          ))}
        </div>
      )}

      {!loading && filtrados.length === 0 && (
        <div className="flex flex-col items-center py-14 text-center">
          <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-line flex items-center justify-center mb-3.5">
            <EmptyIllustration variante="clientes" />
          </div>
          <p className="text-[14.5px] font-medium mb-1">
            {clientes.length === 0 ? 'Todavía no hay clientes' : 'Sin resultados'}
          </p>
          <p className="text-[13px] text-muted leading-relaxed max-w-[260px]">
            {clientes.length === 0 ? 'Agrega el primero para empezar a llevar sus proyectos y documentación.' : 'Prueba con otro nombre, dirección o sistema.'}
          </p>
        </div>
      )}

      {!loading && filtrados.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtrados.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/proyectos/${c.id}`}
              className="group ambient-glow edge-highlight block rounded-2xl border border-line bg-surface overflow-hidden transition-all duration-150 hover:-translate-y-1 hover:shadow-diffuse hover:border-line-strong active:translate-y-0 active:scale-[0.98]"
            >
              {c.foto_portada_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.foto_portada_url} alt="" className="w-full h-24 object-cover" />
              )}
              <div className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-12 h-12 rounded-xl border border-line overflow-hidden flex items-center justify-center shrink-0 ${c.logo_url ? 'bg-white' : fondoAvatar(c.tipo_persona)}`}>
                  {c.logo_url ? (
                    // Un logo no se recorta: se ajusta completo al cuadro, sea ancho, alto o cuadrado.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.logo_url} alt="" className="w-full h-full object-contain p-1" />
                  ) : (
                    <ClienteAvatar tipo={c.tipo_persona} size={34} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display font-bold text-[15.5px] leading-tight tracking-tight truncate transition-colors group-hover:text-teal">{c.nombre}</p>
                  {c.direccion && (
                    <p className="text-[11.5px] text-muted flex items-center gap-1 mt-0.5 truncate">
                      <MapPin size={10} strokeWidth={2.4} className="shrink-0" /> {c.direccion}
                    </p>
                  )}
                </div>
              </div>

              {c.sistemas.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {c.sistemas.slice(0, 4).map((s) => (
                    <span key={s} className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-surface-2 text-muted border border-line whitespace-nowrap">{s}</span>
                  ))}
                  {c.sistemas.length > 4 && <span className="text-[10.5px] text-faint">+{c.sistemas.length - 4}</span>}
                </div>
              ) : (
                <p className="text-[12px] text-faint">Sin proyectos todavía</p>
              )}

              <p className="text-[11px] text-faint mt-3 pt-2.5 border-t border-dashed border-line">
                {c.total_proyectos} {c.total_proyectos === 1 ? 'proyecto' : 'proyectos'}
              </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showNuevo && (
        <ModalOverlay onClose={() => setShowNuevo(false)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[92vh] overflow-y-auto">
            <p className="font-display font-semibold text-[16px] mb-3.5">Nuevo cliente</p>
            <div className="mb-4">
              <CamposCliente valor={datosNuevo} onChange={setDatosNuevo} />
            </div>
            {msg && <div className="text-sm px-4 py-3 mb-3.5 rounded-xl bg-red/10 text-red border border-red/30">{msg}</div>}
            <div className="flex gap-2">
              <button onClick={() => setShowNuevo(false)} className="flex-1 min-h-[48px] rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium">Cancelar</button>
              <button onClick={handleCrear} disabled={creando} className="flex-1 min-h-[48px] rounded-xl bg-teal text-inkOnAccent text-[14.5px] font-semibold disabled:opacity-50">
                {creando ? 'Creando...' : 'Crear cliente'}
              </button>
            </div>
            <p className="text-[11.5px] text-faint mt-2.5 text-center">Después puedes agregar foto, contactos y sus proyectos.</p>
          </div>
        </ModalOverlay>
      )}
    </SupervisorShell>
  );
}
