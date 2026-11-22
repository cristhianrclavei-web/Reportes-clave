'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Cable, Check, ChevronRight, FolderOpen, FolderInput, Plus, Wrench } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import TableroKanban, { InterruptorTablero, useVistaTablero, type ColumnaKanban } from '@/components/TableroKanban';
import { showToast } from '@/components/Toast';
import FormProyecto from '@/components/proyectos/FormProyecto';
import { ChipEtapa } from '@/components/proyectos/EtapasProyecto';
import { TituloSeccion } from '@/components/proyectos/ContenidoLista';
import type { ProyectoResumen } from '@/lib/clientes';
import { cambiarEtapaProyecto, crearProyecto } from '@/lib/proyectos';
import { contenidoSinProyecto, moverAProyecto, NOMBRE_CONTENIDO, totalDe, type Contenido, type ElementoContenido, type TipoContenido } from '@/lib/proyectoContenido';
import { SISTEMAS, cortoSistema, llevaSolar, nombreEtapa, tonoEtapa, type Etapa, type SistemaClave } from '@/lib/proyectosEtapas';

// En la ficha del cliente: sus proyectos (obras) por etapa y, abajo, lo
// suyo que todavía no está en ningún proyecto, para acomodarlo.

const TODAS: Etapa[] = ['prospecto', 'cotizado', 'vendido', 'instalacion', 'tramite_cfe', 'terminado', 'cancelado'];

export function columnasEtapa(conSolar: boolean): ColumnaKanban<Etapa>[] {
  return TODAS.filter((e) => conSolar || e !== 'tramite_cfe').map((e) => ({
    clave: e,
    titulo: e === 'terminado' ? (conSolar ? 'Terminado / Interconectado' : 'Terminado') : nombreEtapa(e, conSolar ? ['solar'] : []),
    punto: tonoEtapa(e).punto,
    vacio: e === 'prospecto' ? 'Interesados sin cotizar' : e === 'tramite_cfe' ? 'Solo proyectos con paneles solares' : undefined,
  }));
}

export default function ProyectosDelCliente({ clienteId, clienteNombre, proyectos, onCambio }: {
  clienteId: string;
  clienteNombre: string;
  proyectos: ProyectoResumen[];
  onCambio: () => void;
}) {
  const router = useRouter();
  const [vista, setVista] = useVistaTablero('proyectos');
  const [nuevo, setNuevo] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [local, setLocal] = useState<Record<string, Etapa>>({});
  const lista = proyectos.map((p) => ({ ...p, etapa: local[p.id] || p.etapa }));
  const conSolar = lista.some((p) => llevaSolar(p.sistemas));
  const ordenados = [...lista].sort((a, b) => TODAS.indexOf(a.etapa) - TODAS.indexOf(b.etapa) || a.nombre.localeCompare(b.nombre, 'es'));

  return (
    <section className="mb-6" data-tour="proyectos-cliente">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="font-display font-semibold text-[16px]">Proyectos</p>
        <div className="flex items-center gap-2">
          {lista.length > 0 && <InterruptorTablero vista={vista} onCambiar={setVista} />}
          {!lista.some((p) => p.tipo === 'instalacion') && (
            <button type="button" onClick={() => setRegistrando(true)} data-tour="registrar-instalacion"
              className="min-h-[42px] px-3.5 rounded-xl border border-line bg-surface-2 text-[13.5px] font-semibold flex items-center gap-1.5 hover:border-teal/60">
              <Wrench size={15} /> Instalación existente
            </button>
          )}
          <button type="button" onClick={() => setNuevo(true)}
            className="min-h-[42px] px-4 rounded-xl bg-teal text-inkOnAccent text-[13.5px] font-display font-semibold flex items-center gap-1.5 shadow-glow-teal">
            <Plus size={16} strokeWidth={2.6} /> Nuevo proyecto
          </button>
        </div>
      </div>

      {lista.length === 0 && (
        <div className="glass rounded-2xl text-center py-10 px-4 mb-4">
          <FolderOpen size={28} strokeWidth={1.6} className="text-faint mx-auto mb-2.5" />
          <p className="text-[14px] font-semibold">Sin proyectos todavía</p>
          <p className="text-[13px] text-muted mt-1">Un proyecto es una obra o contrato: ahí van sus sistemas, planos, cotizaciones, servicios y pagos.</p>
        </div>
      )}

      {vista === 'tablero' && lista.length > 0 && (
        <TableroKanban<(typeof lista)[number], Etapa>
          columnas={columnasEtapa(conSolar)}
          items={lista}
          columnaDe={(p) => p.etapa}
          keyFn={(p) => p.id}
          puedeMover={(p, destino) => (destino === 'tramite_cfe' && !llevaSolar(p.sistemas) ? 'El trámite de CFE es solo para proyectos con paneles solares.' : true)}
          onMover={async (p, destino) => {
            await cambiarEtapaProyecto({ id: p.id, nombre: p.nombre, sistemas: p.sistemas }, destino);
            setLocal((l) => ({ ...l, [p.id]: destino }));
            showToast(`${p.nombre}: ${nombreEtapa(destino, p.sistemas)}`, 'success');
          }}
          onAviso={(t, tipo) => showToast(t, tipo)}
          tarjeta={(p) => (
            <Link href={`/dashboard/proyectos/${clienteId}/${p.id}`} draggable={false} className="group block px-3 pt-3 pb-1.5">
              <strong className="block text-[14px] font-semibold leading-snug group-hover:text-teal">{p.nombre}</strong>
              <span className="block text-[12px] text-teal font-medium truncate mt-0.5">{p.sistemas.map(cortoSistema).join(' · ')}</span>
            </Link>
          )}
        />
      )}

      {vista === 'lista' && lista.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 lg:grid-cols-2">
          {ordenados.map((p) => (
            <Link key={p.id} href={`/dashboard/proyectos/${clienteId}/${p.id}`}
              className="glass rounded-2xl p-3.5 flex items-center gap-3 hover:border-teal/60 transition-colors">
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-semibold truncate">{p.nombre}</span>
                <span className="flex flex-wrap items-center gap-1.5 mt-1">
                  <ChipEtapa etapa={p.etapa} sistemas={p.sistemas} tipo={p.tipo} />
                  <span className="text-[12px] text-muted truncate">{p.sistemas.map(cortoSistema).join(' · ')}</span>
                </span>
              </span>
              <ChevronRight size={17} className="text-faint shrink-0" />
            </Link>
          ))}
        </div>
      )}

      <SinProyecto clienteId={clienteId} proyectos={lista} onMovido={onCambio} />

      <Link href={`/dashboard/diagramas?cliente=${clienteId}`} className="glass rounded-2xl p-3.5 mt-3 flex items-center gap-3 hover:border-teal/60 transition-colors">
        <Cable size={20} className="text-teal shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-[14px]">Todos los diagramas y planos de {clienteNombre}</span>
          <span className="block text-[12.5px] text-muted">Paneles, lazos, planos, guías y unifilares, de todos sus proyectos</span>
        </span>
        <ChevronRight size={17} className="text-faint shrink-0" />
      </Link>

      {registrando && (
        <RegistrarInstalacion clienteId={clienteId} clienteNombre={clienteNombre} onCerrar={() => setRegistrando(false)}
          onListo={(id) => router.push(`/dashboard/proyectos/${clienteId}/${id}`)} />
      )}
      {nuevo && (
        <FormProyecto clienteId={clienteId} clienteNombre={clienteNombre} onCerrar={() => setNuevo(false)}
          onGuardado={(id) => router.push(`/dashboard/proyectos/${clienteId}/${id}`)} />
      )}
    </section>
  );
}

// Lo del cliente sin proyecto: se muestra solo si hay algo, con «Mover a…».
function SinProyecto({ clienteId, proyectos, onMovido }: {
  clienteId: string;
  proyectos: (ProyectoResumen & { etapa: Etapa })[];
  onMovido: () => void;
}) {
  const [contenido, setContenido] = useState<Contenido | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [moviendo, setMoviendo] = useState<string | null>(null);

  async function cargar() {
    setError(null);
    try {
      setContenido(await contenidoSinProyecto(clienteId));
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar lo que no tiene proyecto.');
    }
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clienteId]);

  const grupos = useMemo(() => (contenido
    ? (Object.keys(contenido) as TipoContenido[]).map((t) => ({ tipo: t, elementos: contenido[t] })).filter((g) => g.elementos.length > 0)
    : []), [contenido]);

  async function mover(e: ElementoContenido, proyectoId: string) {
    if (!proyectoId) return;
    setMoviendo(e.id);
    try {
      await moverAProyecto(e, proyectoId);
      showToast(`Movido a ${proyectos.find((p) => p.id === proyectoId)?.nombre}`, 'success');
      await cargar();
      onMovido();
    } catch (err: any) {
      showToast(err?.message || 'No se pudo mover.', 'error');
    } finally {
      setMoviendo(null);
    }
  }

  if (error) return <p className="rounded-xl bg-red/10 text-red text-[13.5px] px-3 py-2 mt-3">{error} <button type="button" onClick={cargar} className="underline font-semibold">Reintentar</button></p>;
  if (!contenido) return null;
  const total = totalDe(contenido);
  if (total === 0) return null;

  return (
    <div className="mt-4 rounded-2xl border border-dashed border-line p-3.5" data-tour="sin-proyecto">
      <button type="button" onClick={() => setAbierto(!abierto)} className="w-full flex items-center gap-2.5 text-left">
        <FolderInput size={18} className="text-amber shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-semibold">Sin proyecto · {total}</span>
          <span className="block text-[12.5px] text-muted">
            {grupos.map((g) => `${g.elementos.length} ${g.elementos.length === 1 ? NOMBRE_CONTENIDO[g.tipo].uno.toLowerCase() : NOMBRE_CONTENIDO[g.tipo].varios.toLowerCase()}`).join(', ')}
          </span>
        </span>
        <span className="text-[13px] font-semibold text-teal">{abierto ? 'Ocultar' : 'Acomodar'}</span>
      </button>
      {abierto && (
        <div className="mt-3">
          {proyectos.length === 0 && <p className="text-[13px] text-amber mb-2">Crea un proyecto para poder mover estas cosas a él.</p>}
          {grupos.map((g) => (
            <div key={g.tipo} className="mb-3">
              <TituloSeccion titulo={NOMBRE_CONTENIDO[g.tipo].varios} cuenta={g.elementos.length} />
              <div className="grid gap-1.5">
                {g.elementos.map((e) => (
                  <div key={`${e.tipo}-${e.id}`} className="rounded-xl bg-surface-2 border border-line p-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
                    <Link href={e.enlace} className="flex-1 min-w-0 hover:text-teal">
                      <span className="block text-[14px] font-semibold truncate">{e.titulo}</span>
                      <span className="block text-[12px] text-muted truncate">{e.detalle}</span>
                    </Link>
                    {proyectos.length > 0 && (
                      <select aria-label={`Mover ${e.titulo} a un proyecto`} disabled={moviendo !== null} value=""
                        onChange={(ev) => mover(e, ev.target.value)}
                        className="min-h-[40px] px-2.5 rounded-lg bg-surface border border-line text-[13px] sm:max-w-[220px]">
                        <option value="">{moviendo === e.id ? 'Moviendo…' : 'Mover a…'}</option>
                        {proyectos.filter((p) => p.etapa !== 'cancelado').map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}



// Lo que el cliente ya tiene funcionando, como proyecto «En operación»: ahí
// van sus planos, lazos y guías y se ligan los mantenimientos. Puede jalar
// de una vez todo lo que no tiene proyecto (menos las cotizaciones, que
// suelen ser de obras aparte).
function RegistrarInstalacion({ clienteId, clienteNombre, onCerrar, onListo }: {
  clienteId: string;
  clienteNombre: string;
  onCerrar: () => void;
  onListo: (id: string) => void;
}) {
  const [sistemas, setSistemas] = useState<SistemaClave[]>([]);
  const [traer, setTraer] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  async function registrar() {
    if (sistemas.length === 0) { setError('Elige al menos un sistema.'); return; }
    setError(null);
    setGuardando('Creando…');
    try {
      const id = await crearProyecto({
        clienteId, nombre: 'Instalación existente', sistemas, etapa: 'terminado', descripcion: '',
        fechaInicio: null, fechaEntrega: null, monto: null, moneda: 'MXN', responsableId: null, tipo: 'instalacion',
      });
      if (traer) {
        setGuardando('Pasando lo que ya existía…');
        const contenido = await contenidoSinProyecto(clienteId);
        const elementos = (Object.keys(contenido) as TipoContenido[]).filter((t) => t !== 'cotizacion').flatMap((t) => contenido[t]);
        let fallas = 0;
        for (const e of elementos) await moverAProyecto(e, id).catch(() => { fallas++; });
        if (fallas) showToast(`${fallas} ${fallas === 1 ? 'cosa no se pudo' : 'cosas no se pudieron'} mover; quedan en «Sin proyecto».`, 'error');
      }
      showToast('Instalación registrada', 'success');
      onListo(id);
    } catch (e: any) {
      setError(e?.message || 'No se pudo registrar la instalación.');
      setGuardando(null);
    }
  }

  return (
    <ModalOverlay onClose={() => !guardando && onCerrar()}>
      <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[90vh] overflow-y-auto">
        <p className="font-display font-bold text-[19px]">Instalación existente</p>
        <p className="text-[13px] text-muted mt-1 mb-4">Lo que {clienteNombre} ya tiene funcionando. Queda «En operación» y ahí se agregan sus planos, lazos y guías, y se ligan los mantenimientos.</p>
        <p className="text-[12.5px] text-muted mb-1.5">Sistemas instalados</p>
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {SISTEMAS.map((x) => {
            const activo = sistemas.includes(x.clave);
            return (
              <button key={x.clave} type="button" aria-pressed={activo}
                onClick={() => setSistemas(activo ? sistemas.filter((y) => y !== x.clave) : [...sistemas, x.clave])}
                className={`min-h-[44px] px-3 rounded-xl border text-left text-[14px] flex items-center gap-2 ${activo ? 'border-teal bg-teal/10 font-semibold' : 'border-line bg-surface-2'}`}>
                <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${activo ? 'bg-teal border-teal text-inkOnAccent' : 'border-line-strong'}`}>{activo && <Check size={13} strokeWidth={3} />}</span>
                {x.nombre}
              </button>
            );
          })}
        </div>
        <label className="flex items-start gap-2.5 text-[14px] mb-2">
          <input type="checkbox" checked={traer} onChange={(e) => setTraer(e.target.checked)} className="w-5 h-5 mt-0.5 accent-teal" />
          <span>Pasar aquí lo que no tiene proyecto (servicios, levantamientos, paneles, lazos, planos, guías y unifilares). Las cotizaciones se quedan donde están.</span>
        </label>
        {error && <p className="text-red font-semibold text-[13px]">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCerrar} disabled={!!guardando} className="flex-1 min-h-[50px] rounded-2xl border border-line-strong font-semibold text-[14.5px] disabled:opacity-60">Cancelar</button>
          <button type="button" onClick={registrar} disabled={!!guardando} className="flex-1 min-h-[50px] rounded-2xl bg-teal text-inkOnAccent font-semibold text-[14.5px] disabled:opacity-60">{guardando || 'Registrar'}</button>
        </div>
      </div>
    </ModalOverlay>
  );
}
