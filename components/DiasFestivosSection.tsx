'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabaseClient';
import { showToast } from '@/components/Toast';
import { hoyLocal, sumarDias } from '@/lib/fechaHoy';
import { fechaCorta } from '@/lib/coberturaReportes';
import { CalendarOff, ChevronDown, Plus, Trash2 } from 'lucide-react';

type Festivo = { fecha: string; nombre: string; tipo: 'oficial' | 'costumbre' | 'empresa' };

const TIPO_LABEL: Record<Festivo['tipo'], string> = {
  oficial: 'Oficial',
  empresa: 'Empresa',
  costumbre: 'Costumbre · sí se pide reporte',
};

function diaSemana(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'long' });
}

// Días festivos. Los 'oficial' y 'empresa' no se le exigen a ningún técnico:
// no reciben el recordatorio de reporte pendiente ni tienen que justificarlo.
// Los de 'costumbre' solo sirven de aviso al agendar (ver lib/avisos.ts). El alta y la baja quedan en Eventos (trigger en SQL).
export default function DiasFestivosSection() {
  const [festivos, setFestivos] = useState<Festivo[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [hoy, setHoy] = useState<string | null>(null);
  const [fecha, setFecha] = useState('');
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function cargar(desde: string, hasta: string) {
    const { data, error } = await createClient()
      .from('dias_festivos')
      .select('fecha, nombre, tipo')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha');
    if (!error) setFestivos((data as Festivo[]) || []);
  }

  useEffect(() => {
    // De 30 días atrás (por si hay que corregir uno reciente) a un año
    // adelante: la tabla trae cargados varios años de festivos oficiales.
    const h = hoyLocal();
    setHoy(h);
    cargar(sumarDias(h, -30), sumarDias(h, 365));
  }, []);

  async function agregar() {
    if (!fecha || !nombre.trim()) return;
    setGuardando(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No hay sesión activa');
      const { error } = await supabase
        .from('dias_festivos')
        .insert({ fecha, nombre: nombre.trim(), tipo: 'empresa', creado_por: user.id });
      if (error) throw error.code === '23505' ? new Error('Ese día ya está marcado') : error;
      setFestivos((prev) => [...prev, { fecha, nombre: nombre.trim(), tipo: 'empresa' as const }].sort((a, b) => a.fecha.localeCompare(b.fecha)));
      setFecha('');
      setNombre(''); 
      showToast('Día festivo agregado', 'success');
    } catch (e: any) {
      showToast('No se pudo agregar: ' + (e?.message || 'error'), 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(f: Festivo) {
    if (!window.confirm(`¿Quitar el ${fechaCorta(f.fecha)} (${f.nombre}) de los días festivos?`)) return;
    const { error } = await createClient().from('dias_festivos').delete().eq('fecha', f.fecha);
    if (error) {
      showToast('No se pudo quitar: ' + error.message, 'error');
      return;
    }
    setFestivos((prev) => prev.filter((x) => x.fecha !== f.fecha));
    showToast('Día festivo quitado', 'success');
  }

  const proximos = hoy ? festivos.filter((f) => f.fecha >= hoy && f.tipo !== 'costumbre').length : 0;

  return (
    <div className="mb-4 rounded-2xl bg-surface border border-line">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full p-4 flex items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <CalendarOff size={18} strokeWidth={2.3} className="text-teal shrink-0" />
          <span className="min-w-0">
            <span className="text-[14px] font-semibold block">Días festivos</span>
            <span className="text-[12px] text-muted">
              {proximos === 0 ? 'Ninguno próximo' : proximos === 1 ? '1 próximo' : `${proximos} próximos`} · no se pide reporte esos días
            </span>
          </span>
        </span>
        <ChevronDown size={18} className={`text-muted shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div className="px-4 pb-4">
          {festivos.length > 0 && (
            <ul className="flex flex-col gap-1.5 mb-3">
              {festivos.map((f) => (
                <li
                  key={f.fecha}
                  className={`flex items-center justify-between gap-2 p-2.5 rounded-xl bg-surface-2 border border-line ${hoy && f.fecha < hoy ? 'opacity-60' : ''}`}
                >
                  <span className="text-[13.5px] min-w-0">
                    <span className="font-semibold">{fechaCorta(f.fecha)}</span>{' '}
                    <span className="text-muted capitalize">{diaSemana(f.fecha)}</span> · {f.nombre}
                    <span className="text-[11.5px] text-muted"> · {TIPO_LABEL[f.tipo] || f.tipo}</span>
                  </span>
                  <button
                    onClick={() => quitar(f)}
                    aria-label={`Quitar ${f.nombre}`}
                    className="p-1.5 rounded-lg text-red hover:bg-red/10 shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="px-3 min-h-[44px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14px]"
            />
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Inventario anual"
              maxLength={80}
              className="flex-1 px-3 min-h-[44px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14px]"
            />
            <button
              onClick={agregar}
              disabled={guardando || !fecha || !nombre.trim()}
              className="px-4 min-h-[44px] rounded-xl bg-teal text-white font-semibold text-[14px] flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Plus size={16} strokeWidth={2.5} /> Agregar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
