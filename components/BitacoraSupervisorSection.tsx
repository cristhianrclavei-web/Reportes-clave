'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabaseClient';

type ActividadConTecnico = {
  id: string;
  proyecto: string;
  titulo: string;
  estado: 'en_curso' | 'pausada' | 'concluida';
  hora_inicio: string;
  hora_fin: string | null;
  created_by: string;
  profiles?: { full_name: string } | { full_name: string }[] | null;
};

function nombreTecnico(profiles: ActividadConTecnico['profiles']): string {
  if (!profiles) return 'Técnico';
  if (Array.isArray(profiles)) return profiles[0]?.full_name || 'Técnico';
  return profiles.full_name || 'Técnico';
}

function tiempoTranscurrido(desde: string): string {
  const ms = Date.now() - new Date(desde).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function EstadoChip({ estado }: { estado: ActividadConTecnico['estado'] }) {
  const cfg =
    estado === 'en_curso'
      ? { label: '● En curso', cls: 'bg-teal/15 text-teal' }
      : estado === 'pausada'
      ? { label: '⏸ Pausada', cls: 'bg-amber/15 text-amber' }
      : { label: '✓ Concluida', cls: 'bg-surface-2 text-muted' };
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${cfg.cls}`}>{cfg.label}</span>;
}

function ActividadCard({ a, mostrarTecnico }: { a: ActividadConTecnico; mostrarTecnico: boolean }) {
  return (
    <Link href={`/bitacora/${a.id}`} className="block glass rounded-2xl p-4 active:scale-[0.98] transition-transform">
      <div className="flex justify-between items-start gap-2 mb-1.5">
        <strong className="font-display font-bold text-[14px]">{a.titulo}</strong>
        <EstadoChip estado={a.estado} />
      </div>
      <p className="text-[12px] text-muted">{a.proyecto}{mostrarTecnico ? ` · ${nombreTecnico(a.profiles)}` : ''}</p>
      <p className="text-[11px] text-faint mt-1">
        {a.estado === 'concluida' && a.hora_fin
          ? `Concluida hace ${tiempoTranscurrido(a.hora_fin)}`
          : `Iniciada hace ${tiempoTranscurrido(a.hora_inicio)}`}
      </p>
    </Link>
  );
}

export default function BitacoraSupervisorSection() {
  const [actividades, setActividades] = useState<ActividadConTecnico[]>([]);
  const [loading, setLoading] = useState(true);
  const [soloActivas, setSoloActivas] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tecnicoFiltro, setTecnicoFiltro] = useState('todos');

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('actividades')
      .select('id, proyecto, titulo, estado, hora_inicio, hora_fin, created_by, profiles(full_name)')
      .order('hora_inicio', { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (error) {
          console.error('[BitacoraSupervisorSection] Error cargando actividades:', error.message);
          setError(error.message);
        }
        setActividades((data as any) || []);
        setLoading(false);
      });
  }, []);

  const tecnicos = useMemo(() => {
    const nombres = new Set(actividades.map((a) => nombreTecnico(a.profiles)));
    return Array.from(nombres).sort((a, b) => a.localeCompare(b));
  }, [actividades]);

  const filtradas = useMemo(() => {
    return actividades.filter((a) => {
      if (soloActivas && a.estado === 'concluida') return false;
      if (tecnicoFiltro !== 'todos' && nombreTecnico(a.profiles) !== tecnicoFiltro) return false;
      return true;
    });
  }, [actividades, soloActivas, tecnicoFiltro]);

  const agrupadas = useMemo(() => {
    if (tecnicoFiltro !== 'todos') return null; // ya filtrado a un solo técnico, no hace falta agrupar
    const grupos: Record<string, ActividadConTecnico[]> = {};
    filtradas.forEach((a) => {
      const nombre = nombreTecnico(a.profiles);
      if (!grupos[nombre]) grupos[nombre] = [];
      grupos[nombre].push(a);
    });
    return Object.entries(grupos).sort(([a], [b]) => a.localeCompare(b));
  }, [filtradas, tecnicoFiltro]);

  if (loading) return null;
  if (error) {
    return (
      <div className="mb-6 p-4 rounded-2xl bg-red/10 border border-red/30">
        <p className="text-red text-sm font-medium">No se pudo cargar la bitácora de técnicos.</p>
        <p className="text-red/80 text-xs mt-1">{error}</p>
      </div>
    );
  }
  if (actividades.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="font-display font-semibold text-[15px] tracking-wide">Bitácora de técnicos en campo</h2>
        <div className="flex items-center gap-2">
          <select
            value={tecnicoFiltro}
            onChange={(e) => setTecnicoFiltro(e.target.value)}
            className="px-3 py-1.5 rounded-full bg-surface-2 border border-line text-[12px] focus:border-teal focus:outline-none"
          >
            <option value="todos">Todos los técnicos</option>
            {tecnicos.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button onClick={() => setSoloActivas((v) => !v)} className="text-[12px] text-teal font-medium shrink-0">
            {soloActivas ? 'Ver todas' : 'Solo en curso'}
          </button>
        </div>
      </div>

      {filtradas.length === 0 ? (
        <p className="text-muted text-sm">
          {tecnicoFiltro !== 'todos' ? `${tecnicoFiltro} no tiene actividades ${soloActivas ? 'en curso' : ''} registradas.` : 'No hay actividades en curso ahora mismo.'}
        </p>
      ) : agrupadas ? (
        <div className="flex flex-col gap-5">
          {agrupadas.map(([tecnico, lista]) => (
            <div key={tecnico}>
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-6 h-6 rounded-full bg-teal text-inkOnAccent flex items-center justify-center text-[10px] font-display font-bold shrink-0">
                  {tecnico.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')}
                </div>
                <span className="text-[13px] font-semibold">{tecnico}</span>
                <span className="text-[11px] text-muted">({lista.length})</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {lista.map((a) => <ActividadCard key={a.id} a={a} mostrarTecnico={false} />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtradas.map((a) => <ActividadCard key={a.id} a={a} mostrarTecnico={false} />)}
        </div>
      )}
    </div>
  );
}
