'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Crown, Pencil, Plus, ShieldCheck, Trash2, Users, UserX, X } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { AvatarTecnico, UNIFORMES } from '@/components/AvatarTecnico';
import { showToast } from '@/components/Toast';
import { createClient } from '@/lib/supabaseClient';
import { Cuadrilla, cuadrillaPorTecnico, cuadrillasConSupervisor, eliminarCuadrilla, guardarCuadrilla, useCuadrillas } from '@/lib/cuadrillas';

// Personal → Cuadrillas: el supervisor agrupa a los técnicos. Cada persona
// está en una sola cuadrilla; las cuadrillas sirven para filtrar el tablero
// y la agenda, y para asignar un servicio a todo el grupo de un toque.

type Tecnico = { id: string; nombre: string };

const inputCls = 'w-full px-3.5 py-3 rounded-2xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]';
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5';

export default function Cuadrillas() {
  const { cuadrillas, recargar } = useCuadrillas();
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [supervisores, setSupervisores] = useState<Tecnico[]>([]);
  const [cargado, setCargado] = useState(false);
  const [editar, setEditar] = useState<Cuadrilla | 'nueva' | null>(null);

  useEffect(() => {
    createClient()
      .from('profiles').select('id, full_name, activo').eq('role', 'tecnico').order('full_name')
      .then(({ data }) => {
        setTecnicos(((data as any[]) || []).filter((t) => t.activo !== false).map((t) => ({ id: t.id, nombre: t.full_name })));
        setCargado(true);
      });
    // Quién puede quedar a cargo de una cuadrilla.
    createClient()
      .from('profiles').select('id, full_name, activo').eq('role', 'supervisor').order('full_name')
      .then(({ data }) => setSupervisores(((data as any[]) || []).filter((t) => t.activo !== false).map((t) => ({ id: t.id, nombre: t.full_name }))));
  }, []);
  const nombreSupervisor = useMemo(() => new Map(supervisores.map((t) => [t.id, t.nombre])), [supervisores]);

  const nombreDe = useMemo(() => new Map(tecnicos.map((t) => [t.id, t.nombre])), [tecnicos]);
  const indiceDe = (id: string) => Math.max(0, tecnicos.findIndex((t) => t.id === id));
  const mapa = useMemo(() => cuadrillaPorTecnico(cuadrillas), [cuadrillas]);
  const sueltos = tecnicos.filter((t) => !mapa.has(t.id));

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <p className="text-[13.5px] text-muted max-w-xl">
          Agrupa a tu personal para filtrar el tablero del día y la agenda, y para asignar un servicio a toda la
          cuadrilla de un toque. Cada persona pertenece a una sola cuadrilla.
        </p>
        <button type="button" onClick={() => setEditar('nueva')}
          className="shrink-0 h-10 px-4 rounded-full bg-teal text-inkOnAccent text-[13.5px] font-semibold flex items-center gap-1.5 shadow-glow-teal active:scale-95">
          <Plus size={16} strokeWidth={2.6} /> Nueva cuadrilla
        </button>
      </div>

      {cargado && cuadrillas.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line-strong px-5 py-10 text-center">
          <Users size={26} className="mx-auto text-muted mb-2" />
          <p className="text-[15px] font-semibold">Todavía no hay cuadrillas</p>
          <p className="text-[13.5px] text-muted mt-1">Son opcionales: con poco personal la app funciona igual sin ellas.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {cuadrillas.map((c) => {
          const miembros = c.miembros.filter((id) => nombreDe.has(id));
          return (
            <button key={c.id} type="button" onClick={() => setEditar(c)}
              className="text-left rounded-2xl bg-surface border border-line p-4 hover:border-teal/50 active:scale-[0.99] transition-all">
              <div className="flex items-center gap-2.5 mb-3">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: UNIFORMES[c.color % UNIFORMES.length] }} />
                <p className="font-display font-bold text-[19px] tracking-wide flex-1 min-w-0 truncate">{c.nombre}</p>
                <span className="text-[12.5px] text-muted tabular-nums shrink-0">{miembros.length} {miembros.length === 1 ? 'persona' : 'personas'}</span>
                <Pencil size={15} className="text-muted shrink-0" />
              </div>
              {c.supervisor_id && nombreSupervisor.has(c.supervisor_id) && (
                <p className="text-[12.5px] text-muted flex items-center gap-1.5 -mt-1.5 mb-3">
                  <ShieldCheck size={13} className="text-teal shrink-0" /> A cargo de {nombreSupervisor.get(c.supervisor_id)}
                </p>
              )}
              {miembros.length === 0 ? (
                <p className="text-[13px] text-faint">Sin integrantes</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {miembros.map((id) => (
                    <span key={id} className="pl-1 pr-2.5 py-1 rounded-full bg-surface-2 border border-line text-[12.5px] font-medium flex items-center gap-1.5">
                      <AvatarTecnico id={id} nombre={nombreDe.get(id) || ''} size={22} indice={indiceDe(id)} />
                      {nombreDe.get(id)}
                      {c.lider_id === id && <Crown size={12} className="text-amber" aria-label="Líder" />}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {cuadrillas.length > 0 && sueltos.length > 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-line-strong px-4 py-3">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5 mb-2">
            <UserX size={14} /> Sin cuadrilla · {sueltos.length}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sueltos.map((t) => (
              <span key={t.id} className="pl-1 pr-2.5 py-1 rounded-full bg-surface border border-line text-[12.5px] font-medium flex items-center gap-1.5">
                <AvatarTecnico id={t.id} nombre={t.nombre} size={22} indice={indiceDe(t.id)} />
                {t.nombre}
              </span>
            ))}
          </div>
        </div>
      )}

      {editar && (
        <EditorCuadrilla
          cuadrilla={editar === 'nueva' ? null : editar}
          cuadrillas={cuadrillas}
          tecnicos={tecnicos}
          supervisores={cuadrillasConSupervisor() ? supervisores : []}
          indiceDe={indiceDe}
          onClose={() => setEditar(null)}
          onListo={() => { setEditar(null); recargar(); }}
        />
      )}
    </div>
  );
}

function EditorCuadrilla({
  cuadrilla, cuadrillas, tecnicos, supervisores, indiceDe, onClose, onListo,
}: {
  cuadrilla: Cuadrilla | null;
  cuadrillas: Cuadrilla[];
  tecnicos: Tecnico[];
  // Vacío si la instalación no tiene el patch del supervisor a cargo.
  supervisores: Tecnico[];
  indiceDe: (id: string) => number;
  onClose: () => void;
  onListo: () => void;
}) {
  // Color por defecto: el primero que no use otra cuadrilla.
  const libre = UNIFORMES.findIndex((_, i) => !cuadrillas.some((c) => c.color === i));
  const [nombre, setNombre] = useState(cuadrilla?.nombre || '');
  const [color, setColor] = useState(cuadrilla?.color ?? (libre >= 0 ? libre : 0));
  const [miembros, setMiembros] = useState<string[]>(cuadrilla?.miembros || []);
  const [lider, setLider] = useState<string | null>(cuadrilla?.lider_id || null);
  const [supervisor, setSupervisor] = useState<string>(cuadrilla?.supervisor_id || '');
  const [guardando, setGuardando] = useState(false);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mapa = useMemo(() => cuadrillaPorTecnico(cuadrillas), [cuadrillas]);

  function alternar(id: string) {
    setMiembros((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
    if (lider === id) setLider(null);
  }

  async function guardar() {
    if (!nombre.trim()) { setError('Ponle un nombre a la cuadrilla.'); return; }
    setGuardando(true);
    setError(null);
    try {
      await guardarCuadrilla({
        id: cuadrilla?.id, nombre, color, liderId: lider, miembros,
        supervisorId: supervisores.length > 0 ? supervisor || null : undefined,
      });
      showToast(cuadrilla ? 'Cuadrilla actualizada' : 'Cuadrilla creada', 'success');
      onListo();
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar.');
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!cuadrilla) return;
    setGuardando(true);
    try {
      await eliminarCuadrilla(cuadrilla.id);
      showToast('Cuadrilla eliminada', 'success');
      onListo();
    } catch (e: any) {
      setError(e?.message || 'No se pudo eliminar.');
      setGuardando(false);
    }
  }

  return (
    <ModalOverlay onClose={() => !guardando && onClose()}>
      <div className="glass-strong rounded-3xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="font-display font-bold text-[19px] tracking-wide">{cuadrilla ? 'Editar cuadrilla' : 'Nueva cuadrilla'}</h2>
          <button onClick={onClose} disabled={guardando} aria-label="Cerrar" className="w-10 h-10 -mr-1 -mt-1 flex items-center justify-center text-muted shrink-0">
            <X size={19} strokeWidth={2.5} />
          </button>
        </div>

        <label className={labelCls}>Nombre</label>
        <input className={`${inputCls} mb-4`} maxLength={40} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Zona norte, Incendio, Instalaciones" autoFocus={!cuadrilla} />

        <label className={labelCls}>Color</label>
        <div className="flex flex-wrap gap-2 mb-4">
          {UNIFORMES.map((hex, i) => (
            <button key={hex} type="button" onClick={() => setColor(i)} aria-label={`Color ${i + 1}`} aria-pressed={color === i}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform active:scale-90 ${color === i ? 'ring-2 ring-offset-2 ring-offset-surface ring-ink/70' : ''}`}
              style={{ backgroundColor: hex }}>
              {color === i && <Check size={15} strokeWidth={3} className="text-white" />}
            </button>
          ))}
        </div>

        {supervisores.length > 0 && (
          <>
            <label className={labelCls}>Supervisor a cargo</label>
            <div className="relative mb-1.5">
              <select value={supervisor} onChange={(e) => setSupervisor(e.target.value)} className={`${inputCls} appearance-none pr-10`}>
                <option value="">Sin supervisor a cargo</option>
                {supervisores.map((sp) => <option key={sp.id} value={sp.id}>{sp.nombre}</option>)}
              </select>
              <ChevronDown size={17} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            </div>
            <p className="text-[12px] text-faint mb-4">Quien queda a cargo ve el filtro «Mis cuadrillas» en el tablero, la agenda y el control de reportes.</p>
          </>
        )}

        <label className={labelCls}>Integrantes · {miembros.length}</label>
        <div className="rounded-2xl border border-line divide-y divide-line mb-4 max-h-[38vh] overflow-y-auto">
          {tecnicos.length === 0 && <p className="text-[13px] text-muted p-3">No hay personal técnico activo.</p>}
          {tecnicos.map((t) => {
            const sel = miembros.includes(t.id);
            const otra = mapa.get(t.id);
            const enOtra = otra && otra.id !== cuadrilla?.id ? otra : null;
            return (
              <div key={t.id} className="flex items-center gap-2.5 px-3 py-2">
                <button type="button" onClick={() => alternar(t.id)} role="checkbox" aria-checked={sel}
                  className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                  <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${sel ? 'bg-teal border-teal text-inkOnAccent' : 'border-line-strong'}`}>
                    {sel && <Check size={14} strokeWidth={3} />}
                  </span>
                  <AvatarTecnico id={t.id} nombre={t.nombre} size={28} indice={indiceDe(t.id)} />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium truncate">{t.nombre}</span>
                    {enOtra && <span className="block text-[11.5px] text-muted truncate">{sel ? `Se mueve desde ${enOtra.nombre}` : `En ${enOtra.nombre}`}</span>}
                  </span>
                </button>
                {sel && (
                  <button type="button" onClick={() => setLider(lider === t.id ? null : t.id)} aria-pressed={lider === t.id}
                    title={lider === t.id ? 'Quitar como líder' : 'Marcar como líder'}
                    className={`shrink-0 h-8 px-2.5 rounded-full text-[11.5px] font-semibold flex items-center gap-1 border ${lider === t.id ? 'bg-amber/15 border-amber/40 text-amber' : 'border-line text-muted'}`}>
                    <Crown size={12} /> Líder
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {error && <p className="text-[13px] text-red font-semibold mb-3">{error}</p>}

        <button type="button" onClick={guardar} disabled={guardando}
          className="w-full min-h-[48px] rounded-2xl bg-teal text-inkOnAccent font-semibold text-[15px] disabled:opacity-50 active:scale-[0.98]">
          {guardando ? 'Guardando…' : cuadrilla ? 'Guardar cambios' : 'Crear cuadrilla'}
        </button>

        {cuadrilla && (
          confirmarBorrado ? (
            <div className="mt-3 rounded-2xl border border-red/30 bg-red/10 p-3">
              <p className="text-[13px] text-ink/85 mb-2.5">
                Se elimina la cuadrilla; sus integrantes quedan sin cuadrilla. Los servicios y reportes no cambian.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setConfirmarBorrado(false)} disabled={guardando} className="min-h-[42px] rounded-xl border border-line text-[13.5px] font-semibold">Conservar</button>
                <button type="button" onClick={borrar} disabled={guardando} className="min-h-[42px] rounded-xl bg-red text-white text-[13.5px] font-semibold">Eliminar</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmarBorrado(true)} disabled={guardando}
              className="w-full mt-3 min-h-[44px] text-[13.5px] font-semibold text-red flex items-center justify-center gap-1.5">
              <Trash2 size={15} /> Eliminar cuadrilla
            </button>
          )
        )}
      </div>
    </ModalOverlay>
  );
}
