import { createClient } from '@/lib/supabaseClient';
import { coincideBusqueda } from '@/lib/busqueda';

// Modelos de equipo que ya se han instalado (patch_equipos_modelos.sql), para
// sugerirlos en «Montaje de equipo» del reporte. Se guarda una copia en el
// teléfono: en campo muchas veces no hay señal y las sugerencias deben salir
// igual.

export type ModeloEquipo = {
  modelo: string;
  marca: string | null;
  descripcion: string | null;
  imagen: string | null;
  enlace: string | null;
  veces: number;
};

const CLAVE_COPIA = 'modelosEquipoCache';
// shortcut: se bajan los 3,000 más usados; si el catálogo crece mucho más,
// buscar en el servidor en vez de bajarlo completo.
const MAXIMO = 3000;

function leerCopia(): ModeloEquipo[] {
  try {
    const texto = localStorage.getItem(CLAVE_COPIA);
    const lista = texto ? JSON.parse(texto) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    // Copia dañada o sin acceso a localStorage: se trabaja sin sugerencias guardadas.
    return [];
  }
}

function guardarCopia(lista: ModeloEquipo[]) {
  try {
    localStorage.setItem(CLAVE_COPIA, JSON.stringify(lista));
  } catch {
    // Sin espacio o en modo privado: las sugerencias siguen en memoria.
  }
}

// Primero responde con la copia del teléfono y, si hay red, avisa con la
// lista fresca. Si la tabla todavía no existe (falta el SQL) se queda con la copia.
export function cargarModelosEquipo(alTener: (lista: ModeloEquipo[]) => void) {
  const copia = leerCopia();
  if (copia.length > 0) alTener(copia);
  createClient()
    .from('equipos_modelos')
    .select('modelo, marca, descripcion, imagen, enlace, veces')
    .order('veces', { ascending: false })
    .limit(MAXIMO)
    .then(({ data, error }) => {
      if (error) {
        console.warn('[equipos] No se pudieron actualizar las sugerencias de modelos:', error.message);
        return;
      }
      const lista = (data || []) as ModeloEquipo[];
      guardarCopia(lista);
      alTener(lista);
    });
}

// Los que coinciden con lo escrito (en modelo, marca o descripción), los más
// usados primero.
export function buscarModelos(lista: ModeloEquipo[], texto: string, cuantos = 6): ModeloEquipo[] {
  const q = texto.trim();
  if (q.length < 2) return [];
  return lista.filter((m) => coincideBusqueda(`${m.modelo} ${m.marca || ''} ${m.descripcion || ''}`, q)).slice(0, cuantos);
}
