'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Receipt, Search } from 'lucide-react';
import { createClient } from '@/lib/supabaseClient';
import { normalizar } from '@/lib/clientesCatalogo';
import type { ProductoSyscom } from '@/lib/syscom';

// «Marca y modelo» de un equipo del plano con sugerencias: primero lo que ya
// está cotizado en el proyecto del plano y, si nada coincide, SYSCOM (con el
// mismo cupo automático que las cotizaciones). Se guarda al elegir o al salir.

type Opcion = { texto: string; detalle: string; fuente: 'proyecto' | 'syscom'; imagen?: string | null };

const CAMPO = 'w-full px-3 min-h-[42px] rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[14px]';

// Renglones de las cotizaciones del proyecto con modelo o descripción.
async function cotizadoEnProyecto(proyectoId: string): Promise<Opcion[]> {
  const { data, error } = await createClient()
    .from('cotizacion_lineas')
    .select('descripcion, modelo, marca, cotizaciones!inner(proyecto_id, folio)')
    .eq('cotizaciones.proyecto_id', proyectoId)
    .limit(300);
  if (error) throw new Error('No se pudo leer lo cotizado del proyecto.');
  const vistos = new Set<string>();
  const lista: Opcion[] = [];
  for (const l of (data || []) as any[]) {
    const texto = [l.marca, l.modelo].filter(Boolean).join(' ').trim() || (l.descripcion || '').trim();
    if (!texto || vistos.has(normalizar(texto))) continue;
    vistos.add(normalizar(texto));
    const cot = Array.isArray(l.cotizaciones) ? l.cotizaciones[0] : l.cotizaciones;
    lista.push({ texto: texto.slice(0, 60), detalle: `${cot?.folio || 'Cotización'} · ${(l.descripcion || '').slice(0, 70)}`, fuente: 'proyecto' });
  }
  return lista;
}

export default function ModeloSugerido({ valor, proyectoId, tipoNombre, onGuardar }: {
  valor: string;
  proyectoId: string | null;
  // Nombre del tipo de equipo («Cámara bala»): ayuda a buscar en SYSCOM.
  tipoNombre: string;
  onGuardar: (v: string) => void;
}) {
  const [texto, setTexto] = useState(valor);
  useEffect(() => setTexto(valor), [valor]);
  const [abierto, setAbierto] = useState(false);
  const [delProyecto, setDelProyecto] = useState<Opcion[]>([]);
  const [deSyscom, setDeSyscom] = useState<Opcion[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const guardado = useRef(valor);

  useEffect(() => {
    if (!proyectoId) return;
    let vigente = true;
    cotizadoEnProyecto(proyectoId).then((l) => { if (vigente) setDelProyecto(l); }).catch(() => {});
    return () => { vigente = false; };
  }, [proyectoId]);

  const q = normalizar(texto);
  const coinciden = useMemo(
    () => delProyecto.filter((o) => !q || normalizar(`${o.texto} ${o.detalle}`).includes(q)).slice(0, 8),
    [delProyecto, q],
  );

  // SYSCOM solo si lo del proyecto no alcanza y ya se escribió algo.
  useEffect(() => {
    setDeSyscom([]);
    setAviso(null);
    if (!abierto || coinciden.length > 0 || texto.trim().length < 4 || texto === guardado.current) return;
    const espera = setTimeout(async () => {
      setBuscando(true);
      try {
        const respuesta = await fetch(`/api/syscom/productos?q=${encodeURIComponent(texto.trim())}&auto=1`);
        const datos = await respuesta.json().catch(() => null);
        if (!respuesta.ok) { setAviso(datos?.error || 'No se pudo buscar en SYSCOM.'); return; }
        if (datos?.pausado) { setAviso('Búsqueda en SYSCOM en pausa por el cupo del mes; escribe el modelo a mano.'); return; }
        setDeSyscom(((datos?.productos || []) as ProductoSyscom[]).slice(0, 6).map((p) => ({
          texto: [p.marca, p.modelo].filter(Boolean).join(' ').trim() || p.titulo.slice(0, 60),
          detalle: p.titulo.slice(0, 90),
          fuente: 'syscom',
          imagen: p.imagen,
        })));
      } catch {
        setAviso('Sin conexión: escribe el modelo a mano.');
      } finally {
        setBuscando(false);
      }
    }, 700);
    return () => clearTimeout(espera);
  }, [abierto, coinciden.length, texto, tipoNombre]);

  function guardar(v: string) {
    const limpio = v.trim().slice(0, 60);
    guardado.current = limpio;
    setTexto(limpio);
    setAbierto(false);
    if (limpio !== valor) onGuardar(limpio);
  }

  const opciones = coinciden.length > 0 ? coinciden : deSyscom;

  return (
    <div className="relative">
      <span className="block text-[12px] text-muted mb-1">Marca y modelo</span>
      <input className={CAMPO} value={texto} maxLength={60} placeholder={proyectoId ? 'Escribe o elige lo cotizado' : 'Escribe para buscar en SYSCOM'}
        role="combobox" aria-expanded={abierto} aria-autocomplete="list"
        onFocus={() => setAbierto(true)}
        onChange={(e) => { setTexto(e.target.value); setAbierto(true); }}
        onBlur={() => setTimeout(() => { if (guardado.current !== texto) guardar(texto); else setAbierto(false); }, 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); guardar(opciones.length === 1 ? opciones[0].texto : texto); }
          if (e.key === 'Escape') setAbierto(false);
        }} />
      {abierto && (opciones.length > 0 || buscando || aviso) && (
        <div role="listbox" className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-line bg-surface shadow-xl max-h-[260px] overflow-y-auto">
          {coinciden.length > 0 && <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint flex items-center gap-1"><Receipt size={12} /> Cotizado en este proyecto</p>}
          {coinciden.length === 0 && deSyscom.length > 0 && <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint flex items-center gap-1"><Search size={12} /> SYSCOM</p>}
          {opciones.map((o) => (
            <button key={`${o.fuente}-${o.texto}`} type="button" role="option" aria-selected={false}
              onMouseDown={(e) => e.preventDefault()} onClick={() => guardar(o.texto)}
              className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-surface-2">
              {o.imagen && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.imagen} alt="" className="w-9 h-9 rounded-lg object-contain bg-white shrink-0" />
              )}
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold truncate">{o.texto}</span>
                <span className="block text-[11.5px] text-muted truncate">{o.detalle}</span>
              </span>
            </button>
          ))}
          {buscando && <p className="px-3 py-2 text-[12.5px] text-muted flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Buscando en SYSCOM…</p>}
          {aviso && <p className="px-3 py-2 text-[12.5px] text-amber">{aviso}</p>}
        </div>
      )}
    </div>
  );
}
