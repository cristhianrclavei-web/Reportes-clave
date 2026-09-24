'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SupervisorShell from '@/components/SupervisorShell';
import TablaLista, { ColumnaTabla } from '@/components/TablaLista';
import { VistaCondicional } from '@/lib/vistaSupervisor';
import { ProyectoConCliente, EstadoProyecto, SISTEMAS_SUGERIDOS, crearProyecto } from '@/lib/proyectos';
import { showToast } from '@/components/Toast';
import { Plus, Search, Building2, ChevronRight } from 'lucide-react';

const ESTADO_CLS: Record<EstadoProyecto, string> = {
  propuesta: 'bg-amber/15 text-amber border-amber/30',
  en_curso: 'bg-teal/15 text-teal border-teal/30',
  concluido: 'bg-surface-2 text-muted border-line',
};
const ESTADO_LABEL: Record<EstadoProyecto, string> = {
  propuesta: 'Propuesta',
  en_curso: 'En curso',
  concluido: 'Concluido',
};

function EstadoChip({ estado }: { estado: EstadoProyecto }) {
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${ESTADO_CLS[estado]}`}>
      {ESTADO_LABEL[estado]}
    </span>
  );
}

function formatFecha(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal-glow text-[15px] transition-colors placeholder:text-faint';
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5';

export default function ProyectosList({
  proyectos,
  userName,
  errorCarga,
}: {
  proyectos: ProyectoConCliente[];
  userName?: string;
  errorCarga?: string | null;
}) {
  const router = useRouter();
  const [seccion, setSeccion] = useState<'nuevo' | 'proyectos'>('proyectos');
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<EstadoProyecto | 'todos'>('todos');

  const [clienteNombre, setClienteNombre] = useState('');
  const [sistema, setSistema] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const nombresClientes = useMemo(
    () => Array.from(new Set(proyectos.map((p) => p.cliente_nombre))).sort(),
    [proyectos]
  );

  const filtrados = useMemo(() => {
    return proyectos.filter((p) => {
      if (filtroEstado !== 'todos' && p.estado !== filtroEstado) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${p.cliente_nombre} ${p.sistema} ${p.descripcion || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [proyectos, search, filtroEstado]);

  async function handleCrear() {
    if (!clienteNombre.trim() || !sistema.trim()) {
      setMsg('Falta el cliente/empresa o el sistema.');
      return;
    }
    setGuardando(true);
    setMsg(null);
    try {
      const id = await crearProyecto({ clienteNombre, sistema, descripcion });
      showToast('Proyecto creado', 'success');
      router.push(`/dashboard/proyectos/${id}`);
    } catch (e: any) {
      setMsg('Error al guardar: ' + (e?.message || 'error desconocido'));
      setGuardando(false);
    }
  }

  const columnas: ColumnaTabla<ProyectoConCliente>[] = [
    { header: 'Cliente / Empresa', render: (p) => <span className="font-semibold">{p.cliente_nombre}</span> },
    { header: 'Sistema', render: (p) => p.sistema },
    { header: 'Estado', render: (p) => <EstadoChip estado={p.estado} /> },
    { header: 'Actualizado', render: (p) => formatFecha(p.updated_at) },
  ];

  return (
    <SupervisorShell active="proyectos" title="Proyectos" userName={userName}>
      {errorCarga && (
        <div className="mb-4 p-4 rounded-2xl bg-red/10 border border-red/30">
          <p className="text-[14px] font-semibold text-red mb-1">No se pudieron cargar los proyectos</p>
          <p className="text-[13px] text-ink/80 leading-relaxed">{errorCarga}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-5">
        <button
          onClick={() => setSeccion('nuevo')}
          className={`min-h-[54px] px-2 rounded-2xl text-[13.5px] font-display font-semibold border transition-colors flex items-center justify-center gap-1.5 ${
            seccion === 'nuevo' ? 'bg-teal text-inkOnAccent border-teal shadow-glow-teal' : 'bg-surface-2 border-line-strong text-ink/80'
          }`}
        >
          <Plus size={17} strokeWidth={2.4} className="shrink-0" />
          Agregar cliente o proyecto
        </button>
        <button
          onClick={() => setSeccion('proyectos')}
          className={`min-h-[54px] px-2 rounded-2xl text-[13.5px] font-display font-semibold border transition-colors flex items-center justify-center gap-1.5 ${
            seccion === 'proyectos' ? 'bg-teal text-inkOnAccent border-teal shadow-glow-teal' : 'bg-surface-2 border-line-strong text-ink/80'
          }`}
        >
          <Building2 size={17} strokeWidth={2.4} className="shrink-0" />
          Proyectos
        </button>
      </div>

      {seccion === 'nuevo' && (
        <div className="glass rounded-2xl p-4">
          <p className="font-display font-semibold text-[13px] uppercase tracking-wider text-teal mb-3.5 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-teal inline-block" /> Nuevo proyecto
          </p>

          <label className={labelCls}>Cliente / Empresa *</label>
          <input
            list="clientes-existentes"
            value={clienteNombre}
            onChange={(e) => setClienteNombre(e.target.value)}
            placeholder="Ej. Aislantes y Empaques"
            className={`${inputCls} mb-3.5`}
          />
          <datalist id="clientes-existentes">
            {nombresClientes.map((n) => <option key={n} value={n} />)}
          </datalist>
          <p className="text-[11.5px] text-faint -mt-2.5 mb-3.5">
            Si ya existe ese cliente, aparece en las sugerencias — así no se duplica.
          </p>

          <label className={labelCls}>Sistema *</label>
          <input
            list="sistemas-sugeridos"
            value={sistema}
            onChange={(e) => setSistema(e.target.value)}
            placeholder="Ej. CCTV"
            className={`${inputCls} mb-3.5`}
          />
          <datalist id="sistemas-sugeridos">
            {SISTEMAS_SUGERIDOS.map((s) => <option key={s} value={s} />)}
          </datalist>

          <label className={labelCls}>Descripción del sistema</label>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Qué incluye, alcance, notas del sitio..."
            className={`${inputCls} min-h-[80px] mb-4`}
          />

          {msg && <div className="text-sm px-4 py-3 mb-3.5 rounded-xl bg-red/10 text-red border border-red/30">{msg}</div>}

          <button
            onClick={handleCrear}
            disabled={guardando}
            className="w-full min-h-[52px] rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15px] active:scale-95 transition-transform disabled:opacity-60 shadow-glow-teal"
          >
            {guardando ? 'Guardando...' : 'Crear proyecto'}
          </button>
          <p className="text-[11.5px] text-faint mt-2.5 text-center">
            Después de crearlo puedes vincular cotizaciones, cambiar el estado y subir documentación.
          </p>
        </div>
      )}

      {seccion === 'proyectos' && (
        <>
          <div className="relative mb-3.5">
            <Search size={16} strokeWidth={2.4} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por cliente, sistema o descripción..."
              className="w-full pl-10 pr-3.5 min-h-[48px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14.5px]"
            />
          </div>

          <div className="flex gap-1.5 p-1 rounded-xl bg-surface-2 border border-line mb-4 w-fit">
            {(['todos', 'propuesta', 'en_curso', 'concluido'] as const).map((e) => (
              <button
                key={e}
                onClick={() => setFiltroEstado(e)}
                className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors whitespace-nowrap ${
                  filtroEstado === e ? 'bg-teal text-inkOnAccent' : 'text-muted'
                }`}
              >
                {e === 'todos' ? 'Todos' : ESTADO_LABEL[e]}
              </button>
            ))}
          </div>

          {filtrados.length === 0 && (
            <p className="text-center text-muted py-14 text-[14px] leading-relaxed">
              {proyectos.length === 0 ? 'Todavía no hay proyectos.' : 'Sin resultados.'}
            </p>
          )}

          {filtrados.length > 0 && (
            <VistaCondicional
              tabla={
                <TablaLista
                  columnas={columnas}
                  filas={filtrados}
                  keyFn={(p) => p.id}
                  hrefFn={(p) => `/dashboard/proyectos/${p.id}`}
                />
              }
              tarjetas={
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filtrados.map((p) => (
                    <Link
                      key={p.id}
                      href={`/dashboard/proyectos/${p.id}`}
                      className="block rounded-2xl border-l-4 border-teal bg-surface p-4 sm:p-5 active:scale-[0.99] hover:shadow-glow transition-all shadow-glow"
                    >
                      <div className="flex justify-between items-start gap-3 mb-2.5">
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Cliente / Empresa</div>
                          <strong className="font-display font-bold text-[16px] tracking-wide block truncate">{p.cliente_nombre}</strong>
                        </div>
                        <ChevronRight size={18} strokeWidth={2.4} className="text-faint shrink-0 mt-1" />
                      </div>

                      <p className="text-[14px] font-medium mb-2">{p.sistema}</p>
                      {p.descripcion && <p className="text-[12.5px] text-muted mb-3 line-clamp-2">{p.descripcion}</p>}

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-dashed border-line-strong">
                        <EstadoChip estado={p.estado} />
                        <span className="text-[11.5px] text-faint">{formatFecha(p.updated_at)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              }
            />
          )}
        </>
      )}
    </SupervisorShell>
  );
}
