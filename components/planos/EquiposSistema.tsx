'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { HardDrive, Network, Receipt } from 'lucide-react';
import SimboloPlano from '@/components/lazos/SimboloPlano';
import { equipoCatalogo, equiposDeSistema, esCamara } from '@/lib/equiposSistemas';
import { tipoDispositivo } from '@/lib/lazos';
import type { EquipoPlano, Plano, Sembrado } from '@/lib/planos';
import { almacenamientoCctv, DISCOS_TB, RESOLUCIONES, type ConfigGrabacion } from '@/lib/cctv';

// Piezas del editor de planos para los sistemas que no son detección:
// el catálogo para sembrar, la ficha con modelo, IP y campo de visión, y el
// resumen de CCTV (cámaras, red, disco duro y pasar a cotización).

type PorColocar = { tipo: string; elementoId: string | null };

export function PanelEquiposSistema({ sistema, porColocar, onElegir, onCancelar }: {
  sistema: string;
  porColocar: PorColocar | null;
  onElegir: (p: PorColocar) => void;
  onCancelar: () => void;
}) {
  const catalogo = equiposDeSistema(sistema);
  return (
    <div className="pt-1">
      {porColocar ? (
        <div className="mb-3 rounded-xl border border-teal bg-teal/10 p-2.5 flex items-center gap-2.5">
          <span className="w-10 flex justify-center text-ink"><SimboloPlano tipo={porColocar.tipo} tamano={30} /></span>
          <span className="flex-1 min-w-0">
            <span className="block text-[12px] text-teal font-semibold">Toca el plano donde va (puedes poner varios seguidos)</span>
            <span className="block text-[14px] font-semibold truncate">{tipoDispositivo(porColocar.tipo).nombre}</span>
          </span>
          <button type="button" onClick={onCancelar} className="shrink-0 min-h-[40px] px-3 rounded-lg border border-line bg-surface text-[13px] font-semibold">Listo</button>
        </div>
      ) : (
        <p className="text-[13px] text-muted mb-3">Elige un equipo y toca el plano donde va. Después tócalo con «Mover» para girarlo y ponerle sus datos.</p>
      )}
      <div className="grid grid-cols-3 gap-1.5">
        {catalogo.map((t) => {
          const activo = porColocar?.tipo === t.codigo;
          return (
            <button key={t.codigo} type="button" title={t.nombre} aria-pressed={activo}
              onClick={() => (activo ? onCancelar() : onElegir({ tipo: t.codigo, elementoId: null }))}
              className={`min-h-[72px] rounded-xl border flex flex-col items-center justify-center gap-1 px-1 text-ink ${activo ? 'border-teal bg-teal/15' : 'border-line bg-surface-2'}`}>
              <SimboloPlano tipo={t.codigo} tamano={30} />
              <span className="text-[11px] leading-tight text-center text-muted line-clamp-2">{t.nombre}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const CAMPO = 'w-full px-3 min-h-[42px] rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[14px]';

// Un campo que guarda al salir de él (así «Deshacer» no se llena de letras sueltas).
function CampoTexto({ etiqueta, valor, max, onGuardar, placeholder, numero, min, maxNumero, unidad }: {
  etiqueta: string;
  valor: string;
  max: number;
  onGuardar: (v: string) => void;
  placeholder?: string;
  numero?: boolean;
  min?: number;
  maxNumero?: number;
  unidad?: string;
}) {
  const [texto, setTexto] = useState(valor);
  useEffect(() => setTexto(valor), [valor]);
  const n = Number(texto.replace(',', '.'));
  const error = numero && texto.trim() !== '' && (!Number.isFinite(n) || (min !== undefined && n < min) || (maxNumero !== undefined && n > maxNumero))
    ? `Escribe un número${min !== undefined ? ` de ${min}` : ''}${maxNumero !== undefined ? ` a ${maxNumero}` : ''}.`
    : null;
  return (
    <label className="block">
      <span className="block text-[12px] text-muted mb-1">{etiqueta}{unidad ? ` (${unidad})` : ''}</span>
      <input className={`${CAMPO} ${error ? 'border-red' : ''}`} value={texto} maxLength={max} placeholder={placeholder}
        inputMode={numero ? 'decimal' : undefined}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => { if (!error && texto !== valor) onGuardar(texto.trim()); }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      {error && <span className="block text-red font-semibold text-[12px] mt-0.5">{error}</span>}
    </label>
  );
}

export function DatosEquipoSistema({ equipo, equiposDeRed, onDatos }: {
  equipo: EquipoPlano;
  equiposDeRed: EquipoPlano[];
  onDatos: (cambios: Partial<EquipoPlano>) => void;
}) {
  const cat = equipoCatalogo(equipo.tipo);
  const camara = cat?.camara;
  const numeroO = (v: string) => (v === '' ? null : Number(v.replace(',', '.')));
  const nombreRed = (e: EquipoPlano) => e.etiqueta || tipoDispositivo(e.tipo).nombre;
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <div className="col-span-2"><CampoTexto etiqueta="Nombre en el plano" valor={equipo.etiqueta || ''} max={40} placeholder={camara ? 'C-01, Acceso norte…' : 'Etiqueta'} onGuardar={(v) => onDatos({ etiqueta: v || null })} /></div>
      <div className="col-span-2"><CampoTexto etiqueta="Marca y modelo" valor={equipo.modelo || ''} max={60} placeholder="Hikvision DS-2CD1027G2H" onGuardar={(v) => onDatos({ modelo: v || null })} /></div>
      {(camara || cat?.red || cat?.sistema === 'acceso') && (
        <CampoTexto etiqueta="Dirección IP" valor={equipo.ip || ''} max={40} placeholder="192.168.1.64" onGuardar={(v) => onDatos({ ip: v || null })} />
      )}
      <CampoTexto etiqueta="Altura" unidad="m" numero min={0} maxNumero={100} valor={equipo.altura != null ? String(equipo.altura) : ''} max={8} onGuardar={(v) => onDatos({ altura: numeroO(v) })} />
      {camara && (
        <>
          <CampoTexto etiqueta="Campo de visión" unidad="°" numero min={1} maxNumero={360} valor={String(equipo.angulo ?? camara.angulo)} max={5} onGuardar={(v) => onDatos({ angulo: numeroO(v) })} />
          <CampoTexto etiqueta="Alcance" unidad="m" numero min={0.5} maxNumero={500} valor={String(equipo.alcance ?? camara.alcance)} max={6} onGuardar={(v) => onDatos({ alcance: numeroO(v) })} />
          <p className="col-span-2 text-[11.5px] text-muted -mt-1">El giro de abajo apunta la cámara. El cono sale a escala si el plano tiene escala.</p>
        </>
      )}
      {camara && (
        <label className="col-span-2 block">
          <span className="block text-[12px] text-muted mb-1">Se conecta a</span>
          <select className={CAMPO} value={equipo.conectadoA || ''} onChange={(e) => onDatos({ conectadoA: e.target.value || null })}>
            <option value="">Sin conectar</option>
            {equiposDeRed.map((r) => <option key={r.id} value={r.id}>{nombreRed(r)}</option>)}
          </select>
          {equiposDeRed.length === 0 && <span className="block text-[11.5px] text-muted mt-0.5">Siembra un NVR o switch para conectar las cámaras.</span>}
        </label>
      )}
    </div>
  );
}

// ---------- Resumen de CCTV ----------

const CLAVE_GRABACION = 'cctvGrabacion';

export function ResumenCctv({ plano, sembrado, metros, onElegir }: {
  plano: Plano | null;
  sembrado: Sembrado;
  metros: number | null;
  onElegir: (id: string) => void;
}) {
  const camaras = sembrado.equipos.filter((e) => esCamara(e.tipo));
  const red = sembrado.equipos.filter((e) => equipoCatalogo(e.tipo)?.red);
  const [config, setConfig] = useState<ConfigGrabacion>({ dias: 30, horas: 24, resolucion: '4MP', codec: 'H.265', fps: 15, movimientoPct: 100 });
  // Se recuerda en este dispositivo: casi siempre se graba igual.
  useEffect(() => {
    try {
      const guardada = localStorage.getItem(CLAVE_GRABACION);
      if (guardada) setConfig((c) => ({ ...c, ...JSON.parse(guardada) }));
    } catch { /* sin almacenamiento: valores de siempre */ }
  }, []);
  function cambiar(c: Partial<ConfigGrabacion>) {
    const nueva = { ...config, ...c };
    setConfig(nueva);
    try { localStorage.setItem(CLAVE_GRABACION, JSON.stringify(nueva)); } catch { /* modo privado */ }
  }
  const calculo = useMemo(() => almacenamientoCctv(camaras.length, config), [camaras.length, config]);
  const nombre = (e: EquipoPlano) => e.etiqueta || tipoDispositivo(e.tipo).nombre;
  const sinConectar = camaras.filter((c) => !c.conectadoA || !red.some((r) => r.id === c.conectadoA));

  return (
    <div className="mt-1 mb-3 grid gap-3">
      <div className="rounded-xl border border-line bg-surface-2 p-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint mb-2">Cámaras · {camaras.length}</p>
        {camaras.length === 0 && <p className="text-[13px] text-muted">Siémbralas con «Equipos». Cada una lleva su campo de visión.</p>}
        <div className="grid gap-1 max-h-[220px] overflow-y-auto">
          {camaras.map((c) => (
            <button key={c.id} type="button" onClick={() => onElegir(c.id)} className="min-h-[40px] px-2 rounded-lg flex items-center gap-2.5 text-left hover:bg-surface">
              <span className="w-8 flex justify-center text-ink"><SimboloPlano tipo={c.tipo} tamano={24} /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-semibold truncate">{nombre(c)}</span>
                <span className="block text-[12px] text-muted truncate">{[c.modelo, c.ip].filter(Boolean).join(' · ') || 'Sin modelo'}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface-2 p-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint mb-2 flex items-center gap-1.5"><Network size={14} /> Red</p>
        {red.length === 0 && <p className="text-[13px] text-muted">Siembra el NVR y los switches; en la ficha de cada cámara eliges a cuál llega.</p>}
        {red.map((r) => {
          const suyas = camaras.filter((c) => c.conectadoA === r.id);
          return (
            <div key={r.id} className="mb-2">
              <button type="button" onClick={() => onElegir(r.id)} className="text-[13.5px] font-semibold hover:text-teal">{nombre(r)}{r.ip ? ` · ${r.ip}` : ''}</button>
              <p className="text-[12.5px] text-muted pl-3 border-l border-line ml-1">
                {suyas.length ? suyas.map(nombre).join(', ') : 'Sin cámaras conectadas'}
              </p>
            </div>
          );
        })}
        {sinConectar.length > 0 && red.length > 0 && (
          <p className="text-[12.5px] text-amber font-semibold">{sinConectar.length} {sinConectar.length === 1 ? 'cámara sin conectar' : 'cámaras sin conectar'}</p>
        )}
      </div>

      <div className="rounded-xl border border-line bg-surface-2 p-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint mb-2 flex items-center gap-1.5"><HardDrive size={14} /> Disco duro</p>
        <div className="grid grid-cols-2 gap-2">
          <label><span className="block text-[12px] text-muted mb-1">Días de grabación</span>
            <input className={CAMPO} inputMode="numeric" value={config.dias} onChange={(e) => cambiar({ dias: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })} /></label>
          <label><span className="block text-[12px] text-muted mb-1">Horas al día</span>
            <input className={CAMPO} inputMode="numeric" value={config.horas} onChange={(e) => cambiar({ horas: Math.max(1, Math.min(24, Number(e.target.value) || 1)) })} /></label>
          <label><span className="block text-[12px] text-muted mb-1">Resolución</span>
            <select className={CAMPO} value={config.resolucion} onChange={(e) => cambiar({ resolucion: e.target.value as ConfigGrabacion['resolucion'] })}>
              {RESOLUCIONES.map((r) => <option key={r.clave} value={r.clave}>{r.nombre}</option>)}
            </select></label>
          <label><span className="block text-[12px] text-muted mb-1">Códec</span>
            <select className={CAMPO} value={config.codec} onChange={(e) => cambiar({ codec: e.target.value as ConfigGrabacion['codec'] })}>
              <option value="H.265">H.265</option><option value="H.264">H.264</option>
            </select></label>
          <label><span className="block text-[12px] text-muted mb-1">Cuadros por segundo</span>
            <select className={CAMPO} value={config.fps} onChange={(e) => cambiar({ fps: Number(e.target.value) as 15 | 30 })}>
              <option value={15}>15</option><option value={30}>30</option>
            </select></label>
          <label><span className="block text-[12px] text-muted mb-1">Grabación</span>
            <select className={CAMPO} value={config.movimientoPct} onChange={(e) => cambiar({ movimientoPct: Number(e.target.value) })}>
              <option value={100}>Continua</option><option value={50}>Por movimiento (≈50 %)</option><option value={30}>Por movimiento (≈30 %)</option>
            </select></label>
        </div>
        <p className="text-[14px] mt-2.5">
          Necesitas <b className="font-mono">{calculo.tb.toFixed(1)} TB</b>
          {calculo.discoSugerido ? <> → disco de <b>{calculo.discoSugerido} TB</b></> : <> → más de {DISCOS_TB[DISCOS_TB.length - 1]} TB: usa varios discos</>}
        </p>
        <p className="text-[11.5px] text-muted mt-0.5">Estimado con {calculo.mbpsPorCamara.toFixed(1)} Mbps por cámara. Revisa la ficha del grabador: cuántos discos y de qué tamaño acepta.</p>
      </div>

      {plano && (
        <Link href={`/dashboard/cotizaciones?plano=${plano.id}`} className="min-h-[46px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[14px] flex items-center justify-center gap-2">
          <Receipt size={17} /> Pasar a cotización
        </Link>
      )}
      {metros === null && camaras.length > 0 && (
        <p className="text-[12px] text-amber">El plano no tiene escala: los conos no están a tamaño real. Ponla con «Escala».</p>
      )}
    </div>
  );
}
