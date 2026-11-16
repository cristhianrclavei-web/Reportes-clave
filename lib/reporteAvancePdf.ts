// Reporte de avance de la instalación de un cliente: resumen por etapa, por
// plano y por tipo de equipo, cada plano con sus equipos pintados según su
// estado, y la lista de lo que falta con el motivo de lo que no se puede
// instalar. Se arma en el navegador, igual que el PDF del plano.

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import {
  COLOR_BLOQUEADO, ESTADOS_AVANCE, colorDeAvance, contar, cuentaVacia, datosDeEstado, equiposQueCuentan, estadoDe,
  nombreEtapa, porcentajes, resumenPorEtapa, resumenPorLazo, resumenPorTipo, sumar,
  type AvancePlano, type Cuenta,
} from './avancePlano';
import { ordenarPorNivel } from './planos';
import { exportarPlanoPdf } from './exportarPlanoPdf';
import { tipoDispositivo } from './lazos';
import type { EquipoPlano, Plano } from './planos';

export type PlanoParaReporte = {
  plano: Plano;
  avance: AvancePlano;
  // El fondo del plano, como en exportarPlanoPdf. Sin fondo, el plano no se dibuja.
  pdfOriginal: ArrayBuffer | Uint8Array | null;
  fondoPng: Uint8Array | null;
  // Dirección de cada equipo ligado a un dispositivo del lazo (id del dispositivo → texto).
  etiquetas: Map<string, string>;
};

const ANCHO = 612;
const ALTO = 792;
const MARGEN = 40;
const TINTA = rgb(0.06, 0.15, 0.23);
const GRIS = rgb(0.42, 0.46, 0.5);
const LINEA = rgb(0.78, 0.8, 0.82);

function color(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// Helvetica solo trae letras latinas: lo demás se cambia para que no truene.
function limpio(valor: string): string {
  return valor.replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/→/g, '>').replace(/[^\x20-\xFF]/g, '?');
}

// Corta el texto para que quepa en el ancho.
function recortar(valor: string, fuente: PDFFont, tam: number, ancho: number): string {
  let t = limpio(valor);
  if (fuente.widthOfTextAtSize(t, tam) <= ancho) return t;
  while (t.length > 1 && fuente.widthOfTextAtSize(`${t}...`, tam) > ancho) t = t.slice(0, -1);
  return `${t}...`;
}

function rotuloDe(equipo: EquipoPlano, etiquetas: Map<string, string>): string {
  return (equipo.elementoId && etiquetas.get(equipo.elementoId)) || equipo.etiqueta || 'Sin dirección';
}

export async function reporteAvancePdf({ cliente, empresa, planos: sinOrden, paneles = [], lazoDe = () => null, fotos = new Map() }: {
  cliente: string;
  empresa: string;
  planos: PlanoParaReporte[];
  // Nombres de los paneles del cliente, para la portada.
  paneles?: string[];
  // El lazo de un equipo (por su dispositivo ligado), para la tabla por lazo.
  lazoDe?: (e: EquipoPlano) => { id: string; nombre: string } | null;
  // Fotos de evidencia ya descargadas (ruta → bytes JPG o PNG).
  fotos?: Map<string, Uint8Array>;
}): Promise<Uint8Array> {
  // Los planos van por nivel (-2, -1, Planta baja, 1…).
  const planos = ordenarPorNivel(sinOrden.map((p) => ({ ...p, nombre: p.plano.nombre })));
  const pdf = await PDFDocument.create();
  pdf.setTitle(limpio(`Reporte de avance - ${cliente}`));
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fecha = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' });

  let hoja: PDFPage = pdf.addPage([ANCHO, ALTO]);
  const imagenes: { hoja: PDFPage; x: number; y: number; ancho: number; alto: number; bytes: Uint8Array }[] = [];
  let y = ALTO - MARGEN;

  function pie(p: PDFPage) {
    p.drawText(limpio(`${empresa} · Reporte de avance · ${cliente} · Corte al ${fecha}`), { x: MARGEN, y: 22, size: 7.5, font: fuente, color: GRIS });
  }
  function hojaNueva() {
    pie(hoja);
    hoja = pdf.addPage([ANCHO, ALTO]);
    y = ALTO - MARGEN;
  }
  function espacio(alto: number) {
    if (y - alto < MARGEN + 10) hojaNueva();
  }
  function titulo(t: string) {
    espacio(40);
    y -= 8;
    hoja.drawText(limpio(t.toUpperCase()), { x: MARGEN, y, size: 10, font: negrita, color: TINTA });
    y -= 5;
    hoja.drawLine({ start: { x: MARGEN, y }, end: { x: ANCHO - MARGEN, y }, thickness: 1, color: TINTA });
    y -= 14;
  }

  // ---------- Encabezado ----------
  hoja.drawText(limpio(empresa), { x: MARGEN, y: y - 4, size: 11, font: negrita, color: GRIS });
  hoja.drawText('REPORTE DE AVANCE DE INSTALACIÓN', { x: MARGEN, y: y - 26, size: 17, font: negrita, color: TINTA });
  hoja.drawText(recortar(cliente, negrita, 14, ANCHO - MARGEN * 2), { x: MARGEN, y: y - 46, size: 14, font: negrita, color: TINTA });
  hoja.drawText(recortar(`${paneles.length === 1 ? 'Panel' : 'Paneles'}: ${paneles.length ? paneles.join(', ') : 'sin registrar'}`, fuente, 10, ANCHO - MARGEN * 2), { x: MARGEN, y: y - 62, size: 10, font: fuente, color: TINTA });
  hoja.drawText(limpio(`Fecha de corte: ${fecha} · ${planos.length} ${planos.length === 1 ? 'plano' : 'planos'}`), { x: MARGEN, y: y - 76, size: 9.5, font: fuente, color: GRIS });
  y -= 89;
  hoja.drawLine({ start: { x: MARGEN, y }, end: { x: ANCHO - MARGEN, y }, thickness: 1.5, color: TINTA });
  y -= 18;

  // ---------- Totales ----------
  let total: Cuenta = cuentaVacia();
  for (const p of planos) total = sumar(total, contar(p.plano.sembrado.equipos, p.avance));

  // % probado y % con algún avance, sin contar lo que no se puede instalar.
  const pctTotal = porcentajes(total);
  const cuadros: [string, string][] = [
    ['Equipos en proyecto', String(total.total)],
    ['Probado', `${pctTotal.probado}% (${pctTotal.probados} de ${pctTotal.aplicables})`],
    ['Con algún avance', `${pctTotal.avance}% (${pctTotal.conAvance} de ${pctTotal.aplicables})`],
    ['No se pueden instalar', String(total.bloqueados)],
  ];
  const anchoCuadro = (ANCHO - MARGEN * 2 - 18) / 4;
  cuadros.forEach(([rotulo, valor], i) => {
    const x = MARGEN + i * (anchoCuadro + 6);
    hoja.drawRectangle({ x, y: y - 46, width: anchoCuadro, height: 46, borderColor: LINEA, borderWidth: 0.8 });
    hoja.drawText(limpio(rotulo.toUpperCase()), { x: x + 7, y: y - 14, size: 6.8, font: negrita, color: GRIS });
    hoja.drawText(recortar(valor, negrita, 13, anchoCuadro - 12), { x: x + 7, y: y - 35, size: 13, font: negrita, color: i === 3 && total.bloqueados > 0 ? color(COLOR_BLOQUEADO) : TINTA });
  });
  y -= 60;

  // Barra del total por estado, con la letra de cada tramo (no solo color).
  const tramos = [
    ...ESTADOS_AVANCE.map((e) => ({ nombre: e.corto, color: e.color, letra: e.letra === '✓' ? 'OK' : e.letra, n: total.porEstado[e.id] })),
    { nombre: 'No se puede', color: COLOR_BLOQUEADO, letra: 'X', n: total.bloqueados },
  ];
  if (total.total > 0) {
    let x = MARGEN;
    for (const t of tramos) {
      const ancho = (t.n / total.total) * (ANCHO - MARGEN * 2);
      if (ancho > 0) {
        hoja.drawRectangle({ x, y: y - 14, width: ancho, height: 14, color: color(t.color) });
        const texto = `${t.letra} ${t.n}`;
        if (negrita.widthOfTextAtSize(texto, 8) < ancho - 4) hoja.drawText(texto, { x: x + (ancho - negrita.widthOfTextAtSize(texto, 8)) / 2, y: y - 10, size: 8, font: negrita, color: rgb(1, 1, 1) });
      }
      x += ancho;
    }
    y -= 28;
  }
  let xLeyenda = MARGEN;
  for (const t of tramos) {
    const texto = limpio(`${t.letra} ${t.nombre}`);
    hoja.drawCircle({ x: xLeyenda + 4, y: y + 3, size: 4, color: color(t.color) });
    hoja.drawText(texto, { x: xLeyenda + 12, y, size: 7.8, font: fuente, color: TINTA });
    xLeyenda += 22 + fuente.widthOfTextAtSize(texto, 7.8);
  }
  y -= 16;

  // ---------- Tablas de resumen ----------
  const columnas = ['Equipos', 'Pendiente', 'Tub. y cable', 'Instalado', 'Direcc.', 'Probado', 'No se puede', '% probado'];
  const xPrimera = MARGEN + 150;
  const anchoColumna = (ANCHO - MARGEN - xPrimera) / columnas.length;

  function tabla(nombre: string, primera: string, filas: { rotulo: string; cuenta: Cuenta }[]) {
    if (filas.length === 0) return;
    titulo(nombre);
    const encabezado = () => {
      hoja.drawText(limpio(primera.toUpperCase()), { x: MARGEN, y, size: 7, font: negrita, color: GRIS });
      columnas.forEach((c, i) => {
        const t = limpio(c.toUpperCase());
        hoja.drawText(t, { x: xPrimera + (i + 1) * anchoColumna - negrita.widthOfTextAtSize(t, 6.5) - 2, y, size: 6.5, font: negrita, color: GRIS });
      });
      y -= 13;
    };
    encabezado();
    const renglon = (rotulo: string, c: Cuenta, fuerte: boolean) => {
      if (y - 14 < MARGEN + 10) {
        hojaNueva();
        encabezado();
      }
      const letra = fuerte ? negrita : fuente;
      hoja.drawText(recortar(rotulo, letra, 9, 145), { x: MARGEN, y, size: 9, font: letra, color: TINTA });
      const valores = [
        c.total, c.porEstado.pendiente, c.porEstado.canalizado, c.porEstado.instalado, c.porEstado.direccionado, c.porEstado.probado,
        c.bloqueados, `${porcentajes(c).probado}%`,
      ];
      valores.forEach((v, i) => {
        const t = String(v);
        const rojo = i === 6 && c.bloqueados > 0;
        hoja.drawText(t, { x: xPrimera + (i + 1) * anchoColumna - letra.widthOfTextAtSize(t, 9) - 2, y, size: 9, font: letra, color: rojo ? color(COLOR_BLOQUEADO) : TINTA });
      });
      y -= 4;
      hoja.drawLine({ start: { x: MARGEN, y }, end: { x: ANCHO - MARGEN, y }, thickness: 0.4, color: LINEA });
      y -= 11;
    };
    filas.forEach((f) => renglon(f.rotulo, f.cuenta, false));
    if (filas.length > 1) renglon('Total', filas.reduce((suma, f) => sumar(suma, f.cuenta), cuentaVacia()), true);
    y -= 6;
  }

  const todos = planos.flatMap((p) => p.plano.sembrado.equipos);
  const avanceJunto: AvancePlano = Object.assign({}, ...planos.map((p) => p.avance));
  tabla('Avance por nivel', 'Nivel (plano)', planos.map((p) => ({ rotulo: p.plano.nombre, cuenta: contar(p.plano.sembrado.equipos, p.avance) })));
  // Por lazo: se juntan los de todos los planos.
  const porLazo = new Map<string, { rotulo: string; cuenta: Cuenta }>();
  for (const p of planos) {
    for (const r of resumenPorLazo(p.plano.sembrado.equipos, p.avance, lazoDe)) {
      const previa = porLazo.get(r.id);
      porLazo.set(r.id, { rotulo: r.nombre, cuenta: previa ? sumar(previa.cuenta, r.cuenta) : r.cuenta });
    }
  }
  tabla('Avance por lazo', 'Lazo', [...porLazo.entries()].sort(([a, x], [b, z]) => (a === 'sin' ? 1 : b === 'sin' ? -1 : x.rotulo.localeCompare(z.rotulo, 'es', { numeric: true }))).map(([, f]) => f));
  // Por etapa de obra solo si se usan etapas.
  const porEtapa = resumenPorEtapa(todos, avanceJunto);
  if (porEtapa.some((r) => r.etapa !== null)) tabla('Avance por etapa de obra', 'Etapa', porEtapa.map((r) => ({ rotulo: nombreEtapa(r.etapa), cuenta: r.cuenta })));
  tabla('Avance por tipo de equipo', 'Equipo', resumenPorTipo(todos, avanceJunto).map((r) => ({ rotulo: r.nombre, cuenta: r.cuenta })));

  // ---------- Lo que falta ----------
  type Faltante = { rotulo: string; tipo: string; plano: string; etapa: string; estado: string; detalle: string; bloqueado: boolean; grupo: string };
  const faltantes: Faltante[] = [];
  for (const p of planos) {
    for (const e of equiposQueCuentan(p.plano.sembrado.equipos)) {
      const marca = p.avance[e.id];
      const estado = estadoDe(p.avance, e.id);
      if (estado === 'probado' && !marca?.bloqueo) continue;
      faltantes.push({
        rotulo: rotuloDe(e, p.etiquetas),
        tipo: tipoDispositivo(e.tipo).nombre,
        plano: p.plano.nombre,
        etapa: e.etapa ? `E${e.etapa}` : '-',
        estado: datosDeEstado(estado).corto,
        detalle: marca?.bloqueo ? [marca.bloqueo.motivo, marca.bloqueo.nota].filter(Boolean).join(': ') : '',
        bloqueado: Boolean(marca?.bloqueo),
        grupo: marca?.bloqueo ? `No se puede instalar - ${marca.bloqueo.motivo}` : `Falta terminar - ${datosDeEstado(estado).nombre}`,
      });
    }
  }
  // Primero lo bloqueado (es lo que hay que explicar), luego por estado.
  faltantes.sort((a, b) => Number(b.bloqueado) - Number(a.bloqueado) || a.grupo.localeCompare(b.grupo) || a.plano.localeCompare(b.plano) || a.rotulo.localeCompare(b.rotulo, 'es', { numeric: true }));

  titulo(`Detalle de lo que falta (${faltantes.length})`);
  if (faltantes.length === 0) {
    hoja.drawText('Todos los equipos están probados y funcionando.', { x: MARGEN, y, size: 10, font: fuente, color: TINTA });
    y -= 16;
  }
  const xs = { rotulo: MARGEN, tipo: MARGEN + 78, plano: MARGEN + 205, etapa: MARGEN + 300, estado: MARGEN + 328, detalle: MARGEN + 405 };
  let grupoActual = '';
  for (const f of faltantes) {
    if (f.grupo !== grupoActual) {
      espacio(40);
      grupoActual = f.grupo;
      const cuantos = faltantes.filter((x) => x.grupo === f.grupo).length;
      y -= 4;
      hoja.drawText(limpio(`${f.grupo} (${cuantos})`), { x: MARGEN, y, size: 9.5, font: negrita, color: f.bloqueado ? color(COLOR_BLOQUEADO) : TINTA });
      y -= 13;
      (['Dirección', 'Equipo', 'Plano', 'Et.', 'Estado', f.bloqueado ? 'Qué falta' : ''] as const).forEach((c, i) => {
        hoja.drawText(limpio(c.toUpperCase()), { x: Object.values(xs)[i], y, size: 6.5, font: negrita, color: GRIS });
      });
      y -= 11;
    }
    espacio(13);
    hoja.drawText(recortar(f.rotulo, negrita, 8.5, 74), { x: xs.rotulo, y, size: 8.5, font: negrita, color: TINTA });
    hoja.drawText(recortar(f.tipo, fuente, 8.5, 122), { x: xs.tipo, y, size: 8.5, font: fuente, color: TINTA });
    hoja.drawText(recortar(f.plano, fuente, 8.5, 90), { x: xs.plano, y, size: 8.5, font: fuente, color: TINTA });
    hoja.drawText(limpio(f.etapa), { x: xs.etapa, y, size: 8.5, font: fuente, color: TINTA });
    hoja.drawText(recortar(f.estado, fuente, 8.5, 74), { x: xs.estado, y, size: 8.5, font: fuente, color: TINTA });
    if (f.detalle) hoja.drawText(recortar(f.detalle, fuente, 8.5, ANCHO - MARGEN - xs.detalle), { x: xs.detalle, y, size: 8.5, font: fuente, color: TINTA });
    y -= 12;
  }
  // ---------- Evidencias (fotos en miniatura) ----------
  const conFoto: { ruta: string; rotulo: string; texto: string }[] = [];
  for (const p of planos) {
    for (const e of equiposQueCuentan(p.plano.sembrado.equipos)) {
      const marca = p.avance[e.id];
      const ruta = marca?.bloqueo?.foto || marca?.foto;
      if (!ruta || !fotos.has(ruta)) continue;
      const texto = marca?.bloqueo ? `No se puede: ${marca.bloqueo.motivo}` : datosDeEstado(estadoDe(p.avance, e.id)).corto;
      conFoto.push({ ruta, rotulo: `${rotuloDe(e, p.etiquetas)} · ${p.plano.nombre}`, texto });
    }
  }
  if (conFoto.length > 0) {
    const porRenglon = 4;
    const anchoFoto = (ANCHO - MARGEN * 2 - (porRenglon - 1) * 8) / porRenglon;
    const altoFoto = anchoFoto * 0.75;
    // El título no se queda solo al final de la hoja: va con el primer renglón de fotos.
    espacio(altoFoto + 70);
    titulo(`Evidencias fotográficas (${conFoto.length})`);
    for (let i = 0; i < conFoto.length; i += porRenglon) {
      espacio(altoFoto + 30);
      conFoto.slice(i, i + porRenglon).forEach((f, k) => {
        const x = MARGEN + k * (anchoFoto + 8);
        hoja.drawRectangle({ x, y: y - altoFoto, width: anchoFoto, height: altoFoto, borderColor: LINEA, borderWidth: 0.6 });
        const bytes = fotos.get(f.ruta)!;
        imagenes.push({ hoja, x, y: y - altoFoto, ancho: anchoFoto, alto: altoFoto, bytes });
        hoja.drawText(recortar(f.rotulo, negrita, 7.2, anchoFoto), { x, y: y - altoFoto - 9, size: 7.2, font: negrita, color: TINTA });
        hoja.drawText(recortar(f.texto, fuente, 7, anchoFoto), { x, y: y - altoFoto - 18, size: 7, font: fuente, color: GRIS });
      });
      y -= altoFoto + 28;
    }
  }

  // ---------- Firmas ----------
  espacio(110);
  titulo('Conformidad');
  const anchoFirma = (ANCHO - MARGEN * 2 - 30) / 2;
  (['Entrega (nombre y firma)', 'Recibe (nombre y firma)'] as const).forEach((rotulo, i) => {
    const x = MARGEN + i * (anchoFirma + 30);
    hoja.drawLine({ start: { x, y: y - 50 }, end: { x: x + anchoFirma, y: y - 50 }, thickness: 0.8, color: TINTA });
    hoja.drawText(limpio(rotulo), { x, y: y - 62, size: 8.5, font: fuente, color: GRIS });
  });
  hoja.drawText(limpio(`Fecha: ${fecha}`), { x: MARGEN, y: y - 82, size: 8.5, font: fuente, color: GRIS });
  y -= 92;
  pie(hoja);

  // Las fotos se ponen al final (embedJpg es asíncrono); si una no se entiende, queda el recuadro vacío.
  for (const im of imagenes) {
    try {
      const esPng = im.bytes[0] === 0x89 && im.bytes[1] === 0x50;
      const imagen = esPng ? await pdf.embedPng(im.bytes) : await pdf.embedJpg(im.bytes);
      const escala = Math.min(im.ancho / imagen.width, im.alto / imagen.height);
      const w = imagen.width * escala;
      const h = imagen.height * escala;
      im.hoja.drawImage(imagen, { x: im.x + (im.ancho - w) / 2, y: im.y + (im.alto - h) / 2, width: w, height: h });
    } catch (e) {
      console.error('Foto del reporte que no se pudo poner:', e);
    }
  }

  // ---------- Los planos, pintados por estado ----------
  for (const p of planos) {
    if (!p.pdfOriginal && !p.fondoPng) continue;
    const idsQueCuentan = new Set(equiposQueCuentan(p.plano.sembrado.equipos).map((e) => e.id));
    const bytes = await exportarPlanoPdf({
      plano: p.plano,
      pdfOriginal: p.pdfOriginal,
      fondoPng: p.fondoPng,
      cliente,
      etiquetas: p.etiquetas,
      soloPlano: true,
      // El panel no lleva estado de obra.
      colorFondo: (equipoId) => (idsQueCuentan.has(equipoId) ? colorDeAvance(p.avance[equipoId]) : null),
    });
    const origen = await PDFDocument.load(bytes);
    const [pagina] = await pdf.copyPages(origen, [0]);
    pdf.addPage(pagina);
    // Rótulo del plano en su esquina, proporcional al tamaño de la hoja.
    const tam = Math.max(10, Math.max(p.plano.ancho, p.plano.alto) / 90);
    const rotulo = limpio(`${p.plano.nombre} · Avance al ${fecha}`);
    pagina.drawRectangle({ x: tam, y: tam, width: negrita.widthOfTextAtSize(rotulo, tam) + tam, height: tam * 1.8, color: rgb(1, 1, 1), opacity: 0.85 });
    pagina.drawText(rotulo, { x: tam * 1.5, y: tam * 1.5, size: tam, font: negrita, color: TINTA });
  }

  return pdf.save();
}
