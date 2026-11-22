'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Plus, Zap } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import AutocompletarCliente from '@/components/AutocompletarCliente';
import EstadoVacio from '@/components/EstadoVacio';
import { showToast } from '@/components/Toast';
import { catalogoEnCache, listarCatalogoClientes, type ClienteCatalogo } from '@/lib/clientesCatalogo';
import {
  NOMBRE_TIPO_SISTEMA, datosVacios, descripcionPorOmision, kwpTotal, plantilla, redondear,
  type TipoSistema, type Unifilar,
} from '@/lib/unifilar';
import { crearUnifilar, datosDelCliente, listarUnifilares } from '@/lib/unifilaresDatos';
import { moverAProyecto } from '@/lib/proyectoContenido';

// Lista de diagramas unifilares de sistemas fotovoltaicos (solo supervisión).

const CAMPO = 'w-full px-3.5 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]';

export default function UnifilaresLista({ puedeCrear = false, proyectoId = null, clienteDelProyecto = null }: {
  // Fuera de un proyecto solo se consulta: los unifilares nuevos nacen en el proyecto.
  puedeCrear?: boolean;
  proyectoId?: string | null;
  clienteDelProyecto?: { id: string; nombre: string } | null;
}) {
  const [unifilares, setUnifilares] = useState<Unifilar[]>([]);
  const [clientes, setClientes] = useState<ClienteCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [faltaPatch, setFaltaPatch] = useState(false);
  const [nuevo, setNuevo] = useState(false);

  async function cargar() {
    setError(null);
    try {
      const r = await listarUnifilares();
      setUnifilares(r.unifilares);
      setFaltaPatch(r.faltaPatch);
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar los unifilares.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    setClientes(catalogoEnCache());
    listarCatalogoClientes().then(setClientes).catch(() => {});
  }, []);

  const nombreCliente = (id: string | null) => (id ? clientes.find((c) => c.id === id)?.nombre || 'Cliente' : 'Sin cliente');

  if (faltaPatch) {
    return <p className="rounded-xl bg-amber/10 text-amber text-[14px] px-4 py-3">Los diagramas unifilares todavía no están activados en esta base: falta correr supabase/patch_unifilares.sql.</p>;
  }

  return (
    <div>
      <div className="flex flex-col gap-3 mb-5 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-[14px] text-muted leading-snug lg:max-w-2xl">
          Diagramas unifilares de sistemas fotovoltaicos (interconectados, aislados o híbridos) con calibres, metros y caída de tensión, listos en PDF para el trámite de CFE.
        </p>
        {puedeCrear && <button type="button" onClick={() => setNuevo(true)}
          className="min-h-[50px] lg:min-h-[46px] px-6 rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15px] tracking-wide shadow-glow-teal flex items-center justify-center gap-2 shrink-0">
          <Plus size={18} strokeWidth={2.6} /> Nuevo unifilar
        </button>}
      </div>

      {error && (
        <div className="rounded-xl bg-red/10 text-red text-[14px] px-4 py-3 mb-4">
          {error} <button type="button" onClick={() => { setCargando(true); cargar(); }} className="underline font-semibold">Reintentar</button>
        </div>
      )}
      {cargando && <p className="text-[14px] text-muted">Cargando…</p>}

      {!cargando && !error && unifilares.length === 0 && (
        <EstadoVacio icono={<Zap size={26} strokeWidth={2} />} titulo="Todavía no hay unifilares"
          detalle={puedeCrear ? 'Crea uno: empieza con los equipos de ejemplo del tipo de sistema y ajústalos al proyecto.' : 'Se crean dentro de un proyecto con paneles solares (pestaña Solar).'} />
      )}

      {!cargando && unifilares.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 lg:grid-cols-2 xl:grid-cols-3">
          {unifilares.map((u) => (
            <Link key={u.id} href={`/unifilares/${u.id}`} className="block rounded-2xl bg-surface border border-line p-3.5 transition-colors hover:border-teal/60">
              <div className="flex items-center gap-2.5">
                <span className="flex-1 min-w-0 text-[15px] font-semibold truncate">{u.nombre}</span>
                <ChevronRight size={18} className="text-muted shrink-0" />
              </div>
              <p className="text-[12.5px] text-muted mt-0.5 truncate">{nombreCliente(u.cliente_id)}</p>
              <p className="text-[12.5px] text-muted mt-0.5">
                {NOMBRE_TIPO_SISTEMA[u.tipo]} · {redondear(kwpTotal(u.datos))} kWp · {u.datos.equipos.length} equipos
              </p>
            </Link>
          ))}
        </div>
      )}

      {nuevo && <NuevoUnifilar proyectoId={proyectoId} clienteFijo={clienteDelProyecto} onCerrar={() => setNuevo(false)} />}
    </div>
  );
}

function NuevoUnifilar({ proyectoId, clienteFijo, onCerrar }: { proyectoId: string | null; clienteFijo: { id: string; nombre: string } | null; onCerrar: () => void }) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoSistema>('interconectado');
  const [conEjemplo, setConEjemplo] = useState(true);
  const [clienteTexto, setClienteTexto] = useState(clienteFijo?.nombre || '');
  const [clienteId, setClienteId] = useState<string | null>(clienteFijo?.id || null);
  const [errores, setErrores] = useState<{ nombre?: string; cliente?: string }>({});
  const [guardando, setGuardando] = useState(false);

  async function crear() {
    const faltas: { nombre?: string; cliente?: string } = {};
    if (!nombre.trim()) faltas.nombre = 'Ponle nombre al unifilar.';
    if (clienteTexto.trim() && !clienteId) faltas.cliente = 'Elige el cliente de la lista o deja el campo vacío.';
    setErrores(faltas);
    if (Object.keys(faltas).length > 0) return;
    setGuardando(true);
    try {
      const datos = conEjemplo ? plantilla(tipo, () => crypto.randomUUID()) : datosVacios();
      datos.proyecto.descripcion = descripcionPorOmision(tipo);
      datos.proyecto.fecha = new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }).toUpperCase();
      if (clienteId) {
        const cliente = await datosDelCliente(clienteId);
        if (cliente) Object.assign(datos.proyecto, cliente);
      }
      const id = await crearUnifilar({ nombre, tipo, cliente_id: clienteId, datos });
      if (proyectoId) await moverAProyecto({ tipo: 'unifilar', id }, proyectoId).catch((e) => showToast(e?.message || 'Se creó, pero no quedó en el proyecto.', 'error'));
      window.location.href = `/unifilares/${id}`;
    } catch (e: any) {
      showToast(e?.message || 'No se pudo crear el unifilar', 'error');
      setGuardando(false);
    }
  }

  return (
    <ModalOverlay onClose={() => !guardando && onCerrar()}>
      <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[90vh] overflow-y-auto">
        <p className="font-display font-bold text-[19px]">Nuevo diagrama unifilar</p>
        <p className="text-[13px] text-muted mt-1 mb-4">Después agregas equipos del catálogo, configuras las cadenas y MPPT, y tocas cada tramo para poner calibre y metros.</p>

        <label className="block mb-3"><span className="block text-[12.5px] text-muted mb-1">Nombre</span>
          <input className={CAMPO} value={nombre} maxLength={120} placeholder="Casa Octavio, nave 2…" onChange={(ev) => setNombre(ev.target.value)} />
          {errores.nombre && <span className="block text-red font-semibold text-[13px] mt-1">{errores.nombre}</span>}</label>

        <div className="mb-3"><span className="block text-[12.5px] text-muted mb-1">Cliente (opcional)</span>
          <AutocompletarCliente value={clienteTexto} soloSugerir className={CAMPO} placeholder="Escribe para buscar"
            onChange={(texto, id) => { setClienteTexto(texto); setClienteId(id); }} />
          <span className="block text-[12px] text-muted mt-1">Trae su dirección y ubicación para el cuadro del plano.</span>
          {errores.cliente && <span className="block text-red font-semibold text-[13px] mt-1">{errores.cliente}</span>}</div>

        <fieldset className="mb-3">
          <legend className="block text-[12.5px] text-muted mb-1">Tipo de sistema</legend>
          <div className="grid gap-1.5">
            {(Object.keys(NOMBRE_TIPO_SISTEMA) as TipoSistema[]).map((t) => (
              <label key={t} className={`flex items-center gap-2.5 min-h-[44px] px-3 rounded-xl border text-[14px] cursor-pointer ${tipo === t ? 'border-teal bg-teal/10' : 'border-line bg-surface-2'}`}>
                <input type="radio" name="tipo" checked={tipo === t} onChange={() => setTipo(t)} className="accent-teal" />
                {NOMBRE_TIPO_SISTEMA[t]}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex items-center gap-2.5 mb-3 text-[14px]">
          <input type="checkbox" checked={conEjemplo} onChange={(ev) => setConEjemplo(ev.target.checked)} className="w-5 h-5 accent-teal" />
          Empezar con equipos de ejemplo ya conectados
        </label>

        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCerrar} disabled={guardando} className="flex-1 min-h-[50px] rounded-2xl border border-line-strong font-semibold text-[14.5px] disabled:opacity-60">Cancelar</button>
          <button type="button" onClick={crear} disabled={guardando} className="flex-1 min-h-[50px] rounded-2xl bg-teal text-inkOnAccent font-semibold text-[14.5px] disabled:opacity-60">
            {guardando ? 'Creando…' : 'Crear unifilar'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
