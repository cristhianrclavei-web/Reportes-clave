'use client';

import { useEffect, useMemo, useState } from 'react';
import { HeartPulse, Phone, Search, Shirt, Droplet, Crown } from 'lucide-react';
import { AvatarTecnico, UNIFORMES } from '@/components/AvatarTecnico';
import { createClient } from '@/lib/supabaseClient';
import { useCuadrillas, cuadrillaPorTecnico } from '@/lib/cuadrillas';

// Personal → Equipo: la ficha de cada persona para quien supervisa. Aquí es
// donde se consulta, en una emergencia, a quién avisar, el tipo de sangre y
// las alergias que cada quien registró en su perfil; también las tallas
// para pedir uniforme y equipo de protección. Solo lo ven los supervisores
// (la base no entrega estos datos a nadie más).

type Persona = {
  id: string;
  full_name: string;
  role: string;
  activo: boolean | null;
  telefono: string | null;
  apodo: string | null;
  puesto: string | null;
  especialidades: string[] | null;
  emergencia_nombre: string | null;
  emergencia_telefono: string | null;
  tipo_sangre?: string | null;
  alergias?: string | null;
  talla_camisa?: string | null;
  talla_calzado?: string | null;
};

const BASE = 'id, full_name, role, activo, telefono, apodo, puesto, especialidades, emergencia_nombre, emergencia_telefono';
const AMPLIADO = `${BASE}, tipo_sangre, alergias, talla_camisa, talla_calzado`;

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const tel = (t: string) => `tel:${t.replace(/[^\d+]/g, '')}`;

export default function Directorio() {
  const [gente, setGente] = useState<Persona[] | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState('');
  const { cuadrillas } = useCuadrillas();
  const mapa = useMemo(() => cuadrillaPorTecnico(cuadrillas), [cuadrillas]);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      // Si la base aún no tiene patch_perfil_ampliado.sql, se cargan los datos de antes.
      let r = await supabase.from('profiles').select(AMPLIADO).order('full_name');
      if (r.error) r = (await supabase.from('profiles').select(BASE).order('full_name')) as typeof r;
      if (r.error) { setError(true); setGente([]); return; }
      setGente(((r.data as unknown as Persona[]) || []).filter((p) => p.activo !== false));
    })();
  }, []);

  const lista = useMemo(() => {
    const n = norm(q.trim());
    const todos = gente || [];
    const filtrados = !n ? todos : todos.filter((p) =>
      norm(`${p.full_name} ${p.apodo || ''} ${p.puesto || ''} ${(p.especialidades || []).join(' ')} ${mapa.get(p.id)?.nombre || ''}`).includes(n));
    // Supervisión al final; el resto por nombre.
    return [...filtrados].sort((a, b) => (a.role === 'supervisor' ? 1 : 0) - (b.role === 'supervisor' ? 1 : 0) || a.full_name.localeCompare(b.full_name, 'es'));
  }, [gente, q, mapa]);

  const sinEmergencia = (gente || []).filter((p) => p.role === 'tecnico' && !p.emergencia_telefono).length;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, puesto, especialidad o cuadrilla"
            className="w-full h-11 pl-10 pr-3 rounded-full bg-surface border border-line focus:border-teal focus:outline-none text-[14px] placeholder:text-muted" />
        </div>
        {gente && sinEmergencia > 0 && (
          <p className="text-[12.5px] text-amber font-medium flex items-center gap-1.5">
            <HeartPulse size={14} /> {sinEmergencia} {sinEmergencia === 1 ? 'persona no ha registrado' : 'personas no han registrado'} contacto de emergencia
          </p>
        )}
      </div>

      {error && <p className="text-[13px] text-red font-semibold mb-3">No se pudo cargar el equipo. Revisa la conexión.</p>}
      {!gente && <p className="text-[13px] text-muted py-8 text-center">Cargando…</p>}
      {gente && lista.length === 0 && <p className="text-[13px] text-muted py-8 text-center">Nadie coincide con la búsqueda.</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
        {lista.map((p, i) => {
          const c = mapa.get(p.id);
          const tieneEmergencia = p.emergencia_nombre || p.emergencia_telefono || p.tipo_sangre || p.alergias;
          return (
            <article key={p.id} className="rounded-2xl bg-surface border border-line p-4 flex flex-col">
              <div className="flex items-center gap-3">
                <AvatarTecnico id={p.id} nombre={p.full_name} size={52} indice={i} />
                <div className="min-w-0 flex-1">
                  <p className="font-display font-bold text-[18px] leading-tight tracking-wide truncate">
                    {p.full_name}{p.apodo ? <span className="text-teal font-semibold text-[13.5px]"> «{p.apodo}»</span> : null}
                  </p>
                  <p className="text-[12.5px] text-muted truncate">{p.puesto || (p.role === 'supervisor' ? 'Supervisión' : 'Personal técnico')}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 mt-3">
                {c && (
                  <span className="pl-2 pr-2.5 py-1 rounded-full bg-surface-2 border border-line text-[11.5px] font-semibold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: UNIFORMES[c.color % UNIFORMES.length] }} />
                    {c.nombre}
                    {c.lider_id === p.id && <Crown size={11} className="text-amber" aria-label="Líder" />}
                  </span>
                )}
                {(p.especialidades || []).map((e) => (
                  <span key={e} className="px-2.5 py-1 rounded-full bg-teal/12 text-teal text-[11.5px] font-semibold">{e}</span>
                ))}
              </div>

              {p.telefono && (
                <a href={tel(p.telefono)} className="mt-3 inline-flex items-center gap-2 text-[13.5px] font-medium text-ink/85 hover:text-teal w-fit">
                  <Phone size={14} className="text-muted" /> {p.telefono}
                </a>
              )}

              <div className="mt-3 pt-3 border-t border-line">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-faint flex items-center gap-1.5 mb-1.5">
                  <HeartPulse size={12} className="text-red" /> En caso de emergencia
                </p>
                {!tieneEmergencia ? (
                  <p className="text-[12.5px] text-faint">Sin datos registrados</p>
                ) : (
                  <div className="text-[13px] space-y-1">
                    {(p.emergencia_nombre || p.emergencia_telefono) && (
                      <p>
                        <span className="text-ink/85">{p.emergencia_nombre || 'Contacto'}</span>
                        {p.emergencia_telefono && (
                          <a href={tel(p.emergencia_telefono)} className="ml-2 font-semibold text-teal tabular-nums">{p.emergencia_telefono}</a>
                        )}
                      </p>
                    )}
                    {(p.tipo_sangre || p.alergias) && (
                      <p className="flex items-start gap-2">
                        {p.tipo_sangre && (
                          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red/12 text-red text-[12px] font-bold tabular-nums">
                            <Droplet size={11} /> {p.tipo_sangre}
                          </span>
                        )}
                        {p.alergias && <span className="text-ink/80">{p.alergias}</span>}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {(p.talla_camisa || p.talla_calzado) && (
                <p className="mt-2.5 text-[12.5px] text-muted flex items-center gap-1.5">
                  <Shirt size={13} />
                  {[p.talla_camisa && `Camisa ${p.talla_camisa}`, p.talla_calzado && `Calzado ${p.talla_calzado}`].filter(Boolean).join(' · ')}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
