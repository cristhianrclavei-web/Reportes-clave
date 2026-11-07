// Los símbolos del plano (lib/simbolosPlano.ts) en SVG: dentro del plano y
// como ícono en las listas del editor.

import { figuraDe, type FiguraSimbolo } from '@/lib/simbolosPlano';

// Los trazos y letras en unidades (radio 1). Quien lo usa pone la escala y el giro.
export function FiguraEnSvg({ figura }: { figura: FiguraSimbolo }) {
  return (
    <>
      {figura.trazos.map((t, i) => (
        <path key={i} d={t.d} fill={t.relleno || 'none'} stroke={t.linea || 'none'} strokeWidth={t.grosor}
          strokeDasharray={t.guiones?.join(' ')} strokeLinejoin="round" />
      ))}
      {figura.letras.map((l, i) => (
        <text key={i} x={l.x} y={l.y} textAnchor="middle" dominantBaseline="central" fontSize={l.tam} fontWeight={800}
          fontFamily="ui-sans-serif, system-ui, Helvetica, Arial" fill={l.color}>{l.texto}</text>
      ))}
    </>
  );
}

// Ícono suelto (listas, fichas), del mismo dibujo que en el plano.
export default function SimboloPlano({ tipo, tamano = 30 }: { tipo: string; tamano?: number }) {
  return (
    <svg width={tamano} height={tamano} viewBox="-1.15 -1.15 2.3 2.3" aria-hidden="true">
      <FiguraEnSvg figura={figuraDe(tipo)} />
    </svg>
  );
}
