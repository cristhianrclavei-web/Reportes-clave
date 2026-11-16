'use client';

import { AlertTriangle, BatteryLow, BatteryMedium, BatteryFull, Satellite } from 'lucide-react';
import { AvatarTecnico } from '@/components/AvatarTecnico';
import { COLOR_ESTADO, TEXTO_ESTADO, ultimaVez } from '@/lib/campo';
import type { InfoTecnico } from './useCampo';

// Un técnico en la lista de la izquierda (los dos mapas). Con `conTelefono`
// (Servicios → Mapa) también dice la batería y si el GPS manda bien, para
// distinguir si no está trabajando o si es un problema del teléfono.

export function ChipEstado({ estado }: { estado: InfoTecnico['estado'] }) {
  const color = COLOR_ESTADO[estado];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap"
      style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {TEXTO_ESTADO[estado]}
    </span>
  );
}

function Bateria({ nivel }: { nivel: number }) {
  const Icono = nivel <= 15 ? BatteryLow : nivel <= 60 ? BatteryMedium : BatteryFull;
  return (
    <span className={`inline-flex items-center gap-1 ${nivel <= 15 ? 'text-red font-semibold' : ''}`} title="Batería del teléfono">
      <Icono size={13} /> {nivel}%
    </span>
  );
}

// Qué tan bien manda el GPS su último punto.
export function textoGps(info: InfoTecnico, ahora: number): { texto: string; mal: boolean } {
  const ultimo = info.conocido;
  if (!ultimo) return { texto: 'Nunca ha mandado ubicación', mal: true };
  const minutos = (ahora - Date.parse(ultimo.registrado_en)) / 60000;
  // Los teléfonos mandan ubicación en horario de trabajo: de noche no es un problema.
  const horaDelDia = Number(new Date(ahora).toLocaleTimeString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'America/Mexico_City' }));
  if (minutos > 15 && (horaDelDia < 7 || horaDelDia >= 19)) return { texto: 'Fuera de horario', mal: false };
  if (minutos > 15) return { texto: 'Sin puntos: teléfono, datos o GPS apagado', mal: true };
  if ((ultimo.precision_m || 0) > 100) return { texto: `GPS impreciso (±${Math.round(ultimo.precision_m!)} m)`, mal: true };
  return { texto: 'GPS bien', mal: false };
}

export default function TarjetaTecnico({ info, ahora, elegido, onClick, conTelefono, esHoy }: {
  info: InfoTecnico;
  ahora: number;
  elegido: boolean;
  onClick: () => void;
  conTelefono: boolean;
  esHoy: boolean;
}) {
  const color = COLOR_ESTADO[info.estado];
  const visto = info.ultimo || info.conocido;
  const gps = textoGps(info, ahora);
  return (
    <button type="button" onClick={onClick} aria-pressed={elegido}
      className={`w-full text-left rounded-2xl border p-3 flex gap-3 transition-colors ${elegido ? 'border-teal bg-teal/10' : 'border-line bg-surface hover:border-teal/50'}`}>
      <span className="shrink-0 rounded-full p-[2.5px] h-fit" style={{ background: color }}>
        <AvatarTecnico id={info.id} nombre={info.nombre} size={40} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-semibold text-[14px] leading-tight truncate">{info.nombre}</span>
          {info.alertas.length > 0 && (
            <span className="shrink-0 inline-flex items-center gap-0.5 text-red text-[11.5px] font-bold" title={info.alertas.map((a) => a.texto).join('\n')}>
              <AlertTriangle size={13} strokeWidth={2.6} /> {info.alertas.length}
            </span>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
          <ChipEstado estado={info.estado} />
          {info.avance.total > 0 && <span className="text-[12px] text-muted tabular-nums">{info.avance.hechos} de {info.avance.total}</span>}
        </span>
        {info.actual && <span className="block text-[12.5px] mt-1 truncate"><span className="text-muted">Ahora:</span> {info.actual.proyecto}</span>}
        {info.siguiente && <span className="block text-[12.5px] truncate"><span className="text-muted">Sigue:</span> {info.siguiente.proyecto}{info.siguiente.hora_programada ? ` · ${info.siguiente.hora_programada}` : ''}</span>}
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1 text-[11.5px] text-muted">
          <span>{visto ? `Visto ${ultimaVez(visto.registrado_en, ahora)}` : 'Sin ubicación'}</span>
          {conTelefono && esHoy && typeof info.conocido?.bateria === 'number' && <Bateria nivel={info.conocido.bateria} />}
          {conTelefono && esHoy && (
            <span className={`inline-flex items-center gap-1 ${gps.mal ? 'text-amber' : ''}`}><Satellite size={12} /> {gps.texto}</span>
          )}
        </span>
      </span>
    </button>
  );
}
