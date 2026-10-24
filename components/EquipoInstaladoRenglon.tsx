'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, AlertTriangle, X, Search, ScanLine, ExternalLink, Package } from 'lucide-react';
import { coincideBusqueda } from '@/lib/busqueda';
import { soloNumero, UNIDADES_EQUIPO } from '@/lib/materialesReporte';
import { buscarModelos, ModeloEquipo } from '@/lib/sugerenciasEquipos';
import { descripcionCorta } from '@/lib/descripcionEquipo';
import { formaCanonica } from '@/lib/conceptosMateriales';
import SelectorProductoSyscom from '@/components/SelectorProductoSyscom';
import EscanerCodigo, { hayEscanerDeCodigos } from '@/components/EscanerCodigo';
import type { ProductoSyscom } from '@/lib/syscom';

// Renglón de «Montaje de equipo» en el reporte. La referencia es el MODELO:
// al escribirlo sugiere los modelos ya instalados antes y los del almacén;
// elegir uno llena marca, descripción y foto. Si no aparece, se busca en
// SYSCOM (a petición: cada búsqueda gasta cupo). Ligarlo al almacén
// (articuloId) evita la alerta «equipo instalado sin registro».

export type EquipoFila = {
  cant: string;
  // pza, m, rollo… (los reportes de antes no la traen: son piezas).
  unidad?: string;
  desc: string;
  modelo: string;
  marca: string;
  serie: string;
  articuloId?: string | null;
  // Foto y ficha de SYSCOM (solo el enlace; el archivo no se guarda).
  imagen?: string | null;
  enlace?: string | null;
  // La etiqueta no trae modelo o no se puede leer.
  sinModelo?: boolean;
};
export type ArticuloCatalogo = { id: string; descripcion: string; marca: string | null; modelo: string | null; unidad: string };

export function renglonEquipoVacio(eq: EquipoFila): boolean {
  return !eq.cant && !eq.desc && !eq.modelo && !eq.marca && !eq.serie;
}

// Un renglón con algo escrito necesita modelo, salvo que se marque que no tiene.
export function faltaModelo(eq: EquipoFila): boolean {
  return !renglonEquipoVacio(eq) && !eq.modelo.trim() && !eq.sinModelo;
}

// « · 3 equipos (DS-2CD1043, DS-7108)» para el aviso a supervisión.
export function textoEquiposAviso(equipos: EquipoFila[]): string {
  const conDatos = equipos.filter((e) => !renglonEquipoVacio(e));
  if (conDatos.length === 0) return '';
  // Solo se suman piezas: 100 m de alambre cuentan como un equipo.
  const total = conDatos.reduce((suma, e) => suma + (!e.unidad || e.unidad === 'pza' ? parseFloat(e.cant) || 1 : 1), 0);
  const modelos = [...new Set(conDatos.map((e) => e.modelo.trim()).filter(Boolean))];
  let texto = ` · ${total} ${total === 1 ? 'equipo' : 'equipos'}`;
  if (modelos.length > 0) {
    const primeros = modelos.slice(0, 3).join(', ');
    texto += modelos.length > 3 ? ` (${primeros}…)` : ` (${primeros})`;
  }
  return texto;
}

function coincideCatalogo(eq: EquipoFila, catalogo: ArticuloCatalogo[]): ArticuloCatalogo | null {
  // Misma regla que el trigger: por modelo o por descripción exacta.
  const mod = eq.modelo.trim().toLowerCase();
  const des = eq.desc.trim().toLowerCase();
  return (
    (mod && catalogo.find((a) => (a.modelo || '').trim().toLowerCase() === mod)) ||
    (des && catalogo.find((a) => a.descripcion.trim().toLowerCase() === des)) ||
    null
  );
}

export default function EquipoInstaladoRenglon({
  eq, catalogo, modelos, inputCls, onCambiar, onQuitar,
}: {
  eq: EquipoFila;
  catalogo: ArticuloCatalogo[] | null;
  modelos: ModeloEquipo[];
  inputCls: string;
  onCambiar: (nuevo: EquipoFila) => void;
  onQuitar?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [buscandoSyscom, setBuscandoSyscom] = useState(false);
  const [escaneando, setEscaneando] = useState(false);
  // Se revisa ya en el teléfono: en el servidor no existe el lector.
  const [conEscaner, setConEscaner] = useState(false);
  useEffect(() => setConEscaner(hayEscanerDeCodigos()), []);
  const vacio = renglonEquipoVacio(eq);
  const ligado = eq.articuloId ? catalogo?.find((a) => a.id === eq.articuloId) || null : null;
  const automatico = !eq.articuloId && catalogo ? coincideCatalogo(eq, catalogo) : null;

  const yaInstalados = useMemo(() => {
    if (eq.articuloId) return [];
    return buscarModelos(modelos, eq.modelo, 5);
  }, [modelos, eq.modelo, eq.articuloId]);

  const delAlmacen = useMemo(() => {
    const q = eq.modelo.trim();
    if (!catalogo || q.length < 2 || eq.articuloId) return [];
    return catalogo.filter((a) => coincideBusqueda(`${a.descripcion} ${a.marca || ''} ${a.modelo || ''}`, q)).slice(0, 4);
  }, [catalogo, eq.modelo, eq.articuloId]);

  const haySugerencias = yaInstalados.length > 0 || delAlmacen.length > 0;
  const marcasConocidas = useMemo(() => modelos.map((m) => m.marca || '').filter(Boolean), [modelos]);

  function cambiarModelo(valor: string) {
    // Otro modelo ya no es ese producto: se suelta el artículo y la foto.
    onCambiar({ ...eq, modelo: valor, articuloId: null, imagen: null, enlace: null, sinModelo: false });
    setAbierto(true);
  }

  function elegirInstalado(m: ModeloEquipo) {
    onCambiar({
      ...eq, modelo: m.modelo, marca: m.marca || eq.marca, desc: m.descripcion ? descripcionCorta(m.descripcion) : eq.desc,
      imagen: m.imagen, enlace: m.enlace, articuloId: null, sinModelo: false,
    });
    setAbierto(false);
  }

  function elegirAlmacen(a: ArticuloCatalogo) {
    onCambiar({ ...eq, desc: a.descripcion, marca: a.marca || eq.marca, modelo: a.modelo || eq.modelo, articuloId: a.id, sinModelo: false });
    setAbierto(false);
  }

  function elegirSyscom(p: ProductoSyscom) {
    onCambiar({
      ...eq, modelo: p.modelo || eq.modelo, marca: p.marca || eq.marca, desc: p.titulo ? descripcionCorta(p.titulo) : eq.desc,
      imagen: p.imagen, enlace: p.link, articuloId: null, sinModelo: false,
    });
    setBuscandoSyscom(false);
  }

  return (
    <div className="mb-3 pb-3 border-b border-line last:border-b-0">
      <div className="flex gap-2.5">
        {eq.imagen && (
          // Foto del catálogo de SYSCOM: dominio externo, thumbnail chico.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={eq.imagen} alt="" className="w-14 h-14 rounded-lg border border-line bg-white object-contain shrink-0" />
        )}
        {/* Celular: Modelo / Cant + Unidad + Marca / Descripción / Serie. Computadora: todo en un renglón. */}
        <div className="flex-1 min-w-0 grid grid-cols-4 sm:grid-cols-[64px_84px_1.3fr_1fr_1.6fr_1.2fr] gap-2">
          <input placeholder="Cant." inputMode="decimal" className={`${inputCls} text-center tabular-nums order-2 sm:order-none`} value={eq.cant} onChange={(e) => onCambiar({ ...eq, cant: soloNumero(e.target.value) })} />
          <select aria-label="Unidad" className={`${inputCls} !px-2 order-3 sm:order-none`} value={eq.unidad || 'pza'} onChange={(e) => onCambiar({ ...eq, unidad: e.target.value })}>
            {UNIDADES_EQUIPO.map((u) => <option key={u.valor} value={u.valor}>{u.label}</option>)}
          </select>
          <div className="relative col-span-4 sm:col-span-1 order-1 sm:order-none">
            <input
              placeholder={eq.sinModelo ? 'Sin modelo' : 'Modelo'}
              aria-label="Modelo"
              className={`${inputCls} w-full font-semibold ${faltaModelo(eq) ? 'border-red' : ''}`}
              value={eq.modelo}
              onChange={(e) => cambiarModelo(e.target.value)}
              onFocus={() => setAbierto(true)}
              onBlur={(e) => {
                setTimeout(() => setAbierto(false), 150);
                // «ds-2cd1043g2» escrito a mano se guarda como el modelo ya conocido.
                const canonico = formaCanonica(e.target.value, modelos.map((m) => m.modelo));
                if (canonico !== eq.modelo) onCambiar({ ...eq, modelo: canonico });
              }}
            />
            {abierto && haySugerencias && (
              <div className="absolute z-30 left-0 w-[min(320px,80vw)] mt-1 rounded-xl bg-surface border border-line-strong shadow-diffuse overflow-hidden max-h-[320px] overflow-y-auto">
                {yaInstalados.length > 0 && <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider text-muted">Ya instalados</p>}
                {yaInstalados.map((m) => (
                  <button
                    key={'m' + m.modelo}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => elegirInstalado(m)}
                    className="w-full text-left px-3 py-2 hover:bg-surface-2 border-t border-line flex items-center gap-2.5"
                  >
                    {m.imagen ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.imagen} alt="" className="w-9 h-9 rounded-md bg-white object-contain shrink-0" />
                    ) : (
                      <span className="w-9 h-9 rounded-md bg-surface-2 flex items-center justify-center shrink-0"><Package size={15} className="text-faint" /></span>
                    )}
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-semibold truncate">{m.modelo}</span>
                      <span className="block text-[11.5px] text-muted truncate">{[m.marca, m.descripcion].filter(Boolean).join(' · ')}</span>
                    </span>
                  </button>
                ))}
                {delAlmacen.length > 0 && <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider text-muted border-t border-line">Del almacén</p>}
                {delAlmacen.map((a) => (
                  <button
                    key={'a' + a.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => elegirAlmacen(a)}
                    className="w-full text-left px-3 py-2 hover:bg-surface-2 border-t border-line"
                  >
                    <span className="block text-[13.5px] font-semibold truncate">{a.modelo || a.descripcion}</span>
                    <span className="block text-[11.5px] text-muted truncate">{[a.marca, a.modelo ? a.descripcion : a.unidad].filter(Boolean).join(' · ')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            placeholder="Marca"
            className={`${inputCls} col-span-2 sm:col-span-1 order-4 sm:order-none`}
            value={eq.marca}
            onChange={(e) => onCambiar({ ...eq, marca: e.target.value })}
            onBlur={(e) => {
              const canonica = formaCanonica(e.target.value, marcasConocidas);
              if (canonica !== eq.marca) onCambiar({ ...eq, marca: canonica });
            }}
          />
          <input
            placeholder="Descripción"
            className={`${inputCls} col-span-4 sm:col-span-1 order-5 sm:order-none`}
            value={eq.desc}
            onChange={(e) => onCambiar({ ...eq, desc: e.target.value, articuloId: null })}
          />
          <div className="relative col-span-4 sm:col-span-1 order-6 sm:order-none">
            <input placeholder="No. Serie" className={`${inputCls} w-full ${conEscaner ? 'pr-11' : ''}`} value={eq.serie} onChange={(e) => onCambiar({ ...eq, serie: e.target.value })} />
            {conEscaner && (
              <button
                type="button"
                onClick={() => setEscaneando(true)}
                aria-label="Escanear número de serie"
                title="Escanear número de serie"
                className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-teal active:scale-90 transition-transform"
              >
                <ScanLine size={18} strokeWidth={2.3} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-1.5">
        <button
          type="button"
          onClick={() => setBuscandoSyscom(true)}
          className="text-[12px] font-semibold text-teal flex items-center gap-1 disabled:opacity-40"
        >
          <Search size={12} strokeWidth={2.6} /> Buscar en SYSCOM
        </button>
        {eq.enlace && (
          <a href={eq.enlace} target="_blank" rel="noopener noreferrer" className="text-[12px] text-muted flex items-center gap-1">
            <ExternalLink size={12} strokeWidth={2.4} /> Ficha
          </a>
        )}
        {!eq.modelo.trim() && !vacio && (
          <label className="text-[12px] text-muted flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-teal" checked={Boolean(eq.sinModelo)} onChange={(e) => onCambiar({ ...eq, sinModelo: e.target.checked })} />
            No tiene modelo visible
          </label>
        )}
        {onQuitar && (
          <button type="button" onClick={onQuitar} aria-label="Quitar renglón" className="ml-auto text-muted shrink-0 p-1"><X size={14} /></button>
        )}
      </div>

      {faltaModelo(eq) && <p className="text-[11.5px] text-red mt-1">Falta el modelo. Si la etiqueta no lo trae, marca «No tiene modelo visible».</p>}

      {!vacio && catalogo && (
        <p className="mt-1">
          {ligado || automatico ? (
            <span className="text-[11.5px] text-teal font-medium flex items-center gap-1 min-w-0">
              <Check size={12} strokeWidth={2.8} className="shrink-0" />
              <span className="truncate">En almacén: {(ligado || automatico)!.descripcion}</span>
            </span>
          ) : (
            <span className="text-[11.5px] text-amber font-medium flex items-center gap-1">
              <AlertTriangle size={12} strokeWidth={2.6} className="shrink-0" />
              No está en el almacén: elige de la lista o se avisará al almacenista
            </span>
          )}
        </p>
      )}

      {buscandoSyscom && (
        <SelectorProductoSyscom
          busquedaInicial={eq.modelo || eq.desc}
          conPrecio={false}
          soloAlBuscar
          onSeleccionar={elegirSyscom}
          onClose={() => setBuscandoSyscom(false)}
        />
      )}
      {escaneando && (
        <EscanerCodigo
          onLeer={(texto) => { onCambiar({ ...eq, serie: texto }); setEscaneando(false); }}
          onClose={() => setEscaneando(false)}
        />
      )}
    </div>
  );
}
