// HTML de lo que se dibuja sobre el mapa de técnicos en campo (estilos en
// globals.css: .pin-tec, .marca-hora, .parada-num). Lo usan los dos mapas.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FiguraAvatar, colorUniforme } from '@/components/AvatarTecnico';
import { urlFoto, type PerfilPublico } from '@/lib/perfiles';
import { TEXTO_REPORTE, type ParadaCampo } from '@/lib/campo';
import { textoDuracion } from '@/lib/visitas';

export function sinEtiquetas(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Mexico_City' });
}

// Cara del técnico: su foto si la subió y, debajo, su figura de avatar.
function htmlCara(nombre: string, perfil: PerfilPublico | undefined): string {
  const figura = renderToStaticMarkup(createElement(FiguraAvatar, {
    uniforme: colorUniforme(perfil?.avatar_color, nombre),
    figura: perfil?.avatar_estilo ?? 0,
    size: 40,
  }));
  const foto = urlFoto(perfil?.foto_path);
  return foto ? `${figura}<img src="${sinEtiquetas(foto)}" alt="" loading="lazy">` : figura;
}

// Pin del técnico: su foto con un aro del color de su estado. `atenuado`:
// hay otro elegido. `gris`: última ubicación conocida (no es de hoy).
export function htmlPin(opciones: { nombre: string; perfil?: PerfilPublico; color: string; etiqueta: string; elegido: boolean; atenuado: boolean; enLinea: boolean; gris?: boolean }): string {
  const clases = ['pin-tec'];
  if (opciones.elegido) clases.push('elegido');
  if (opciones.atenuado) clases.push('atenuado');
  if (opciones.gris) clases.push('apagado');
  const halo = opciones.enLinea ? '<span class="pin-tec-halo"></span>' : '';
  return `<div class="${clases.join(' ')}" style="--color-pin:${opciones.color};--color-ruta:${opciones.color}">${halo}`
    + `<div class="pin-tec-cara">${htmlCara(opciones.nombre, opciones.perfil)}</div>`
    + `<div class="pin-tec-nombre">${sinEtiquetas(opciones.etiqueta)}</div></div>`;
}

const COLOR_REPORTE = { entregado: '#16a34a', pendiente: '#f59e0b', sin_reporte: '#dc2626' };

// Una marca del día: «I» inicio, número de parada o «F» fin.
export type MarcaDelDia =
  | { tipo: 'inicio' | 'fin'; lat: number; lng: number; hora: string; nombre: string }
  | { tipo: 'parada'; lat: number; lng: number; parada: ParadaCampo };

function etiquetaDe(m: MarcaDelDia): string {
  if (m.tipo !== 'parada') return m.tipo === 'inicio' ? 'I' : 'F';
  return String(m.parada.numero);
}

function colorDe(m: MarcaDelDia): string {
  if (m.tipo !== 'parada') return m.tipo === 'inicio' ? '#16a34a' : '#0f172a';
  return m.parada.reporte ? COLOR_REPORTE[m.parada.reporte] : '#64748b';
}

function detalleDe(m: MarcaDelDia): string {
  if (m.tipo !== 'parada') {
    return `<b>${m.tipo === 'inicio' ? 'Inicio' : 'Fin'} · ${sinEtiquetas(hora(m.hora))}</b><small>${sinEtiquetas(m.nombre)}</small>`;
  }
  const p = m.parada;
  const partes = [
    `<b>${p.numero} · ${sinEtiquetas(hora(p.desde))} – ${sinEtiquetas(hora(p.hasta))}</b>`,
    `<small>${sinEtiquetas(p.lugar || 'Lugar sin identificar')}${p.propio ? ' (lugar propio)' : ''}</small>`,
  ];
  if (p.servicio) partes.push(`<small>Servicio: ${sinEtiquetas(p.servicio.proyecto)}</small>`);
  partes.push(`<em>${sinEtiquetas(textoDuracion(p.minutos))} en sitio${p.enCurso ? ' (sigue ahí)' : ''}</em>`);
  if (p.reporte) partes.push(`<i style="color:${COLOR_REPORTE[p.reporte]}">Reporte: ${TEXTO_REPORTE[p.reporte]}</i>`);
  return partes.join('');
}

// Un grupo de marcas que en pantalla quedarían encimadas: un solo círculo
// («2·3», «I·F») con el detalle de todas. Al acercar el mapa se separan.
export function htmlGrupo(marcas: MarcaDelDia[]): string {
  const varias = marcas.length > 1;
  const color = varias ? '#334155' : colorDe(marcas[0]);
  const texto = marcas.map(etiquetaDe).join('·');
  const detalle = marcas.map((m) => `<div class="parada-detalle-uno">${detalleDe(m)}</div>`).join('');
  const relleno = !varias && (marcas[0].tipo === 'inicio' || marcas[0].tipo === 'fin') ? ' relleno' : '';
  return `<div class="marca-hora parada" style="--color-ruta:${color}" role="button" aria-label="${sinEtiquetas(texto)}">`
    + `<div class="marca-hora-detalle"><button type="button" class="marca-hora-cerrar" aria-label="Cerrar">×</button>${detalle}</div>`
    + `<div class="parada-num${varias ? ' grupo' : ''}${relleno}">${sinEtiquetas(texto)}</div></div>`;
}

// Lugar de la empresa (oficina, almacén) o servicio pendiente.
export function htmlLugar(nombre: string, tipo: 'propio' | 'pendiente', detalle = ''): string {
  const simbolo = tipo === 'propio' ? '⌂' : '○';
  return `<div class="marca-hora parada lugar-${tipo}" role="button" aria-label="${sinEtiquetas(nombre)}">`
    + `<div class="marca-hora-detalle"><button type="button" class="marca-hora-cerrar" aria-label="Cerrar">×</button><b>${sinEtiquetas(nombre)}</b>${detalle ? `<small>${sinEtiquetas(detalle)}</small>` : ''}</div>`
    + `<div class="lugar-marca">${simbolo}</div></div>`;
}

// Visitas a un cliente (buscador, modo historial): un pin con la lista.
export function htmlVisitas(cliente: string, filas: { fecha: string; texto: string; enlaces: { texto: string; href: string }[] }[]): string {
  const lista = filas.slice(0, 12).map((f) => `<div class="parada-detalle-uno"><b>${sinEtiquetas(f.fecha)}</b><small>${sinEtiquetas(f.texto)}</small>`
    + f.enlaces.map((e) => `<a href="${sinEtiquetas(e.href)}" target="_blank" rel="noopener">${sinEtiquetas(e.texto)}</a>`).join(' ')
    + '</div>').join('');
  const mas = filas.length > 12 ? `<small>y ${filas.length - 12} más (en la lista)</small>` : '';
  return `<div class="marca-hora parada" style="--color-ruta:#3b82f6" role="button" aria-label="${sinEtiquetas(cliente)}">`
    + `<div class="marca-hora-detalle"><button type="button" class="marca-hora-cerrar" aria-label="Cerrar">×</button><b>${sinEtiquetas(cliente)}</b>${lista}${mas}</div>`
    + `<div class="parada-num grupo">${filas.length}</div></div>`;
}
