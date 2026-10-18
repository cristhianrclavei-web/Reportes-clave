'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Info, PenLine, X } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import AutocompletarCliente from '@/components/AutocompletarCliente';
import { ElegirCuadrilla } from '@/components/cuadrillas/ChipsCuadrilla';
import IconoTipo from './IconoTipo';
import { TIPOS_ACTIVIDAD, TipoActividad, tipoActividad } from '@/lib/tiposActividad';
import { ActividadJornada, DatosJornadas, registrarActividadManual, editarActividadManual } from '@/lib/jornadaDatos';
import { eliminarMiActividad } from '@/lib/actividades';
import { seEnciman, tramosLibres } from '@/lib/jornada';
import { hoyLocal, sumarDias } from '@/lib/fechaHoy';
import { duracionTexto } from '@/lib/lineaDelDia';

// Registrar a mano algo que se pasó iniciar en vivo (subir material en la
// oficina, el traslado, la compra…). Mientras se llena avisa:
//  - en rojo, si choca con otra actividad de la bitácora (no se puede
//    guardar así; ofrece los tramos libres para ajustar con un toque);
//  - en ámbar, si cae dentro de un servicio (sí se puede: ese rato se
//    descuenta del servicio).
// A los acompañantes se les registra lo mismo (la base lo hace y avisa si a
// alguno no se le pudo poner porque ya tenía algo a esa hora).

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
const aHora = (ms: number) => hhmm(ms);
const inputCls = 'w-full px-3.5 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]';
const labelCls = 'block text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5';

function aMs(fecha: string, hora: string): number | null {
  if (!fecha || !/^\d{2}:\d{2}$/.test(hora)) return null;
  const t = new Date(`${fecha}T${hora}:00`).getTime();
  return Number.isNaN(t) ? null : t;
}

export default function RegistroManual({
  yoId, fechaInicial, tramo, datos, tecnicos, editar, onCerrar, onGuardado,
}: {
  yoId: string;
  fechaInicial: string;
  tramo: { inicio: number; fin: number } | null;
  datos: DatosJornadas;
  tecnicos: { id: string; full_name: string }[];
  // Para corregir algo ya registrado a mano (solo el registro propio).
  editar?: ActividadJornada;
  onCerrar: () => void;
  onGuardado: (mensaje: string) => void;
}) {
  const hoy = hoyLocal();
  const [tipo, setTipo] = useState<TipoActividad | null>(editar ? editar.tipo : null);
  const [titulo, setTitulo] = useState(editar ? editar.titulo : '');
  const [lugar, setLugar] = useState(editar ? editar.proyecto : '');
  const [fecha, setFecha] = useState(fechaInicial);
  const [inicio, setInicio] = useState(tramo ? aHora(tramo.inicio) : '');
  const [fin, setFin] = useState(tramo ? aHora(tramo.fin) : '');
  const [acompanantes, setAcompanantes] = useState<string[]>([]);
  const [nota, setNota] = useState('');
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inicioMs = aMs(fecha, inicio);
  const finMs = aMs(fecha, fin);
  const rangoValido = inicioMs !== null && finMs !== null && finMs > inicioMs;

  // Errores de cada campo, en el idioma de quien lo llena.
  const errores: { tipo?: string; fecha?: string; horas?: string } = {};
  if (!tipo) errores.tipo = 'Elige qué fue.';
  if (!fecha || fecha > hoy || fecha < sumarDias(hoy, -7)) errores.fecha = 'Solo se puede registrar a mano lo de hoy y los 7 días anteriores.';
  if (!inicio || !fin) errores.horas = 'Pon la hora de inicio y la de fin.';
  else if (!rangoValido) errores.horas = 'La hora de fin debe ser después de la de inicio.';
  else if (finMs! > Date.now() + 5 * 60000) errores.horas = 'No puede terminar en el futuro. Si sigue en curso, iníciala en vivo.';
  else if (finMs! - inicioMs! > 14 * 3600000) errores.horas = 'No puede durar más de 14 horas.';

  // Choques con mis actividades de ese día y servicios en los que cae.
  const { choques, servicios, libres } = useMemo(() => {
    if (!rangoValido) return { choques: [], servicios: [], libres: [] };
    const rango = { inicio: inicioMs!, fin: finMs! };
    const mias = datos.actividades
      .filter((a) => a.tecnicoId === yoId && a.id !== editar?.id)
      .map((a) => ({ ...a, fin: a.fin ?? Date.now() }));
    const choques = mias.filter((a) => seEnciman(a, rango));
    const servicios = datos.servicios
      .filter((s) => s.tecnicoIds.includes(yoId))
      .filter((s) => seEnciman({ inicio: s.inicio, fin: s.fin ?? Date.now() }, rango));
    return { choques, servicios, libres: choques.length ? tramosLibres(rango, mias) : [] };
  }, [rangoValido, inicioMs, finMs, datos, yoId, editar?.id]);

  const puedeGuardar = Object.keys(errores).length === 0 && choques.length === 0;
  const otros = tecnicos.filter((t) => t.id !== yoId);

  async function guardar() {
    setIntento(true);
    if (!puedeGuardar || !tipo) return;
    setGuardando(true);
    setError(null);
    if (editar) {
      try {
        await editarActividadManual({ id: editar.id, tipo, titulo, proyecto: lugar, inicio: new Date(inicioMs!), fin: new Date(finMs!) });
        onGuardado('Cambios guardados');
      } catch (e: any) {
        setError(e?.message || 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
        setGuardando(false);
      }
      return;
    }
    try {
      const r = await registrarActividadManual({
        tipo, titulo, proyecto: lugar, inicio: new Date(inicioMs!), fin: new Date(finMs!), nota, acompanantes,
      });
      let mensaje = 'Actividad registrada';
      const conOtros = r.creadas - 1;
      if (conOtros > 0) mensaje += ` (también a ${conOtros} acompañante${conOtros > 1 ? 's' : ''})`;
      if (r.omitidos.length > 0) {
        mensaje += `. No se le puso a ${r.omitidos.map((o) => `${o.nombre} (ya tenía «${o.choca_con}»)`).join(', ')}`;
      }
      onGuardado(mensaje);
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!editar) return;
    if (!confirm('¿Borrar este registro de tu bitácora?\n\nSolo se borra el tuyo; a tus acompañantes no les cambia.')) return;
    setGuardando(true);
    setError(null);
    try {
      await eliminarMiActividad({ id: editar.id, report_id: null, hora_inicio: new Date(editar.inicio).toISOString() });
      onGuardado('Registro borrado');
    } catch (e: any) {
      setError(e?.message || 'No se pudo borrar. Revisa tu conexión e intenta de nuevo.');
      setGuardando(false);
    }
  }

  return (
    <ModalOverlay onClose={() => !guardando && onCerrar()}>
      <div className="glass-strong rounded-3xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-5">
        <div className="flex items-start gap-3 mb-4">
          <span className="w-11 h-11 rounded-2xl bg-teal/15 text-teal flex items-center justify-center shrink-0"><PenLine size={20} strokeWidth={2.3} /></span>
          <div className="min-w-0 flex-1">
            <p className="font-display font-bold text-[18px] tracking-wide leading-tight">{editar ? 'Editar registro' : 'Registrar a mano'}</p>
            <p className="text-[12.5px] text-muted">
              {editar ? 'Corrige qué fue o el horario. Solo cambia tu registro, no el de tus acompañantes.' : 'Para lo que se te pasó iniciar en vivo: el traslado, la compra, preparar material…'}
            </p>
          </div>
          <button type="button" onClick={onCerrar} disabled={guardando} aria-label="Cerrar" className="w-9 h-9 rounded-full bg-surface-2 border border-line flex items-center justify-center shrink-0">
            <X size={16} strokeWidth={2.4} />
          </button>
        </div>

        <p className={labelCls}>¿Qué fue? *</p>
        <div className="grid grid-cols-3 gap-2 mb-1">
          {TIPOS_ACTIVIDAD.map((t) => (
            <button
              key={t.clave}
              type="button"
              onClick={() => setTipo(t.clave)}
              aria-pressed={tipo === t.clave}
              className={`rounded-xl border p-2 flex flex-col items-center gap-1 text-center transition-all active:scale-95 ${tipo === t.clave ? 'border-teal bg-teal/10 ring-1 ring-teal' : 'border-line bg-surface'}`}
            >
              <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: t.color }}>
                <IconoTipo tipo={t.clave} size={16} />
              </span>
              <span className="text-[12px] font-semibold leading-tight">{t.nombre}</span>
            </button>
          ))}
        </div>
        {intento && errores.tipo && <p className="text-[12.5px] text-red mb-1">{errores.tipo}</p>}

        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="col-span-3 sm:col-span-1">
            <label htmlFor="rm-fecha" className={labelCls}>Día</label>
            <input id="rm-fecha" type="date" min={sumarDias(hoy, -7)} max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-3 sm:col-span-2 grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="rm-inicio" className={labelCls}>De</label>
              <input id="rm-inicio" type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="rm-fin" className={labelCls}>A</label>
              <input id="rm-fin" type="time" value={fin} onChange={(e) => setFin(e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>
        {(intento || (inicio && fin)) && (errores.fecha || errores.horas) && (
          <p className="text-[12.5px] text-red mt-1.5">{errores.fecha || errores.horas}</p>
        )}
        {rangoValido && !errores.horas && <p className="text-[12.5px] text-muted mt-1.5">Duración: {duracionTexto((finMs! - inicioMs!) / 60000)}</p>}

        {choques.length > 0 && (
          <div className="mt-3 rounded-xl border border-red/45 bg-red/8 px-3.5 py-3">
            <p className="text-[13.5px] font-semibold text-red flex items-center gap-1.5"><AlertTriangle size={15} strokeWidth={2.4} /> Choca con tu bitácora</p>
            {choques.map((c) => (
              <p key={c.id} className="text-[12.5px] text-ink/85 mt-1">
                Ya tienes «{c.titulo}» de {hhmm(c.inicio)} a {hhmm(c.fin)}. Una persona no puede estar en dos actividades a la vez.
              </p>
            ))}
            {libres.length > 0 ? (
              <>
                <p className="text-[12.5px] text-ink/85 mt-2">Ajusta al tramo libre:</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {libres.map((l) => (
                    <button key={l.inicio} type="button" onClick={() => { setInicio(aHora(l.inicio)); setFin(aHora(l.fin)); }}
                      className="min-h-[36px] px-3 rounded-full border border-teal/50 text-teal text-[12.5px] font-semibold tabular-nums active:scale-95 transition-transform">
                      Usar {hhmm(l.inicio)}–{hhmm(l.fin)}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-[12.5px] text-ink/85 mt-2">No queda tiempo libre en ese horario. Si la otra actividad está mal, ábrela y corrígela primero.</p>
            )}
          </div>
        )}

        {choques.length === 0 && servicios.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber/45 bg-amber/8 px-3.5 py-2.5 flex gap-2">
            <Info size={16} strokeWidth={2.4} className="text-amber shrink-0 mt-0.5" />
            <p className="text-[12.5px] text-ink/85 leading-snug">
              Cae durante el servicio «{servicios[0].titulo}». Se puede registrar: ese rato se descuenta del tiempo en el servicio y cuenta como {tipo ? tipoActividad(tipo).nombre.toLowerCase() : 'esta actividad'}.
            </p>
          </div>
        )}

        <label htmlFor="rm-titulo" className={`${labelCls} mt-4`}>Qué hiciste (opcional)</label>
        <input id="rm-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={tipo ? tipoActividad(tipo).ejemplo : 'Ej. Subir material a la camioneta'} className={inputCls} />

        <label className={`${labelCls} mt-3`}>Cliente o lugar (opcional)</label>
        <AutocompletarCliente
          value={lugar}
          onChange={(nombre) => setLugar(nombre)}
          className={inputCls}
          placeholder="Escribe para buscar"
          soloSugerir
        />

        {otros.length > 0 && !editar && (
          <>
            <p className={`${labelCls} mt-4`}>¿Quién iba contigo?</p>
            <p className="text-[12px] text-muted -mt-1 mb-2">A cada uno se le registra lo mismo en su bitácora.</p>
            <ElegirCuadrilla disponibles={otros.map((t) => t.id)} seleccion={acompanantes} onCambiar={setAcompanantes} className="mb-2" />
            <div className="flex flex-wrap gap-1.5">
              {otros.map((t) => {
                const elegido = acompanantes.includes(t.id);
                return (
                  <button key={t.id} type="button" aria-pressed={elegido}
                    onClick={() => setAcompanantes(elegido ? acompanantes.filter((x) => x !== t.id) : [...acompanantes, t.id])}
                    className={`min-h-[36px] px-3 rounded-full border text-[13px] font-medium transition-colors ${elegido ? 'bg-teal text-inkOnAccent border-teal' : 'border-line-strong text-ink/80'}`}>
                    {t.full_name}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {!editar && (
          <>
            <label htmlFor="rm-nota" className={`${labelCls} mt-4`}>Nota (opcional)</label>
            <textarea id="rm-nota" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Algo que convenga saber" className={`${inputCls} py-2.5 min-h-[70px]`} />
          </>
        )}

        {error && <p className="text-[13px] text-red mt-3">{error}</p>}

        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCerrar} disabled={guardando} className="flex-1 min-h-[50px] rounded-2xl border border-line-strong text-ink/80 text-[14.5px] font-semibold active:scale-95 transition-transform disabled:opacity-60">
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={guardando || choques.length > 0}
            className="flex-1 min-h-[50px] rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15px] active:scale-95 transition-transform disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
        {editar && (
          <button type="button" onClick={borrar} disabled={guardando}
            className="mt-3 w-full min-h-[44px] rounded-2xl text-red text-[13.5px] font-semibold active:scale-95 transition-transform disabled:opacity-60">
            Borrar este registro
          </button>
        )}
      </div>
    </ModalOverlay>
  );
}
