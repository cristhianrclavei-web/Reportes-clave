'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SupervisorShell from '@/components/SupervisorShell';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import { ClienteConResumen, listarClientesConResumen, crearCliente } from '@/lib/clientes';
import { Plus, Search, Building2, MapPin } from 'lucide-react';

const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5';
const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal-glow text-[15px] transition-colors placeholder:text-faint';

export default function ClientesList({ userName }: { userName?: string }) {
  const router = useRouter();
  const [clientes, setClientes] = useState<ClienteConResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [showNuevo, setShowNuevo] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [direccionNueva, setDireccionNueva] = useState('');
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

  async function handleCrear() {
    if (!nombreNuevo.trim()) {
      setMsg('Falta el nombre del cliente.');
      return;
    }
    setCreando(true);
    setMsg(null);
    try {
      const id = await crearCliente({ nombre: nombreNuevo, direccion: direccionNueva });
      showToast('Cliente creado', 'success');
      router.push(`/dashboard/proyectos/${id}`);
    } catch (e: any) {
      setMsg(e?.message || 'No se pudo crear');
      setCreando(false);
    }
  }

  return (
    <SupervisorShell active="proyectos" title="Proyectos" userName={userName}>
      {error && (
        <div className="mb-4 p-4 rounded-2xl bg-red/10 border border-red/30">
          <p className="text-[14px] font-semibold text-red mb-1">No se pudieron cargar los clientes</p>
          <p className="text-[13px] text-ink/80 leading-relaxed">{error}</p>
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
          onClick={() => { setShowNuevo(true); setNombreNuevo(''); setDireccionNueva(''); setMsg(null); }}
          className="shrink-0 min-h-[48px] px-4 rounded-xl bg-teal text-inkOnAccent font-display font-semibold text-[13.5px] flex items-center gap-1.5 active:scale-95 transition-transform shadow-glow-teal"
        >
          <Plus size={17} strokeWidth={2.4} />
          <span className="hidden sm:inline">Nuevo cliente</span>
        </button>
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-[132px] rounded-2xl bg-surface-2 animate-pulse" />)}
        </div>
      )}

      {!loading && filtrados.length === 0 && (
        <p className="text-center text-muted py-14 text-[14px] leading-relaxed">
          {clientes.length === 0 ? 'Todavía no hay clientes. Agrega el primero.' : 'Sin resultados para esa búsqueda.'}
        </p>
      )}

      {!loading && filtrados.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtrados.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/proyectos/${c.id}`}
              className="block rounded-2xl border border-line bg-surface p-4 active:scale-[0.98] hover:shadow-glow hover:border-line-strong transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-surface-2 border border-line overflow-hidden flex items-center justify-center shrink-0">
                  {c.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.logo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Building2 size={20} strokeWidth={1.8} className="text-faint" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display font-bold text-[15.5px] leading-tight truncate">{c.nombre}</p>
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
            </Link>
          ))}
        </div>
      )}

      {showNuevo && (
        <ModalOverlay onClose={() => setShowNuevo(false)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[92vh] overflow-y-auto">
            <p className="font-display font-semibold text-[16px] mb-3.5">Nuevo cliente</p>
            <label className={labelCls}>Nombre / Empresa *</label>
            <input value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} placeholder="Ej. Aislantes y Empaques" className={`${inputCls} mb-3`} />
            <label className={labelCls}>Dirección (opcional)</label>
            <input value={direccionNueva} onChange={(e) => setDireccionNueva(e.target.value)} placeholder="Calle, colonia, ciudad..." className={`${inputCls} mb-4`} />
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
