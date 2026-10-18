// Diálogos propios de la app en lugar de confirm(), alert() y prompt() del
// navegador. Aquellos se anuncian con el dominio («reportes-clave.vercel.app
// dice») y con el diseño del sistema; estos usan el de la app.
//
// Se usan igual que los del navegador, pero esperando la respuesta:
//   if (!(await confirmar('¿Borrar X?\n\nNo se puede deshacer.'))) return;
//   avisar('No se pudo guardar: sin conexión');
//   const nombre = await pedirTexto('¿Con qué nombre?', 'Copia');
//
// Del texto se sacan solos el título (la pregunta), el detalle (lo demás),
// el botón (el verbo de la pregunta: «Borrar», «Quitar»…) y si la acción es
// delicada (botón en rojo). Quien llama puede cambiar cualquiera de ellos.
// Los dibuja components/Dialogos.tsx, montado una vez en app/layout.tsx.

export type TonoDialogo = 'info' | 'peligro' | 'error';

export type OpcionesDialogo = {
  titulo?: string;
  detalle?: string;
  textoAceptar?: string;
  textoCancelar?: string;
  tono?: TonoDialogo;
};

export type PedidoDialogo = {
  id: number;
  tipo: 'confirmar' | 'avisar' | 'pedirTexto';
  titulo: string;
  detalle: string;
  textoAceptar: string;
  textoCancelar: string;
  tono: TonoDialogo;
  valorInicial?: string;
  responder: (valor: boolean | string | null) => void;
};

export const EVENTO_DIALOGO = 'app:dialogo';

// Título y detalle a partir del texto de siempre.
//  - «Pregunta\n\nDetalle»  → la pregunta es el título
//  - «Aviso. ¿Pregunta?»    → la pregunta es el título y el aviso, el detalle
//  - «¿Pregunta? Detalle»   → igual
//  - «No se pudo X: motivo» → «No se pudo X» y el motivo
export function partesDelTexto(texto: string): { titulo: string; detalle: string } {
  const limpio = texto.trim();
  const parrafos = limpio.split(/\n\s*\n/);
  if (parrafos.length > 1) {
    return { titulo: parrafos[0].trim(), detalle: parrafos.slice(1).join('\n\n').trim() };
  }
  const inicioPregunta = limpio.indexOf('¿');
  if (inicioPregunta > 0) {
    return { titulo: limpio.slice(inicioPregunta).trim(), detalle: limpio.slice(0, inicioPregunta).trim() };
  }
  const finPregunta = limpio.indexOf('?');
  if (inicioPregunta === 0 && finPregunta > 0 && finPregunta < limpio.length - 1) {
    return { titulo: limpio.slice(0, finPregunta + 1).trim(), detalle: limpio.slice(finPregunta + 1).trim() };
  }
  const dosPuntos = limpio.indexOf(': ');
  if (/^no se pud/i.test(limpio) && dosPuntos > 0) {
    return { titulo: limpio.slice(0, dosPuntos).trim(), detalle: limpio.slice(dosPuntos + 2).trim() };
  }
  return { titulo: limpio, detalle: '' };
}

const VERBOS_DELICADOS = ['eliminar', 'borrar', 'quitar', 'descartar', 'rechazar', 'cancelar', 'vaciar'];

// El verbo con que empieza la pregunta («¿Borrar…» → «Borrar»), para el
// botón. null si no empieza con un verbo en infinitivo.
export function verboDe(titulo: string): string | null {
  const m = titulo.match(/^¿\s*([a-záéíóúñ]+)/i);
  if (!m) return null;
  const palabra = m[1];
  if (!/(ar|er|ir)$/i.test(palabra)) return null;
  return palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase();
}

export function esDelicado(texto: string): boolean {
  const t = texto.toLowerCase();
  const verbo = verboDe(partesDelTexto(texto).titulo)?.toLowerCase();
  if (verbo && VERBOS_DELICADOS.includes(verbo)) return true;
  return t.includes('permanente') || t.includes('no se puede deshacer') || t.includes('se borrar');
}

let siguienteId = 1;

function pedir(
  tipo: PedidoDialogo['tipo'],
  texto: string,
  opciones: OpcionesDialogo,
  porOmision: { textoAceptar: string; textoCancelar: string; tono: TonoDialogo },
  valorInicial?: string,
): Promise<boolean | string | null> {
  const partes = partesDelTexto(texto);
  return new Promise((resolve) => {
    // Sin pantalla (servidor) no hay a quién preguntar.
    if (typeof window === 'undefined') {
      resolve(tipo === 'confirmar' ? false : null);
      return;
    }
    const pedido: PedidoDialogo = {
      id: siguienteId++,
      tipo,
      titulo: opciones.titulo ?? partes.titulo,
      detalle: opciones.detalle ?? partes.detalle,
      textoAceptar: opciones.textoAceptar ?? porOmision.textoAceptar,
      textoCancelar: opciones.textoCancelar ?? porOmision.textoCancelar,
      tono: opciones.tono ?? porOmision.tono,
      valorInicial,
      responder: resolve,
    };
    window.dispatchEvent(new CustomEvent(EVENTO_DIALOGO, { detail: pedido }));
  });
}

export async function confirmar(texto: string, opciones: OpcionesDialogo = {}): Promise<boolean> {
  const verbo = verboDe(partesDelTexto(texto).titulo);
  const delicado = esDelicado(texto);
  const respuesta = await pedir('confirmar', texto, opciones, {
    textoAceptar: verbo || 'Aceptar',
    // «¿Cancelar el servicio?» no puede tener dos botones «Cancelar».
    textoCancelar: verbo === 'Cancelar' ? 'Volver' : 'Cancelar',
    tono: delicado ? 'peligro' : 'info',
  });
  return respuesta === true;
}

export async function avisar(texto: string, opciones: OpcionesDialogo = {}): Promise<void> {
  const esError = /no se pud|error|falló|fallo/i.test(texto);
  await pedir('avisar', texto, opciones, { textoAceptar: 'Entendido', textoCancelar: '', tono: esError ? 'error' : 'info' });
}

export async function pedirTexto(texto: string, valorInicial = '', opciones: OpcionesDialogo = {}): Promise<string | null> {
  const respuesta = await pedir('pedirTexto', texto, opciones, { textoAceptar: 'Aceptar', textoCancelar: 'Cancelar', tono: 'info' }, valorInicial);
  return typeof respuesta === 'string' ? respuesta : null;
}
