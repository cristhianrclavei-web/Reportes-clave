// Geometría del logo de Clave Inteligente, en un solo lugar. La usan
// components/Logo.tsx (pantalla), lib/pdfBranding.ts (documentos) y
// app/icono (ícono de la app): así el escudo y los íconos son exactamente
// los mismos en todas partes y solo cambia el color según el fondo.
//
// Trazado a partir del logotipo original de la empresa: escudo abierto con
// tres nodos (arriba, izquierda y abajo), un ramal corto que sale del nodo
// izquierdo, las iniciales grandes al centro y, bajo el nombre, la línea roja
// con los seis servicios.

// ---------- Escudo (viewBox 0 0 100 100) ----------
// Contorno abierto: sube del nodo izquierdo, pasa por el nodo de arriba, baja
// por la derecha y cierra en diagonal hacia el nodo de abajo.
export const ESCUDO_CONTORNO = 'M17 66 V23 L50 9 L83 23 V66 L50 92';
// Ramal corto que sale del nodo izquierdo (no llega al de abajo).
export const ESCUDO_RAMAL = 'M17 66 L32 81';
export const ESCUDO_TRAZO = 5.5;
// [cx, cy, r]
export const ESCUDO_NODOS: [number, number, number][] = [[50, 9, 6.5], [17, 66, 6.5], [50, 92, 6.5]];
// Iniciales: tamaño de letra y punto de anclaje (centro en x, línea base en y).
export const ESCUDO_LETRA = { tam: 50, x: 50.5, y: 66 };

// ---------- Íconos de servicio (viewBox 0 0 24 24) ----------
// Formas rellenas, como en el logotipo. Cada pieza es un path: relleno, o
// trazo si lleva `trazo` (grosor). Los huecos (flama interior, candado,
// ranuras) van en el mismo path con el sentido contrario al contorno, para
// que se vea el fondo a través sin depender de su color.
export type PiezaIcono = { d: string; trazo?: number };
// rojo: la flama, siempre roja. gris: tono medio del texto. fuerte: tono
// pleno del texto (el detector, que en el original va en blanco).
export type TonoIcono = 'rojo' | 'gris' | 'fuerte';
export type IconoServicio = { nombre: string; tono: TonoIcono; piezas: PiezaIcono[] };

export const ROJO_FLAMA = '#E5484D';

function circulo(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
}
function rect(x: number, y: number, w: number, h: number): string {
  return `M${x} ${y}h${w}v${h}h${-w}Z`;
}

export const ICONOS_SERVICIO: IconoServicio[] = [
  {
    nombre: 'Detección y combate de incendios',
    tono: 'rojo',
    piezas: [
      {
        d: 'M12.3 2.2c.5 2.6 2.2 4 3.7 5.8 1.5 1.8 2.6 3.6 2.6 6.1 0 4-3 7.2-6.8 7.2S5 18.3 5 14.4c0-2.2.9-4 2.3-5.5.2 1.5.8 2.4 1.9 2.9-.4-3.4.6-6.6 3.1-9.6Z'
          + 'M12 13.4c-1.5 1.6-2.4 2.9-2.4 4.2 0 1.4 1.1 2.4 2.4 2.4s2.4-1 2.4-2.4c0-1.3-.9-2.6-2.4-4.2Z',
      },
    ],
  },
  {
    nombre: 'CCTV y videovigilancia',
    tono: 'gris',
    piezas: [
      // Cuerpo de la cámara, inclinado.
      { d: 'M4.6 7.2 15.6 3.4l2 5.7-11 3.8Z' },
      // Lente.
      { d: 'M17.4 4.4l3-.6 1.1 3.3-2.8 1.3Z' },
      // Brazo y placa de pared.
      { d: 'M9.6 12.2v3.4l-3.4 2.6', trazo: 1.9 },
      { d: rect(3, 16.2, 2.6, 5.2) },
    ],
  },
  {
    nombre: 'Control de acceso',
    tono: 'gris',
    piezas: [
      {
        d: 'M12 2.6 19.2 5.3v5.9c0 4.3-2.9 7.9-7.2 9.6-4.3-1.7-7.2-5.3-7.2-9.6V5.3Z'
          // Candado (hueco): cuerpo y arco.
          + 'M9.2 11.6v4.4h5.6v-4.4Z'
          + 'M14.1 11.6V9.9a2.1 2.1 0 0 0-4.2 0v1.7h1.2V9.9a.9.9 0 0 1 1.8 0v1.7Z',
      },
    ],
  },
  {
    nombre: 'Energía solar fotovoltaica',
    tono: 'gris',
    piezas: [
      { d: rect(3, 3.6, 5.4, 4.2) + rect(9.3, 3.6, 5.4, 4.2) + rect(15.6, 3.6, 5.4, 4.2) },
      { d: rect(3, 8.7, 5.4, 4.2) + rect(9.3, 8.7, 5.4, 4.2) + rect(15.6, 8.7, 5.4, 4.2) },
      { d: rect(11.2, 13.6, 1.6, 5) + rect(7.4, 18.6, 9.2, 1.8) },
    ],
  },
  {
    nombre: 'Automatización industrial',
    tono: 'gris',
    piezas: [
      { d: rect(4.6, 19.2, 10, 2) + rect(7.4, 15.6, 4.4, 3.6) },
      { d: 'M9.6 15.4 13.4 8.4', trazo: 2.3 },
      { d: 'M13.4 8.4 7.8 5', trazo: 1.9 },
      { d: circulo(9.6, 15.4, 1.8) + circulo(13.4, 8.4, 2) + circulo(7.8, 5, 1.4) },
      { d: 'M7.8 5 5.2 3.4M7.8 5 5 6.4', trazo: 1.3 },
    ],
  },
  {
    nombre: 'Detección de humo',
    tono: 'fuerte',
    piezas: [
      // Visto ligeramente desde abajo, como en el logotipo: la base ancha
      // pegada al techo, la cámara con sus ranuras y la tapa inferior.
      { d: 'M2.4 9.5c0-1.7 4.3-3 9.6-3s9.6 1.3 9.6 3v1.1c0 1.7-4.3 3-9.6 3s-9.6-1.3-9.6-3Z' },
      {
        d: 'M5.2 14.1c1.9.6 4.2.9 6.8.9s4.9-.3 6.8-.9l-1 2.7c-1.5.5-3.5.8-5.8.8s-4.3-.3-5.8-.8Z'
          // Ranuras (huecos).
          + 'M7.7 15.7v1.3h1.3v-1.3Z' + 'M10.1 15.9v1.3h1.3v-1.3Z' + 'M12.6 15.9v1.3h1.3v-1.3Z' + 'M15 15.7v1.3h1.3v-1.3Z',
      },
      { d: 'M8.8 18.7c.9.2 2 .3 3.2.3s2.3-.1 3.2-.3c-.3 1-1.6 1.7-3.2 1.7s-2.9-.7-3.2-1.7Z' },
    ],
  },
];

// ---------- Nombre ----------
// En el logotipo el nombre va en versalitas: la inicial de cada palabra más
// alta que el resto («CLAVE INTELIGENTE»). Devuelve los tramos con su escala.
export const ESCALA_VERSALITA = 0.8;
export function tramosNombre(nombre: string): { texto: string; escala: number }[] {
  const tramos: { texto: string; escala: number }[] = [];
  nombre.trim().split(/\s+/).forEach((palabra, i) => {
    const p = palabra.toUpperCase();
    if (i > 0) tramos.push({ texto: ' ', escala: ESCALA_VERSALITA });
    tramos.push({ texto: p.slice(0, 1), escala: 1 });
    if (p.length > 1) tramos.push({ texto: p.slice(1), escala: ESCALA_VERSALITA });
  });
  return tramos;
}
