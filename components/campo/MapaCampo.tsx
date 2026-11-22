'use client';

import 'leaflet/dist/leaflet.css';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Crosshair, History, MapIcon, Maximize2, Minimize2, Radio, Search, Smartphone } from 'lucide-react';
import SelectorDiaMapa from '@/components/servicios/SelectorDiaMapa';
import BotonMotorMapa from '@/components/servicios/BotonMotorMapa';
import BuscadorVisitas from '@/components/servicios/BuscadorVisitas';
import { FALTA_SQL_UBICACION } from '@/lib/ubicacionTecnicos';
import { sumarDias } from '@/lib/fechaHoy';
import { normalizar } from '@/lib/clientesCatalogo';
import { TEXTO_ESTADO, ultimaVez, type EstadoTecnico } from '@/lib/campo';
import { useCampo } from './useCampo';
import TarjetaTecnico from './TarjetaTecnico';
import PanelTecnico from './PanelTecnico';
import ReproductorDia from './ReproductorDia';

// Mapa de técnicos en campo, con dos propósitos:
//   · Resumen: vista rápida de cómo va el día (lista, mapa y detalle).
//   · Servicios → Mapa: vista operativa, «En vivo» o «Historial» con el
//     buscador de visitas dibujado en el mismo mapa; la lista dice también
//     la batería y si el GPS manda bien.
// Escritorio: lista | mapa | detalle. Celular: mapa, detalle y lista, uno debajo de otro.

type Filtro = 'todos' | EstadoTecnico;
const FILTROS: Filtro[] = ['todos', 'en_servicio', 'en_ruta', 'pausa', 'terminado'];

const BOTON_MAPA = 'w-11 h-11 rounded-2xl bg-surface/95 backdrop-blur-md border border-line shadow-diffuse flex items-center justify-center text-ink/75 hover:text-teal hover:border-teal/50 active:scale-95 transition';

export default function MapaCampo({ modo }: { modo: 'resumen' | 'servicios' }) {
  const enServicios = modo === 'servicios';
  const c = useCampo({ conConocidos: enServicios });
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [historial, setHistorial] = useState(false);
  const [ampliado, setAmpliado] = useState(false);

  useEffect(() => {
    if (!ampliado) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') setAmpliado(false); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [ampliado]);

  // «En vivo» siempre es hoy; al regresar se quitan las visitas del buscador.
  function irAEnVivo() {
    setHistorial(false);
    c.setVisitas(null);
    if (c.hoy && !c.esHoy) c.irADia(c.hoy);
  }

  // En una base sin el rastreo (p. ej. el demo) el Resumen no muestra el mapa.
  if (c.error === FALTA_SQL_UBICACION && !enServicios) return null;

  const ahora = c.ahora ?? 0;
  const conRastreo = c.infos.filter((t) => t.ultimo);
  const nadie = !c.cargando && !c.error && conRastreo.length === 0;
  const textoBuscado = normalizar(busqueda);
  const visibles = c.infos.filter((t) => (filtro === 'todos' || t.estado === filtro) && normalizar(t.nombre).includes(textoBuscado));
  const kpis = [
    { titulo: c.esHoy ? 'En campo' : 'Con rastreo', valor: conRastreo.filter((t) => !c.esHoy || t.estado !== 'terminado').length },
    { titulo: 'En ruta', valor: c.infos.filter((t) => t.estado === 'en_ruta').length },
    { titulo: c.esHoy ? 'Servicios de hoy' : 'Servicios del día', valor: c.servicios.length },
    { titulo: 'Completados', valor: c.servicios.filter((s) => s.estado === 'concluido').length },
  ];
  const textoDia = c.fecha ? new Date(`${c.fecha}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }) : '';

  // Ampliado: el alto se calcula contra la pantalla (encabezado + KPIs ≈ 9.5rem);
  // «h-full» no sirve porque el contenedor no tiene alto fijo y el mapa quedaba en 0.
  const alturaMapa = ampliado ? 'h-[calc(100dvh-9.5rem)] min-h-[320px]' : enServicios ? 'h-[62vh] min-h-[420px] lg:h-[700px]' : 'h-[58vh] min-h-[380px] lg:h-[600px]';
  const marco = ampliado
    ? 'fixed inset-0 z-[95] bg-bg p-2 lg:p-3 overflow-y-auto'
    : 'relative isolate mb-5';

  // ---------- Columna izquierda: la lista ----------
  const lista = (
    <div className="flex flex-col gap-2.5 min-h-0 lg:max-h-[700px]">
      {nadie && (
        <div className="shrink-0 rounded-2xl border border-line bg-surface p-3.5">
          <p className="flex items-center gap-2 text-[14px] font-semibold"><Smartphone size={17} className="text-muted" /> {c.esHoy ? 'Nadie ha compartido su ubicación hoy' : 'No hay ubicaciones ese día'}</p>
          <p className="text-[12.5px] text-muted mt-1">{c.esHoy ? 'Los teléfonos de la empresa aparecen aquí en horario de trabajo.' : 'Ese día ningún teléfono de la empresa compartió su ubicación.'}</p>
          <div className="grid grid-cols-2 gap-2 mt-2.5">
            {c.hoy && (
              <button type="button" onClick={() => { setHistorial(true); c.irADia(sumarDias(c.esHoy ? c.hoy! : c.fecha!, -1)); }}
                className="min-h-[46px] rounded-xl border border-line bg-surface-2 text-[13px] font-semibold">Ver {c.esHoy ? 'ayer' : 'el día anterior'}</button>
            )}
            <button type="button" onClick={() => c.setVerConocidos(!c.verConocidos)} aria-pressed={c.verConocidos}
              className={`min-h-[46px] rounded-xl border px-2 leading-tight text-[13px] font-semibold ${c.verConocidos ? 'border-teal bg-teal/15' : 'border-line bg-surface-2'}`}>Última ubicación</button>
          </div>
          {c.verConocidos && c.conocidos.length > 0 && (
            <ul className="mt-2.5 flex flex-col gap-1 text-[12.5px]">
              {c.conocidos.map((k) => (
                <li key={k.tecnico_id} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#64748b]" /> <b>{(k.nombre || 'Técnico').split(' ')[0]}</b>, última vez {ultimaVez(k.registrado_en, ahora)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="relative shrink-0">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
        <input type="search" value={busqueda} onChange={(ev) => setBusqueda(ev.target.value)} placeholder="Buscar técnico" aria-label="Buscar técnico"
          className="w-full pl-9 pr-3 min-h-[44px] rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[14px]" />
      </div>
      <div className="shrink-0 flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5" role="tablist" aria-label="Estado">
        {FILTROS.map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filtro === f} onClick={() => setFiltro(f)}
            className={`shrink-0 min-h-[38px] px-3 rounded-full border text-[12.5px] font-semibold ${filtro === f ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface border-line text-muted'}`}>
            {f === 'todos' ? 'Todos' : TEXTO_ESTADO[f]}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto min-h-0 pr-0.5">
        {c.cargando && c.infos.length === 0 && <p className="text-[13px] text-muted px-1">Cargando…</p>}
        {!c.cargando && visibles.length === 0 && <p className="text-[13px] text-muted px-1">{c.infos.length === 0 ? 'Sin técnicos con servicios ni rastreo este día.' : 'Nadie con ese filtro.'}</p>}
        {visibles.map((t) => (
          <TarjetaTecnico key={t.id} info={t} ahora={ahora} elegido={c.elegido === t.id} onClick={() => c.elegir(t.id)} conTelefono={enServicios} esHoy={c.esHoy} />
        ))}
      </div>
    </div>
  );

  // ---------- Centro: el mapa ----------
  const mapa = (
    <div className={`relative rounded-3xl border border-line overflow-hidden shadow-diffuse bg-surface ${alturaMapa}`}>
      {/* El div del mapa no cambia de clase: React borraría las que pone Leaflet. z-0: debajo de los menús. */}
      <div className="absolute inset-0 z-0"><div ref={c.contenedorRef} className="h-full w-full" /></div>

      {/* Arriba a la derecha: botones. Los KPIs van fuera del mapa para no tapar
          el control «Mapa / Satélite» de Google (arriba a la izquierda). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-2.5 lg:p-3 flex items-start justify-end gap-2">
        <div className="pointer-events-auto flex items-center gap-1.5">
          <BotonMotorMapa motor={c.motor} hayGoogle={c.hayGoogle} cambiar={c.cambiarMotor} className="max-sm:[&>span]:hidden max-sm:w-11 max-sm:px-0 max-sm:justify-center" />
          {conRastreo.length > 0 && <button type="button" onClick={c.encuadrarTodos} aria-label="Ver a todos" title="Ver a todos" className={BOTON_MAPA}><Crosshair size={18} /></button>}
          <button type="button" onClick={() => setAmpliado(!ampliado)} aria-label={ampliado ? 'Salir de pantalla completa' : 'Pantalla completa'} className={BOTON_MAPA}>
            {ampliado ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
          {!enServicios && !ampliado && (
            <Link href="/dashboard/servicios?sub=mapa" className="h-11 px-3.5 rounded-2xl bg-teal text-inkOnAccent text-[13px] font-semibold flex items-center gap-1.5 shadow-glow-teal">
              <MapIcon size={16} /> <span className="hidden sm:inline">Abrir mapa</span>
            </Link>
          )}
        </div>
      </div>

      {c.error && (
        <div className="absolute inset-x-0 top-16 z-10 flex justify-center px-3">
          <p className="rounded-2xl bg-surface/95 border border-red/40 px-4 py-2.5 text-[13px] font-semibold text-red">{c.error}</p>
        </div>
      )}

      {/* Abajo: el reproductor del técnico elegido */}
      {c.info && c.info.recorrido.length > 1 && (
        <div className="absolute inset-x-0 bottom-0 z-20 p-2.5 lg:p-3 pr-14">
          <ReproductorDia recorrido={c.info.recorrido} tiempo={c.tiempo} onTiempo={c.setTiempo} esHoy={c.esHoy} />
        </div>
      )}
    </div>
  );

  return (
    <section id="mapa-tecnicos" aria-label="Técnicos en campo" className={marco}>
      {/* Encabezado: título, En vivo / Historial y el día */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <span className="relative flex w-2.5 h-2.5">
            {c.esHoy && conRastreo.some((t) => t.enLinea) && <span className="absolute inset-0 rounded-full bg-[#16a34a] opacity-60 animate-ping" />}
            <span className={`relative w-2.5 h-2.5 rounded-full ${c.esHoy && conRastreo.some((t) => t.enLinea) ? 'bg-[#16a34a]' : 'bg-faint'}`} />
          </span>
          <h2 className="font-display font-bold text-[18px] lg:text-[20px] tracking-wide leading-none">{enServicios ? 'Mapa de técnicos' : 'Técnicos en campo'}</h2>
          <span className="text-[12.5px] text-muted first-letter:uppercase hidden sm:inline">· {textoDia}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface border border-line p-1" role="tablist" aria-label="Qué ver">
            <button type="button" role="tab" aria-selected={!historial} onClick={irAEnVivo}
              className={`min-h-[40px] px-3 rounded-lg text-[13px] font-semibold flex items-center gap-1.5 ${!historial ? 'bg-teal text-inkOnAccent' : 'text-muted'}`}><Radio size={14} /> En vivo</button>
            <button type="button" role="tab" aria-selected={historial} onClick={() => setHistorial(true)}
              className={`min-h-[40px] px-3 rounded-lg text-[13px] font-semibold flex items-center gap-1.5 ${historial ? 'bg-teal text-inkOnAccent' : 'text-muted'}`}><History size={14} /> Historial</button>
          </div>
          {historial && c.fecha && c.hoy && c.fechaMinima && (
            <SelectorDiaMapa fecha={c.fecha} hoy={c.hoy} fechaMinima={c.fechaMinima} irADia={c.irADia} />
          )}
        </div>
      </div>

      <div className={`grid gap-3 grid-cols-1 lg:grid-cols-[290px_minmax(0,1fr)] ${c.info ? 'xl:grid-cols-[290px_minmax(0,1fr)_340px]' : ''} items-start`}>
        {/* En el celular el mapa va primero. */}
        <div className="order-2 lg:order-1 min-w-0">{lista}</div>
        <div className="order-1 lg:order-2 min-w-0 flex flex-col gap-3">
          <div className="grid grid-cols-4 gap-1.5">
            {kpis.map((k) => (
              <div key={k.titulo} className="rounded-xl bg-surface border border-line px-2 sm:px-3 py-1.5 min-w-0">
                <p className="font-display font-bold text-[17px] sm:text-[19px] leading-none tabular-nums">{k.valor}</p>
                <p className="text-[10.5px] sm:text-[11.5px] text-muted mt-0.5 leading-tight">{k.titulo}</p>
              </div>
            ))}
          </div>
          {mapa}
          {/* Sin espacio para la tercera columna, el detalle va debajo del mapa. */}
          {c.info && <div className="xl:hidden"><PanelTecnico info={c.info} ahora={ahora} esHoy={c.esHoy} onCerrar={() => c.elegir(null)} /></div>}
        </div>
        {c.info && <div className="hidden xl:block order-3 min-w-0 xl:max-h-[760px] xl:overflow-y-auto"><PanelTecnico info={c.info} ahora={ahora} esHoy={c.esHoy} onCerrar={() => c.elegir(null)} /></div>}
      </div>

      {/* Servicios → Mapa, Historial: el buscador de visitas, dibujado en el mismo mapa. */}
      {enServicios && historial && !ampliado && c.error !== FALTA_SQL_UBICACION && (
        <div className="mt-3">
          <BuscadorVisitas
            fechaMinimaRastreo={c.fechaMinima}
            onVerEnMapa={(dia, ids) => {
              const sePudo = c.verDia(dia, ids);
              if (sePudo) document.getElementById('mapa-tecnicos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              return sePudo;
            }}
            onVisitasCliente={(v) => {
              c.setVisitas(v);
              if (v) document.getElementById('mapa-tecnicos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          />
        </div>
      )}
    </section>
  );
}
