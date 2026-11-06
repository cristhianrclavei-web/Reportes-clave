'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { Simbolo } from '@/components/lazos/DiagramaLazo';
import { Elemento, Lazo, conteoPorNivel, conteoPorTipo, direccionVisible, hijosDe, lineaPrincipal, sinDireccion, tipoDispositivo } from '@/lib/lazos';

// Pestaña «Lista en orden»: arriba el resumen del lazo (cuántos hay y de qué
// tipo) y abajo los dispositivos en el orden del cable. Lo que cuelga de un
// dispositivo se pliega y despliega, con una guía que marca de quién cuelga.

function cuantosCuelgan(elementos: Elemento[], id: string): number {
  let total = 0;
  for (const hijo of hijosDe(elementos, id)) total += 1 + cuantosCuelgan(elementos, hijo.id);
  return total;
}

function ResumenLazo({ lazo, elementos }: { lazo: Lazo; elementos: Elemento[] }) {
  const enLinea = lineaPrincipal(elementos).length;
  const enRamas = elementos.length - enLinea;
  const tipos = conteoPorTipo(elementos);
  const faltan = sinDireccion(elementos);
  const porNivel = conteoPorNivel(elementos);
  let detectores = 0;
  let modulos = 0;
  for (const e of elementos) {
    if (e.direccion?.startsWith('D')) detectores++;
    if (e.direccion?.startsWith('M')) modulos++;
  }

  return (
    <section className="rounded-2xl bg-surface border border-line p-3.5 mb-3" aria-label="Resumen del lazo">
      <div className="flex items-center gap-4">
        <div className="shrink-0">
          <p className="font-display font-bold text-[34px] leading-none">{elementos.length}</p>
          <p className="text-[12px] text-muted mt-1">{elementos.length === 1 ? 'dispositivo' : 'dispositivos'}</p>
        </div>
        <dl className="flex-1 grid grid-cols-2 gap-1.5 text-[12px]">
          <div className="rounded-lg bg-surface-2 px-2 py-1.5">
            <dt className="text-faint">En la línea</dt>
            <dd className="font-semibold text-[14px]">{enLinea}</dd>
          </div>
          <div className="rounded-lg bg-surface-2 px-2 py-1.5">
            <dt className="text-faint">En ramas</dt>
            <dd className="font-semibold text-[14px]">{enRamas}</dd>
          </div>
          {lazo.tipo === 'deteccion' && (
            <>
              <div className="rounded-lg bg-surface-2 px-2 py-1.5">
                <dt className="text-faint">Direcciones D</dt>
                <dd className="font-semibold text-[14px]">{detectores}</dd>
              </div>
              <div className="rounded-lg bg-surface-2 px-2 py-1.5">
                <dt className="text-faint">Direcciones M</dt>
                <dd className="font-semibold text-[14px]">{modulos}</dd>
              </div>
            </>
          )}
        </dl>
      </div>

      {tipos.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 mt-3" aria-label="Dispositivos por tipo">
          {tipos.map(({ tipo, cuantos }) => (
            <li key={tipo} className="flex items-center gap-1.5 rounded-xl bg-surface-2 border border-line pl-1 pr-2.5 py-1">
              <span className="w-8 flex justify-center scale-[0.7] -my-1 text-ink"><Simbolo tipo={tipo} chico /></span>
              <span className="font-mono font-semibold text-[13px]">{cuantos}</span>
              <span className="text-[12px] text-muted">{tipoDispositivo(tipo).nombre}</span>
            </li>
          ))}
        </ul>
      )}

      {porNivel.length > 0 && (
        <div className="mt-3">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-faint mb-1.5">Por nivel</p>
          <ul className="flex flex-wrap gap-1.5" aria-label="Dispositivos por nivel">
            {porNivel.map(({ nivel, cuantos }) => (
              <li key={nivel} className="rounded-xl bg-surface-2 border border-line px-2.5 py-1 text-[12px]">
                <span className="font-mono font-semibold text-[13px]">{cuantos}</span> <span className="text-muted">{nivel}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {faltan.length > 0 && (
        <p className="flex items-start gap-1.5 text-[12.5px] text-amber mt-2.5">
          <AlertTriangle size={15} strokeWidth={2.4} className="shrink-0 mt-px" />
          {faltan.length === 1 ? `${faltan[0].nombre} no tiene dirección.` : `${faltan.length} dispositivos no tienen dirección.`}
        </p>
      )}
    </section>
  );
}

export default function ListaEnOrden({ lazo, elementos, onTocar }: {
  lazo: Lazo;
  elementos: Elemento[];
  onTocar: (elemento: Elemento) => void;
}) {
  // Ramas desplegadas. Empiezan plegadas para que la línea se lea de corrido.
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const principal = lineaPrincipal(elementos);
  const conRamas = elementos.filter((e) => hijosDe(elementos, e.id).length > 0);
  const todoAbierto = conRamas.length > 0 && conRamas.every((e) => abiertos.has(e.id));

  function alternar(id: string) {
    const nuevos = new Set(abiertos);
    if (nuevos.has(id)) nuevos.delete(id);
    else nuevos.add(id);
    setAbiertos(nuevos);
  }

  function alternarTodo() {
    if (todoAbierto) setAbiertos(new Set());
    else setAbiertos(new Set(conRamas.map((e) => e.id)));
  }

  function fila(e: Elemento, marca: string, numerado: boolean, plegable: boolean) {
    const direccion = direccionVisible(e.direccion, lazo.numero);
    const abierto = abiertos.has(e.id);
    const cuelgan = plegable ? cuantosCuelgan(elementos, e.id) : 0;
    return (
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onTocar(e)} className="flex-1 min-w-0 flex items-center gap-2.5 py-2 text-left hover:bg-surface-2/60 rounded-lg">
          <span className={`w-7 h-7 shrink-0 rounded-lg font-mono text-[11px] flex items-center justify-center ${numerado ? 'bg-surface-2 text-muted' : 'text-faint'}`}>
            {marca}
          </span>
          <span className="w-10 shrink-0 flex justify-center text-ink scale-[0.8]"><Simbolo tipo={e.tipo} chico /></span>
          <span className="flex-1 min-w-0">
            <span className="block font-mono text-[14px] truncate">{e.nombre}</span>
            {e.ubicacion && <span className="block text-[12px] text-muted truncate">{e.ubicacion}</span>}
          </span>
          {direccion && <span className="font-mono text-[12px] rounded-md bg-surface-2 px-1.5 py-0.5 shrink-0">{direccion}</span>}
        </button>
        {plegable && (
          <button type="button" onClick={() => alternar(e.id)} aria-expanded={abierto}
            aria-label={`${abierto ? 'Ocultar' : 'Mostrar'} ${cuelgan} que cuelgan de ${e.nombre}`}
            className={`shrink-0 min-w-[46px] h-9 rounded-full border text-[12px] font-semibold flex items-center justify-center gap-0.5 transition-colors ${abierto ? 'border-teal/60 bg-teal/10 text-teal' : 'border-line bg-surface-2 text-muted'}`}>
            {cuelgan}
            <ChevronDown size={15} strokeWidth={2.6} className={`transition-transform ${abierto ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
    );
  }

  // Renglones de un nivel. Dentro de una rama, lo que sigue en serie va al
  // mismo nivel (↓); varias cosas colgando del mismo dispositivo son ramas
  // aparte (↳) y van un nivel más adentro, plegables.
  function renglones(lista: Elemento[], nivel: number, enSerie: boolean): React.ReactNode[] {
    const resultado: React.ReactNode[] = [];
    lista.forEach((e, i) => {
      const hijos = hijosDe(elementos, e.id);
      const sigueEnSerie = nivel > 0 && hijos.length === 1;
      const plegable = hijos.length > 0 && !sigueEnSerie;
      let marca = enSerie ? '↓' : '↳';
      if (nivel === 0) marca = String(i + 1);
      resultado.push(
        <li key={e.id} className={nivel > 0 ? 'relative before:absolute before:-left-[11px] before:top-[26px] before:w-2.5 before:h-0.5 before:bg-line-strong' : ''}>
          {fila(e, marca, nivel === 0, plegable)}
          {plegable && abiertos.has(e.id) && (
            <ol className="ml-[13px] pl-2.5 border-l-2 border-line-strong mb-1">{renglones(hijos, nivel + 1, false)}</ol>
          )}
        </li>,
      );
      if (sigueEnSerie) resultado.push(...renglones(hijos, nivel, true));
    });
    return resultado;
  }

  return (
    <>
      <ResumenLazo lazo={lazo} elementos={elementos} />
      <div className="flex items-center gap-2 mb-1">
        <span className="font-mono text-[12px] border-[1.5px] border-teal text-teal rounded-md px-1.5 py-0.5">PCI</span>
        <span className="flex-1 min-w-0 text-[12.5px] text-muted truncate">{lazo.panel || 'Panel'} · salida del lazo</span>
        {conRamas.length > 0 && (
          <button type="button" onClick={alternarTodo} className="shrink-0 min-h-[34px] px-2.5 rounded-full text-[12.5px] font-semibold text-teal flex items-center gap-1 hover:bg-teal/10">
            {todoAbierto ? <ChevronsDownUp size={15} strokeWidth={2.4} /> : <ChevronsUpDown size={15} strokeWidth={2.4} />}
            {todoAbierto ? 'Plegar ramas' : 'Desplegar ramas'}
          </button>
        )}
      </div>
      {principal.length === 0
        ? <p className="text-[14px] text-muted py-6">Todavía no hay dispositivos. Toca «Agregar dispositivo» y captura en el orden en que corre el cable.</p>
        : <ol className="divide-y divide-line">{renglones(principal, 0, false)}</ol>}
    </>
  );
}
