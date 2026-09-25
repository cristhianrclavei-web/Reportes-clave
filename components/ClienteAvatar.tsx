import type { TipoPersona } from '@/lib/clienteDatos';

// Imagen predeterminada de un cliente sin logo. A propósito muy distintas
// entre sí, para distinguir de un vistazo a "Juan González" (persona
// física: caricatura de una persona) de "Print Pack" (empresa: edificio).

// Fondo del cuadro que contiene el avatar; cada tipo con su color.
export function fondoAvatar(tipo: TipoPersona | null | undefined): string {
  return tipo === 'fisica' ? 'bg-amber/15' : 'bg-teal/10';
}

export default function ClienteAvatar({ tipo, size = 32 }: { tipo: TipoPersona | null | undefined; size?: number }) {
  if (tipo === 'fisica') {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <path d="M8 64c0-13 10-21 24-21s24 8 24 21Z" fill="#2F7D5C" />
        <path d="M27 42h10v6a5 5 0 0 1-10 0Z" fill="#E8B48A" />
        <circle cx="32" cy="27" r="12" fill="#F1C7A1" />
        <path d="M19.5 26c0-9 5.5-15 12.5-15s12.5 6 12.5 15c-3.4-4.6-7.6-6.8-12.5-6.8S22.9 21.4 19.5 26Z" fill="#3B2A20" />
        <circle cx="27.4" cy="28" r="1.5" fill="#3B2A20" />
        <circle cx="36.6" cy="28" r="1.5" fill="#3B2A20" />
        <path d="M28 33.2c2.6 2.5 5.4 2.5 8 0" fill="none" stroke="#B5654A" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  const ventanas: [number, number][] = [];
  for (let fila = 0; fila < 5; fila++) for (let col = 0; col < 3; col++) ventanas.push([18 + col * 8, 18 + fila * 8]);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect x="14" y="10" width="28" height="50" rx="2.5" fill="#1F3A4D" />
      {ventanas.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="4.5" height="4.5" rx="1" fill={i % 4 === 1 ? '#F2B84B' : '#CFE5DC'} />
      ))}
      <rect x="42" y="28" width="14" height="32" rx="2.5" fill="#2F7D5C" />
      <rect x="45.5" y="32" width="3.5" height="3.5" rx="0.8" fill="#CFE5DC" />
      <rect x="51" y="32" width="3.5" height="3.5" rx="0.8" fill="#CFE5DC" />
      <rect x="45.5" y="40" width="3.5" height="3.5" rx="0.8" fill="#CFE5DC" />
      <rect x="51" y="40" width="3.5" height="3.5" rx="0.8" fill="#CFE5DC" />
      <rect x="23" y="50" width="10" height="10" rx="1.2" fill="#F2B84B" />
      <path d="M6 60.5h52" stroke="#1F3A4D" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
