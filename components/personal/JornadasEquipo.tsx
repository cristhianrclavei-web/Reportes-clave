'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { createClient } from '@/lib/supabaseClient';
import { hoyLocal, sumarDias, fechaLocal } from '@/lib/fechaHoy';
import { fechaLargaCalendario } from '@/lib/calendarioMes';
import { ClaseTiempo } from '@/lib/jornada';
import { DatosJornadas, ResumenTecnico, cargarDatosJornadas, jornadaDeTecnico, resumenDeJornadas, sumarMinutos, guardarHorarioJornada, estadisticasJornada } from '@/lib/jornadaDatos';
import { showToast } from '@/components/Toast';
import { duracionTexto } from '@/lib/lineaDelDia';
import { useCuadrillas, cuadrillaPorTecnico, enCuadrilla, TODAS } from '@/lib/cuadrillas';
import { FiltroCuadrillas } from '@/components/cuadrillas/ChipsCuadrilla';
import { AvatarTecnico } from '@/components/AvatarTecnico';
import SubTabs from '@/components/SubTabs';
import JornadaDia, { RepartoTiempo } from '@/components/bitacora/JornadaDia';

// Personal → Jornadas: en qué se va el tiempo de cada técnico y de cada
// cuadrilla (trabajo en servicio, traslados, compras, oficina, comida…) y
// cuánto de la jornada quedó sin registrar. Se ve por día, semana o mes;
// al tocar a alguien se abre su día hora por hora.

type Periodo = 'dia' | 'semana' | 'mes';
type Orden = 'sin_registrar' | 'servicio' | 'nombre';

function rangoDe(periodo: Periodo, fecha: string): { desde: string; hasta: string } {
  if (periodo === 'dia') return { desde: fecha, hasta: fecha };
  if (periodo === 'semana') {
    const diaSemana = (fechaLocal(fecha).getDay() + 6) % 7; // lunes = 0
    const lunes = sumarDias(fecha, -diaSemana);
    return { desde: lunes, hasta: sumarDias(lunes, 6) };
  }
  const primero = `${fecha.slice(0, 8)}01`;
  const siguienteMes = `${sumarDias(primero, 32).slice(0, 8)}01`;
  return { desde: primero, hasta: sumarDias(siguienteMes, -1) };
}

function moverPeriodo(periodo: Periodo, fecha: string, paso: number): string {
  if (periodo === 'dia') return sumarDias(fecha, paso);
  if (periodo === 'semana') return sumarDias(fecha, paso * 7);
  const d = fechaLocal(`${fecha.slice(0, 8)}01`);
  d.setMonth(d.getMonth() + paso);
  return hoyLocal(d);
}

function etiquetaPeriodo(periodo: Periodo, fecha: string, hoy: string): string {
  const { desde, hasta } = rangoDe(periodo, fecha);
  if (periodo === 'dia') return `${fecha === hoy ? 'Hoy · ' : ''}${fechaLargaCalendario(fecha)}`;
  if (periodo === 'semana') {
    const corta = (f: string) => fechaLocal(f).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
    return `Semana del ${corta(desde)} al ${corta(hasta)}`;
  }
  return fechaLocal(desde).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
}

function total(porClase: Partial<Record<ClaseTiempo, number>>): number {
  return Object.values(porClase).reduce((n, v) => n + (v || 0), 0);
}
function pct(parte: number, todo: number): number {
  return todo > 0 ? Math.round((parte / todo) * 100) : 0;
}

export default function JornadasEquipo() {
  const [hoy, setHoy] = useState<string | null>(null);
  const [ahora, setAhora] = useState(0);
  const [periodo, setPeriodo] = useState<Periodo>('dia');
  const [fecha, setFecha] = useState<string | null>(null);
  const [tecnicos, setTecnicos] = useState<{ id: string; full_name: string }[]>([]);
  const [datos, setDatos] = useState<DatosJornadas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState(TODAS);
  const [vista, setVista] = useState<'tecnico' | 'cuadrilla'>('tecnico');
  const [orden, setOrden] = useState<Orden>('sin_registrar');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);
  const [verAyuda, setVerAyuda] = useState(false);
  // Editor del horario de la jornada (hora de entrada y de salida).
  const [editandoHorario, setEditandoHorario] = useState(false);
  const [horaEntrada, setHoraEntrada] = useState('');
  const [horaSalida, setHoraSalida] = useState('');
  const [guardandoHorario, setGuardandoHorario] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const { cuadrillas } = useCuadrillas();
  const mapaCuadrillas = useMemo(() => cuadrillaPorTecnico(cuadrillas), [cuadrillas]);

  useEffect(() => {
    // Fecha y hora se leen ya montado (el servidor está en UTC).
    const h = hoyLocal();
    setHoy(h);
    setFecha(h);
    setAhora(Date.now());
    const reloj = setInterval(() => setAhora(Date.now()), 60000);
    createClient().from('profiles').select('id, full_name').eq('role', 'tecnico').eq('activo', true).order('full_name')
      .then(({ data, error: e }) => {
        if (e) setError('No se pudo cargar al personal: ' + e.message);
        setTecnicos(data || []);
      });
    return () => clearInterval(reloj);
  }, []);

  useEffect(() => {
    if (!fecha) return;
    const { desde, hasta } = rangoDe(periodo, fecha);
    let vigente = true;
    setCargando(true);
    setError(null);
    cargarDatosJornadas(desde, hasta)
      .then((d) => { if (vigente) setDatos(d); })
      .catch((e) => { if (vigente) setError('No se pudieron cargar las jornadas: ' + (e?.message || 'revisa tu conexión.')); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [periodo, fecha, recarga]);

  const visibles = useMemo(
    () => tecnicos.filter((t) => enCuadrilla(filtro, mapaCuadrillas, t.id)),
    [tecnicos, filtro, mapaCuadrillas],
  );

  const resumen = useMemo<ResumenTecnico[]>(() => {
    if (!datos || !fecha || !hoy) return [];
    const { desde, hasta } = rangoDe(periodo, fecha);
    const fechas: string[] = [];
    for (let f = desde; f <= hasta && f <= hoy; f = sumarDias(f, 1)) fechas.push(f);
    return resumenDeJornadas(datos, visibles.map((t) => t.id), fechas, ahora);
  }, [datos, fecha, hoy, periodo, visibles, ahora]);

  if (!hoy || !fecha) return <div className="h-[300px] rounded-3xl bg-surface border border-line animate-pulse" aria-busy="true" />;

  const nombre = new Map(tecnicos.map((t) => [t.id, t.full_name]));
  const equipo = resumen.reduce((acc, r) => sumarMinutos(acc, r.porClase), {} as Partial<Record<ClaseTiempo, number>>);
  const totalEquipo = total(equipo);
  const sinRegistrar = equipo.sin_registrar || 0;
  const enServicio = equipo.servicio || 0;
  // Promedios por técnico y por día con registros.
  const estEquipo = estadisticasJornada(equipo, resumen.reduce((n, r) => n + r.dias.length, 0));

  // Filas: por técnico o por cuadrilla (suma de sus miembros).
  type Fila = { clave: string; titulo: string; porClase: Partial<Record<ClaseTiempo, number>>; diasSinRegistros: number; miembros: ResumenTecnico[]; color?: number };
  // Días con registro de la fila (suma de sus miembros), para los promedios.
  const diasDe = (f: Fila) => f.miembros.reduce((n, m) => n + m.dias.length, 0);
  let filas: Fila[];
  if (vista === 'cuadrilla') {
    const grupos = new Map<string, Fila>();
    for (const r of resumen) {
      const c = mapaCuadrillas.get(r.tecnicoId);
      const clave = c?.id || 'sin';
      const fila = grupos.get(clave) || { clave, titulo: c?.nombre || 'Sin cuadrilla', porClase: {}, diasSinRegistros: 0, miembros: [], color: c?.color };
      fila.porClase = sumarMinutos(fila.porClase, r.porClase);
      fila.diasSinRegistros += r.diasSinRegistros;
      fila.miembros.push(r);
      grupos.set(clave, fila);
    }
    filas = Array.from(grupos.values());
  } else {
    filas = resumen.map((r) => ({ clave: r.tecnicoId, titulo: nombre.get(r.tecnicoId) || 'Técnico', porClase: r.porClase, diasSinRegistros: r.diasSinRegistros, miembros: [r] }));
  }
  filas.sort((a, b) => {
    if (orden === 'nombre') return a.titulo.localeCompare(b.titulo);
    const clave: ClaseTiempo = orden === 'servicio' ? 'servicio' : 'sin_registrar';
    return pct(b.porClase[clave] || 0, total(b.porClase)) - pct(a.porClase[clave] || 0, total(a.porClase)) || a.titulo.localeCompare(b.titulo);
  });

  async function guardarHorario() {
    setGuardandoHorario(true);
    try {
      await guardarHorarioJornada({ inicio: horaEntrada, fin: horaSalida });
      showToast('Horario de jornada guardado', 'success');
      setEditandoHorario(false);
      setRecarga((n) => n + 1);
    } catch (e: any) {
      showToast('No se pudo guardar el horario: ' + (e?.message || 'revisa tu conexión.'), 'error');
    } finally {
      setGuardandoHorario(false);
    }
  }

  function abrirFila(clave: string) {
    setAbierto(abierto === clave ? null : clave);
    setDiaAbierto(periodo === 'dia' ? fecha : null);
  }

  function diaDetalle(tecnicoId: string, dia: string) {
    if (!datos) return null;
    return (
      <JornadaDia
        dia={jornadaDeTecnico(datos, tecnicoId, dia, ahora)}
        esHoy={dia === hoy}
        ahora={ahora}
        hrefServicio={(id) => `/dashboard/servicios/${id}`}
        hrefActividad={(id) => `/bitacora/${id}`}
      />
    );
  }

  function detalleTecnico(r: ResumenTecnico) {
    if (periodo === 'dia') return diaDetalle(r.tecnicoId, fecha!);
    if (r.dias.length === 0) return <p className="text-[13px] text-muted">Sin registros en este periodo.</p>;
    return (
      <div className="flex flex-col gap-2">
        {r.dias.map((d) => (
          <div key={d.fecha}>
            <button type="button" onClick={() => setDiaAbierto(diaAbierto === d.fecha ? null : d.fecha)} aria-expanded={diaAbierto === d.fecha}
              className="w-full flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-left">
              <span className="w-[92px] shrink-0 text-[12.5px] font-semibold first-letter:uppercase">
                {fechaLocal(d.fecha).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
              <span className="flex-1 min-w-0"><RepartoTiempo porClase={d.porClase} compacta /></span>
              <span className={`text-[12px] tabular-nums shrink-0 w-14 text-right ${(d.porClase.sin_registrar || 0) > 0 ? 'text-amber font-semibold' : 'text-muted'}`}>
                {pct(d.porClase.sin_registrar || 0, total(d.porClase))}% s/r
              </span>
              <ChevronDown size={15} className={`shrink-0 text-muted transition-transform ${diaAbierto === d.fecha ? 'rotate-180' : ''}`} />
            </button>
            {diaAbierto === d.fecha && <div className="mt-2 mb-2 pl-1">{diaDetalle(r.tecnicoId, d.fecha)}</div>}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Periodo */}
      <div className="rounded-3xl bg-surface border border-line p-4 flex flex-col gap-3">
        <SubTabs
          activa={periodo}
          onCambiar={(p) => { setPeriodo(p); setAbierto(null); }}
          opciones={[
            { k: 'dia' as const, label: 'Día' },
            { k: 'semana' as const, label: 'Semana' },
            { k: 'mes' as const, label: 'Mes' },
          ]}
          className="mb-0"
        />
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 font-display font-bold text-[18px] tracking-wide leading-tight first-letter:uppercase">{etiquetaPeriodo(periodo, fecha, hoy)}</p>
          {rangoDe(periodo, fecha).hasta < hoy || rangoDe(periodo, fecha).desde > hoy ? (
            <button type="button" onClick={() => setFecha(hoy)} className="shrink-0 h-10 px-3.5 rounded-full border border-teal/45 bg-teal/10 text-teal text-[13px] font-semibold active:scale-95 transition-transform">Actual</button>
          ) : null}
          <button type="button" onClick={() => { setFecha(moverPeriodo(periodo, fecha, -1)); setAbierto(null); }} aria-label="Periodo anterior" className="shrink-0 w-10 h-10 rounded-full border border-line bg-surface-2 flex items-center justify-center active:scale-90 transition">
            <ChevronLeft size={19} strokeWidth={2.4} />
          </button>
          <button type="button" onClick={() => { setFecha(moverPeriodo(periodo, fecha, 1)); setAbierto(null); }} disabled={rangoDe(periodo, fecha).hasta >= hoy} aria-label="Periodo siguiente" className="shrink-0 w-10 h-10 rounded-full border border-line bg-surface-2 flex items-center justify-center active:scale-90 transition disabled:opacity-35">
            <ChevronRight size={19} strokeWidth={2.4} />
          </button>
        </div>
        <FiltroCuadrillas cuadrillas={cuadrillas} mapa={mapaCuadrillas} ids={tecnicos.map((t) => t.id)} valor={filtro} onCambiar={setFiltro} />
        {datos && !editandoHorario && (
          <p className="text-[12.5px] text-muted">
            Jornada de lunes a viernes: {datos.horario.inicio} a {datos.horario.fin}.{' '}
            <button type="button" onClick={() => { setHoraEntrada(datos.horario.inicio); setHoraSalida(datos.horario.fin); setEditandoHorario(true); }} className="text-teal font-semibold underline-offset-2 hover:underline">
              Cambiar
            </button>
          </p>
        )}
        {editandoHorario && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="block text-[11.5px] font-semibold uppercase tracking-wider text-muted mb-1">Entrada</span>
              <input type="time" value={horaEntrada} onChange={(e) => setHoraEntrada(e.target.value)} className="min-h-[42px] px-3 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14px]" />
            </label>
            <label className="block">
              <span className="block text-[11.5px] font-semibold uppercase tracking-wider text-muted mb-1">Salida</span>
              <input type="time" value={horaSalida} onChange={(e) => setHoraSalida(e.target.value)} className="min-h-[42px] px-3 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14px]" />
            </label>
            <button type="button" onClick={() => setEditandoHorario(false)} disabled={guardandoHorario} className="min-h-[42px] px-4 rounded-xl border border-line-strong text-[13.5px] font-medium">Cancelar</button>
            <button type="button" onClick={guardarHorario} disabled={guardandoHorario} className="min-h-[42px] px-4 rounded-xl bg-teal text-inkOnAccent text-[13.5px] font-semibold disabled:opacity-60">
              {guardandoHorario ? 'Guardando…' : 'Guardar'}
            </button>
            {horaEntrada && horaSalida && horaSalida <= horaEntrada && <p className="w-full text-[12.5px] text-red">La salida debe ser después de la entrada.</p>}
          </div>
        )}
      </div>

      {error && <p className="text-[13.5px] text-red">{error}</p>}

      {/* En qué se va el tiempo del equipo */}
      <div className="rounded-3xl bg-surface border border-line p-4 sm:p-5">
        <div className="flex items-start gap-2 mb-3">
          <h2 className="flex-1 font-display font-semibold text-[16px] tracking-wide">¿En qué se va el tiempo?</h2>
          <button type="button" onClick={() => setVerAyuda(!verAyuda)} aria-expanded={verAyuda} className="shrink-0 min-h-[32px] px-2 text-[12.5px] font-semibold text-teal flex items-center gap-1">
            <Info size={14} strokeWidth={2.4} /> Cómo se calcula
          </button>
        </div>
        {verAyuda && (
          <ul className="rounded-xl bg-surface-2/70 border border-line px-3.5 py-3 mb-3 flex flex-col gap-1.5 text-[12.5px] text-ink/80 leading-snug list-disc pl-7">
            <li>Cada día cuenta de la hora de entrada a la de salida de la jornada (Ajustes), o desde antes o hasta después si se registró algo fuera de ese horario. Sábados, domingos y festivos solo cuenta lo registrado.</li>
            <li><b>Trabajo en servicio</b>: de la llegada al cierre del servicio, sin la comida, sin las pausas y sin lo que se registró en la bitácora a esa hora (por ejemplo, una salida por material).</li>
            <li>Cada minuto se cuenta una sola vez. Si dos cosas caen a la misma hora, manda la bitácora sobre la pausa y la pausa sobre el servicio.</li>
            <li><b>Sin registrar</b>: tramos de 5 minutos o más de la jornada sin servicio ni actividad. Los días sin ningún registro (vacaciones, faltas) no se cuentan aquí; se indican aparte.</li>
          </ul>
        )}
        {cargando && !datos ? (
          <div className="h-[120px] rounded-2xl bg-surface-2 animate-pulse" aria-busy="true" />
        ) : totalEquipo === 0 ? (
          <p className="text-[13.5px] text-muted py-4 text-center">No hay registros en este periodo.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              {([
                ['Jornada registrada', `${pct(totalEquipo - sinRegistrar, totalEquipo)}%`, duracionTexto(totalEquipo - sinRegistrar), 'text-teal'],
                ['Trabajo en servicio', `${pct(enServicio, totalEquipo)}%`, duracionTexto(enServicio), 'text-ink'],
                ['Registrado por día', duracionTexto(estEquipo.registradoPorDia), `promedio por técnico · ${duracionTexto(estEquipo.servicioPorDia)} en servicio`, 'text-ink'],
                ['Sin registrar', `${pct(sinRegistrar, totalEquipo)}%`, duracionTexto(sinRegistrar), sinRegistrar > 0 ? 'text-amber' : 'text-muted'],
              ] as const).map(([rotulo, valor, detalle, color]) => (
                <div key={rotulo} className="rounded-xl bg-surface-2/70 px-3 py-2.5">
                  <span className="block text-[11px] uppercase tracking-wider text-muted">{rotulo}</span>
                  <span className={`block font-display font-bold text-[22px] tabular-nums leading-tight ${color}`}>{valor}</span>
                  <span className="block text-[12px] text-muted tabular-nums">{detalle}</span>
                </div>
              ))}
            </div>
            <RepartoTiempo porClase={equipo} />
          </>
        )}
      </div>

      {/* Por técnico o por cuadrilla */}
      <div className="rounded-3xl bg-surface border border-line p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h2 className="w-full sm:w-auto sm:flex-1 font-display font-semibold text-[16px] tracking-wide">{vista === 'cuadrilla' ? 'Por cuadrilla' : 'Por técnico'}</h2>
          {cuadrillas.length > 0 && (
            <select value={vista} onChange={(e) => { setVista(e.target.value as 'tecnico' | 'cuadrilla'); setAbierto(null); }} aria-label="Agrupar"
              className="min-h-[36px] px-3 rounded-full bg-surface-2 border border-line text-[12.5px]">
              <option value="tecnico">Por técnico</option>
              <option value="cuadrilla">Por cuadrilla</option>
            </select>
          )}
          <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)} aria-label="Ordenar"
            className="min-h-[36px] px-3 rounded-full bg-surface-2 border border-line text-[12.5px]">
            <option value="sin_registrar">Más sin registrar</option>
            <option value="servicio">Más en servicio</option>
            <option value="nombre">Por nombre</option>
          </select>
        </div>

        <div className="flex flex-col gap-2">
          {filas.map((f) => {
            const t = total(f.porClase);
            const sinReg = f.porClase.sin_registrar || 0;
            return (
              <div key={f.clave}>
                <button type="button" onClick={() => abrirFila(f.clave)} aria-expanded={abierto === f.clave}
                  className={`w-full text-left rounded-2xl border px-3 py-2.5 transition-colors ${abierto === f.clave ? 'border-teal/60 bg-surface-2/50' : 'border-line hover:border-line-strong'}`}>
                  <span className="flex items-center gap-3">
                    {vista === 'tecnico' ? (
                      <AvatarTecnico nombre={f.titulo} id={f.clave} size={36} />
                    ) : (
                      <span className="w-9 h-9 rounded-full bg-teal/15 text-teal text-[12px] font-bold flex items-center justify-center shrink-0">{f.miembros.length}</span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold truncate">{f.titulo}</span>
                      <span className="block text-[12px] text-muted">
                        {t > 0 ? `${duracionTexto(t - sinReg)} registradas${periodo !== 'dia' ? ` (${duracionTexto(estadisticasJornada(f.porClase, diasDe(f)).registradoPorDia)} por día)` : ''} · ${pct(f.porClase.servicio || 0, t)}% en servicio` : 'Sin registros'}
                        {f.diasSinRegistros > 0 && periodo !== 'dia' ? ` · ${f.diasSinRegistros} día${f.diasSinRegistros > 1 ? 's' : ''} sin nada` : ''}
                      </span>
                    </span>
                    <span className={`shrink-0 text-[12.5px] font-semibold tabular-nums px-2 py-0.5 rounded-full ${pct(sinReg, t) >= 15 ? 'bg-amber/15 text-amber' : 'bg-surface-2 text-muted'}`}>
                      {t > 0 ? `${pct(sinReg, t)}% s/r` : '—'}
                    </span>
                    <ChevronDown size={16} className={`shrink-0 text-muted transition-transform ${abierto === f.clave ? 'rotate-180' : ''}`} />
                  </span>
                  {t > 0 && <span className="block mt-2"><RepartoTiempo porClase={f.porClase} compacta /></span>}
                </button>
                {abierto === f.clave && (
                  <div className="mt-2 mb-1 pl-1">
                    {vista === 'tecnico' ? detalleTecnico(f.miembros[0]) : (
                      <div className="flex flex-col gap-1.5">
                        {f.miembros.map((m) => {
                          const tm = total(m.porClase);
                          return (
                            <div key={m.tecnicoId} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2">
                              <AvatarTecnico nombre={nombre.get(m.tecnicoId) || ''} id={m.tecnicoId} size={28} />
                              <span className="w-[120px] shrink-0 text-[13px] font-semibold truncate">{nombre.get(m.tecnicoId)}</span>
                              <span className="flex-1 min-w-0">{tm > 0 ? <RepartoTiempo porClase={m.porClase} compacta /> : <span className="text-[12px] text-muted">Sin registros</span>}</span>
                              <span className="shrink-0 text-[12px] tabular-nums text-muted w-14 text-right">{tm > 0 ? `${pct(m.porClase.sin_registrar || 0, tm)}% s/r` : ''}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filas.length === 0 && !cargando && <p className="text-[13.5px] text-muted text-center py-4">No hay técnicos con este filtro.</p>}
        </div>
        <p className="text-[12px] text-muted mt-3">«s/r»: parte de la jornada sin registrar. En ámbar desde 15%.</p>
      </div>
    </div>
  );
}
