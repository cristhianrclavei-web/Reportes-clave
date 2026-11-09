'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FileText, Loader2, Map as IconoPlano, X } from 'lucide-react';
import LienzoPlano from '@/components/lazos/LienzoPlano';
import SimboloPlano from '@/components/lazos/SimboloPlano';
import { colorDeLazo, conexionesEnPlano } from '@/lib/conexionesPlano';
import { direccionVisible, tipoDispositivo, type Elemento, type Lazo } from '@/lib/lazos';
import { tamanoSimbolo, type EquipoPlano, type Plano, type Punto } from '@/lib/planos';
import { imagenDelPlano, planosDelCliente } from '@/lib/planosDatos';

// El plano junto al diagrama unifilar, solo para ver (nada se mueve). Sale
// el plano donde están los dispositivos del lazo; si el lazo pasa por varios
// niveles, se elige cuál arriba. Tocar un equipo lo marca en el diagrama;
// tocar uno en el diagrama (`enfocar`) trae el plano hasta él.

const nadaQueHacer = () => {};
// Aquí no se traza tubería: el punto se queda donde se tocó.
const sinAjuste = (p: Punto) => ({ puntos: [p], guias: { x: null, y: null } });

export default function PlanoDelLazo({ lazo, elementos, enfocar, onTocarEquipo, onAbrirFicha, className = '' }: {
  lazo: Lazo;
  elementos: Elemento[];
  // Dispositivo a buscar en el plano; `vez` cambia en cada toque.
  enfocar: { elementoId: string; vez: number } | null;
  onTocarEquipo: (elementoId: string | null) => void;
  onAbrirFicha: (elemento: Elemento) => void;
  className?: string;
}) {
  const [planos, setPlanos] = useState<Plano[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planoId, setPlanoId] = useState<string | null>(null);
  const [imagen, setImagen] = useState<{ planoId: string; url: string } | null>(null);
  const [errorImagen, setErrorImagen] = useState<string | null>(null);
  // El dispositivo marcado (con su tarjeta) y el pedido de centrar el plano.
  const [marcado, setMarcado] = useState<string | null>(null);
  const [vista, setVista] = useState<{ punto: Punto; vez: number } | null>(null);

  useEffect(() => {
    let vigente = true;
    planosDelCliente(lazo.cliente_id)
      .then(({ planos: lista }) => { if (vigente) setPlanos(lista); })
      .catch((e) => { if (vigente) setError(e.message); });
    return () => { vigente = false; };
  }, [lazo.cliente_id]);

  const porId = useMemo(() => new Map(elementos.map((e) => [e.id, e])), [elementos]);

  // Solo los planos donde está sembrado algún dispositivo de este lazo.
  const conElLazo = useMemo(
    () => (planos || []).filter((p) => p.sembrado.equipos.some((e) => e.elementoId && porId.has(e.elementoId))),
    [planos, porId],
  );
  const plano = conElLazo.find((p) => p.id === planoId) || conElLazo[0] || null;

  // En qué plano está cada dispositivo (para las flechas «sigue en…» y para
  // cambiar de plano al buscar uno).
  const planoDe = useMemo(() => {
    const mapa = new Map<string, Plano>();
    for (const p of planos || []) for (const e of p.sembrado.equipos) if (e.elementoId) mapa.set(e.elementoId, p);
    return mapa;
  }, [planos]);

  const imagenPath = plano?.imagen_path;
  const idDelPlano = plano?.id;
  useEffect(() => {
    if (!imagenPath || !idDelPlano) return;
    let vigente = true;
    setErrorImagen(null);
    imagenDelPlano(imagenPath)
      .then((url) => { if (vigente) setImagen({ planoId: idDelPlano, url }); })
      .catch((e) => { if (vigente) setErrorImagen(e.message); });
    return () => { vigente = false; };
  }, [imagenPath, idDelPlano]);

  // Un toque en el diagrama: se cambia al plano donde está y se centra.
  const vezEnfocar = enfocar?.vez;
  useEffect(() => {
    if (!enfocar || !planos) return;
    setMarcado(enfocar.elementoId);
    const donde = planoDe.get(enfocar.elementoId);
    if (!donde) return;
    setPlanoId(donde.id);
    const equipo = donde.sembrado.equipos.find((e) => e.elementoId === enfocar.elementoId);
    if (equipo) setVista((v) => ({ punto: [equipo.x, equipo.y], vez: (v?.vez || 0) + 1 }));
    // Solo con cada toque nuevo (o cuando terminan de llegar los planos).
  }, [vezEnfocar, planos]); // eslint-disable-line react-hooks/exhaustive-deps

  const conexiones = useMemo(() => {
    if (!plano) return null;
    const otros = new Map<string, string>();
    for (const [id, p] of planoDe) if (p.id !== plano.id) otros.set(id, p.nombre);
    return conexionesEnPlano([{ ...lazo, elementos }], plano.sembrado, otros, tamanoSimbolo(plano.ancho, plano.alto) * 2);
  }, [plano, planoDe, lazo, elementos]);
  const colorPorLazo = useMemo(() => new Map([[lazo.id, colorDeLazo(0)]]), [lazo.id]);

  function etiquetaDe(e: EquipoPlano): string {
    const elemento = e.elementoId ? porId.get(e.elementoId) : null;
    if (elemento) return direccionVisible(elemento.direccion, lazo.numero) || elemento.nombre;
    return e.etiqueta || '';
  }

  function alTocar(_p: Punto, equipo: EquipoPlano | null) {
    const id = equipo?.elementoId && porId.has(equipo.elementoId) ? equipo.elementoId : null;
    setMarcado(id);
    onTocarEquipo(id);
  }

  const elementoMarcado = marcado ? porId.get(marcado) || null : null;
  const equipoMarcado = plano && marcado ? plano.sembrado.equipos.find((e) => e.elementoId === marcado) || null : null;
  const otroPlano = marcado && !equipoMarcado ? planoDe.get(marcado) : null;

  let contenido: React.ReactNode;
  if (error) {
    contenido = <Aviso>{error}</Aviso>;
  } else if (!planos) {
    contenido = <Aviso><Loader2 size={18} className="animate-spin" /> Abriendo el plano…</Aviso>;
  } else if (!plano) {
    contenido = (
      <Aviso>
        <span>Ningún dispositivo de {lazo.codigo} está sembrado en un plano.</span>
        <Link href={`/lazos?cliente=${lazo.cliente_id}`} className="font-semibold text-teal underline">Ir a los planos del cliente</Link>
      </Aviso>
    );
  } else {
    const url = imagen?.planoId === plano.id ? imagen.url : null;
    contenido = (
      <>
        {errorImagen && <Aviso>{errorImagen}</Aviso>}
        {!errorImagen && (
          <LienzoPlano key={plano.id}
            imagenUrl={url} ancho={plano.ancho} alto={plano.alto} sembrado={plano.sembrado}
            etiquetaDe={etiquetaDe}
            seleccion={equipoMarcado ? { tipo: 'equipo', id: equipoMarcado.id } : null}
            trazo={[]} colorTrazo="" medida={[]}
            ajustarPunto={sinAjuste}
            onTocar={(p, equipo) => alTocar(p, equipo)} onDobleToque={nadaQueHacer}
            onArrastreInicio={nadaQueHacer} onArrastre={nadaQueHacer} onArrastreFin={nadaQueHacer}
            conexiones={conexiones} colorPorLazo={colorPorLazo} resaltado={null}
            ayudaPuntero={false} guiasArrastre={null} verNodos={false}
            onNodoInicio={nadaQueHacer} onNodo={nadaQueHacer} onNodoFin={nadaQueHacer}
            bloqueado enfocar={vista} />
        )}
        {elementoMarcado && (
          <div className="absolute left-2 right-16 bottom-2 rounded-xl bg-surface/95 border border-line shadow-lg p-2 flex items-center gap-2 backdrop-blur">
            <span className="w-9 flex justify-center text-ink"><SimboloPlano tipo={elementoMarcado.tipo} tamano={26} /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13.5px] font-semibold truncate">
                {elementoMarcado.nombre}{elementoMarcado.direccion ? ` · ${direccionVisible(elementoMarcado.direccion, lazo.numero)}` : ''}
              </span>
              <span className="block text-[12px] text-muted truncate">
                {otroPlano ? `Está en el plano «${otroPlano.nombre}»` : equipoMarcado ? tipoDispositivo(elementoMarcado.tipo).nombre : 'No está sembrado en ningún plano'}
              </span>
            </span>
            {otroPlano && (
              <button type="button" onClick={() => setPlanoId(otroPlano.id)} className="shrink-0 min-h-[36px] px-2.5 rounded-lg border border-line text-[12.5px] font-semibold">Ir</button>
            )}
            <button type="button" onClick={() => onAbrirFicha(elementoMarcado)} className="shrink-0 min-h-[36px] px-2.5 rounded-lg bg-teal text-inkOnAccent text-[12.5px] font-semibold flex items-center gap-1">
              <FileText size={14} /> Ficha
            </button>
            <button type="button" onClick={() => { setMarcado(null); onTocarEquipo(null); }} aria-label="Cerrar" className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-muted"><X size={15} /></button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className={`rounded-2xl border border-line bg-surface overflow-hidden flex flex-col ${className}`}>
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-line overflow-x-auto">
        <IconoPlano size={16} className="shrink-0 text-teal ml-1" />
        {conElLazo.length > 1 ? conElLazo.map((p) => (
          <button key={p.id} type="button" onClick={() => setPlanoId(p.id)} aria-pressed={p.id === plano?.id}
            className={`shrink-0 min-h-[32px] px-2.5 rounded-full text-[12.5px] font-semibold border ${p.id === plano?.id ? 'bg-teal/15 border-teal text-ink' : 'border-line text-muted'}`}>
            {p.nombre}
          </button>
        )) : <span className="text-[13px] font-semibold truncate">{plano?.nombre || 'Plano'}</span>}
        {plano && (
          <Link href={`/lazos/plano/${plano.id}`} className="ml-auto shrink-0 min-h-[32px] px-2.5 rounded-lg border border-line text-[12.5px] font-semibold flex items-center">Abrir</Link>
        )}
      </div>
      <div className="relative flex-1 min-h-0">{contenido}</div>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <div className="h-full flex flex-col items-center justify-center gap-2 p-4 text-center text-[13.5px] text-muted">{children}</div>;
}
