'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Cable, ChevronLeft, ChevronRight, Plus, WifiOff, X } from 'lucide-react';
import MenuCuenta from '@/components/MenuCuenta';
import TecnicoTabs from '@/components/TecnicoTabs';
import Logo from '@/components/Logo';
import ModalOverlay from '@/components/ModalOverlay';
import AutocompletarCliente from '@/components/AutocompletarCliente';
import EstadoVacio from '@/components/EstadoVacio';
import EncabezadoSeccion, { BOTON_PRINCIPAL, RotuloGrupo } from '@/components/tecnico/EncabezadoSeccion';
import { showToast } from '@/components/Toast';
import { catalogoEnCache, listarCatalogoClientes, ClienteCatalogo } from '@/lib/clientesCatalogo';
import { NOMBRE_CIRCUITO, PREFIJO_CIRCUITO, TipoCircuito } from '@/lib/lazos';
import { crearLazo, listarLazos, LazoResumen } from '@/lib/lazosDatos';

const CAMPO = 'w-full px-3.5 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]';

type Errores = Partial<Record<'cliente' | 'nombre' | 'codigo' | 'numero', string>>;

export default function LazosList({ userName, esSupervisor, clienteInicial }: {
  userName: string;
  esSupervisor: boolean;
  clienteInicial: string | null;
}) {
  const [lazos, setLazos] = useState<LazoResumen[]>([]);
  const [clientes, setClientes] = useState<ClienteCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [sinConexion, setSinConexion] = useState(false);
  const [filtroCliente, setFiltroCliente] = useState<string | null>(clienteInicial);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);

  async function cargar() {
    setErrorCarga(null);
    try {
      const resultado = await listarLazos();
      setLazos(resultado.lazos);
      setSinConexion(resultado.sinConexion);
    } catch (e: any) {
      setErrorCarga(e?.message || 'No se pudieron cargar los lazos.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // Nombres de los clientes: primero la copia local (funciona sin señal).
    setClientes(catalogoEnCache());
    listarCatalogoClientes().then(setClientes).catch(() => {});
  }, []);

  const nombreCliente = (id: string) => clientes.find((c) => c.id === id)?.nombre || 'Cliente';

  const visibles = filtroCliente ? lazos.filter((l) => l.cliente_id === filtroCliente) : lazos;

  // Agrupados por cliente, en orden alfabético.
  const porCliente = new Map<string, LazoResumen[]>();
  for (const lazo of visibles) {
    const lista = porCliente.get(lazo.cliente_id) || [];
    lista.push(lazo);
    porCliente.set(lazo.cliente_id, lista);
  }
  const grupos = [...porCliente.entries()].sort((a, b) => nombreCliente(a[0]).localeCompare(nombreCliente(b[0]), 'es'));

  return (
    <div className={`max-w-2xl mx-auto pb-16 ${esSupervisor ? "" : "lg:max-w-none lg:px-6"}`}>
      {/* Técnicos: una sección más, con sus pestañas. Supervisión llega desde
          la ficha del cliente y regresa a ella. */}
      {esSupervisor ? (
        <div className="sticky top-0 z-20 glass-strong px-4 py-3 flex items-center justify-between gap-3" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
          <div className="flex items-center gap-2 min-w-0">
            <Link href={filtroCliente ? `/dashboard/proyectos/${filtroCliente}` : '/dashboard/proyectos'} aria-label="Volver al cliente" className="shrink-0 w-11 h-11 -ml-1.5 rounded-full flex items-center justify-center active:scale-90 transition-transform">
              <ChevronLeft size={24} strokeWidth={2.4} />
            </Link>
            <span className="font-display font-semibold text-[17px] tracking-wide truncate">Lazos y circuitos</span>
          </div>
          <MenuCuenta nombre={userName} respaldo="Supervisión" />
        </div>
      ) : (
        <div className="sticky top-0 z-20 bg-bg pb-2">
          <div className="barra-fija px-5 pb-3 flex items-center justify-between gap-3" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
            <Logo variante="completo" size={34} className="min-w-0" />
            <MenuCuenta nombre={userName} respaldo="Personal técnico" />
          </div>
          <TecnicoTabs active="lazos" />
        </div>
      )}

      <div className="px-5 pt-4">
        <EncabezadoSeccion
          titulo="Lazos y circuitos"
          detalle="El cableado de cada lazo de detección, voceo y estrobos, en el orden en que corre el cable."
          accion={
            <button type="button" onClick={() => setNuevoAbierto(true)} className={BOTON_PRINCIPAL}>
              <Plus size={19} strokeWidth={2.6} /> Nuevo lazo o circuito
            </button>
          }
        />

        {sinConexion && (
          <p className="flex items-center gap-2 text-[13px] text-amber bg-amber/10 rounded-xl px-3 py-2 mb-4">
            <WifiOff size={16} strokeWidth={2.4} /> Sin señal: es la última lista que se cargó en este teléfono.
          </p>
        )}

        {filtroCliente && (
          <button type="button" onClick={() => setFiltroCliente(null)} className="mb-4 inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-full bg-surface-2 border border-line text-[13px]">
            Solo {nombreCliente(filtroCliente)} <X size={14} strokeWidth={2.4} aria-label="Quitar filtro" />
          </button>
        )}

        {errorCarga && (
          <div className="rounded-xl bg-red/10 text-red text-[14px] px-4 py-3 mb-4">
            {errorCarga}{' '}
            <button type="button" onClick={() => { setCargando(true); cargar(); }} className="underline font-semibold">Reintentar</button>
          </div>
        )}

        {cargando && <p className="text-[14px] text-muted">Cargando…</p>}

        {!cargando && !errorCarga && visibles.length === 0 && (
          <EstadoVacio
            icono={<Cable size={26} strokeWidth={2} />}
            titulo="Todavía no hay lazos"
            detalle="Crea el primero y captura sus dispositivos mientras cableas."
          />
        )}

        {grupos.map(([clienteId, lista]) => (
          <section key={clienteId} className="mb-6">
            <RotuloGrupo cuenta={lista.length}>{nombreCliente(clienteId)}</RotuloGrupo>
            <div className="flex flex-col gap-2.5">
              {lista.map((lazo) => (
                <Link key={lazo.id} href={`/lazos/${lazo.id}`} className={`block rounded-2xl bg-surface border p-3.5 transition-colors hover:border-teal/60 ${lazo.fallaAbierta ? 'border-amber/60' : 'border-line'}`}>
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-[13px] rounded-lg bg-surface-2 px-2 py-1">{lazo.codigo}</span>
                    <span className="flex-1 min-w-0 text-[15.5px] font-semibold truncate">{lazo.nombre}</span>
                    <ChevronRight size={18} className="text-muted shrink-0" />
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2.5 text-[12px] text-muted">
                    <span className="rounded-full bg-surface-2 px-2.5 py-1">{NOMBRE_CIRCUITO[lazo.tipo]}</span>
                    {lazo.clase && <span className="rounded-full bg-surface-2 px-2.5 py-1">Clase {lazo.clase}</span>}
                    <span className="rounded-full bg-surface-2 px-2.5 py-1">{lazo.dispositivos} dispositivos</span>
                  </div>
                  {lazo.fallaAbierta && (
                    <p className="flex items-center gap-1.5 mt-2.5 text-[13px] font-medium text-amber">
                      <AlertTriangle size={15} strokeWidth={2.4} /> Búsqueda de falla a tierra abierta
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      {nuevoAbierto && (
        <NuevoLazo
          clienteInicial={filtroCliente ? { id: filtroCliente, nombre: nombreCliente(filtroCliente) } : null}
          lazosExistentes={lazos}
          onCerrar={() => setNuevoAbierto(false)}
          onCreado={(id) => { window.location.href = `/lazos/${id}`; }}
        />
      )}
    </div>
  );
}

// También se abre desde el diagrama de un lazo para agregar el siguiente
// lazo del mismo panel (llega con panel, número y clase ya puestos).
export function NuevoLazo({ clienteInicial, lazosExistentes, inicial, onCerrar, onCreado }: {
  clienteInicial: { id: string; nombre: string } | null;
  lazosExistentes: LazoResumen[];
  inicial?: { numero: number; clase: 'A' | 'B'; panel: string };
  onCerrar: () => void;
  onCreado: (id: string) => void;
}) {
  const [cliente, setCliente] = useState(clienteInicial?.nombre || '');
  const [clienteId, setClienteId] = useState<string | null>(clienteInicial?.id || null);
  const [tipo, setTipo] = useState<TipoCircuito>('deteccion');
  const [numero, setNumero] = useState(String(inicial?.numero || 1));
  const [codigo, setCodigo] = useState('LZ1');
  // Mientras no se escriba a mano, el código sigue al tipo y al número.
  const [codigoAMano, setCodigoAMano] = useState(false);
  const [nombre, setNombre] = useState('');
  const [clase, setClase] = useState<'A' | 'B'>(inicial?.clase || 'B');
  const [panel, setPanel] = useState(inicial?.panel || '');
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Propone el siguiente número libre de ese tipo en el cliente elegido.
  useEffect(() => {
    if (codigoAMano) return;
    const prefijo = PREFIJO_CIRCUITO[tipo];
    const usados = lazosExistentes.filter((l) => l.cliente_id === clienteId && l.tipo === tipo).length;
    const siguiente = tipo === 'deteccion' ? Number(numero) || usados + 1 : usados + 1;
    setCodigo(`${prefijo}${siguiente}`);
  }, [tipo, numero, clienteId, codigoAMano, lazosExistentes]);

  function validar(): Errores {
    const e: Errores = {};
    if (!clienteId) e.cliente = 'Elige el cliente de la lista. Si no existe, pide a supervisión que lo dé de alta.';
    if (!nombre.trim()) e.nombre = 'Ponle un nombre, por ejemplo «Lazo 1 · Data Center».';
    if (!/^[A-Za-z0-9-]{1,12}$/.test(codigo.trim())) e.codigo = 'Solo letras, números y guion (hasta 12).';
    if (tipo === 'deteccion') {
      const n = Number(numero);
      if (!Number.isInteger(n) || n < 1 || n > 99) e.numero = 'El número de lazo va de 1 a 99.';
    }
    return e;
  }

  async function guardar() {
    const e = validar();
    setErrores(e);
    setErrorGeneral(null);
    if (Object.keys(e).length > 0) return;
    setGuardando(true);
    try {
      const lazo = await crearLazo({
        cliente_id: clienteId as string,
        tipo,
        codigo: codigo.trim().toUpperCase(),
        nombre: nombre.trim(),
        numero: tipo === 'deteccion' ? Number(numero) : null,
        clase: tipo === 'deteccion' ? clase : null,
        panel: panel.trim() || null,
      });
      showToast('Lazo creado');
      onCreado(lazo.id);
    } catch (err: any) {
      setErrorGeneral(err?.message || 'No se pudo crear el lazo.');
      setGuardando(false);
    }
  }

  return (
    <ModalOverlay onClose={() => !guardando && onCerrar()}>
      <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[88vh] overflow-y-auto">
        <h2 className="font-display font-bold text-[22px] mb-4">Nuevo lazo o circuito</h2>

        <label className="block text-[13px] text-muted mb-1.5">Cliente</label>
        <AutocompletarCliente
          value={cliente}
          onChange={(n, id) => { setCliente(n); setClienteId(id); }}
          className={CAMPO}
          placeholder="Escribe para buscar"
          soloSugerir
        />
        {errores.cliente && <p className="text-red font-semibold text-[13px] mt-1">{errores.cliente}</p>}

        <span className="block text-[13px] text-muted mt-4 mb-1.5">Tipo</span>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="Tipo de circuito">
          {(['deteccion', 'voceo', 'estrobos'] as TipoCircuito[]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={tipo === t} onClick={() => setTipo(t)}
              className={`min-h-[40px] rounded-lg text-[13.5px] font-semibold ${tipo === t ? 'bg-teal text-inkOnAccent' : 'text-muted'}`}>
              {t === 'deteccion' ? 'Detección' : t === 'voceo' ? 'Voceo' : 'Estrobos'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          {tipo === 'deteccion' && (
            <div>
              <label htmlFor="lazo-numero" className="block text-[13px] text-muted mb-1.5">Número de lazo en el panel</label>
              <input id="lazo-numero" inputMode="numeric" value={numero} onChange={(ev) => setNumero(ev.target.value.replace(/\D/g, '').slice(0, 2))} className={CAMPO} />
              {errores.numero && <p className="text-red font-semibold text-[13px] mt-1">{errores.numero}</p>}
            </div>
          )}
          <div>
            <label htmlFor="lazo-codigo" className="block text-[13px] text-muted mb-1.5">Código</label>
            <input id="lazo-codigo" value={codigo} onChange={(ev) => { setCodigo(ev.target.value.toUpperCase()); setCodigoAMano(true); }} className={`${CAMPO} font-mono`} />
            {errores.codigo && <p className="text-red font-semibold text-[13px] mt-1">{errores.codigo}</p>}
          </div>
        </div>
        <p className="text-[12px] text-faint mt-1.5">El código encabeza el nombre de cada dispositivo: {codigo || 'LZ1'}_SH_1.</p>

        <label htmlFor="lazo-nombre" className="block text-[13px] text-muted mt-4 mb-1.5">Nombre</label>
        <input id="lazo-nombre" value={nombre} onChange={(ev) => setNombre(ev.target.value)} maxLength={120} placeholder="Lazo 1 · Data Center" className={CAMPO} />
        {errores.nombre && <p className="text-red font-semibold text-[13px] mt-1">{errores.nombre}</p>}

        {tipo === 'deteccion' && (
          <>
            <span className="block text-[13px] text-muted mt-4 mb-1.5">Clase</span>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="Clase del lazo">
              {(['B', 'A'] as const).map((c) => (
                <button key={c} type="button" role="radio" aria-checked={clase === c} onClick={() => setClase(c)}
                  className={`min-h-[40px] rounded-lg text-[13.5px] font-semibold ${clase === c ? 'bg-teal text-inkOnAccent' : 'text-muted'}`}>
                  Clase {c}
                </button>
              ))}
            </div>
          </>
        )}

        <label htmlFor="lazo-panel" className="block text-[13px] text-muted mt-4 mb-1.5">Panel (opcional)</label>
        <input id="lazo-panel" value={panel} onChange={(ev) => setPanel(ev.target.value)} maxLength={160} placeholder="Notifier NFS2-3030, cuarto eléctrico" className={CAMPO} />

        {errorGeneral && <p className="text-red font-semibold text-[13px] mt-3">{errorGeneral}</p>}

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onCerrar} disabled={guardando} className="flex-1 min-h-[48px] rounded-xl bg-surface-2 border border-line font-semibold text-[14.5px]">Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando} className="flex-[1.4] min-h-[48px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[14.5px] disabled:opacity-60">
            {guardando ? 'Creando…' : 'Crear y capturar'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
