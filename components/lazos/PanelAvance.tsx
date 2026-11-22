'use client';

import VisorFotos from '@/components/VisorFotos';

import { useEffect, useState } from 'react';
import { Ban, BarChart3, BoxSelect, CloudOff, FileDown, Hand, History, Loader2, MousePointerClick, RotateCcw, Search, Undo2, X } from 'lucide-react';
import CampoFoto from '@/components/lazos/CampoFoto';
import { showToast } from '@/components/Toast';
import { confirmar } from '@/lib/dialogos';
import { tipoDispositivo } from '@/lib/lazos';
import {
  COLOR_BLOQUEADO, ESTADOS_AVANCE, ETAPAS, LETRA_BLOQUEADO, MOTIVOS_BLOQUEO, contar, cuentaDeEstado, datosDeEstado, equiposQueCuentan,
  errorDeBloqueo, estadoDe, insigniaDe, nombreEtapa, ordenarParaLista, pasaFiltro, porcentajes,
  type AvancePlano, type CambioAvance, type EstadoAvance, type FiltroAvance, type MarcaAvance,
} from '@/lib/avancePlano';
import { historialDeEquipo, revertirAvance, subirFotoAvance, urlFotoAvance, type CambioHistorial } from '@/lib/planosDatos';
import type { EquipoPlano } from '@/lib/planos';

// Panel de la herramienta «Avance» del plano, pensado para la obra (botones
// grandes; cada estado con su color Y su letra: P, T, I, D, ✓, ✕).
//   · Resumen: % probado y % con algún avance (sin contar lo que no se puede instalar).
//   · Un toque en el plano: avanza un paso, o abre la ficha del equipo.
//   · Filtros por estado, lazo, tipo y dirección; selección por zona, lo
//     que se ve, lazo o tipo, y «Marcar N como …» con confirmación.
//   · Ficha: quién y cuándo, foto, comentario e historial (supervisión revierte).

export type ModoToque = 'avanzar' | 'ficha';

const chip = (activo: boolean) =>
  `min-h-[42px] px-3.5 rounded-full border text-[13.5px] font-semibold transition-colors ${activo ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line text-ink/80'}`;

// La letra del estado en un círculo de su color: se lee aunque no se distingan los colores.
export function Insignia({ marca, grande = false }: { marca: MarcaAvance | undefined; grande?: boolean }) {
  const { letra, color, nombre } = insigniaDe(marca);
  return (
    <span aria-label={nombre} title={nombre}
      className={`${grande ? 'w-8 h-8 text-[15px]' : 'w-6 h-6 text-[12px]'} rounded-full shrink-0 flex items-center justify-center font-bold text-white`}
      style={{ background: color }}>
      {letra}
    </span>
  );
}

function ChipEstado({ marca }: { marca: MarcaAvance | undefined }) {
  const { color, nombre } = insigniaDe(marca);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full pl-0.5 pr-2.5 py-0.5 text-[12.5px] font-semibold border" style={{ borderColor: color, color }}>
      <Insignia marca={marca} /> {nombre}
    </span>
  );
}

function fechaHora(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });
}

export default function PanelAvance({
  planoId, equipos, avance, elegidos, etiquetaDe, nombreDe, lazoDe, lazos, filtro, onFiltro, puntosRecuadro, onRecuadro,
  onElegir, onAlternar, onLimpiar, onMarcar, onEtapa, pendientes, onReporte, generando, modo, onModo, puedeDeshacer, onDeshacer,
  esSupervisor, onResumen, onAvanceDelServidor,
}: {
  planoId: string;
  equipos: EquipoPlano[];
  avance: AvancePlano;
  elegidos: Set<string>;
  etiquetaDe: (e: EquipoPlano) => string;
  // Nombre completo del dispositivo ligado (LZ1_SH_7) o el del tipo.
  nombreDe: (e: EquipoPlano) => string;
  lazoDe: (e: EquipoPlano) => { id: string; nombre: string } | null;
  lazos: { id: string; nombre: string }[];
  filtro: FiltroAvance;
  onFiltro: (f: FiltroAvance) => void;
  puntosRecuadro: number | null;
  onRecuadro: (activo: boolean) => void;
  onElegir: (ids: string[]) => void;
  onAlternar: (id: string) => void;
  onLimpiar: () => void;
  // Aplica el cambio a los elegidos (el editor revisa las reglas y guarda para deshacer).
  onMarcar: (cambio: CambioAvance) => Promise<void> | void;
  onEtapa: (etapa: number | null) => void;
  pendientes: number;
  onReporte: () => void;
  generando: boolean;
  modo: ModoToque;
  onModo: (m: ModoToque) => void;
  puedeDeshacer: boolean;
  onDeshacer: () => void;
  esSupervisor: boolean;
  onResumen: () => void;
  onAvanceDelServidor: (avance: AvancePlano) => void;
}) {
  const [destino, setDestino] = useState<EstadoAvance | null>(null);
  const [bloqueando, setBloqueando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [nota, setNota] = useState('');
  const [fotoBloqueo, setFotoBloqueo] = useState<File | null>(null);
  const [errorBloqueo, setErrorBloqueo] = useState<string | null>(null);
  const [extra, setExtra] = useState(false);
  const [comentario, setComentario] = useState('');
  const [fotoExtra, setFotoExtra] = useState<File | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [historial, setHistorial] = useState<CambioHistorial[] | null>(null);
  const [verHistorial, setVerHistorial] = useState(false);
  const [fotoGrande, setFotoGrande] = useState<string | null>(null);
  const [miniatura, setMiniatura] = useState<string | null>(null);

  const cuentan = equiposQueCuentan(equipos);
  const lazoIdDe = (e: EquipoPlano) => lazoDe(e)?.id || null;
  const visibles = ordenarParaLista(cuentan.filter((e) => pasaFiltro(e, avance, filtro, lazoIdDe, etiquetaDe(e))), avance, (e) => etiquetaDe(e));
  // El resumen no depende de los filtros de estado/búsqueda: es del plano (o la etapa elegida).
  const delResumen = cuentan.filter((e) => pasaFiltro(e, avance, { etapa: filtro.etapa, soloFaltan: false }));
  const cuenta = contar(delResumen, avance);
  const pct = porcentajes(cuenta);
  const etapasUsadas = [...new Set(cuentan.map((e) => e.etapa).filter(Boolean) as number[])].sort((a, b) => a - b);
  const tipos = [...new Set(cuentan.map((e) => e.tipo))].sort();
  const losElegidos = cuentan.filter((e) => elegidos.has(e.id));
  const unoSolo = losElegidos.length === 1 ? losElegidos[0] : null;
  const marcaDelUnico = unoSolo ? avance[unoSolo.id] : undefined;
  const bloqueados = cuentan.filter((e) => avance[e.id]?.bloqueo);

  // Ficha: historial y foto del equipo elegido.
  const fotoDelUnico = marcaDelUnico?.bloqueo?.foto || marcaDelUnico?.foto || null;
  useEffect(() => {
    setHistorial(null);
    setVerHistorial(false);
    setMiniatura(null);
    if (fotoDelUnico) urlFotoAvance(fotoDelUnico).then(setMiniatura);
  }, [unoSolo?.id, fotoDelUnico]);

  async function abrirHistorial() {
    if (!unoSolo) return;
    setVerHistorial(!verHistorial);
    if (historial) return;
    try {
      setHistorial(await historialDeEquipo(planoId, unoSolo.id));
    } catch (e: any) {
      showToast(e?.message || 'No se pudo cargar el historial.', 'error');
    }
  }

  async function revertir(cambio: CambioHistorial) {
    if (!(await confirmar(`¿Revertir este cambio? El equipo regresa a «${cambio.antes ? insigniaDe(cambio.antes).nombre : 'Pendiente'}».`))) return;
    try {
      onAvanceDelServidor(await revertirAvance(cambio.id));
      setHistorial(null);
      setVerHistorial(false);
      showToast('Cambio revertido');
    } catch (e: any) {
      showToast(e?.message || 'No se pudo revertir.', 'error');
    }
  }

  // Marcar un estado: con un solo equipo de una vez; con varios, con confirmación.
  async function marcarEstado(estado: EstadoAvance) {
    if (losElegidos.length === 0) return;
    if (losElegidos.length > 1) {
      const texto = `¿Marcar ${losElegidos.length} equipos como «${datosDeEstado(estado).corto}»?`;
      if (!(await confirmar(texto))) return;
    }
    setTrabajando(true);
    try {
      const cambio: CambioAvance = { estado };
      if (comentario.trim()) cambio.comentario = comentario.trim();
      if (fotoExtra) cambio.foto = await subirFotoAvance(planoId, fotoExtra);
      await onMarcar(cambio);
      setDestino(null);
      setExtra(false);
      setComentario('');
      setFotoExtra(null);
    } catch (e: any) {
      showToast(e?.message || 'No se pudo guardar.', 'error');
    } finally {
      setTrabajando(false);
    }
  }

  async function guardarBloqueo() {
    const problema = errorDeBloqueo({ motivo, nota });
    if (problema) {
      setErrorBloqueo(problema);
      return;
    }
    setTrabajando(true);
    try {
      // La foto es opcional: sin foto, el bloqueo se guarda solo con el motivo.
      const foto = fotoBloqueo ? await subirFotoAvance(planoId, fotoBloqueo) : null;
      await onMarcar({ bloqueo: { motivo, nota: nota.trim() || null, foto } });
      setBloqueando(false);
      setMotivo('');
      setNota('');
      setFotoBloqueo(null);
      setErrorBloqueo(null);
    } catch (e: any) {
      setErrorBloqueo(e?.message || 'No se pudo guardar.');
    } finally {
      setTrabajando(false);
    }
  }

  const textoDeLazo = (id: string) => lazos.find((l) => l.id === id)?.nombre || 'Sin lazo';
  // Lo grande: la dirección; sin dirección (sirenas, estrobos), el tipo.
  const titulo = (e: EquipoPlano) => etiquetaDe(e) || tipoDispositivo(e.tipo).nombre;
  // Lo de abajo: el nombre del dispositivo y el tipo, sin repetir.
  const subtitulo = (e: EquipoPlano) => {
    const tipo = tipoDispositivo(e.tipo).nombre;
    const nombre = nombreDe(e);
    if (!etiquetaDe(e)) return nombre === tipo ? '' : nombre;
    return nombre === tipo ? tipo : `${nombre} · ${tipo}`;
  };

  return (
    <div className="pt-1 flex flex-col gap-3">
      {/* ---------- Resumen ---------- */}
      <div className="rounded-2xl border border-line bg-surface-2 p-3.5">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint">
          Avance{filtro.etapa === 'todas' ? '' : ` · ${filtro.etapa === 'sin' ? 'Sin etapa' : nombreEtapa(filtro.etapa)}`} · {cuenta.total} equipos
        </p>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className="rounded-xl bg-surface border border-line p-2.5">
            <p className="font-display font-bold text-[26px] leading-none" style={{ color: ESTADOS_AVANCE[4].color }}>{pct.probado}%</p>
            <p className="text-[12.5px] text-muted mt-1">probado · {pct.probados} de {pct.aplicables}</p>
          </div>
          <div className="rounded-xl bg-surface border border-line p-2.5">
            <p className="font-display font-bold text-[26px] leading-none">{pct.avance}%</p>
            <p className="text-[12.5px] text-muted mt-1">con avance · {pct.conAvance} de {pct.aplicables}</p>
          </div>
        </div>
        {/* Barra segmentada: cada tramo con su letra. */}
        {cuenta.total > 0 && (
          <div className="flex h-7 rounded-lg overflow-hidden bg-surface mt-2.5" role="img"
            aria-label={[...ESTADOS_AVANCE.map((e) => `${e.corto} ${cuenta.porEstado[e.id]}`), `No se puede instalar ${cuenta.bloqueados}`].join(', ')}>
            {[...ESTADOS_AVANCE.map((e) => ({ id: e.id, color: e.color, letra: e.letra, n: cuenta.porEstado[e.id] })), { id: 'bloq', color: COLOR_BLOQUEADO, letra: LETRA_BLOQUEADO, n: cuenta.bloqueados }]
              .filter((t) => t.n > 0)
              .map((t) => (
                <span key={t.id} className="h-full flex items-center justify-center text-white text-[12px] font-bold overflow-hidden" style={{ width: `${(t.n / cuenta.total) * 100}%`, background: t.color }}>
                  {t.n / cuenta.total >= 0.08 ? `${t.letra} ${t.n}` : ''}
                </span>
              ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2.5">
          {ESTADOS_AVANCE.map((estado) => (
            <button key={estado.id} type="button" onClick={() => onFiltro({ ...filtro, estado: filtro.estado === estado.id ? null : estado.id })}
              className={`flex items-center gap-2 text-[13px] rounded-lg px-1 py-0.5 text-left ${filtro.estado === estado.id ? 'bg-teal/15' : ''}`}>
              <Insignia marca={{ estado: estado.id }} />
              <span className="flex-1 min-w-0">{estado.corto}</span>
              <span className="font-mono font-semibold">{cuentaDeEstado(cuenta, estado.id)}</span>
            </button>
          ))}
          <button type="button" onClick={() => onFiltro({ ...filtro, estado: filtro.estado === 'bloqueado' ? null : 'bloqueado' })}
            className={`flex items-center gap-2 text-[13px] rounded-lg px-1 py-0.5 text-left ${filtro.estado === 'bloqueado' ? 'bg-teal/15' : ''}`}>
            <Insignia marca={{ estado: 'pendiente', bloqueo: { motivo: '' } }} />
            <span className="flex-1 min-w-0">No se puede</span>
            <span className="font-mono font-semibold">{cuenta.bloqueados}</span>
          </button>
        </div>
        {pendientes > 0 && (
          <p className="text-[12.5px] text-amber mt-2 flex items-center gap-1.5"><CloudOff size={13} /> {pendientes} {pendientes === 1 ? 'marca guardada' : 'marcas guardadas'} en este teléfono; {pendientes === 1 ? 'sube' : 'suben'} al volver la señal.</p>
        )}
        <button type="button" onClick={onResumen} className="mt-2.5 w-full min-h-[44px] rounded-xl border border-line bg-surface text-[13.5px] font-semibold flex items-center justify-center gap-2">
          <BarChart3 size={16} /> Resumen por nivel y por lazo
        </button>
      </div>

      {/* ---------- Qué hace un toque en el plano ---------- */}
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint mb-1.5">Un toque en el plano</p>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 border border-line p-1" role="radiogroup" aria-label="Qué hace un toque">
          <button type="button" role="radio" aria-checked={modo === 'avanzar'} onClick={() => onModo('avanzar')}
            className={`min-h-[48px] rounded-lg text-[13.5px] font-semibold flex items-center justify-center gap-1.5 ${modo === 'avanzar' ? 'bg-teal text-inkOnAccent' : 'text-muted'}`}>
            <MousePointerClick size={17} /> Avanza un paso
          </button>
          <button type="button" role="radio" aria-checked={modo === 'ficha'} onClick={() => onModo('ficha')}
            className={`min-h-[48px] rounded-lg text-[13.5px] font-semibold flex items-center justify-center gap-1.5 ${modo === 'ficha' ? 'bg-teal text-inkOnAccent' : 'text-muted'}`}>
            <Hand size={17} /> Abre su ficha
          </button>
        </div>
        <p className="text-[12px] text-muted mt-1">
          {modo === 'avanzar' ? 'P → T → I → D → ✓. Si te equivocas, «Deshacer» (o Ctrl+Z).' : 'Toca varios para elegirlos y marcarlos juntos.'}
        </p>
        {puedeDeshacer && (
          <button type="button" onClick={onDeshacer} className="mt-1.5 min-h-[44px] px-4 rounded-xl border border-line bg-surface text-[13.5px] font-semibold flex items-center gap-2">
            <Undo2 size={16} /> Deshacer el último cambio
          </button>
        )}
      </div>

      {/* ---------- Filtros ---------- */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
          <input type="search" value={filtro.texto || ''} onChange={(ev) => onFiltro({ ...filtro, texto: ev.target.value })}
            placeholder="Buscar dirección (D007, L01M004)" aria-label="Buscar por dirección"
            className="w-full pl-9 pr-3 min-h-[46px] rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[15px]" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select value={filtro.lazo || ''} onChange={(ev) => onFiltro({ ...filtro, lazo: ev.target.value || null })} aria-label="Filtrar por lazo"
            className="min-h-[46px] px-2.5 rounded-xl bg-surface border border-line text-[14px]">
            <option value="">Todos los lazos</option>
            {lazos.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            <option value="sin">Sin lazo</option>
          </select>
          <select value={filtro.tipo || ''} onChange={(ev) => onFiltro({ ...filtro, tipo: ev.target.value || null })} aria-label="Filtrar por tipo"
            className="min-h-[46px] px-2.5 rounded-xl bg-surface border border-line text-[14px]">
            <option value="">Todos los tipos</option>
            {tipos.map((t) => <option key={t} value={t}>{tipoDispositivo(t).nombre}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={chip(filtro.soloFaltan)} onClick={() => onFiltro({ ...filtro, soloFaltan: !filtro.soloFaltan })}>Solo lo que falta</button>
          {etapasUsadas.length > 0 && (
            <select value={String(filtro.etapa)} onChange={(ev) => onFiltro({ ...filtro, etapa: ev.target.value === 'todas' || ev.target.value === 'sin' ? ev.target.value : Number(ev.target.value) })}
              aria-label="Etapa de la obra" className="min-h-[42px] px-2.5 rounded-full bg-surface-2 border border-line text-[13.5px] font-semibold">
              <option value="todas">Todas las etapas de obra</option>
              {etapasUsadas.map((n) => <option key={n} value={n}>Etapa {n}</option>)}
              <option value="sin">Sin etapa</option>
            </select>
          )}
          {(filtro.estado || filtro.lazo || filtro.tipo || filtro.texto) && (
            <button type="button" className={`${chip(false)} flex items-center gap-1`} onClick={() => onFiltro({ etapa: filtro.etapa, soloFaltan: filtro.soloFaltan })}><X size={14} /> Quitar filtros</button>
          )}
        </div>
      </div>

      {/* ---------- Elegir varios ---------- */}
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint mb-1.5">Elegir varios</p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => onRecuadro(puntosRecuadro === null)} className={`${chip(puntosRecuadro !== null)} flex items-center gap-1.5`}>
            <BoxSelect size={15} /> {puntosRecuadro === null ? 'Por zona' : puntosRecuadro === 0 ? 'Toca una esquina…' : 'Toca la esquina contraria…'}
          </button>
          <button type="button" className={chip(false)} onClick={() => onElegir(visibles.map((e) => e.id))}>Los {visibles.length} que se ven</button>
          <select value="" onChange={(ev) => { const id = ev.target.value; if (id) onElegir(cuentan.filter((e) => (lazoIdDe(e) || 'sin') === id).map((e) => e.id)); }}
            aria-label="Elegir por lazo" className="min-h-[42px] px-2.5 rounded-full bg-surface-2 border border-line text-[13.5px] font-semibold">
            <option value="">Por lazo…</option>
            {lazos.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            <option value="sin">Sin lazo</option>
          </select>
          <select value="" onChange={(ev) => { const t = ev.target.value; if (t) onElegir(cuentan.filter((e) => e.tipo === t).map((e) => e.id)); }}
            aria-label="Elegir por tipo" className="min-h-[42px] px-2.5 rounded-full bg-surface-2 border border-line text-[13.5px] font-semibold">
            <option value="">Por tipo…</option>
            {tipos.map((t) => <option key={t} value={t}>{tipoDispositivo(t).nombre}</option>)}
          </select>
          {elegidos.size > 0 && <button type="button" className={`${chip(false)} flex items-center gap-1`} onClick={onLimpiar}><X size={14} /> Soltar</button>}
        </div>
      </div>

      {/* ---------- Ficha (uno) o marcar varios ---------- */}
      {losElegidos.length > 0 && (
        <div className="rounded-2xl border border-teal/50 bg-teal/5 p-3.5">
          {unoSolo ? (
            <>
              <div className="flex items-start gap-3">
                <Insignia marca={marcaDelUnico} grande />
                <div className="min-w-0 flex-1">
                  <p className={`font-bold text-[20px] leading-tight ${etiquetaDe(unoSolo) ? 'font-mono' : ''}`}>{titulo(unoSolo)}</p>
                  {nombreDe(unoSolo) !== titulo(unoSolo) && <p className="text-[13.5px] leading-snug">{nombreDe(unoSolo)}</p>}
                  <p className="text-[12.5px] text-muted">{tipoDispositivo(unoSolo.tipo).nombre} · {lazoDe(unoSolo)?.nombre || 'Sin lazo'} · {nombreEtapa(unoSolo.etapa)}</p>
                </div>
              </div>
              <div className="mt-2"><ChipEstado marca={marcaDelUnico} /></div>
              {marcaDelUnico?.nombre && <p className="text-[12.5px] text-muted mt-1.5">Marcó {marcaDelUnico.nombre}{marcaDelUnico.en ? ` · ${fechaHora(marcaDelUnico.en)}` : ''}</p>}
              {marcaDelUnico?.forzado && <p className="text-[12.5px] text-amber mt-1">Probado autorizado sin direccionar: {marcaDelUnico.forzado}</p>}
              {marcaDelUnico?.comentario && <p className="text-[13px] mt-1">«{marcaDelUnico.comentario}»</p>}
              {marcaDelUnico?.bloqueo && (
                <p className="text-[13.5px] mt-1.5 text-red font-semibold">No se puede instalar: {marcaDelUnico.bloqueo.motivo}{marcaDelUnico.bloqueo.nota ? ` — ${marcaDelUnico.bloqueo.nota}` : ''}</p>
              )}
              {miniatura && (
                <button type="button" onClick={() => setFotoGrande(miniatura)} className="mt-2 w-24 h-24 rounded-xl overflow-hidden border border-line" aria-label="Ver la foto">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={miniatura} alt="Foto de evidencia" className="w-full h-full object-cover" />
                </button>
              )}
              <button type="button" onClick={abrirHistorial} className="mt-2 min-h-[40px] px-3 rounded-xl border border-line bg-surface text-[13px] font-semibold flex items-center gap-1.5">
                <History size={15} /> {verHistorial ? 'Ocultar historial' : 'Historial'}
              </button>
              {verHistorial && (
                <ul className="mt-2 rounded-xl border border-line bg-surface divide-y divide-line text-[12.5px]">
                  {historial === null && <li className="px-3 py-2 text-muted">Cargando…</li>}
                  {historial?.length === 0 && <li className="px-3 py-2 text-muted">Sin cambios guardados todavía (el historial empieza con esta versión).</li>}
                  {historial?.map((h) => (
                    <li key={h.id} className="px-3 py-2 flex items-center gap-2">
                      <span className="flex-1 min-w-0">
                        <b>{h.accion === 'revertido' ? 'Revertido' : insigniaDe(h.despues || undefined).nombre}</b>
                        <span className="text-muted"> · {h.nombre || '—'} · {fechaHora(h.en)}</span>
                        {h.despues?.comentario && <span className="block">«{h.despues.comentario}»</span>}
                      </span>
                      {esSupervisor && h.accion === 'marca' && (
                        <button type="button" onClick={() => revertir(h)} className="shrink-0 min-h-[36px] px-2.5 rounded-lg border border-line text-[12px] font-semibold flex items-center gap-1">
                          <RotateCcw size={13} /> Revertir
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="font-semibold text-[15px]">{losElegidos.length} equipos elegidos</p>
          )}

          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint mt-3.5 mb-1.5">{unoSolo ? 'Marcar como' : 'Marcar todos como'}</p>
          <div className="grid grid-cols-1 gap-1.5">
            {ESTADOS_AVANCE.map((estado) => {
              const actual = unoSolo ? estadoDe(avance, unoSolo.id) === estado.id && !marcaDelUnico?.bloqueo : destino === estado.id;
              return (
                <button key={estado.id} type="button" disabled={trabajando}
                  onClick={() => (unoSolo ? marcarEstado(estado.id) : setDestino(estado.id))}
                  className={`min-h-[52px] px-3 rounded-xl border text-left text-[15px] font-semibold flex items-center gap-3 active:scale-[0.98] transition-transform bg-surface disabled:opacity-60 ${actual ? 'border-teal ring-2 ring-teal/40' : 'border-line'}`}>
                  <Insignia marca={{ estado: estado.id }} grande />
                  <span className="flex-1">{estado.nombre}</span>
                </button>
              );
            })}
          </div>

          {/* Comentario y foto opcionales al marcar */}
          <button type="button" onClick={() => setExtra(!extra)} className="mt-2 text-[13px] font-semibold text-teal min-h-[36px]">
            {extra ? 'Sin comentario ni foto' : '+ Comentario o foto (opcional)'}
          </button>
          {extra && (
            <div className="mt-1 flex flex-col gap-2">
              <input type="text" value={comentario} maxLength={300} onChange={(ev) => setComentario(ev.target.value)} placeholder="Comentario"
                className="w-full px-3 min-h-[46px] rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[15px]" />
              <CampoFoto titulo="Foto (necesita señal)" archivo={fotoExtra} onCambiar={setFotoExtra} />
            </div>
          )}

          {!unoSolo && destino && (
            <button type="button" onClick={() => marcarEstado(destino)} disabled={trabajando}
              className="mt-3 w-full min-h-[54px] rounded-xl bg-teal text-inkOnAccent font-bold text-[15.5px] flex items-center justify-center gap-2 disabled:opacity-60">
              {trabajando && <Loader2 size={18} className="animate-spin" />}
              Marcar {losElegidos.length} como {datosDeEstado(destino).corto}
            </button>
          )}

          {/* No se puede instalar: motivo obligatorio, foto opcional */}
          {!bloqueando ? (
            <div className="flex flex-wrap gap-1.5 mt-3">
              <button type="button" onClick={() => setBloqueando(true)}
                className="min-h-[46px] px-3.5 rounded-xl border border-red/50 text-red bg-red/5 text-[14px] font-semibold flex items-center gap-1.5">
                <Ban size={16} /> No se puede instalar…
              </button>
              {losElegidos.some((e) => avance[e.id]?.bloqueo) && (
                <button type="button" onClick={() => onMarcar({ bloqueo: null })} className="min-h-[46px] px-3.5 rounded-xl border border-line bg-surface text-[14px] font-semibold">Ya se puede (quitar motivo)</button>
              )}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-red/40 bg-red/5 p-3 flex flex-col gap-2.5">
              <p className="text-[14px] font-semibold">¿Por qué no se puede instalar{losElegidos.length > 1 ? ` (${losElegidos.length} equipos)` : ''}?</p>
              <div className="flex flex-wrap gap-1.5">
                {MOTIVOS_BLOQUEO.map((m) => (
                  <button key={m} type="button" className={chip(motivo === m)} onClick={() => { setMotivo(m); setErrorBloqueo(null); }}>{m}</button>
                ))}
              </div>
              <input type="text" value={nota} maxLength={300} onChange={(ev) => { setNota(ev.target.value); setErrorBloqueo(null); }}
                placeholder={motivo === 'Otro' ? 'Qué lo impide (obligatorio)' : 'Nota (opcional): qué falta para instalarlo'} aria-label="Nota"
                className="w-full px-3 min-h-[46px] rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[15px]" />
              <CampoFoto titulo="Foto de evidencia (opcional; necesita señal)" archivo={fotoBloqueo} onCambiar={(f) => { setFotoBloqueo(f); setErrorBloqueo(null); }} />
              {errorBloqueo && <p role="alert" className="text-red font-semibold text-[13px]">{errorBloqueo}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => { setBloqueando(false); setErrorBloqueo(null); }} disabled={trabajando} className="min-h-[48px] px-4 rounded-xl border border-line bg-surface text-[14px] font-semibold">Cancelar</button>
                <button type="button" onClick={guardarBloqueo} disabled={trabajando} className="flex-1 min-h-[48px] rounded-xl bg-red text-white text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                  {trabajando && <Loader2 size={17} className="animate-spin" />} Guardar
                </button>
              </div>
            </div>
          )}

          {/* Etapa de obra (dato de diseño, como antes) */}
          <details className="mt-3">
            <summary className="text-[13px] font-semibold text-muted min-h-[36px] flex items-center cursor-pointer">Etapa de la obra</summary>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {ETAPAS.map((n) => (
                <button key={n} type="button" className={`${chip(unoSolo?.etapa === n)} min-w-[44px]`} onClick={() => onEtapa(n)}>{n}</button>
              ))}
              <button type="button" className={chip(false)} onClick={() => onEtapa(null)}>Sin etapa</button>
            </div>
          </details>
        </div>
      )}

      {/* ---------- Lo que no se puede instalar (para supervisión) ---------- */}
      {bloqueados.length > 0 && (
        <div className="rounded-2xl border border-red/40 bg-red/5 p-2.5">
          <p className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-red mb-1">No se puede instalar · {bloqueados.length}</p>
          {bloqueados.map((e) => (
            <button key={e.id} type="button" onClick={() => onAlternar(e.id)}
              className={`w-full text-left px-2 py-2 rounded-lg flex items-start gap-2 ${elegidos.has(e.id) ? 'bg-teal/15' : 'hover:bg-surface'}`}>
              <Insignia marca={avance[e.id]} />
              <span className="min-w-0">
                <span className={`block font-bold text-[15px] ${etiquetaDe(e) ? 'font-mono' : ''}`}>{titulo(e)}</span>
                <span className="block text-[12.5px] text-ink/80">{avance[e.id]?.bloqueo?.motivo}{avance[e.id]?.bloqueo?.nota ? ` — ${avance[e.id]?.bloqueo?.nota}` : ''}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ---------- Lista de equipos ---------- */}
      <div className="rounded-2xl border border-line bg-surface-2 p-2">
        <p className="px-1.5 pt-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-faint mb-1">
          Equipos · {visibles.length}{filtro.lazo ? ` · ${textoDeLazo(filtro.lazo)}` : ''}
        </p>
        {visibles.length === 0 && <p className="px-1.5 pb-2 text-[13px] text-muted">No hay equipos con este filtro.</p>}
        <div className="max-h-[340px] lg:max-h-[420px] overflow-y-auto">
          {visibles.map((e) => (
            <button key={e.id} type="button" onClick={() => onAlternar(e.id)} aria-pressed={elegidos.has(e.id)}
              className={`w-full text-left px-2 py-2 rounded-xl flex items-center gap-2.5 ${elegidos.has(e.id) ? 'bg-teal/15' : 'hover:bg-surface'}`}>
              <span className="min-w-0 flex-1">
                <span className={`block font-bold text-[16px] leading-tight ${etiquetaDe(e) ? 'font-mono' : ''}`}>{titulo(e)}</span>
                {subtitulo(e) && <span className="block text-[12.5px] text-ink/80 leading-snug break-words">{subtitulo(e)}</span>}
              </span>
              <ChipEstado marca={avance[e.id]} />
            </button>
          ))}
        </div>
      </div>

      <button type="button" onClick={onReporte} disabled={generando}
        className="min-h-[50px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[14.5px] flex items-center justify-center gap-2 disabled:opacity-60">
        {generando ? <Loader2 size={17} className="animate-spin" /> : <FileDown size={17} strokeWidth={2.4} />}
        Reporte de avance (PDF)
      </button>
      <p className="text-[12px] text-muted -mt-1.5">Todos los planos del cliente: portada, resumen por nivel y por lazo, lo que falta con su motivo, fotos y espacio para firmas.</p>

      {fotoGrande && <VisorFotos fotos={[{ url: fotoGrande, titulo: 'Foto de evidencia' }]} onCerrar={() => setFotoGrande(null)} />}
    </div>
  );
}
