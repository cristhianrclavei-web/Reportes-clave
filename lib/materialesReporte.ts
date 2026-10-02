// Materiales del reporte: tubería, cable, soportería y fijación. Un solo
// lugar para las opciones (tipos, medidas, unidades), para leer tanto el
// formato nuevo (listas con cantidad y unidad) como el de los reportes
// viejos, y para mostrarlos igual en PDF, Excel, vista previa y detalle.

export type FilaTuberia = { tipo: string; medida: string; cantidad: string; unidad: string; especifica?: string; articuloId?: string | null; articulo?: string | null };
export type FilaCable = { tipo: string; calibre: string; cantidad: string; unidad: string; articuloId?: string | null; articulo?: string | null };
export type FilaSoporteria = { desc: string; medida: string; cantidad: string; unidad: string; articuloId?: string | null; articulo?: string | null };

export const TIPOS_TUBERIA = ['Conduit pared delgada', 'Conduit pared gruesa', 'Roscada', 'Ajuste', 'Ranurada', 'PVC', 'Flexible (licuatite)', 'Otra'];
export const MEDIDAS_TUBERIA = ['1/2"', '3/4"', '1"', '1 1/4"', '1 1/2"', '2"', '2 1/2"', '3"', '4"'];
export const UNIDADES_TUBERIA = [
  { valor: 'm', label: 'metros' },
  { valor: 'tramo', label: 'tramos (3 m)' },
  { valor: 'pza', label: 'piezas' },
];

export const TIPOS_CABLE = [
  'UTP Cat 5e', 'UTP Cat 6', 'UTP Cat 6A', 'Coaxial RG59', 'Coaxial RG6', 'Siamés', 'Fibra óptica',
  'FPLR (incendio)', 'Alarma 2x22', 'Alarma 4x22', 'THW / THHN', 'Uso rudo', 'Otro',
];
export const UNIDADES_CABLE = [
  { valor: 'm', label: 'metros' },
  { valor: 'bobina', label: 'bobinas (305 m)' },
  { valor: 'rollo', label: 'rollos (100 m)' },
];

export const SUGERENCIAS_SOPORTERIA = [
  'Taquete', 'Pija', 'Ancla', 'Abrazadera tipo uña', 'Abrazadera omega', 'Unicanal', 'Varilla roscada',
  'Tuerca y rondana', 'Cople', 'Conector', 'Curva', 'Caja de registro', 'Condulet', 'Cincho', 'Grapa', 'Soporte / brazo',
];
export const UNIDADES_SOPORTERIA = [
  { valor: 'pza', label: 'piezas' },
  { valor: 'm', label: 'metros' },
  { valor: 'caja', label: 'cajas' },
  { valor: 'bolsa', label: 'bolsas' },
  { valor: 'juego', label: 'juegos' },
  { valor: 'tramo', label: 'tramos' },
];

const ETIQUETA_UNIDAD: Record<string, [string, string]> = {
  m: ['m', 'm'], tramo: ['tramo', 'tramos'], pza: ['pza', 'pzas'], bobina: ['bobina', 'bobinas'], rollo: ['rollo', 'rollos'],
  caja: ['caja', 'cajas'], bolsa: ['bolsa', 'bolsas'], juego: ['juego', 'juegos'],
};

export function cantidadTexto(cantidad: string | number | undefined, unidad: string | undefined): string {
  const n = String(cantidad ?? '').trim();
  if (!n) return '—';
  const [s, p] = ETIQUETA_UNIDAD[unidad || ''] || [unidad || '', unidad || ''];
  return `${n} ${Number(n) === 1 ? s : p}`.trim();
}

// Deja solo números y un punto decimal (también acepta coma y la convierte).
export function soloNumero(v: string): string {
  const limpio = v.replace(',', '.').replace(/[^\d.]/g, '');
  const [entero, ...resto] = limpio.split('.');
  return resto.length ? `${entero}.${resto.join('').slice(0, 2)}` : entero;
}

// ---------- Lectura (formato nuevo o de reportes viejos) ----------

export function tuberiasDe(data: any): FilaTuberia[] {
  if (Array.isArray(data?.tuberias)) return data.tuberias;
  // Formato viejo: { Roscada: { medida, metros, especifica } }
  const viejo = data?.tuberia && typeof data.tuberia === 'object' ? data.tuberia : {};
  return Object.entries(viejo).map(([tipo, v]: [string, any]) => ({
    tipo, medida: v?.medida || '', cantidad: String(v?.metros || ''), unidad: 'm', especifica: v?.especifica || '',
  }));
}

export function cablesDe(data: any): FilaCable[] {
  const lista: any[] = Array.isArray(data?.cables) && data.cables.length ? data.cables : [data?.cable1, data?.cable2].filter(Boolean);
  return lista.map((c) => ({
    tipo: c?.tipo || '', calibre: c?.calibre || '',
    cantidad: String(c?.cantidad ?? c?.metros ?? ''), unidad: c?.unidad || 'm',
    articuloId: c?.articuloId || null, articulo: c?.articulo || null,
  }));
}

export function soporteriaDe(data: any): FilaSoporteria[] {
  return Array.isArray(data?.soporteria) ? data.soporteria : [];
}

// Si el nombre del artículo del almacén ya trae la medida, no se repite.
const sinRepetir = (nombre: string | null | undefined, medida: string) =>
  medida && nombre && nombre.toLowerCase().includes(medida.toLowerCase()) ? '' : medida;

export function textoTuberia(t: FilaTuberia): string {
  const tipo = t.tipo === 'Otra' && t.especifica ? `Otra (${t.especifica})` : t.tipo;
  return [t.articulo || tipo, sinRepetir(t.articulo, t.medida), cantidadTexto(t.cantidad, t.unidad)].filter((x) => x && x !== '—').join(' · ');
}
export function textoCable(c: FilaCable): string {
  return [c.articulo || c.tipo, c.calibre && `cal. ${c.calibre}`, cantidadTexto(c.cantidad, c.unidad)].filter((x) => x && x !== '—').join(' · ');
}
export function textoSoporteria(s: FilaSoporteria): string {
  return [s.articulo || s.desc, sinRepetir(s.articulo, s.medida), cantidadTexto(s.cantidad, s.unidad)].filter((x) => x && x !== '—').join(' · ');
}

// Para clasificar artículos del almacén (p. ej. al traer lo del vale).
export function seccionDeArticulo(descripcion: string, categoria: string): 'tuberia' | 'cable' | 'soporteria' | 'equipo' {
  const d = descripcion.toLowerCase();
  if (categoria === 'equipo') return 'equipo';
  if (/tubo|tuber|conduit|licuatite|ducto/.test(d)) return 'tuberia';
  if (/cable|utp|coax|fibra|siam|fplr|thw|thhn|uso rudo/.test(d)) return 'cable';
  return 'soporteria';
}

// Del nombre del artículo del almacén saca tipo y medida de tubería
// («Tubo conduit pared delgada 3/4"» → Conduit pared delgada, 3/4").
export function inferirTuberia(descripcion: string): { tipo: string; medida: string } {
  const d = descripcion.toLowerCase();
  const tipo =
    /pared delgada/.test(d) ? 'Conduit pared delgada'
    : /pared gruesa/.test(d) ? 'Conduit pared gruesa'
    : /licuatite|flexible/.test(d) ? 'Flexible (licuatite)'
    : /pvc/.test(d) ? 'PVC'
    : /roscad/.test(d) ? 'Roscada'
    : /ranurad/.test(d) ? 'Ranurada'
    : /ajuste/.test(d) ? 'Ajuste'
    : '';
  const m = descripcion.match(/(\d+\s+\d\/\d|\d\/\d|\d+(?:\.\d+)?)\s*(?:"|''|pulg)/i);
  return { tipo, medida: m ? `${m[1].replace(/\s+/g, ' ')}"` : '' };
}
