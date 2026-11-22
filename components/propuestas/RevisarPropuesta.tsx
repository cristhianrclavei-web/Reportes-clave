'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronLeft, ExternalLink, GitMerge } from 'lucide-react';
import { showToast } from '@/components/Toast';
import { confirmar } from '@/lib/dialogos';
import { tamanoSimbolo, type EquipoPlano, type Plano, type TuberiaPlano } from '@/lib/planos';
import { imagenDelPlano, obtenerPlano } from '@/lib/planosDatos';
import { NOMBRE_DOCUMENTO, type Cambio } from '@/lib/propuestas';
import { enlaceDe, leerPropuesta, resolverPropuesta, type Original, type Propuesta } from '@/lib/propuestasDatos';

// Revisión de una propuesta: la lista de cambios con su casilla (los que
// chocan con algo que cambió alguien más empiezan sin marcar) y, si es un
// plano, el dibujo con lo agregado en verde, lo quitado en rojo y lo
// cambiado en ámbar. «Fusionar» guarda antes una versión del original.

const COLOR: Record<Cambio['tipo'], string> = { agregado: '#16a34a', quitado: '#dc2626', modificado: '#d97706' };
const ETIQUETA: Record<Cambio['tipo'], string> = { agregado: 'Nuevo', quitado: 'Quitado', modificado: 'Cambiado' };

export default function RevisarPropuesta({ propuestaId }: { propuestaId: string }) {
  const router = useRouter();
  const [datos, setDatos] = useState<{ propuesta: Propuesta; autor: string; original: Original; cambios: Cambio[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aceptados, setAceptados] = useState<Set<string>>(new Set());
  const [respuesta, setRespuesta] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [resaltado, setResaltado] = useState<string | null>(null);

  useEffect(() => {
    leerPropuesta(propuestaId)
      .then((r) => {
        setDatos(r);
        // Lo que no choca con nada va marcado; los conflictos los decide supervisión.
        setAceptados(new Set(r.cambios.filter((c) => !c.conflicto).map((c) => c.clave)));
      })
      .catch((e) => setError(e?.message || 'No se pudo abrir la propuesta.'));
  }, [propuestaId]);

  if (error) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <p className="rounded-xl bg-red/10 text-red text-[14px] px-3 py-2 mb-4">{error}</p>
        <Link href="/dashboard/proyectos?sub=revisiones" className="text-teal font-semibold">Volver a los cambios por revisar</Link>
      </div>
    );
  }
  if (!datos) return <p className="p-6 text-[14px] text-muted">Cargando la propuesta…</p>;

  const { propuesta, autor, original, cambios } = datos;
  const abierta = propuesta.estado === 'enviada' || propuesta.estado === 'borrador';
  const cuantos = cambios.filter((c) => aceptados.has(c.clave)).length;

  function alternar(clave: string) {
    setAceptados((antes) => {
      const nuevo = new Set(antes);
      if (nuevo.has(clave)) nuevo.delete(clave);
      else nuevo.add(clave);
      return nuevo;
    });
  }

  async function resolver(soloRechazar: boolean) {
    const elegidos = soloRechazar ? new Set<string>() : aceptados;
    const n = soloRechazar ? 0 : cuantos;
    const pregunta = n === 0 ? '¿No aceptar ningún cambio?' : `¿Fusionar ${n} ${n === 1 ? 'cambio' : 'cambios'} al original?`;
    const detalle = n === 0 ? 'El original se queda como está y se le avisa al técnico.' : 'Antes se guarda una versión del original, por si hay que regresar.';
    if (!(await confirmar(pregunta, { detalle, textoAceptar: n === 0 ? 'No aceptar' : 'Fusionar', tono: n === 0 ? 'peligro' : undefined }))) return;
    setGuardando(true);
    try {
      await resolverPropuesta(propuesta, cambios, elegidos, respuesta, original.nombre);
      showToast(n === 0 ? 'Propuesta cerrada sin cambios' : 'Cambios fusionados', 'success');
      router.push('/dashboard/proyectos?sub=revisiones');
    } catch (e: any) {
      showToast(e?.message || 'No se pudo guardar.', 'error');
      setGuardando(false);
    }
  }

  return (
    <div className="px-4 lg:px-8 py-5 max-w-[1300px] pb-28">
      <div className="flex items-start gap-2 mb-4">
        <Link href="/dashboard/proyectos?sub=revisiones" aria-label="Volver" className="w-11 h-11 -ml-2 rounded-full flex items-center justify-center shrink-0"><ChevronLeft size={24} /></Link>
        <div className="flex-1 min-w-0">
          <p className="text-[11.5px] text-faint uppercase tracking-[0.06em]">{NOMBRE_DOCUMENTO[propuesta.tipo]} · propuesta de {autor}</p>
          <h1 className="font-display font-bold text-[22px] leading-tight truncate">{original.nombre}</h1>
          {propuesta.comentario && <p className="text-[14px] text-muted mt-1">«{propuesta.comentario}»</p>}
        </div>
        <Link href={enlaceDe(propuesta.tipo, propuesta.objeto_id)} className="min-h-[42px] px-3 rounded-xl border border-line bg-surface-2 text-[13px] font-semibold flex items-center gap-1.5 shrink-0">
          <ExternalLink size={15} /> <span className="hidden sm:inline">Abrir el original</span>
        </Link>
      </div>

      {!abierta && (
        <p className="rounded-xl bg-surface-2 border border-line px-3 py-2 mb-4 text-[14px]">
          Esta propuesta ya se cerró: {propuesta.estado === 'aceptada' ? 'aceptada' : propuesta.estado === 'parcial' ? 'aceptada en parte' : propuesta.estado === 'descartada' ? 'el técnico la descartó' : 'no aceptada'}
          {propuesta.respuesta ? ` — «${propuesta.respuesta}»` : ''}.
        </p>
      )}

      <div className={`grid gap-4 ${propuesta.tipo === 'plano' ? 'lg:grid-cols-[minmax(0,1fr)_380px]' : ''}`}>
        {propuesta.tipo === 'plano' && (
          <VistaPlano planoId={propuesta.objeto_id} original={original.doc} cambios={cambios} resaltado={resaltado} />
        )}
        <div>
          {cambios.length === 0 ? (
            <p className="rounded-xl bg-surface-2 border border-line px-3 py-3 text-[14px] text-muted">
              No hay diferencias con el original: lo que propuso ya está igual (o no cambió nada).
            </p>
          ) : (
            <>
              {abierta && (
                <div className="flex items-center gap-2 mb-2 text-[13px]">
                  <span className="flex-1 text-muted">{cuantos} de {cambios.length} marcados</span>
                  <button type="button" onClick={() => setAceptados(new Set(cambios.map((c) => c.clave)))} className="min-h-[36px] px-2.5 rounded-lg text-teal font-semibold">Todos</button>
                  <button type="button" onClick={() => setAceptados(new Set())} className="min-h-[36px] px-2.5 rounded-lg text-muted font-semibold">Ninguno</button>
                </div>
              )}
              <div className="grid gap-1.5">
                {cambios.map((c) => (
                  <label key={c.clave} onMouseEnter={() => setResaltado(c.elementoId)} onMouseLeave={() => setResaltado(null)}
                    className={`rounded-xl border p-3 flex items-start gap-3 ${c.conflicto ? 'border-amber/60 bg-amber/5' : 'border-line bg-surface'} ${abierta ? 'cursor-pointer' : ''}`}>
                    <input type="checkbox" className="mt-1 w-5 h-5 accent-teal shrink-0" disabled={!abierta} checked={aceptados.has(c.clave)} onChange={() => alternar(c.clave)}
                      onFocus={() => setResaltado(c.elementoId)} />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ color: COLOR[c.tipo], background: `${COLOR[c.tipo]}1a` }}>{ETIQUETA[c.tipo]}</span>
                        <span className="text-[14px] font-semibold">{c.texto}</span>
                      </span>
                      {c.conflicto && (
                        <span className="mt-1 text-[12.5px] text-amber flex items-start gap-1">
                          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                          Alguien más también cambió esto en el original. Marcado = se queda lo del técnico; sin marcar = se queda el original.
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}

          {abierta && (
            <div className="mt-4">
              <label className="block"><span className="block text-[12.5px] text-muted mb-1">Respuesta para {autor} (opcional)</span>
                <textarea value={respuesta} maxLength={1000} onChange={(e) => setRespuesta(e.target.value)} placeholder="Gracias; lo que no marqué se queda como estaba porque…"
                  className="w-full px-3 py-2.5 min-h-[80px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14.5px]" /></label>
              <div className="flex flex-col sm:flex-row gap-2 mt-3">
                <button type="button" disabled={guardando} onClick={() => resolver(true)} className="min-h-[48px] px-4 rounded-2xl border border-line-strong font-semibold text-[14.5px] disabled:opacity-60">
                  No aceptar nada
                </button>
                <button type="button" disabled={guardando || cuantos === 0} onClick={() => resolver(false)}
                  className="flex-1 min-h-[48px] px-4 rounded-2xl bg-teal text-inkOnAccent font-semibold text-[14.5px] flex items-center justify-center gap-2 disabled:opacity-60">
                  <GitMerge size={18} /> {guardando ? 'Guardando…' : `Fusionar ${cuantos} ${cuantos === 1 ? 'cambio' : 'cambios'}`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// El plano con el original en gris y los cambios encima, en color.
function VistaPlano({ planoId, original, cambios, resaltado }: { planoId: string; original: Record<string, unknown>; cambios: Cambio[]; resaltado: string | null }) {
  const [plano, setPlano] = useState<Plano | null>(null);
  const [imagen, setImagen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerPlano(planoId)
      .then((r) => {
        setPlano(r.plano);
        return imagenDelPlano(r.plano.imagen_path).then(setImagen);
      })
      .catch((e) => setError(e?.message || 'No se pudo cargar el dibujo del plano.'));
  }, [planoId]);

  const tocados = useMemo(() => new Set(cambios.map((c) => c.elementoId).filter(Boolean)), [cambios]);

  if (error) return <p className="rounded-xl bg-amber/10 text-amber text-[13px] px-3 py-2">{error} La lista de cambios sí se puede revisar.</p>;
  if (!plano) return <div className="rounded-2xl border border-line bg-surface-2 aspect-[4/3] flex items-center justify-center text-muted text-[14px]">Cargando el plano…</div>;

  const r = tamanoSimbolo(plano.ancho, plano.alto) * 1.3;
  const equiposOriginales = (original.equipos as EquipoPlano[] | undefined) || [];
  const tuberiasOriginales = (original.tuberias as TuberiaPlano[] | undefined) || [];
  const puntos = (t: TuberiaPlano) => t.puntos.map((p) => `${p[0]},${p[1]}`).join(' ');

  return (
    <div className="rounded-2xl border border-line bg-white overflow-hidden self-start lg:sticky lg:top-4">
      <svg viewBox={`0 0 ${plano.ancho} ${plano.alto}`} className="w-full h-auto block" role="img" aria-label="Plano con los cambios propuestos">
        {imagen && <image href={imagen} x={0} y={0} width={plano.ancho} height={plano.alto} opacity={0.55} />}
        {/* Lo que no cambió, en gris. */}
        {tuberiasOriginales.filter((t) => !tocados.has(t.id)).map((t) => (
          <polyline key={t.id} points={puntos(t)} fill="none" stroke="#94a3b8" strokeWidth={r * 0.25} />
        ))}
        {equiposOriginales.filter((e) => !tocados.has(e.id)).map((e) => (
          <circle key={e.id} cx={e.x} cy={e.y} r={r * 0.6} fill="#94a3b8" opacity={0.8} />
        ))}
        {/* Los cambios, en color. */}
        {cambios.filter((c) => c.coleccion === 'tuberias').map((c) => {
          const t = (c.tipo === 'quitado' ? c.antes : c.despues) as TuberiaPlano;
          return <polyline key={c.clave} points={puntos(t)} fill="none" stroke={COLOR[c.tipo]} strokeWidth={r * (resaltado === c.elementoId ? 0.7 : 0.4)} strokeDasharray={c.tipo === 'quitado' ? `${r} ${r * 0.6}` : undefined} />;
        })}
        {cambios.filter((c) => c.coleccion === 'equipos').map((c) => {
          const e = (c.tipo === 'quitado' ? c.antes : c.despues) as EquipoPlano;
          const antes = c.antes as EquipoPlano | null;
          const grande = resaltado === c.elementoId;
          return (
            <g key={c.clave}>
              {c.tipo === 'modificado' && antes && (antes.x !== e.x || antes.y !== e.y) && (
                <>
                  <circle cx={antes.x} cy={antes.y} r={r * 0.6} fill="none" stroke={COLOR.modificado} strokeWidth={r * 0.15} strokeDasharray={`${r * 0.3} ${r * 0.2}`} />
                  <line x1={antes.x} y1={antes.y} x2={e.x} y2={e.y} stroke={COLOR.modificado} strokeWidth={r * 0.12} strokeDasharray={`${r * 0.3} ${r * 0.2}`} />
                </>
              )}
              <circle cx={e.x} cy={e.y} r={grande ? r * 1.6 : r} fill={COLOR[c.tipo]} fillOpacity={c.tipo === 'quitado' ? 0.25 : 0.85} stroke={COLOR[c.tipo]} strokeWidth={r * 0.2} />
              {c.tipo === 'quitado' && (
                <path d={`M${e.x - r * 0.6},${e.y - r * 0.6} L${e.x + r * 0.6},${e.y + r * 0.6} M${e.x + r * 0.6},${e.y - r * 0.6} L${e.x - r * 0.6},${e.y + r * 0.6}`} stroke={COLOR.quitado} strokeWidth={r * 0.25} />
              )}
            </g>
          );
        })}
      </svg>
      <div className="px-3 py-2 border-t border-line bg-surface flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
        <span><b style={{ color: COLOR.agregado }}>●</b> Nuevo</span>
        <span><b style={{ color: COLOR.quitado }}>●</b> Quitado</span>
        <span><b style={{ color: COLOR.modificado }}>●</b> Cambiado (el círculo punteado es donde estaba)</span>
        <span><b className="text-slate-400">●</b> Sin cambio</span>
      </div>
    </div>
  );
}
