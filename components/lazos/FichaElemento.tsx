'use client';

import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowUpToLine, CornerDownRight, Pencil, Trash2, X } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { Simbolo } from '@/components/lazos/DiagramaLazo';
import { confirmar } from '@/lib/dialogos';
import { Cambio, Elemento, Falla, Lazo, describirCambio, direccionVisible, hijosDe, lineaPrincipal, posiciones, tipoDispositivo } from '@/lib/lazos';
import { urlFotoElemento } from '@/lib/lazosDatos';
import VerFoto from '@/components/lazos/VerFoto';

// Ficha de un dispositivo: dónde está, de cuál viene y a cuál sigue, su foto
// y las fallas que se encontraron en él. Desde aquí se corrige, se inserta
// otro antes o después, se cuelga otro de él o se borra.

function fecha(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function FichaElemento({ lazo, elementos, elemento, fallas, cambios, avisoHistorial, onEditar, onInsertarAntes, onInsertarDespues, onColgar, onBorrar, onCerrar }: {
  lazo: Lazo;
  elementos: Elemento[];
  elemento: Elemento;
  fallas: Falla[];
  // Historial del lazo; aquí se muestra lo de este dispositivo.
  cambios: Cambio[];
  avisoHistorial: string | null;
  onEditar: () => void;
  onInsertarAntes: () => void;
  onInsertarDespues: () => void;
  onColgar: () => void;
  onBorrar: () => void;
  onCerrar: () => void;
}) {
  const [urlFoto, setUrlFoto] = useState<string | null>(null);
  const [fotoCargando, setFotoCargando] = useState(false);

  useEffect(() => {
    if (!elemento.foto_path) return;
    setFotoCargando(true);
    urlFotoElemento(elemento.foto_path).then(setUrlFoto).finally(() => setFotoCargando(false));
  }, [elemento.foto_path]);

  const info = tipoDispositivo(elemento.tipo);
  const total = lineaPrincipal(elementos).length;
  const posicion = posiciones(elementos).get(elemento.id);
  const hermanos = elemento.padre_id ? hijosDe(elementos, elemento.padre_id) : lineaPrincipal(elementos);
  const i = hermanos.findIndex((h) => h.id === elemento.id);
  const padre = elemento.padre_id ? elementos.find((e) => e.id === elemento.padre_id) : null;
  const cuelgan = hijosDe(elementos, elemento.id);
  // En una rama se viene del que cuelga y se sigue a lo que cuelga de él.
  let vieneDe: string;
  let sigueA: string;
  if (padre) {
    vieneDe = padre.nombre;
    sigueA = cuelgan.length === 0 ? 'Fin de la rama' : cuelgan.length === 1 ? cuelgan[0].nombre : `${cuelgan.length} ramas`;
  } else {
    vieneDe = i > 0 ? hermanos[i - 1].nombre : 'Panel (PCI)';
    sigueA = hermanos[i + 1]?.nombre || 'Fin de la línea';
  }
  const fallasAqui = fallas.filter((f) => f.elemento_id === elemento.id);
  const cambiosAqui = cambios.filter((c) => c.elemento_id === elemento.id && c.tabla !== 'lazo_fallas');
  const nombreDe = (id: string | null) => elementos.find((e) => e.id === id)?.nombre || null;

  async function borrar() {
    // En una rama, lo que seguía se recorre; en la línea principal, sus ramas se van con él.
    let extra = '';
    if (cuelgan.length > 0 && padre) extra = ' Lo que sigue en la rama queda colgando del anterior.';
    if (cuelgan.length > 0 && !padre) extra = ` También se borran sus ramas (${cuelgan.length}).`;
    const ok = await confirmar(`¿Borrar ${elemento.nombre}?`, {
      detalle: `Se quita del lazo y del diagrama.${extra}`,
      textoAceptar: 'Borrar',
      tono: 'peligro',
    });
    if (ok) onBorrar();
  }

  const accion = 'min-h-[46px] rounded-xl border border-line bg-surface-2 text-[13.5px] font-medium flex items-center justify-center gap-1.5 px-2';

  return (
    <ModalOverlay onClose={onCerrar}>
      <div className="glass-strong rounded-3xl max-w-md w-full p-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-3">
          <span className="text-teal"><Simbolo tipo={elemento.tipo} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-mono text-[19px] truncate">{elemento.nombre}</h2>
            <p className="text-[13px] text-muted">{info.nombre}</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="w-10 h-10 rounded-full flex items-center justify-center text-muted hover:bg-surface-2">
            <X size={20} strokeWidth={2.4} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <div className="rounded-2xl bg-surface border border-line p-3">
            <span className="block text-[12px] text-faint">Dirección</span>
            <span className="font-mono text-[19px]">{direccionVisible(elemento.direccion, lazo.numero) || '—'}</span>
          </div>
          <div className="rounded-2xl bg-surface border border-line p-3">
            <span className="block text-[12px] text-faint">Posición en el lazo</span>
            <span className="font-mono text-[19px]">{posicion ? `${posicion} de ${total}` : '—'}</span>
          </div>
        </div>

        <dl className="rounded-2xl bg-surface border border-line px-3 mt-2 text-[14px]">
          {/* Con la ubicación por partes se ve cada una; los capturados antes
              solo tienen el texto junto. */}
          {elemento.area || elemento.nivel || elemento.referencia ? (
            <>
              {[['Área', elemento.area], ['Nivel', elemento.nivel], ['Referencia', elemento.referencia]].map(([titulo, valor]) => valor && (
                <div key={titulo} className="flex justify-between gap-3 py-2.5 border-b border-line">
                  <dt className="text-muted">{titulo}</dt><dd className="text-right font-medium">{valor}</dd>
                </div>
              ))}
            </>
          ) : (
            <div className="flex justify-between gap-3 py-2.5 border-b border-line">
              <dt className="text-muted">Ubicación</dt><dd className="text-right">{elemento.ubicacion || '—'}</dd>
            </div>
          )}
          {padre && (
            <div className="flex justify-between gap-3 py-2.5 border-b border-line">
              <dt className="text-muted">Cuelga de</dt><dd className="font-mono text-[13px]">{padre.nombre}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3 py-2.5 border-b border-line">
            <dt className="text-muted">Viene de</dt><dd className="font-mono text-[13px] text-right">{vieneDe}</dd>
          </div>
          <div className="flex justify-between gap-3 py-2.5">
            <dt className="text-muted">Sigue a</dt><dd className="font-mono text-[13px] text-right">{sigueA}</dd>
          </div>
        </dl>

        {elemento.foto_path && (
          <div className="mt-2 rounded-2xl overflow-hidden border border-line bg-surface min-h-[120px] flex items-center justify-center">
            {urlFoto
              ? <img src={urlFoto} alt={`Foto de ${elemento.nombre}`} className="w-full max-h-[260px] object-cover" />
              : <span className="text-[13px] text-muted p-4">{fotoCargando ? 'Cargando foto…' : 'No se pudo cargar la foto (¿sin señal?).'}</span>}
          </div>
        )}

        <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted mt-4 mb-2">Historial</h3>
        <ul className="flex flex-col gap-2 text-[13px]">
          {fallasAqui.map((f) => (
            <li key={f.id} className="flex gap-2.5">
              <span className="w-2 h-2 rounded-full bg-amber mt-1.5 shrink-0" />
              <span>
                <b className="font-semibold">{fecha(f.resuelta_en)} · Falla a tierra aquí</b>{f.causa ? ` · ${f.causa}` : ''}
                {f.foto_path && <VerFoto path={f.foto_path} />}
              </span>
            </li>
          ))}
          {cambiosAqui.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${c.accion === 'alta' ? 'bg-teal' : c.tabla === 'lazo_cortes' ? 'bg-amber' : 'bg-muted'}`} />
              <span>
                {describirCambio(c, lazo.numero, nombreDe)}
                <span className="block text-[12px] text-faint">{c.usuario_nombre || 'Alguien'} · {fechaHora(c.creado_en)}</span>
              </span>
            </li>
          ))}
          {cambiosAqui.length === 0 && (
            <li className="flex gap-2.5">
              <span className="w-2 h-2 rounded-full bg-teal mt-1.5 shrink-0" />
              <span><b className="font-semibold">{elemento.creado_en ? fecha(elemento.creado_en) : 'Sin subir todavía'}</b> · capturado</span>
            </li>
          )}
        </ul>
        {avisoHistorial && <p className="text-[12px] text-faint mt-1.5">{avisoHistorial}</p>}

        <div className="grid grid-cols-2 gap-2 mt-4">
          <button type="button" onClick={onEditar} className={accion}><Pencil size={16} strokeWidth={2.2} /> Corregir</button>
          <button type="button" onClick={onColgar} className={accion}><CornerDownRight size={16} strokeWidth={2.2} /> Nueva rama aquí</button>
          <button type="button" onClick={onInsertarAntes} className={accion}><ArrowUpToLine size={16} strokeWidth={2.2} /> Insertar antes</button>
          <button type="button" onClick={onInsertarDespues} className={accion}><ArrowDownToLine size={16} strokeWidth={2.2} /> Insertar después</button>
        </div>
        <button type="button" onClick={borrar} className="w-full mt-2 min-h-[44px] rounded-xl text-red text-[13.5px] font-medium flex items-center justify-center gap-1.5 hover:bg-red/10">
          <Trash2 size={16} strokeWidth={2.2} /> Borrar dispositivo
        </button>
      </div>
    </ModalOverlay>
  );
}
