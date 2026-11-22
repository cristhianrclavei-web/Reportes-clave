'use client';

import { AlertTriangle, Copy, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import {
  AISLAMIENTOS, CALIBRES, CATALOGO, CAIDA_MAXIMA, COLORES_CONDUCTOR, FUNCIONES_CONDUCTOR, NOMBRE_CIRCUITO, TUBERIAS,
  caidaDeTension, conductoresPorOmision, datosArreglo, datosBaterias, definicion, electricoDeTramo, kwpTotal,
  mpptDeArreglo, nombreCalibre, puertoDe, redondear, tituloPorOmision,
  type Aviso, type Circuito, type DatosUnifilar, type DefinicionEquipo, type EquipoUnifilar, type ProyectoUnifilar,
  type TipoEquipo, type TipoSistema, type TramoUnifilar,
} from '@/lib/unifilar';

export const CAMPO = 'w-full px-3 min-h-[42px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14.5px]';
const ETIQUETA = 'block text-[12px] text-muted mb-1';
const BOTON = 'min-h-[42px] px-3 rounded-xl border border-line bg-surface-2 text-[13.5px] font-semibold flex items-center justify-center gap-1.5 hover:border-teal/60';

function Encabezado({ titulo, detalle, onCerrar }: { titulo: string; detalle?: string; onCerrar: () => void }) {
  return (
    <div className="flex items-start gap-2 mb-3">
      <div className="flex-1 min-w-0">
        <p className="font-display font-bold text-[17px] leading-tight">{titulo}</p>
        {detalle && <p className="text-[12.5px] text-muted mt-0.5">{detalle}</p>}
      </div>
      <button type="button" onClick={onCerrar} aria-label="Cerrar" className="w-10 h-10 -mr-1 rounded-xl flex items-center justify-center text-muted hover:bg-surface-2">
        <X size={18} />
      </button>
    </div>
  );
}

// Un número escrito a mano: vacío vale, letras no.
function errorDeNumero(valor: string, min?: number, max?: number): string | null {
  if (!valor.trim()) return null;
  const n = Number(valor.replace(',', '.'));
  if (!Number.isFinite(n)) return 'Escribe solo el número.';
  if (min !== undefined && n < min) return `Mínimo ${min}.`;
  if (max !== undefined && n > max) return `Máximo ${max}.`;
  return null;
}

const LIMITES: Record<string, [number, number]> = {
  mppts: [1, 24], vias: [1, 24], serie: [1, 200], paralelo: [1, 500], polos: [1, 4], factorVoc: [1, 1.3],
};

// ---------- Equipo ----------

export function PanelEquipo({ datos, equipo, onCambiar, onBorrar, onDuplicar, onCerrar }: {
  datos: DatosUnifilar;
  equipo: EquipoUnifilar;
  onCambiar: (cambio: Partial<EquipoUnifilar>) => void;
  onBorrar: () => void;
  onDuplicar: () => void;
  onCerrar: () => void;
}) {
  const def = definicion(equipo.tipo);
  const valor = (clave: string, v: string) => onCambiar({ valores: { ...equipo.valores, [clave]: v } });
  const movido = equipo.etiqueta.dx !== 0 || equipo.etiqueta.dy !== 0;

  return (
    <div>
      <Encabezado titulo={def.nombre} detalle={def.descripcion} onCerrar={onCerrar} />
      {equipo.tipo !== 'tierra' && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <label className="col-span-2"><span className={ETIQUETA}>Nombre en el plano</span>
            <input className={CAMPO} value={equipo.nombre} maxLength={80} onChange={(ev) => onCambiar({ nombre: ev.target.value })} /></label>
          <label className="col-span-2"><span className={ETIQUETA}>Marca y modelo</span>
            <input className={CAMPO} value={equipo.modelo} maxLength={80} placeholder={equipo.tipo === 'arreglo' ? 'Módulo, p. ej. Jinko 550 W' : 'Solis S5-GR1P8K'} onChange={(ev) => onCambiar({ modelo: ev.target.value })} /></label>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {def.campos.map((c) => {
          const v = equipo.valores[c.clave] ?? '';
          if (c.tipo === 'opcion') {
            return (
              <label key={c.clave} className="col-span-2"><span className={ETIQUETA}>{c.etiqueta}</span>
                <select className={CAMPO} value={v} onChange={(ev) => valor(c.clave, ev.target.value)}>
                  {c.opciones?.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
                </select></label>
            );
          }
          const [min, max] = LIMITES[c.clave] || [0, undefined];
          const error = errorDeNumero(v, min, max);
          return (
            <label key={c.clave} className={c.etiqueta.length > 26 ? 'col-span-2' : ''}>
              <span className={ETIQUETA}>{c.etiqueta}{c.unidad ? ` (${c.unidad})` : ''}</span>
              <input className={`${CAMPO} ${error ? 'border-red' : ''}`} inputMode="decimal" value={v} maxLength={40} onChange={(ev) => valor(c.clave, ev.target.value)} />
              {error && <span className="block text-red font-semibold text-[12px] mt-0.5">{error}</span>}
              {c.ayuda && !error && <span className="block text-[11.5px] text-muted mt-0.5">{c.ayuda}</span>}
            </label>
          );
        })}
      </div>

      <ResumenEquipo datos={datos} equipo={equipo} />

      <div className="flex flex-wrap gap-2 mt-4">
        {movido && <button type="button" className={BOTON} onClick={() => onCambiar({ etiqueta: { dx: 0, dy: 0 } })}><RotateCcw size={15} /> Texto a su lugar</button>}
        <button type="button" className={BOTON} onClick={onDuplicar}><Copy size={15} /> Duplicar</button>
        <button type="button" className={`${BOTON} text-red`} onClick={onBorrar}><Trash2 size={15} /> Borrar</button>
      </div>
      <p className="text-[11.5px] text-muted mt-3">Arrastra el equipo o su texto para acomodarlos.</p>
    </div>
  );
}

function ResumenEquipo({ datos, equipo }: { datos: DatosUnifilar; equipo: EquipoUnifilar }) {
  let lineas: string[] = [];
  if (equipo.tipo === 'arreglo') {
    const a = datosArreglo(equipo);
    const destino = mpptDeArreglo(datos, equipo);
    lineas = [
      `${a.modulos} módulos · ${redondear(a.kwp)} kWp`,
      `Voc máx ${redondear(a.vocMax)} V · Vmp ${redondear(a.vmp)} V · Imax ${redondear(a.imax)} A`,
      destino ? `Llega a ${destino.mppt} de ${destino.inversor.nombre}` : 'Todavía no llega a un inversor.',
    ];
  } else if (equipo.tipo === 'baterias') {
    const b = datosBaterias(equipo);
    lineas = [`${redondear(b.voltaje)} V · ${redondear(b.ah)} Ah · ${redondear(b.kwh)} kWh`];
  }
  if (lineas.length === 0) return null;
  return (
    <div className="rounded-xl bg-teal/10 text-[13px] px-3 py-2 mt-3 space-y-0.5">
      {lineas.map((l) => <p key={l}>{l}</p>)}
    </div>
  );
}

// ---------- Tramo ----------

export function PanelTramo({ datos, tramo, onCambiar, onBorrar, onCerrar }: {
  datos: DatosUnifilar;
  tramo: TramoUnifilar;
  onCambiar: (cambio: Partial<TramoUnifilar>) => void;
  onBorrar: () => void;
  onCerrar: () => void;
}) {
  const nombrePunta = (p: TramoUnifilar['a']) => {
    const e = datos.equipos.find((x) => x.id === p.equipo);
    if (!e) return '?';
    return `${e.nombre || definicion(e.tipo).nombre} (${puertoDe(e, p.puerto)?.nombre || p.puerto})`;
  };
  const electrico = electricoDeTramo(datos, { ...tramo, voltaje: '', corriente: '' });
  const caida = caidaDeTension(datos, tramo);
  const cambiarConductor = (i: number, cambio: Partial<TramoUnifilar['conductores'][number]>) => {
    onCambiar({ conductores: tramo.conductores.map((c, k) => (k === i ? { ...c, ...cambio } : c)) });
  };
  const errorMetros = errorDeNumero(tramo.metros, 0, 5000);
  const errorV = errorDeNumero(tramo.voltaje, 0, 2000);
  const errorI = errorDeNumero(tramo.corriente, 0, 5000);
  const movido = tramo.etiqueta.dx !== 0 || tramo.etiqueta.dy !== 0;

  return (
    <div>
      <Encabezado titulo={tramo.tierra ? 'Tramo de tierra' : 'Tramo'} detalle={`${nombrePunta(tramo.a)} → ${nombrePunta(tramo.b)}`} onCerrar={onCerrar} />

      {!tramo.tierra && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <label className="col-span-2"><span className={ETIQUETA}>Título en el plano (opcional)</span>
            <input className={CAMPO} value={tramo.titulo} maxLength={80} placeholder="Circuito de salida inversor" onChange={(ev) => onCambiar({ titulo: ev.target.value })} /></label>
          <label className="col-span-2"><span className={ETIQUETA}>Circuito</span>
            <select className={CAMPO} value={tramo.circuito} onChange={(ev) => onCambiar({ circuito: ev.target.value as Circuito })}>
              {(Object.keys(NOMBRE_CIRCUITO) as Circuito[]).map((c) => <option key={c} value={c}>{NOMBRE_CIRCUITO[c]}</option>)}
            </select></label>
        </div>
      )}

      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-faint">Conductores</span>
        {!tramo.tierra && (
          <button type="button" className="text-[12.5px] font-semibold text-teal" onClick={() => onCambiar({ conductores: conductoresPorOmision(tramo.circuito, false) })}>
            Por omisión
          </button>
        )}
      </div>
      <div className="space-y-2">
        {tramo.conductores.map((c, i) => (
          <div key={i} className="rounded-xl border border-line p-2 grid grid-cols-2 gap-1.5">
            <select aria-label="Función" className={CAMPO} value={c.funcion} onChange={(ev) => cambiarConductor(i, { funcion: ev.target.value })}>
              {[...new Set([...FUNCIONES_CONDUCTOR, c.funcion, 'Fase'])].map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <select aria-label="Calibre" className={CAMPO} value={c.calibre} onChange={(ev) => cambiarConductor(i, { calibre: ev.target.value })}>
              {CALIBRES.map((k) => <option key={k.calibre} value={k.calibre}>{nombreCalibre(k.calibre)} · {k.mm2} mm²</option>)}
            </select>
            <select aria-label="Color" className={CAMPO} value={c.color} onChange={(ev) => cambiarConductor(i, { color: ev.target.value })}>
              {[...new Set([...COLORES_CONDUCTOR, c.color])].map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <div className="flex gap-1.5">
              <select aria-label="Aislamiento" className={CAMPO} value={c.aislamiento} onChange={(ev) => cambiarConductor(i, { aislamiento: ev.target.value })}>
                {[...new Set([...AISLAMIENTOS, c.aislamiento])].map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <button type="button" aria-label="Quitar conductor" className="w-10 shrink-0 rounded-xl border border-line text-red flex items-center justify-center"
                onClick={() => onCambiar({ conductores: tramo.conductores.filter((_, k) => k !== i) })}>
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {tramo.conductores.length < 10 && (
        <button type="button" className={`${BOTON} w-full mt-2`}
          onClick={() => onCambiar({ conductores: [...tramo.conductores, { funcion: 'Neutro', calibre: '8', color: 'Blanco', aislamiento: 'THW' }] })}>
          <Plus size={15} /> Agregar conductor
        </button>
      )}

      <div className="grid grid-cols-2 gap-2 mt-3">
        {!tramo.tierra && (
          <label className="col-span-2"><span className={ETIQUETA}>Tubería</span>
            <input className={CAMPO} list="tuberias-unifilar" value={tramo.tuberia} maxLength={80} onChange={(ev) => onCambiar({ tuberia: ev.target.value })} />
            <datalist id="tuberias-unifilar">{TUBERIAS.map((t) => <option key={t} value={t} />)}</datalist></label>
        )}
        <label><span className={ETIQUETA}>Longitud (m)</span>
          <input className={`${CAMPO} ${errorMetros ? 'border-red' : ''}`} inputMode="decimal" value={tramo.metros} maxLength={12} onChange={(ev) => onCambiar({ metros: ev.target.value })} />
          {errorMetros && <span className="block text-red font-semibold text-[12px] mt-0.5">{errorMetros}</span>}</label>
        {!tramo.tierra && (
          <>
            <span />
            <label><span className={ETIQUETA}>Voltaje (V)</span>
              <input className={`${CAMPO} ${errorV ? 'border-red' : ''}`} inputMode="decimal" value={tramo.voltaje} maxLength={12}
                placeholder={electrico.voltaje ? `Auto: ${redondear(electrico.voltaje)}` : 'Escríbelo'} onChange={(ev) => onCambiar({ voltaje: ev.target.value })} />
              {errorV && <span className="block text-red font-semibold text-[12px] mt-0.5">{errorV}</span>}</label>
            <label><span className={ETIQUETA}>Corriente (A)</span>
              <input className={`${CAMPO} ${errorI ? 'border-red' : ''}`} inputMode="decimal" value={tramo.corriente} maxLength={12}
                placeholder={electrico.corriente ? `Auto: ${redondear(electrico.corriente)}` : 'Escríbela'} onChange={(ev) => onCambiar({ corriente: ev.target.value })} />
              {errorI && <span className="block text-red font-semibold text-[12px] mt-0.5">{errorI}</span>}</label>
          </>
        )}
      </div>

      {!tramo.tierra && (
        <div className={`rounded-xl px-3 py-2 mt-3 text-[13.5px] ${caida === null ? 'bg-surface-2 text-muted' : caida > CAIDA_MAXIMA ? 'bg-red/10 text-red font-semibold' : 'bg-teal/10'}`}>
          {caida === null
            ? 'Caída de tensión: pon la longitud (y el voltaje y la corriente si no salen solos).'
            : `Caída de tensión: ${redondear(caida)} %${caida > CAIDA_MAXIMA ? ` — pasa del ${CAIDA_MAXIMA} %, sube el calibre.` : ''}`}
          <span className="block text-[11.5px] text-muted font-normal mt-0.5">Voltaje y corriente vacíos = salen de los equipos (Vmp e Isc × 1.25 en paneles; potencia ÷ voltaje en CA).</span>
        </div>
      )}

      <label className="flex items-center gap-2.5 mt-3 text-[14px]">
        <input type="checkbox" checked={tramo.mostrarEtiqueta} onChange={(ev) => onCambiar({ mostrarEtiqueta: ev.target.checked })} className="w-5 h-5 accent-teal" />
        Mostrar los datos del tramo en el plano
      </label>

      <div className="flex flex-wrap gap-2 mt-4">
        {movido && <button type="button" className={BOTON} onClick={() => onCambiar({ etiqueta: { dx: 0, dy: 0 } })}><RotateCcw size={15} /> Texto a su lugar</button>}
        {tramo.codo !== null && <button type="button" className={BOTON} onClick={() => onCambiar({ codo: null })}><RotateCcw size={15} /> Codo al centro</button>}
        <button type="button" className={`${BOTON} text-red`} onClick={onBorrar}><Trash2 size={15} /> Borrar tramo</button>
      </div>
      <p className="text-[11.5px] text-muted mt-3">Arrastra el punto azul del cable para mover el codo, y el texto para acomodarlo.</p>
    </div>
  );
}

// ---------- Datos del plano ----------

export function PanelProyecto({ nombre, tipo, datos, onNombre, onProyecto, onNotas, onCerrar }: {
  nombre: string;
  tipo: TipoSistema;
  datos: DatosUnifilar;
  onNombre: (v: string) => void;
  onProyecto: (cambio: Partial<ProyectoUnifilar>) => void;
  onNotas: (notas: string[]) => void;
  onCerrar: () => void;
}) {
  const p = datos.proyecto;
  const campo = (clave: keyof ProyectoUnifilar, etiqueta: string, opciones: { max?: number; ayuda?: string; placeholder?: string; doble?: boolean } = {}) => (
    <label className={opciones.doble ? 'col-span-2' : ''}><span className={ETIQUETA}>{etiqueta}</span>
      <input className={CAMPO} value={String(p[clave] ?? '')} maxLength={opciones.max || 120} placeholder={opciones.placeholder}
        onChange={(ev) => onProyecto({ [clave]: ev.target.value } as Partial<ProyectoUnifilar>)} />
      {opciones.ayuda && <span className="block text-[11.5px] text-muted mt-0.5">{opciones.ayuda}</span>}
    </label>
  );
  const errorLat = errorDeNumero(p.lat, -90, 90);
  const errorLng = errorDeNumero(p.lng, -180, 180);

  return (
    <div>
      <Encabezado titulo="Datos del plano" detalle="Lo que sale en el cuadro de la derecha del PDF." onCerrar={onCerrar} />
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2"><span className={ETIQUETA}>Nombre del unifilar (en la lista)</span>
          <input className={CAMPO} value={nombre} maxLength={120} onChange={(ev) => onNombre(ev.target.value)} />
          {!nombre.trim() && <span className="block text-red font-semibold text-[12px] mt-0.5">Ponle nombre.</span>}</label>
        {campo('titulo', 'Título del plano', { max: 200, doble: true, placeholder: tituloPorOmision(tipo), ayuda: 'Vacío = el de siempre según el tipo de sistema.' })}
        {campo('nombre', 'Nombre del proyecto', { doble: true, placeholder: `SFV DE ${redondear(kwpTotal(datos))} kWp`, ayuda: 'Vacío = se calcula con los kWp.' })}
        {campo('descripcion', 'Descripción', { max: 300, doble: true })}
        {campo('direccion', 'Dirección', { max: 300, doble: true })}
        <label><span className={ETIQUETA}>Latitud</span>
          <input className={`${CAMPO} ${errorLat ? 'border-red' : ''}`} inputMode="decimal" value={p.lat} maxLength={30} placeholder="20.6241321" onChange={(ev) => onProyecto({ lat: ev.target.value })} />
          {errorLat && <span className="block text-red font-semibold text-[12px] mt-0.5">{errorLat}</span>}</label>
        <label><span className={ETIQUETA}>Longitud</span>
          <input className={`${CAMPO} ${errorLng ? 'border-red' : ''}`} inputMode="decimal" value={p.lng} maxLength={30} placeholder="-103.44631" onChange={(ev) => onProyecto({ lng: ev.target.value })} />
          {errorLng && <span className="block text-red font-semibold text-[12px] mt-0.5">{errorLng}</span>}</label>
        <p className="col-span-2 text-[11.5px] text-muted -mt-1">Con latitud y longitud, el PDF pone solo la macro y microlocalización satelital.</p>
        {campo('diseno', 'Diseñó', { doble: true })}
        {campo('fecha', 'Fecha', { max: 40 })}
        {campo('escala', 'Escala', { max: 30 })}
        {campo('clave', 'Clave de plano', { max: 60, placeholder: 'DU-SFV-01' })}
        {campo('hoja', 'Número de plano', { max: 20 })}
        <label className="col-span-2"><span className={ETIQUETA}>Tamaño de hoja</span>
          <select className={CAMPO} value={p.tamano} onChange={(ev) => onProyecto({ tamano: ev.target.value as ProyectoUnifilar['tamano'] })}>
            <option value="carta">Carta horizontal</option>
            <option value="tabloide">Doble carta (tabloide) horizontal</option>
          </select></label>
      </div>

      <div className="flex items-center justify-between mt-4 mb-1.5">
        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-faint">Notas</span>
        {datos.notas.length < 12 && <button type="button" className="text-[12.5px] font-semibold text-teal" onClick={() => onNotas([...datos.notas, ''])}>Agregar nota</button>}
      </div>
      <div className="space-y-2">
        {datos.notas.map((n, i) => (
          <div key={i} className="flex gap-1.5">
            <span className="text-[13px] text-muted pt-2.5 w-5 shrink-0">{i + 1}.</span>
            <textarea className={`${CAMPO} py-2 min-h-[64px]`} value={n} maxLength={600} onChange={(ev) => onNotas(datos.notas.map((x, k) => (k === i ? ev.target.value : x)))} />
            <button type="button" aria-label="Quitar nota" className="w-10 shrink-0 rounded-xl border border-line text-red flex items-center justify-center"
              onClick={() => onNotas(datos.notas.filter((_, k) => k !== i))}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Catálogo ----------

export function PanelCatalogo({ onElegir, onCerrar }: { onElegir: (tipo: TipoEquipo) => void; onCerrar: () => void }) {
  const grupos = new Map<string, DefinicionEquipo[]>();
  for (const d of CATALOGO) grupos.set(d.grupo, [...(grupos.get(d.grupo) || []), d]);
  return (
    <div>
      <Encabezado titulo="Agregar equipo" detalle="Se pone en el centro de la vista; después lo arrastras y lo conectas." onCerrar={onCerrar} />
      {[...grupos.entries()].map(([grupo, lista]) => (
        <div key={grupo} className="mb-3">
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-faint mb-1.5">{grupo}</p>
          <div className="grid gap-1.5">
            {lista.map((d) => (
              <button key={d.tipo} type="button" onClick={() => onElegir(d.tipo)}
                className="text-left rounded-xl border border-line bg-surface-2 px-3 py-2 hover:border-teal/60">
                <span className="block text-[14px] font-semibold">{d.nombre}</span>
                <span className="block text-[12px] text-muted">{d.descripcion}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Revisión ----------

export function PanelRevision({ avisos, onElegir, onCerrar }: { avisos: Aviso[]; onElegir: (a: Aviso) => void; onCerrar: () => void }) {
  return (
    <div>
      <Encabezado titulo="Revisión" detalle="Toca un aviso para ir al equipo o tramo." onCerrar={onCerrar} />
      {avisos.length === 0 && <p className="rounded-xl bg-teal/10 text-[14px] px-3 py-2">Todo en orden: voltajes, corrientes y caídas de tensión dentro de lo permitido.</p>}
      <div className="space-y-1.5">
        {avisos.map((a, i) => (
          <button key={i} type="button" onClick={() => onElegir(a)}
            className={`w-full text-left rounded-xl px-3 py-2 text-[13.5px] flex gap-2 ${a.nivel === 'error' ? 'bg-red/10 text-red' : 'bg-amber/10 text-amber'}`}>
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>{a.texto}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

