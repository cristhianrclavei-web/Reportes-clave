import { createClient } from '@/lib/supabaseClient';

// Sugerencias de tubería, cable y soportería que el personal ya escribió en
// otros reportes (patch_conceptos_materiales.sql), juntas con las de siempre.
// Un concepto es el mismo aunque cambien mayúsculas, acentos o espacios:
// así «taquete» no se vuelve un concepto distinto de «Taquete».

export type CampoConcepto =
  | 'tuberia_medida' | 'tuberia_especifica'
  | 'cable_tipo' | 'cable_calibre'
  | 'soporteria_desc' | 'soporteria_medida';

export type ConceptosAprendidos = Partial<Record<CampoConcepto, string[]>>;

const CLAVE_COPIA = 'conceptosMaterialesCache';

// Igual que public.normalizar_concepto() en la base.
export function normalizarConcepto(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

// Primero las de siempre y después las aprendidas, sin repetir variantes.
export function unirSugerencias(deSiempre: string[], aprendidas: string[] = []): string[] {
  const vistas = new Set<string>();
  const lista: string[] = [];
  for (const texto of [...deSiempre, ...aprendidas]) {
    const clave = normalizarConcepto(texto);
    if (!clave || vistas.has(clave)) continue;
    vistas.add(clave);
    lista.push(texto);
  }
  return lista;
}

// Si lo escrito es una variante de una sugerencia («UNICANAL» → «Unicanal»),
// se usa la forma de la sugerencia; si no, el texto tal cual (sin espacios de más).
export function formaCanonica(texto: string, sugerencias: string[]): string {
  const clave = normalizarConcepto(texto);
  const igual = sugerencias.find((s) => normalizarConcepto(s) === clave);
  if (igual) return igual;
  return texto.replace(/\s+/g, ' ').trim();
}

function leerCopia(): ConceptosAprendidos {
  try {
    const texto = localStorage.getItem(CLAVE_COPIA);
    return texto ? JSON.parse(texto) : {};
  } catch {
    // Copia dañada o sin acceso a localStorage: solo salen las de siempre.
    return {};
  }
}

// Responde primero con la copia del teléfono (sirve sin señal) y luego con
// la lista fresca. Si la tabla todavía no existe (falta el SQL), se queda con la copia.
export function cargarConceptosMateriales(alTener: (c: ConceptosAprendidos) => void) {
  const copia = leerCopia();
  if (Object.keys(copia).length > 0) alTener(copia);
  createClient()
    .from('conceptos_materiales')
    .select('campo, texto')
    .order('veces', { ascending: false })
    .limit(3000)
    .then(({ data, error }) => {
      if (error) {
        console.warn('[materiales] No se pudieron actualizar las sugerencias:', error.message);
        return;
      }
      const agrupados: ConceptosAprendidos = {};
      for (const fila of (data || []) as { campo: CampoConcepto; texto: string }[]) {
        (agrupados[fila.campo] ||= []).push(fila.texto);
      }
      try {
        localStorage.setItem(CLAVE_COPIA, JSON.stringify(agrupados));
      } catch {
        // Sin espacio o modo privado: las sugerencias siguen en memoria.
      }
      alTener(agrupados);
    });
}
