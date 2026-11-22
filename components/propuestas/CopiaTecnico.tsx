'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { CheckCircle2, GitPullRequestArrow, Send, Trash2, XCircle } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import { confirmar } from '@/lib/dialogos';
import { compararPropuesta, copiaAlDia, type TipoDocumento } from '@/lib/propuestas';
import { useMiId, usePerfil } from '@/lib/perfiles';
import { descartarMiCopia, enviarARevision, guardarMiCopia, miPropuesta, type Propuesta } from '@/lib/propuestasDatos';

// El técnico edita una COPIA de planos, unifilares y guías: este hook la
// carga (sobre el original de ahora), la guarda en vez del original y la
// manda a revisión. La barra de abajo le dice en qué está.

type Doc = Record<string, unknown>;

export function useCopiaTecnico(tipo: TipoDocumento, objetoId: string, activa: boolean) {
  const base = useRef<Doc | null>(null);
  const propuesta = useRef<Propuesta | null>(null);
  const [estado, setEstado] = useState<Propuesta | null>(null);
  const [ultima, setUltima] = useState<Propuesta | null>(null);
  const [cambios, setCambios] = useState(0);

  // Recibe el original recién leído y regresa lo que hay que mostrar: la
  // copia del técnico (si tiene) llevada al original de ahora.
  const cargar = useCallback(async (original: Doc): Promise<Doc> => {
    if (!activa) return original;
    try {
      const r = await miPropuesta(tipo, objetoId);
      propuesta.current = r.abierta;
      setEstado(r.abierta);
      setUltima(r.ultima);
      const datos = r.local?.datos || r.abierta?.datos || null;
      base.current = r.abierta?.base || r.local?.base || original;
      if (!datos) {
        setCambios(0);
        return original;
      }
      const alDia = copiaAlDia(tipo, base.current, datos, original);
      setCambios(compararPropuesta(tipo, base.current, datos, base.current).length);
      return alDia;
    } catch (e: any) {
      showToast(e?.message || 'No se pudo leer tu copia; se muestra el original.', 'error');
      base.current = original;
      return original;
    }
  }, [activa, tipo, objetoId]);

  // Guarda la copia. Devuelve si quedó pendiente (sin señal).
  const guardar = useCallback(async (datos: Doc): Promise<boolean> => {
    if (!base.current) return false;
    const cuantos = compararPropuesta(tipo, base.current, datos, base.current).length;
    setCambios(cuantos);
    // Abrir y no cambiar nada no crea copia (los editores guardan solos al cargar).
    if (cuantos === 0 && !propuesta.current) return false;
    const r = await guardarMiCopia(tipo, objetoId, base.current, datos, propuesta.current?.id || null);
    if (r.id && !propuesta.current) {
      // Recién creada: se lee para tener su estado.
      const leida = await miPropuesta(tipo, objetoId).catch(() => null);
      propuesta.current = leida?.abierta || null;
      setEstado(propuesta.current);
    }
    return r.pendiente;
  }, [tipo, objetoId]);

  const enviar = useCallback(async (comentario: string, nombre: string, autor: string) => {
    if (!propuesta.current) throw new Error('Todavía no hay cambios guardados para enviar.');
    await enviarARevision(propuesta.current, comentario, nombre, autor);
    const enviada = { ...propuesta.current, estado: 'enviada' as const };
    propuesta.current = enviada;
    setEstado(enviada);
  }, []);

  const descartar = useCallback(async () => {
    await descartarMiCopia(propuesta.current, tipo, objetoId);
    propuesta.current = null;
    base.current = null;
    setEstado(null);
    setCambios(0);
  }, [tipo, objetoId]);

  return { activa, estado, ultima, cambios, cargar, guardar, enviar, descartar };
}

export function BarraCopia({ copia, nombre, onDescartada }: {
  copia: ReturnType<typeof useCopiaTecnico>;
  nombre: string;
  onDescartada: () => void;
}) {
  const autor = usePerfil(useMiId())?.full_name || 'Un técnico';
  const [enviando, setEnviando] = useState(false);
  const [comentario, setComentario] = useState('');
  const [abierto, setAbierto] = useState(false);
  const resultado = useMemo(() => {
    const u = copia.ultima;
    if (!u || copia.estado || !u.revisado_en) return null;
    // Solo lo de los últimos 7 días.
    if (Date.now() - Date.parse(u.revisado_en) > 7 * 86400000) return null;
    return u;
  }, [copia.ultima, copia.estado]);
  if (!copia.activa) return null;
  const enviada = copia.estado?.estado === 'enviada';

  async function enviar() {
    setEnviando(true);
    try {
      await copia.enviar(comentario, nombre, autor);
      setAbierto(false);
      setComentario('');
      showToast('Cambios enviados a revisión', 'success');
    } catch (e: any) {
      showToast(e?.message || 'No se pudieron enviar.', 'error');
    } finally {
      setEnviando(false);
    }
  }

  async function descartar() {
    if (!(await confirmar('¿Descartar tu copia y todos sus cambios?', { tono: 'peligro', detalle: 'Se vuelve a ver el original. No se puede deshacer.', textoAceptar: 'Descartar' }))) return;
    try {
      await copia.descartar();
      showToast('Copia descartada');
      onDescartada();
    } catch (e: any) {
      showToast(e?.message || 'No se pudo descartar.', 'error');
    }
  }

  return (
    <div className="px-3 py-2 border-b border-line bg-amber/10 text-[13px] flex flex-wrap items-center gap-x-3 gap-y-1.5" data-tour="barra-copia">
      <GitPullRequestArrow size={16} className="text-amber shrink-0" />
      <span className="flex-1 min-w-[180px]">
        {enviada
          ? <><b>Enviada a revisión</b> · {copia.cambios} {copia.cambios === 1 ? 'cambio' : 'cambios'}. Puedes seguir corrigiendo; supervisión ve lo último.</>
          : copia.cambios > 0
            ? <><b>Tu copia</b> · {copia.cambios === 1 ? '1 cambio que no toca el original hasta que supervisión lo acepte.' : `${copia.cambios} cambios que no tocan el original hasta que supervisión los acepte.`}</>
            : <>Editas una <b>copia</b>: tus cambios no tocan el original hasta que supervisión los acepte.</>}
        {resultado && (
          <span className={`block mt-0.5 ${resultado.estado === 'rechazada' ? 'text-red' : 'text-teal'}`}>
            {resultado.estado === 'rechazada' ? <XCircle size={13} className="inline -mt-0.5" /> : <CheckCircle2 size={13} className="inline -mt-0.5" />}{' '}
            Tu última propuesta: {resultado.estado === 'aceptada' ? 'aceptada' : resultado.estado === 'parcial' ? 'aceptada en parte' : 'no aceptada'}
            {resultado.respuesta ? ` — «${resultado.respuesta}»` : ''}
          </span>
        )}
      </span>
      {copia.cambios > 0 && !enviada && (
        <button type="button" onClick={() => setAbierto(true)} className="min-h-[36px] px-3 rounded-lg bg-teal text-inkOnAccent font-semibold flex items-center gap-1.5">
          <Send size={14} /> Enviar a revisión
        </button>
      )}
      {(copia.cambios > 0 || copia.estado) && (
        <button type="button" onClick={descartar} className="min-h-[36px] px-2.5 rounded-lg text-muted hover:text-red flex items-center gap-1"><Trash2 size={14} /> Descartar</button>
      )}
      {abierto && (
        <ModalOverlay onClose={() => !enviando && setAbierto(false)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-5">
            <p className="font-display font-bold text-[19px]">Enviar a revisión</p>
            <p className="text-[13px] text-muted mt-1 mb-3">{copia.cambios === 1 ? 'Supervisión verá tu cambio y decide si se queda.' : `Supervisión verá tus ${copia.cambios} cambios y decide cuáles se quedan.`}</p>
            <label className="block"><span className="block text-[12.5px] text-muted mb-1">Comentario (opcional)</span>
              <textarea className="w-full px-3 py-2.5 min-h-[90px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14.5px]"
                value={comentario} maxLength={1000} placeholder="El D017 estaba en el pasillo, no en la bodega…" onChange={(e) => setComentario(e.target.value)} /></label>
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={() => setAbierto(false)} disabled={enviando} className="flex-1 min-h-[48px] rounded-2xl border border-line-strong font-semibold text-[14.5px]">Cancelar</button>
              <button type="button" onClick={enviar} disabled={enviando} className="flex-1 min-h-[48px] rounded-2xl bg-teal text-inkOnAccent font-semibold text-[14.5px] disabled:opacity-60">{enviando ? 'Enviando…' : 'Enviar'}</button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
