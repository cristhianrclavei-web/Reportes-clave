'use client';

import { useState } from 'react';
import { Ban, BoxSelect, Check, CloudOff, FileDown, Loader2, X } from 'lucide-react';
import { tipoDispositivo } from '@/lib/lazos';
import {
  COLOR_BLOQUEADO, ESTADOS_AVANCE, ETAPAS, MOTIVOS_BLOQUEO, bloqueoSchema, colorDeAvance, contar, datosDeEstado,
  equiposQueCuentan, estadoDe, instalados, nombreEtapa, pasaFiltro, porcentaje,
  type AvancePlano, type Bloqueo, type EstadoAvance, type FiltroAvance,
} from '@/lib/avancePlano';
import type { EquipoPlano } from '@/lib/planos';

// Panel de la herramienta «Avance» del plano: cuánto va instalado y probado,
// filtros por etapa, y las acciones para marcar los equipos elegidos (uno o
// varios): estado de obra, «no se puede instalar» con su motivo y la etapa.

const chip = (activo: boolean) =>
  `min-h-[38px] px-3 rounded-full border text-[13px] font-semibold transition-colors ${activo ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line text-ink/80'}`;

export default function PanelAvance({
  equipos, avance, elegidos, etiquetaDe, filtro, onFiltro, puntosRecuadro, onRecuadro, onElegir, onAlternar, onLimpiar,
  onMarcar, onEtapa, pendientes, onReporte, generando,
}: {
  equipos: EquipoPlano[];
  avance: AvancePlano;
  elegidos: Set<string>;
  etiquetaDe: (e: EquipoPlano) => string;
  filtro: FiltroAvance;
  onFiltro: (f: FiltroAvance) => void;
  // null = no se está eligiendo por recuadro; 0 o 1 = esquinas ya tocadas.
  puntosRecuadro: number | null;
  onRecuadro: (activo: boolean) => void;
  onElegir: (ids: string[]) => void;
  // Agrega o quita un equipo de los elegidos (desde la lista).
  onAlternar: (id: string) => void;
  onLimpiar: () => void;
  onMarcar: (cambio: { estado?: EstadoAvance; bloqueo?: Bloqueo | null }) => void;
  onEtapa: (etapa: number | null) => void;
  // Marcas que no han subido por falta de señal.
  pendientes: number;
  onReporte: () => void;
  generando: boolean;
}) {
  const [bloqueando, setBloqueando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [nota, setNota] = useState('');
  const [errorBloqueo, setErrorBloqueo] = useState<string | null>(null);

  const cuentan = equiposQueCuentan(equipos);
  const visibles = cuentan.filter((e) => pasaFiltro(e, avance, filtro));
  const cuenta = contar(visibles, avance);
  const etapasUsadas = [...new Set(cuentan.map((e) => e.etapa).filter(Boolean) as number[])].sort((a, b) => a - b);
  const haySinEtapa = cuentan.some((e) => !e.etapa);
  const losElegidos = cuentan.filter((e) => elegidos.has(e.id));
  const unoSolo = losElegidos.length === 1 ? losElegidos[0] : null;
  const marcaDelUnico = unoSolo ? avance[unoSolo.id] : undefined;
  const algunoBloqueado = losElegidos.some((e) => avance[e.id]?.bloqueo);

  function guardarBloqueo() {
    const valido = bloqueoSchema.safeParse({ motivo, nota: nota || null });
    if (!valido.success) {
      setErrorBloqueo(valido.error.issues[0]?.message || 'Revisa el motivo.');
      return;
    }
    if (valido.data.motivo === 'Otro' && !valido.data.nota) {
      setErrorBloqueo('Con «Otro», escribe en la nota qué lo impide.');
      return;
    }
    onMarcar({ bloqueo: { motivo: valido.data.motivo, nota: valido.data.nota || null } });
    setBloqueando(false);
    setMotivo('');
    setNota('');
    setErrorBloqueo(null);
  }

  return (
    <div className="pt-1 flex flex-col gap-3">
      {/* Resumen de lo que se ve con el filtro */}
      <div className="rounded-2xl border border-line bg-surface-2 p-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint">
            Avance{filtro.etapa === 'todas' ? '' : ` · ${filtro.etapa === 'sin' ? 'Sin etapa' : nombreEtapa(filtro.etapa)}`} · {cuenta.total} equipos
          </p>
          <p className="font-display font-bold text-[20px] leading-none">{porcentaje(cuenta.porEstado.probado, cuenta.total)}%<span className="text-[11px] font-sans font-semibold text-muted"> probado</span></p>
        </div>
        {/* Barra por estado */}
        <div className="flex h-3 rounded-full overflow-hidden bg-surface mt-2.5" role="img" aria-label="Equipos por estado">
          {ESTADOS_AVANCE.map((estado) => (
            cuenta.porEstado[estado.id] > 0 && (
              <span key={estado.id} style={{ width: `${(cuenta.porEstado[estado.id] / cuenta.total) * 100}%`, background: estado.color }} />
            )
          ))}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2.5">
          {ESTADOS_AVANCE.map((estado) => (
            <p key={estado.id} className="flex items-center gap-2 text-[13px]">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: estado.color }} />
              <span className="flex-1 min-w-0 truncate">{estado.corto}</span>
              <span className="font-mono font-semibold">{cuenta.porEstado[estado.id]}</span>
            </p>
          ))}
          <p className="flex items-center gap-2 text-[13px]">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: COLOR_BLOQUEADO }} />
            <span className="flex-1 min-w-0 truncate">No se puede instalar</span>
            <span className="font-mono font-semibold">{cuenta.bloqueados}</span>
          </p>
        </div>
        <p className="text-[12.5px] text-muted mt-2">Instalados (con o sin prueba): <b className="text-ink">{instalados(cuenta)}</b> de {cuenta.total}.</p>
        {pendientes > 0 && (
          <p className="text-[12.5px] text-amber mt-2 flex items-center gap-1.5"><CloudOff size={13} /> {pendientes} {pendientes === 1 ? 'marca guardada' : 'marcas guardadas'} en este teléfono; {pendientes === 1 ? 'sube' : 'suben'} al volver la señal.</p>
        )}
      </div>

      {/* Filtros */}
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint mb-1.5">Ver</p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={chip(filtro.etapa === 'todas')} onClick={() => onFiltro({ ...filtro, etapa: 'todas' })}>Todas</button>
          {etapasUsadas.map((n) => (
            <button key={n} type="button" className={chip(filtro.etapa === n)} onClick={() => onFiltro({ ...filtro, etapa: n })}>Etapa {n}</button>
          ))}
          {haySinEtapa && etapasUsadas.length > 0 && (
            <button type="button" className={chip(filtro.etapa === 'sin')} onClick={() => onFiltro({ ...filtro, etapa: 'sin' })}>Sin etapa</button>
          )}
          <button type="button" className={chip(filtro.soloFaltan)} onClick={() => onFiltro({ ...filtro, soloFaltan: !filtro.soloFaltan })}>Solo lo que falta</button>
        </div>
      </div>

      {/* Elegir */}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => onRecuadro(puntosRecuadro === null)}
          className={`${chip(puntosRecuadro !== null)} flex items-center gap-1.5`}>
          <BoxSelect size={15} /> {puntosRecuadro === null ? 'Elegir por zona' : puntosRecuadro === 0 ? 'Toca una esquina de la zona…' : 'Toca la esquina contraria…'}
        </button>
        <button type="button" className={chip(false)} onClick={() => onElegir(visibles.map((e) => e.id))}>Elegir los {visibles.length} que se ven</button>
        {elegidos.size > 0 && (
          <button type="button" className={`${chip(false)} flex items-center gap-1`} onClick={onLimpiar}><X size={14} /> Soltar</button>
        )}
      </div>

      {/* Acciones sobre los elegidos */}
      {losElegidos.length === 0 ? (
        <p className="text-[13px] text-muted">
          Toca uno o varios equipos en el plano para marcar en qué van. Con «Elegir por zona» tocas dos esquinas y se eligen todos los de adentro.
        </p>
      ) : (
        <div className="rounded-2xl border border-teal/50 bg-teal/5 p-3.5">
          <p className="font-semibold text-[14.5px]">
            {unoSolo ? `${etiquetaDe(unoSolo) || tipoDispositivo(unoSolo.tipo).nombre} · ${tipoDispositivo(unoSolo.tipo).nombre}` : `${losElegidos.length} equipos elegidos`}
          </p>
          {unoSolo && (
            <p className="text-[12.5px] text-muted mt-0.5">
              {datosDeEstado(estadoDe(avance, unoSolo.id)).nombre} · {nombreEtapa(unoSolo.etapa)}
              {marcaDelUnico?.nombre ? ` · marcó ${marcaDelUnico.nombre}` : ''}
              {marcaDelUnico?.en ? ` el ${new Date(marcaDelUnico.en).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', timeZone: 'America/Mexico_City' })}` : ''}
            </p>
          )}
          {unoSolo && marcaDelUnico?.bloqueo && (
            <p className="text-[13px] mt-1.5 text-red font-semibold">No se puede instalar: {marcaDelUnico.bloqueo.motivo}{marcaDelUnico.bloqueo.nota ? ` — ${marcaDelUnico.bloqueo.nota}` : ''}</p>
          )}

          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint mt-3 mb-1.5">Marcar como</p>
          <div className="grid gap-1.5">
            {ESTADOS_AVANCE.map((estado) => {
              const actual = unoSolo ? estadoDe(avance, unoSolo.id) === estado.id : false;
              return (
                <button key={estado.id} type="button" onClick={() => onMarcar({ estado: estado.id })}
                  className={`min-h-[46px] px-3 rounded-xl border text-left text-[14.5px] font-semibold flex items-center gap-2.5 active:scale-[0.98] transition-transform ${actual ? 'border-teal bg-surface' : 'border-line bg-surface'}`}>
                  <span className="w-4 h-4 rounded-full shrink-0" style={{ background: estado.color }} />
                  <span className="flex-1">{estado.nombre}</span>
                  {actual && <Check size={17} strokeWidth={2.6} className="text-teal" />}
                </button>
              );
            })}
          </div>

          {/* No se puede instalar */}
          {!bloqueando ? (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <button type="button" onClick={() => setBloqueando(true)}
                className="min-h-[42px] px-3 rounded-xl border border-red/50 text-red bg-red/5 text-[13.5px] font-semibold flex items-center gap-1.5">
                <Ban size={15} /> No se puede instalar…
              </button>
              {algunoBloqueado && (
                <button type="button" onClick={() => onMarcar({ bloqueo: null })} className="min-h-[42px] px-3 rounded-xl border border-line bg-surface text-[13.5px] font-semibold">Ya se puede (quitar motivo)</button>
              )}
            </div>
          ) : (
            <div className="mt-2.5 rounded-xl border border-red/40 bg-red/5 p-3">
              <p className="text-[13.5px] font-semibold mb-1.5">¿Por qué no se puede instalar?</p>
              <div className="flex flex-wrap gap-1.5">
                {MOTIVOS_BLOQUEO.map((m) => (
                  <button key={m} type="button" className={chip(motivo === m)} onClick={() => { setMotivo(m); setErrorBloqueo(null); }}>{m}</button>
                ))}
              </div>
              <label className="block text-[12px] font-semibold text-muted mt-2.5 mb-1" htmlFor="nota-bloqueo">Nota (qué falta para poder instalarlo)</label>
              <input id="nota-bloqueo" type="text" value={nota} maxLength={300} onChange={(ev) => setNota(ev.target.value)} placeholder="Ej. falta colado de losa en el pasillo"
                className="w-full px-3 min-h-[44px] rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[14px]" />
              {errorBloqueo && <p className="text-red font-semibold text-[13px] mt-1.5">{errorBloqueo}</p>}
              <div className="flex gap-2 mt-2.5">
                <button type="button" onClick={() => { setBloqueando(false); setErrorBloqueo(null); }} className="min-h-[44px] px-4 rounded-xl border border-line bg-surface text-[14px] font-semibold">Cancelar</button>
                <button type="button" onClick={guardarBloqueo} className="flex-1 min-h-[44px] rounded-xl bg-red text-white text-[14px] font-semibold">Guardar motivo</button>
              </div>
            </div>
          )}

          {/* Etapa de obra */}
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint mt-3.5 mb-1.5">Etapa de la obra</p>
          <div className="flex flex-wrap gap-1.5">
            {ETAPAS.map((n) => (
              <button key={n} type="button" className={`${chip(unoSolo?.etapa === n)} min-w-[42px]`} onClick={() => onEtapa(n)}>{n}</button>
            ))}
            <button type="button" className={chip(false)} onClick={() => onEtapa(null)}>Sin etapa</button>
          </div>
        </div>
      )}

      {/* Lista de equipos */}
      <div className="rounded-2xl border border-line bg-surface-2 p-2">
        <p className="px-1.5 pt-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-faint mb-1">Equipos · {visibles.length}</p>
        {visibles.length === 0 && <p className="px-1.5 pb-2 text-[13px] text-muted">No hay equipos con este filtro.</p>}
        <div className="max-h-[260px] lg:max-h-[340px] overflow-y-auto">
          {visibles.map((e) => {
            const marca = avance[e.id];
            const elegido = elegidos.has(e.id);
            return (
              <button key={e.id} type="button" onClick={() => onAlternar(e.id)}
                className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 text-[13px] ${elegido ? 'bg-teal/15' : 'hover:bg-surface'}`}>
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: colorDeAvance(marca) }} />
                <span className="font-mono font-semibold w-[84px] shrink-0 truncate">{etiquetaDe(e) || '—'}</span>
                <span className="flex-1 min-w-0 truncate text-ink/80">{tipoDispositivo(e.tipo).nombre}</span>
                <span className="text-faint shrink-0">{e.etapa ? `E${e.etapa}` : ''}</span>
                <span className={`shrink-0 text-[12px] font-semibold ${marca?.bloqueo ? 'text-red' : 'text-muted'}`}>{marca?.bloqueo ? marca.bloqueo.motivo : datosDeEstado(estadoDe(avance, e.id)).corto}</span>
              </button>
            );
          })}
        </div>
      </div>

      <button type="button" onClick={onReporte} disabled={generando}
        className="min-h-[48px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[14.5px] flex items-center justify-center gap-2 disabled:opacity-60">
        {generando ? <Loader2 size={17} className="animate-spin" /> : <FileDown size={17} strokeWidth={2.4} />}
        Reporte de avance del proyecto (PDF)
      </button>
      <p className="text-[12px] text-muted -mt-1.5">Incluye todos los planos de este cliente: resumen por etapa y por tipo, cada plano con colores y la lista de lo que falta.</p>
    </div>
  );
}
