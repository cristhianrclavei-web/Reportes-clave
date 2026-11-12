'use client';

import { acomodar, MEDIDAS_DIAGRAMA, tonosDeCable, type AvanceGuia, type DatosGuia } from '@/lib/guias';

// El diagrama de conexión: cada equipo es una caja con sus bornes y cada
// cable una línea de su color entre dos bornes. Tocar un equipo o un cable lo
// resalta y atenúa lo demás, para seguir un cable sin perderse.
//
// `elegido`: { equipo } o { conexion }. Lo decide quien lo usa (GuiaDetalle).

export type Elegido = { equipo: string } | { conexion: string } | null;

export default function DiagramaConexion({ datos, avance, elegido, onElegir }: {
  datos: DatosGuia;
  avance: AvanceGuia;
  elegido: Elegido;
  onElegir: (elegido: Elegido) => void;
}) {
  const acomodo = acomodar(datos);
  const m = MEDIDAS_DIAGRAMA;
  if (acomodo.cajas.length === 0) {
    return <p className="text-[14px] text-muted text-center py-10">Esta guía todavía no tiene equipos.</p>;
  }

  const equipoElegido = elegido && 'equipo' in elegido ? elegido.equipo : null;
  const conexionElegida = elegido && 'conexion' in elegido ? elegido.conexion : null;

  // ¿Este cable tiene que ver con lo elegido?
  function resalta(conexionId: string, de: string, a: string): boolean {
    if (conexionElegida) return conexionElegida === conexionId;
    if (equipoElegido) return de === equipoElegido || a === equipoElegido;
    return false;
  }
  const hayElegido = elegido !== null;

  // Bornes que tocan los cables resaltados (para marcarlos en su caja).
  const bornesResaltados = new Set<string>();
  for (const { conexion } of acomodo.cables) {
    if (!resalta(conexion.id, conexion.de.equipo, conexion.a.equipo)) continue;
    bornesResaltados.add(`${conexion.de.equipo}|${conexion.de.borne}`);
    bornesResaltados.add(`${conexion.a.equipo}|${conexion.a.borne}`);
  }

  return (
    <svg viewBox={`0 0 ${acomodo.ancho} ${acomodo.alto}`} className="w-full h-auto select-none" role="img" aria-label="Diagrama de conexión"
      onClick={() => onElegir(null)}>
      {/* Cajas de los equipos con sus bornes */}
      {acomodo.cajas.map((caja) => {
        const esElegido = equipoElegido === caja.equipo.id;
        return (
          <g key={caja.equipo.id} style={{ cursor: 'pointer' }} opacity={hayElegido && !esElegido && ![...bornesResaltados].some((b) => b.startsWith(`${caja.equipo.id}|`)) ? 0.35 : 1}
            onClick={(ev) => { ev.stopPropagation(); onElegir(esElegido ? null : { equipo: caja.equipo.id }); }}>
            <rect x={caja.x} y={caja.y} width={caja.ancho} height={caja.alto} rx={10}
              fill="rgb(var(--c-surface))" stroke={esElegido ? '#14b8a6' : 'rgb(var(--c-line-rgb) / 0.35)'} strokeWidth={esElegido ? 2.2 : 1.2} />
            <rect x={caja.x} y={caja.y} width={caja.ancho} height={m.altoTitulo - 6} rx={10} fill={esElegido ? '#14b8a6' : '#334155'} />
            <rect x={caja.x} y={caja.y + 14} width={caja.ancho} height={m.altoTitulo - 20} fill={esElegido ? '#14b8a6' : '#334155'} />
            <text x={caja.x + caja.ancho / 2} y={caja.y + 18} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="#fff"
              fontFamily="ui-sans-serif, system-ui">{recortar(caja.equipo.nombre, caja.lado === 'izquierda' ? 19 : 20)}</text>
            {caja.equipo.bornes.map((borne, i) => {
              const y = caja.y + m.altoTitulo + i * m.altoBorne;
              const marcado = bornesResaltados.has(`${caja.equipo.id}|${borne.id}`);
              // El punto del borne va en la orilla por donde salen sus cables.
              const xPunto = caja.lado === 'izquierda' ? caja.x + caja.ancho : caja.x;
              return (
                <g key={borne.id}>
                  {i > 0 && <line x1={caja.x + 6} y1={y} x2={caja.x + caja.ancho - 6} y2={y} stroke="rgb(var(--c-line-rgb) / var(--c-line-a-strong))" strokeWidth={0.6} />}
                  {marcado && <rect x={caja.x + 2} y={y + 2} width={caja.ancho - 4} height={m.altoBorne - 4} rx={6} fill="#14b8a6" fillOpacity={0.16} />}
                  <text x={caja.lado === 'izquierda' ? caja.x + caja.ancho - 10 : caja.x + 10} y={y + m.altoBorne / 2 + 4}
                    textAnchor={caja.lado === 'izquierda' ? 'end' : 'start'} fontSize={11} fontWeight={marcado ? 700 : 500}
                    fill="rgb(var(--c-ink))" fontFamily="ui-monospace, monospace">{recortar(borne.nombre, 17)}</text>
                  <circle cx={xPunto} cy={y + m.altoBorne / 2} r={3.2} fill="rgb(var(--c-surface))" stroke="#475569" strokeWidth={1.2} />
                </g>
              );
            })}
          </g>
        );
      })}

      {/* Cables: encima de las cajas para poder tocarlos */}
      {acomodo.cables.map(({ conexion, d, medio }) => {
        const tonos = tonosDeCable(conexion.color);
        const resaltado = resalta(conexion.id, conexion.de.equipo, conexion.a.equipo);
        const hecho = Boolean(avance.conexiones[conexion.id]);
        const grosor = resaltado ? 3.6 : 2.4;
        return (
          <g key={conexion.id} style={{ cursor: 'pointer' }} opacity={hayElegido && !resaltado ? 0.14 : 1}
            onClick={(ev) => { ev.stopPropagation(); onElegir(conexionElegida === conexion.id ? null : { conexion: conexion.id }); }}>
            {/* Franja ancha invisible: el dedo no tiene que atinarle a una línea delgada. */}
            <path d={d} fill="none" stroke="transparent" strokeWidth={16} />
            {/* Orilla oscura: un cable blanco o amarillo se pierde sobre fondo claro. */}
            <path d={d} fill="none" stroke="#0f172a" strokeOpacity={0.55} strokeWidth={grosor + 1.4} strokeLinecap="round" />
            <path d={d} fill="none" stroke={tonos[0]} strokeWidth={grosor} strokeLinecap="round" />
            {tonos[1] && <path d={d} fill="none" stroke={tonos[1]} strokeWidth={grosor} strokeDasharray="7 7" />}
            {hecho && (
              <g>
                <circle cx={medio[0]} cy={medio[1]} r={6.5} fill="#16a34a" stroke="#fff" strokeWidth={1.2} />
                <path d={`M ${medio[0] - 3} ${medio[1]} l 2.2 2.4 l 4 -4.6`} fill="none" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function recortar(texto: string, largo: number): string {
  return texto.length > largo ? `${texto.slice(0, largo - 1)}…` : texto;
}
