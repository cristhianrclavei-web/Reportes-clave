'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, ChevronLeft, CloudUpload, ExternalLink, Lightbulb, PenLine, Trash2, WifiOff } from 'lucide-react';
import DiagramaConexion, { type Elegido } from '@/components/guias/DiagramaConexion';
import EditorGuia from '@/components/guias/EditorGuia';
import { showToast } from '@/components/Toast';
import { confirmar } from '@/lib/dialogos';
import {
  estadoDePrueba, nombreSistema, progresoDe, rangoDePrueba, textoPunta, tonosDeCable,
  type ConexionGuia, type Guia, type PruebaGuia,
} from '@/lib/guias';
import { borrarGuia, leerGuia, marcar, marcasPendientes, subirMarcasPendientes, urlDeFotoGuia } from '@/lib/guiasDatos';

type Vista = 'diagrama' | 'conexiones' | 'pruebas' | 'notas';

export default function GuiaDetalle({ guiaId, usuarioId, usuarioNombre, esSupervisor }: {
  guiaId: string;
  usuarioId: string;
  usuarioNombre: string;
  esSupervisor: boolean;
}) {
  const [guia, setGuia] = useState<Guia | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sinConexion, setSinConexion] = useState(false);
  const [pendientes, setPendientes] = useState(0);
  const [vista, setVista] = useState<Vista>('diagrama');
  const [elegido, setElegido] = useState<Elegido>(null);
  const [editando, setEditando] = useState(false);
  // Recién creada en blanco llega con ?editar=1: abre directo en el editor.
  useEffect(() => {
    if (!esSupervisor || new URLSearchParams(window.location.search).get('editar') !== '1') return;
    setEditando(true);
    // Se quita de la dirección para que al recargar no vuelva a abrir el editor.
    window.history.replaceState(null, '', window.location.pathname);
  }, [esSupervisor]);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const resultado = await leerGuia(guiaId);
      setGuia(resultado.guia);
      setSinConexion(resultado.sinConexion);
      setPendientes(marcasPendientes(guiaId));
    } catch (e: any) {
      setError(e?.message || 'No se pudo abrir la guía.');
    }
  }, [guiaId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Al volver la señal se sube lo que quedó en cola.
  useEffect(() => {
    async function subir() {
      const quedan = await subirMarcasPendientes();
      setPendientes(quedan);
      if (quedan === 0) setSinConexion(false);
    }
    subir();
    window.addEventListener('online', subir);
    return () => window.removeEventListener('online', subir);
  }, []);

  if (error) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <p className="text-red font-semibold text-[15px]">{error}</p>
        <div className="flex justify-center gap-2 mt-4">
          <Link href="/lazos?ver=guias" className="min-h-[44px] px-4 rounded-xl bg-surface-2 border border-line font-semibold flex items-center">Volver</Link>
          <button type="button" onClick={cargar} className="min-h-[44px] px-4 rounded-xl bg-teal text-inkOnAccent font-semibold">Reintentar</button>
        </div>
      </div>
    );
  }
  if (!guia) return <p className="p-6 text-[14px] text-muted">Cargando…</p>;

  if (editando) {
    return <EditorGuia guia={guia} onCancelar={() => setEditando(false)} onGuardada={(nueva) => { setGuia(nueva); setEditando(false); showToast('Guía guardada', 'success'); }} />;
  }

  const { datos, avance } = guia;
  const progreso = progresoDe(datos, avance);

  // Marca o desmarca una conexión: se ve al instante y se guarda (o queda en cola sin señal).
  async function alternarConexion(c: ConexionGuia) {
    if (!guia) return;
    const yaHecha = Boolean(guia.avance.conexiones[c.id]);
    const marca = yaHecha ? null : { por: usuarioId, nombre: usuarioNombre, en: new Date().toISOString() };
    const conexiones = { ...guia.avance.conexiones };
    if (marca) conexiones[c.id] = marca;
    else delete conexiones[c.id];
    setGuia({ ...guia, avance: { ...guia.avance, conexiones } });
    try {
      const resultado = await marcar(guia.id, 'conexiones', c.id, marca);
      setPendientes(marcasPendientes(guia.id));
      if (resultado.pendiente) setSinConexion(true);
    } catch (e: any) {
      showToast(e?.message || 'No se pudo guardar la marca', 'error');
      cargar();
    }
  }

  async function guardarMedicion(p: PruebaGuia, valor: number | null) {
    if (!guia) return;
    const marca = valor === null ? null : { por: usuarioId, nombre: usuarioNombre, en: new Date().toISOString(), valor };
    const pruebas = { ...guia.avance.pruebas };
    if (marca) pruebas[p.id] = marca;
    else delete pruebas[p.id];
    setGuia({ ...guia, avance: { ...guia.avance, pruebas } });
    try {
      const resultado = await marcar(guia.id, 'pruebas', p.id, marca);
      setPendientes(marcasPendientes(guia.id));
      if (resultado.pendiente) setSinConexion(true);
      if (marca && estadoDePrueba(p, valor) === 'fuera') showToast(`Fuera de rango: debe dar ${rangoDePrueba(p)}`, 'error');
    } catch (e: any) {
      showToast(e?.message || 'No se pudo guardar la medición', 'error');
      cargar();
    }
  }

  async function borrar() {
    if (!guia) return;
    const seguro = await confirmar(`¿Borrar la guía «${guia.nombre}»?\nSe borra el diagrama con todo lo que se marcó. No se puede deshacer.`);
    if (!seguro) return;
    try {
      await borrarGuia(guia.id);
      window.location.href = '/lazos?ver=guias';
    } catch (e: any) {
      showToast(e?.message || 'No se pudo borrar la guía', 'error');
    }
  }

  const pestanas: { k: Vista; texto: string; cuenta?: string }[] = [
    { k: 'diagrama', texto: 'Diagrama' },
    { k: 'conexiones', texto: 'Conexiones', cuenta: `${progreso.conexionesHechas}/${progreso.conexiones}` },
    { k: 'pruebas', texto: 'Pruebas', cuenta: `${progreso.pruebasHechas}/${progreso.pruebas}` },
    { k: 'notas', texto: 'Notas', cuenta: String(datos.notas.length + datos.fotos.length) },
  ];

  const conexionesAVer = elegido && 'equipo' in elegido
    ? datos.conexiones.filter((c) => c.de.equipo === elegido.equipo || c.a.equipo === elegido.equipo)
    : elegido && 'conexion' in elegido
      ? datos.conexiones.filter((c) => c.id === elegido.conexion)
      : [];
  const equipoElegido = elegido && 'equipo' in elegido ? datos.equipos.find((e) => e.id === elegido.equipo) || null : null;

  return (
    <div className="max-w-2xl lg:max-w-[1300px] mx-auto pb-16">
      <div className="sticky top-0 z-20 glass-strong px-4 lg:px-8 py-3" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2">
          <Link href="/lazos?ver=guias" aria-label="Volver a las guías" className="shrink-0 w-11 h-11 -ml-1.5 rounded-full flex items-center justify-center active:scale-90 transition-transform">
            <ChevronLeft size={24} strokeWidth={2.4} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] text-faint uppercase tracking-[0.06em] truncate">
              {guia.es_plantilla ? 'Plantilla · ' : 'Guía de conexión · '}{nombreSistema(guia.sistema)}
            </p>
            <h1 className="font-display font-bold text-[20px] leading-tight truncate">{guia.nombre}</h1>
          </div>
          {esSupervisor && (
            <>
              <button type="button" onClick={() => setEditando(true)} className="min-h-[42px] px-3.5 rounded-xl border border-line bg-surface-2 text-[13.5px] font-semibold flex items-center gap-1.5">
                <PenLine size={16} strokeWidth={2.2} /> <span className="hidden sm:inline">Editar</span>
              </button>
              <button type="button" onClick={borrar} aria-label="Borrar la guía" className="w-[42px] h-[42px] rounded-xl border border-red/40 text-red bg-red/10 flex items-center justify-center">
                <Trash2 size={17} strokeWidth={2.2} />
              </button>
            </>
          )}
        </div>
        {!guia.es_plantilla && (
          <div className="mt-2.5 flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden" role="progressbar" aria-valuenow={progreso.porcentaje} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de la guía">
              <div className={`h-full rounded-full transition-[width] duration-300 ${progreso.terminado ? 'bg-green-500' : 'bg-teal'}`} style={{ width: `${progreso.porcentaje}%` }} />
            </div>
            <span className="font-mono text-[12.5px] text-muted shrink-0">{progreso.porcentaje} %</span>
          </div>
        )}
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface border border-line p-1 mt-2.5 lg:max-w-xl" role="tablist">
          {pestanas.map((p) => (
            <button key={p.k} type="button" role="tab" aria-selected={vista === p.k} onClick={() => setVista(p.k)}
              className={`min-h-[40px] rounded-lg text-[12.5px] font-semibold leading-tight ${vista === p.k ? 'bg-teal text-inkOnAccent' : 'text-muted'}`}>
              {p.texto}
              {p.cuenta !== undefined && <span className="block font-mono text-[10.5px] opacity-80">{p.cuenta}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 lg:px-8 pt-4">
        {(sinConexion || pendientes > 0) && (
          <p className="flex items-center gap-2 rounded-xl bg-amber/10 text-amber text-[13px] px-3 py-2 mb-3">
            {sinConexion ? <WifiOff size={16} strokeWidth={2.4} /> : <CloudUpload size={16} strokeWidth={2.4} />}
            {sinConexion ? 'Sin señal: trabajas con la copia del teléfono. ' : ''}
            {pendientes > 0 ? `${pendientes} ${pendientes === 1 ? 'marca' : 'marcas'} sin subir; se suben solas al volver la señal.` : ''}
          </p>
        )}
        {guia.descripcion && vista === 'diagrama' && <p className="text-[13.5px] text-muted mb-3 leading-snug">{guia.descripcion}</p>}

        {vista === 'diagrama' && (
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6 lg:items-start">
            <div className="rounded-2xl border border-line bg-surface-2/50 p-2">
              <DiagramaConexion datos={datos} avance={avance} elegido={elegido} onElegir={setElegido} />
            </div>
            <div className="mt-3 lg:mt-0 lg:sticky lg:top-[190px]">
              {!elegido && <p className="text-[13.5px] text-muted">Toca un equipo para ver todo lo que se le conecta, o un cable para ver de dónde sale y a dónde llega.</p>}
              {equipoElegido && (
                <div className="rounded-2xl border border-line bg-surface p-3.5 mb-2.5">
                  <p className="font-display font-semibold text-[16px]">{equipoElegido.nombre}</p>
                  {equipoElegido.modelo && <p className="text-[13px] text-muted">{equipoElegido.modelo}</p>}
                  {equipoElegido.nota && <p className="text-[13px] mt-1.5">{equipoElegido.nota}</p>}
                  {equipoElegido.enlace && (
                    <a href={equipoElegido.enlace} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 text-[13px] font-semibold text-teal underline">
                      <ExternalLink size={14} /> Manual o ficha del equipo
                    </a>
                  )}
                </div>
              )}
              <div className="flex flex-col gap-2">
                {conexionesAVer.map((c) => (
                  <RenglonConexion key={c.id} guia={guia} conexion={c} soloVer={guia.es_plantilla} onAlternar={() => alternarConexion(c)} />
                ))}
              </div>
            </div>
          </div>
        )}

        {vista === 'conexiones' && (
          <div className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-2.5">
            {datos.conexiones.length === 0 && <p className="text-[14px] text-muted">Esta guía todavía no tiene conexiones.</p>}
            {datos.conexiones.map((c) => (
              <RenglonConexion key={c.id} guia={guia} conexion={c} soloVer={guia.es_plantilla} onAlternar={() => alternarConexion(c)} />
            ))}
          </div>
        )}

        {vista === 'pruebas' && (
          <div className="flex flex-col gap-2.5 lg:max-w-2xl">
            {datos.pruebas.length === 0 && <p className="text-[14px] text-muted">Esta guía no tiene pruebas de puesta en marcha.</p>}
            {datos.pruebas.map((p) => (
              <RenglonPrueba key={p.id} prueba={p} marca={avance.pruebas[p.id] || null} soloVer={guia.es_plantilla} onGuardar={(valor) => guardarMedicion(p, valor)} />
            ))}
          </div>
        )}

        {vista === 'notas' && (
          <div className="lg:max-w-2xl">
            {datos.notas.length === 0 && datos.fotos.length === 0 && <p className="text-[14px] text-muted">Sin notas ni fotos de referencia.</p>}
            <ul className="flex flex-col gap-2">
              {datos.notas.map((nota, i) => (
                <li key={i} className="flex gap-2.5 rounded-xl border border-amber/40 bg-amber/10 px-3 py-2.5 text-[14px] leading-snug">
                  <Lightbulb size={17} strokeWidth={2.3} className="text-amber shrink-0 mt-0.5" /> {nota}
                </li>
              ))}
            </ul>
            {datos.fotos.length > 0 && (
              <>
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint mt-5 mb-2">Así debe quedar</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {datos.fotos.map((f) => <FotoReferencia key={f.path} path={f.path} pie={f.pie} />)}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Una conexión: de qué borne a qué borne, el cable y su palomita.
function RenglonConexion({ guia, conexion, soloVer, onAlternar }: { guia: Guia; conexion: ConexionGuia; soloVer: boolean; onAlternar: () => void }) {
  const marca = guia.avance.conexiones[conexion.id];
  const tonos = tonosDeCable(conexion.color);
  return (
    <div className={`rounded-2xl border p-3 flex items-start gap-3 ${marca ? 'border-green-500/50 bg-green-500/10' : 'border-line bg-surface'}`}>
      {/* Muestra del cable: uno o dos colores */}
      <span className="mt-1 w-3.5 h-10 rounded-full border border-black/40 shrink-0"
        style={{ background: tonos[1] ? `repeating-linear-gradient(0deg, ${tonos[0]} 0 6px, ${tonos[1]} 6px 12px)` : tonos[0] }} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-[14.5px] font-semibold leading-snug">{textoPunta(guia.datos, conexion.de)}</p>
        <p className="text-[14.5px] font-semibold leading-snug"><span className="text-muted font-normal">→ </span>{textoPunta(guia.datos, conexion.a)}</p>
        <p className="text-[12.5px] text-muted mt-0.5">
          {[conexion.color ? `Cable ${conexion.color}` : null, conexion.calibre ? `calibre ${conexion.calibre}` : null].filter(Boolean).join(' · ') || 'Cable sin especificar'}
        </p>
        {conexion.nota && <p className="text-[12.5px] mt-1">{conexion.nota}</p>}
        {marca && <p className="text-[11.5px] text-faint mt-1">Hecha por {marca.nombre}</p>}
      </div>
      {!soloVer && (
        <button type="button" onClick={onAlternar} aria-pressed={Boolean(marca)} aria-label={marca ? 'Quitar la marca de hecha' : 'Marcar como hecha'}
          className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center shrink-0 active:scale-90 transition-transform ${marca ? 'bg-green-600 border-green-600 text-white' : 'border-line-strong text-transparent'}`}>
          <Check size={24} strokeWidth={3} />
        </button>
      )}
    </div>
  );
}

// Una prueba: lo que debe dar, lo que dio y si quedó dentro del rango.
function RenglonPrueba({ prueba, marca, soloVer, onGuardar }: { prueba: PruebaGuia; marca: { valor: number; nombre: string } | null; soloVer: boolean; onGuardar: (valor: number | null) => void }) {
  const [texto, setTexto] = useState(marca ? String(marca.valor) : '');
  const [aviso, setAviso] = useState<string | null>(null);
  const estado = estadoDePrueba(prueba, marca?.valor);
  const rango = rangoDePrueba(prueba);

  function guardar() {
    if (texto.trim() === '') {
      setAviso(null);
      if (marca) onGuardar(null);
      return;
    }
    const valor = Number(texto.replace(',', '.'));
    if (!Number.isFinite(valor)) {
      setAviso('Escribe solo el número, por ejemplo 12.4');
      return;
    }
    setAviso(null);
    if (!marca || marca.valor !== valor) onGuardar(valor);
  }

  const borde = estado === 'fuera' ? 'border-red/60 bg-red/10' : estado === 'bien' ? 'border-green-500/50 bg-green-500/10' : 'border-line bg-surface';
  return (
    <div className={`rounded-2xl border p-3.5 ${borde}`}>
      <p className="text-[14.5px] font-semibold leading-snug">{prueba.texto}</p>
      {rango && <p className="text-[13px] text-muted mt-0.5">Debe dar <b className="text-ink">{rango}</b></p>}
      {!soloVer && (
        <div className="flex items-center gap-2 mt-2.5">
          <input inputMode="decimal" value={texto} onChange={(ev) => setTexto(ev.target.value)} onBlur={guardar}
            onKeyDown={(ev) => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }}
            placeholder="Lo que mediste" aria-label={`Medición: ${prueba.texto}`}
            className="w-36 px-3 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none font-mono text-[16px]" />
          {prueba.unidad && <span className="text-[14px] text-muted">{prueba.unidad}</span>}
          {estado === 'bien' && <span className="flex items-center gap-1 text-[13px] font-semibold text-green-600"><Check size={16} strokeWidth={3} /> Bien</span>}
          {estado === 'fuera' && <span className="flex items-center gap-1 text-[13px] font-semibold text-red"><AlertTriangle size={16} strokeWidth={2.6} /> Fuera de rango</span>}
        </div>
      )}
      {aviso && <p className="text-red font-semibold text-[13px] mt-1">{aviso}</p>}
      {estado === 'fuera' && <p className="text-[12.5px] text-red mt-1.5">No energices ni entregues así: revisa la conexión o avisa al ingeniero.</p>}
      {marca && <p className="text-[11.5px] text-faint mt-1.5">Medido por {marca.nombre}</p>}
    </div>
  );
}

function FotoReferencia({ path, pie }: { path: string; pie: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vigente = true;
    urlDeFotoGuia(path).then((u) => { if (vigente) setUrl(u); });
    return () => { vigente = false; };
  }, [path]);
  return (
    <figure className="rounded-xl overflow-hidden border border-line bg-surface">
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt={pie || 'Foto de referencia'} className="w-full h-40 object-cover" />
        : <div className="w-full h-40 flex items-center justify-center text-[12.5px] text-muted">Cargando foto…</div>}
      {pie && <figcaption className="text-[12.5px] px-2.5 py-1.5">{pie}</figcaption>}
    </figure>
  );
}
