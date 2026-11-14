'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarSearch, ExternalLink, FileDown, Loader2, MapPin, Route, Search } from 'lucide-react';
import AutocompletarCliente from '@/components/AutocompletarCliente';
import { showToast } from '@/components/Toast';
import LugaresPropios from '@/components/servicios/LugaresPropios';
import { pedirTexto } from '@/lib/dialogos';
import { descargarArchivo } from '@/lib/abrirArchivo';
import { fechaLocal, hoyLocal, sumarDias } from '@/lib/fechaHoy';
import { MARCA } from '@/lib/marca';
import {
  DIAS_MAXIMO_CLIENTE, DIAS_MAXIMO_TECNICO, MINUTOS_PARADA, MINUTOS_VISITA, diasDeTecnico, errorDeRango, horaEnMexicoCorta,
  textoDuracion, textoSinSenal, visitasACliente, type DiaDeTecnico, type Registro, type VisitaACliente,
} from '@/lib/visitas';
import {
  crearLugarPropio, gpsEnLugares, lugaresConocidos, puntosDeTecnico, registrosDeCliente, registrosDeTecnico, tecnicosBuscables,
  type TecnicoBuscable,
} from '@/lib/visitasDatos';

// Buscador de visitas, debajo del mapa de técnicos. Dos preguntas:
//   · Por cliente: ¿qué días fueron con él y quién? (servicios y reportes,
//     comparados con el rastreo cerca de su ubicación).
//   · Por técnico: ¿dónde se detuvo cada día? Sirve para encontrar una
//     visita que no se registró: una parada sin servicio ni reporte.
// «Ver en el mapa» lleva el mapa de arriba a ese día y a ese técnico.

type Modo = 'cliente' | 'tecnico';
type Resultado =
  | { modo: 'cliente'; cliente: { id: string; nombre: string }; desde: string; hasta: string; filas: VisitaACliente[]; hayLugares: boolean }
  | { modo: 'tecnico'; tecnico: TecnicoBuscable; desde: string; hasta: string; dias: DiaDeTecnico[]; puntos: number };

const CAMPO = 'w-full px-3.5 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14.5px]';
const ETIQUETA = 'block text-[12px] font-semibold text-muted mb-1';

function textoDia(fecha: string): string {
  return fechaLocal(fecha).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function textoRegistros(registros: Registro[]): string {
  const servicios = registros.filter((r) => r.tipo === 'servicio').length;
  const reportes = registros.filter((r) => r.tipo === 'reporte').length;
  const partes: string[] = [];
  if (servicios > 0) partes.push(servicios === 1 ? 'Servicio' : `${servicios} servicios`);
  if (reportes > 0) partes.push(reportes === 1 ? 'Reporte' : `${reportes} reportes`);
  return partes.join(' y ') || 'Sin registro';
}

export default function BuscadorVisitas({ fechaMinimaRastreo, onVerEnMapa }: {
  // Primer día con rastreo guardado (los puntos se borran a los 90 días).
  fechaMinimaRastreo: string | null;
  onVerEnMapa: (dia: string, tecnicoId: string | null) => boolean;
}) {
  const [modo, setModo] = useState<Modo>('cliente');
  const [clienteTexto, setClienteTexto] = useState('');
  const [cliente, setCliente] = useState<{ id: string; nombre: string } | null>(null);
  const [tecnicos, setTecnicos] = useState<TecnicoBuscable[]>([]);
  const [tecnicoId, setTecnicoId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [soloAvisos, setSoloAvisos] = useState(false);
  const [exportando, setExportando] = useState(false);
  // Sube cada vez que cambian los lugares propios, para recargar su lista.
  const [versionLugares, setVersionLugares] = useState(0);

  // Las fechas se ponen al montar (no se lee el reloj en el render): último mes.
  useEffect(() => {
    const hoy = hoyLocal();
    setHasta(hoy);
    setDesde(sumarDias(hoy, -30));
    tecnicosBuscables().then(setTecnicos).catch((e) => showToast(e.message, 'error'));
  }, []);

  const nombreTecnico = (id: string) => tecnicos.find((t) => t.id === id)?.nombre || 'Técnico';
  const maximoDias = modo === 'cliente' ? DIAS_MAXIMO_CLIENTE : DIAS_MAXIMO_TECNICO;

  async function buscar() {
    setError(null);
    const errorFechas = errorDeRango(desde, hasta, maximoDias);
    if (errorFechas) {
      setError(errorFechas);
      return;
    }
    if (modo === 'cliente' && !cliente) {
      setError('Elige un cliente de la lista de sugerencias.');
      return;
    }
    const tecnico = tecnicos.find((t) => t.id === tecnicoId);
    if (modo === 'tecnico' && !tecnico) {
      setError('Elige un técnico.');
      return;
    }
    if (!navigator.onLine) {
      setError('La búsqueda necesita señal. Intenta cuando tengas conexión.');
      return;
    }
    setBuscando(true);
    try {
      const lugares = await lugaresConocidos();
      if (modo === 'cliente' && cliente) {
        const suyos = lugares.filter((l) => l.clienteId === cliente.id);
        const [registros, gps] = await Promise.all([
          registrosDeCliente(cliente.id, cliente.nombre, desde, hasta),
          gpsEnLugares(suyos, desde, hasta),
        ]);
        setResultado({ modo: 'cliente', cliente, desde, hasta, filas: visitasACliente(registros, gps, suyos.length > 0, { desde: fechaMinimaRastreo, hoy: hoyLocal() }), hayLugares: suyos.length > 0 });
      } else if (tecnico) {
        const [registros, puntos] = await Promise.all([
          registrosDeTecnico(tecnico.id, desde, hasta),
          puntosDeTecnico(tecnico.id, desde, hasta),
        ]);
        setResultado({ modo: 'tecnico', tecnico, desde, hasta, dias: diasDeTecnico(puntos, registros, lugares), puntos: puntos.length });
      }
      setSoloAvisos(false);
    } catch (e: any) {
      setError(e?.message || 'No se pudo hacer la búsqueda. Intenta de nuevo.');
    }
    setBuscando(false);
  }

  function verEnMapa(dia: string, tecnico: string | null) {
    const sePudo = onVerEnMapa(dia, tecnico);
    if (!sePudo) showToast('Ese día ya no tiene rastreo guardado (se conserva 90 días).', 'error');
  }

  // Desde una parada «sin identificar»: se guarda ese punto como lugar de la
  // empresa y se repite la búsqueda para que ya salga con su nombre.
  async function marcarComoPropio(lat: number, lng: number) {
    const nombre = await pedirTexto('¿Cómo se llama este lugar?\n\nPor ejemplo «Oficina» o «Almacén». Las paradas aquí ya no saldrán como lugar sin identificar.', 'Oficina');
    if (nombre === null) return;
    try {
      await crearLugarPropio(nombre, lat, lng, 150);
      showToast(`«${nombre.trim()}» guardado como lugar propio`);
      setVersionLugares((n) => n + 1);
      buscar();
    } catch (e: any) {
      showToast(e?.message || 'No se pudo guardar el lugar. Intenta de nuevo.', 'error');
    }
  }

  async function exportarPdf() {
    if (!resultado) return;
    setExportando(true);
    try {
      const { visitasPdf } = await import('@/lib/visitasPdf');
      const rango = `Del ${textoDia(resultado.desde)} al ${textoDia(resultado.hasta)}`;
      let bytes: Uint8Array;
      let nombre: string;
      if (resultado.modo === 'cliente') {
        const sinRegistro = resultado.filas.filter((f) => f.aviso === 'sin_registro').length;
        bytes = await visitasPdf({
          empresa: MARCA.nombre,
          titulo: `Visitas a ${resultado.cliente.nombre}`,
          subtitulo: rango,
          notas: [
            `${new Set(resultado.filas.map((f) => f.fecha)).size} días con visita · ${sinRegistro} sin registro en la app.`,
            resultado.hayLugares
              ? `El rastreo cuenta como visita ${MINUTOS_VISITA} minutos o más cerca de la ubicación del cliente.`
              : 'Este cliente no tiene ubicación capturada: solo se muestran servicios y reportes.',
          ],
          columnas: [{ titulo: 'Día', ancho: 18 }, { titulo: 'Técnico', ancho: 24 }, { titulo: 'Registrado en la app', ancho: 20 }, { titulo: 'Rastreo', ancho: 26 }, { titulo: 'Aviso', ancho: 16 }],
          filas: resultado.filas.map((f) => ({
            celdas: [
              textoDia(f.fecha),
              nombreTecnico(f.tecnicoId),
              textoRegistros(f.registros),
              f.gps ? `${horaEnMexicoCorta(f.gps.llegada)} - ${horaEnMexicoCorta(f.gps.salida)} (${textoDuracion(f.gps.minutos)})` : 'Sin rastreo',
              f.aviso === 'sin_registro' ? 'Sin registro' : f.aviso === 'sin_rastreo' ? 'No aparece en rastreo' : '',
            ],
            aviso: f.aviso === 'sin_registro',
          })),
        });
        nombre = `visitas-${resultado.cliente.nombre}-${resultado.desde}-a-${resultado.hasta}.pdf`;
      } else {
        const filas: { celdas: string[]; aviso?: boolean; encabezado?: boolean }[] = [];
        for (const dia of resultado.dias) {
          filas.push({ celdas: [`${textoDia(dia.fecha)} · ${dia.paradas.length} paradas · ${textoRegistros(dia.registros)}`, '', '', ''], encabezado: true });
          for (const r of dia.registros) filas.push({ celdas: ['', r.tipo === 'servicio' ? 'Servicio' : 'Reporte', r.cliente, ''] });
          for (const p of dia.paradas) {
            filas.push({
              celdas: [
                `${horaEnMexicoCorta(p.desde)} - ${horaEnMexicoCorta(p.hasta)} (${textoDuracion(p.minutos)})`,
                'Parada',
                p.cliente || `Lugar sin identificar (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})`,
                p.propio ? 'Lugar propio' : p.cliente ? (p.conRegistro ? '' : 'Sin registro') : 'Revisar',
              ],
              aviso: Boolean(p.cliente) && !p.conRegistro && !p.propio,
            });
          }
        }
        bytes = await visitasPdf({
          empresa: MARCA.nombre,
          titulo: `Recorrido de ${resultado.tecnico.nombre}`,
          subtitulo: rango,
          notas: [
            `Una parada es quedarse ${MINUTOS_PARADA} minutos o más en el mismo lugar. «Sin registro»: estuvo con un cliente y no hay servicio ni reporte de ese cliente ese día.`,
          ],
          columnas: [{ titulo: 'Horario', ancho: 26 }, { titulo: 'Tipo', ancho: 12 }, { titulo: 'Cliente o lugar', ancho: 46 }, { titulo: 'Aviso', ancho: 14 }],
          filas,
        });
        nombre = `recorrido-${resultado.tecnico.nombre}-${resultado.desde}-a-${resultado.hasta}.pdf`;
      }
      await descargarArchivo(new Blob([bytes as BlobPart], { type: 'application/pdf' }), nombre);
    } catch (e: any) {
      showToast(e?.message || 'No se pudo generar el PDF. Intenta de nuevo.', 'error');
    }
    setExportando(false);
  }

  const pestana = (activa: boolean) =>
    `flex-1 min-h-[42px] rounded-xl text-[14px] font-semibold transition-colors ${activa ? 'bg-teal text-inkOnAccent' : 'text-muted hover:bg-surface-2'}`;

  return (
    <section aria-label="Buscar visitas" className="mb-5 rounded-3xl border border-line bg-surface shadow-diffuse p-4 lg:p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-10 h-10 rounded-xl bg-teal/12 text-teal flex items-center justify-center shrink-0"><CalendarSearch size={20} strokeWidth={2.2} /></span>
        <div>
          <h2 className="font-display font-bold text-[18px] leading-tight">Buscar visitas</h2>
          <p className="text-[12.5px] text-muted leading-snug">Qué días fueron con un cliente, o dónde se detuvo un técnico.</p>
        </div>
      </div>

      <div className="flex gap-1 p-1 rounded-2xl bg-surface-2 border border-line mb-3" role="tablist">
        <button type="button" role="tab" aria-selected={modo === 'cliente'} className={pestana(modo === 'cliente')} onClick={() => { setModo('cliente'); setError(null); }}>Por cliente</button>
        <button type="button" role="tab" aria-selected={modo === 'tecnico'} className={pestana(modo === 'tecnico')} onClick={() => { setModo('tecnico'); setError(null); }}>Por técnico</button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr_1fr_auto] lg:items-end">
        {modo === 'cliente' ? (
          <div>
            <label className={ETIQUETA}>Cliente</label>
            <AutocompletarCliente soloSugerir value={clienteTexto} className={CAMPO} placeholder="Escribe para buscar"
              onChange={(nombre, id) => { setClienteTexto(nombre); setCliente(id ? { id, nombre } : null); }} />
          </div>
        ) : (
          <div>
            <label className={ETIQUETA} htmlFor="visitas-tecnico">Técnico</label>
            <select id="visitas-tecnico" className={CAMPO} value={tecnicoId} onChange={(ev) => setTecnicoId(ev.target.value)}>
              <option value="">Elige un técnico</option>
              {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className={ETIQUETA} htmlFor="visitas-desde">Desde</label>
          <input id="visitas-desde" type="date" className={CAMPO} value={desde} max={hasta || undefined} onChange={(ev) => setDesde(ev.target.value)} />
        </div>
        <div>
          <label className={ETIQUETA} htmlFor="visitas-hasta">Hasta</label>
          <input id="visitas-hasta" type="date" className={CAMPO} value={hasta} onChange={(ev) => setHasta(ev.target.value)} />
        </div>
        <button type="button" onClick={buscar} disabled={buscando}
          className="min-h-[46px] px-5 rounded-xl bg-teal text-inkOnAccent font-semibold text-[14.5px] flex items-center justify-center gap-2 disabled:opacity-60">
          {buscando ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} strokeWidth={2.4} />} Buscar
        </button>
      </div>
      {error && <p className="text-red font-semibold text-[13px] mt-2">{error}</p>}
      <p className="text-[12px] text-muted mt-2">
        {modo === 'cliente' ? `Hasta ${DIAS_MAXIMO_CLIENTE} días por búsqueda.` : `Hasta ${DIAS_MAXIMO_TECNICO} días por búsqueda.`}
        {' '}Los servicios y reportes se buscan en cualquier fecha; el rastreo solo se guarda 90 días{fechaMinimaRastreo ? ` (desde el ${textoDia(fechaMinimaRastreo)})` : ''}.
      </p>

      <LugaresPropios version={versionLugares} onCambio={() => setVersionLugares((n) => n + 1)} />

      {resultado && (
        <div className="mt-4 pt-4 border-t border-line">
          {resultado.modo === 'cliente'
            ? <ResultadoCliente resultado={resultado} soloAvisos={soloAvisos} nombreTecnico={nombreTecnico} onVer={verEnMapa} />
            : <ResultadoTecnico resultado={resultado} soloAvisos={soloAvisos} onVer={(dia) => verEnMapa(dia, resultado.tecnico.id)} onPropio={marcarComoPropio} />}
          <div className="flex flex-wrap gap-2 mt-3">
            <label className="min-h-[44px] px-3 rounded-xl border border-line bg-surface-2 flex items-center gap-2 text-[13.5px] font-semibold">
              <input type="checkbox" className="w-4 h-4 accent-teal" checked={soloAvisos} onChange={(ev) => setSoloAvisos(ev.target.checked)} /> Solo lo que hay que revisar
            </label>
            <button type="button" onClick={exportarPdf} disabled={exportando}
              className="min-h-[44px] px-4 rounded-xl border border-line bg-surface-2 font-semibold text-[13.5px] flex items-center gap-2 disabled:opacity-60">
              {exportando ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} strokeWidth={2.3} />} Exportar a PDF
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Aviso({ tipo }: { tipo: 'sin_registro' | 'sin_rastreo' | 'revisar' }) {
  if (tipo === 'sin_registro') {
    return <span className="inline-flex items-center gap-1 text-[11.5px] font-bold px-2 py-0.5 rounded-full bg-red/12 text-red"><AlertTriangle size={12} strokeWidth={2.6} /> Sin registro</span>;
  }
  if (tipo === 'revisar') {
    return <span className="inline-flex items-center gap-1 text-[11.5px] font-bold px-2 py-0.5 rounded-full bg-amber/15 text-amber">Lugar sin identificar</span>;
  }
  return <span className="inline-flex text-[11.5px] font-semibold px-2 py-0.5 rounded-full bg-surface-2 text-muted border border-line">No aparece en el rastreo</span>;
}

function BotonVer({ onClick, texto = 'Ver en el mapa' }: { onClick: () => void; texto?: string }) {
  return (
    <button type="button" onClick={onClick} className="min-h-[38px] px-3 rounded-lg border border-teal/50 text-teal text-[12.5px] font-semibold flex items-center gap-1.5 shrink-0 active:scale-95 transition-transform">
      <Route size={14} strokeWidth={2.4} /> {texto}
    </button>
  );
}

function ResultadoCliente({ resultado, soloAvisos, nombreTecnico, onVer }: {
  resultado: Extract<Resultado, { modo: 'cliente' }>;
  soloAvisos: boolean;
  nombreTecnico: (id: string) => string;
  onVer: (dia: string, tecnicoId: string | null) => void;
}) {
  const filas = soloAvisos ? resultado.filas.filter((f) => f.aviso === 'sin_registro') : resultado.filas;
  const dias = new Set(resultado.filas.map((f) => f.fecha)).size;
  const sinRegistro = resultado.filas.filter((f) => f.aviso === 'sin_registro').length;
  return (
    <div>
      <p className="text-[14.5px]">
        <b>{resultado.cliente.nombre}</b>: {dias} {dias === 1 ? 'día' : 'días'} con visita
        {sinRegistro > 0 && <> · <b className="text-red">{sinRegistro} sin registro en la app</b></>}
      </p>
      {!resultado.hayLugares && (
        <p className="mt-2 rounded-xl border border-amber/40 bg-amber/10 p-3 text-[13px] leading-snug">
          Este cliente no tiene ubicación, así que solo se ven sus servicios y reportes, sin comparar con el rastreo.{' '}
          <Link href={`/dashboard/proyectos/${resultado.cliente.id}`} className="text-teal font-semibold underline">Capturar su ubicación</Link>
        </p>
      )}
      <div className="mt-3 flex flex-col gap-1.5 max-h-[520px] overflow-y-auto">
        {filas.length === 0 && <p className="text-[13.5px] text-muted">{soloAvisos ? 'Nada que revisar: todas las visitas tienen registro.' : 'No hay visitas en estas fechas.'}</p>}
        {filas.map((f) => (
          <div key={`${f.fecha}${f.tecnicoId}`} className={`rounded-xl border p-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 ${f.aviso === 'sin_registro' ? 'border-red/40 bg-red/5' : 'border-line bg-surface-2/60'}`}>
            <p className="w-[150px] shrink-0 font-semibold text-[13.5px] first-letter:uppercase">{textoDia(f.fecha)}</p>
            <p className="flex-1 min-w-[140px] text-[13.5px]">{nombreTecnico(f.tecnicoId)}</p>
            <p className="min-w-[110px] text-[13px]">
              {f.registros.length === 0 ? <span className="text-faint">Sin registro</span> : f.registros.map((r, i) => (
                r.tipo === 'servicio'
                  ? <Link key={i} href={`/dashboard/servicios/${r.id}`} className="text-teal font-semibold underline mr-2">Servicio</Link>
                  : <span key={i} className="font-semibold mr-2">Reporte</span>
              ))}
            </p>
            <p className="min-w-[190px] text-[13px] font-mono">
              {f.gps ? <>{horaEnMexicoCorta(f.gps.llegada)} – {horaEnMexicoCorta(f.gps.salida)} · {textoDuracion(f.gps.minutos)}</> : <span className="font-sans text-faint">Sin rastreo</span>}
              {/* El teléfono dejó de mandar puntos un rato estando ahí: se dice, para que la cuenta se entienda. */}
              {f.gps && textoSinSenal(f.gps.sinSenal) && <span className="block font-sans text-[11.5px] text-muted">incluye {textoSinSenal(f.gps.sinSenal)}</span>}
            </p>
            {f.aviso && <Aviso tipo={f.aviso} />}
            <BotonVer onClick={() => onVer(f.fecha, f.tecnicoId)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultadoTecnico({ resultado, soloAvisos, onVer, onPropio }: {
  resultado: Extract<Resultado, { modo: 'tecnico' }>;
  soloAvisos: boolean;
  onVer: (dia: string) => void;
  onPropio: (lat: number, lng: number) => void;
}) {
  const dias = soloAvisos ? resultado.dias.filter((d) => d.sinRegistro > 0 || d.sinIdentificar > 0) : resultado.dias;
  const sinRegistro = resultado.dias.reduce((suma, d) => suma + d.sinRegistro, 0);
  const sinIdentificar = resultado.dias.reduce((suma, d) => suma + d.sinIdentificar, 0);
  return (
    <div>
      <p className="text-[14.5px]">
        <b>{resultado.tecnico.nombre}</b>: {resultado.dias.length} {resultado.dias.length === 1 ? 'día' : 'días'} con actividad
        {sinRegistro > 0 && <> · <b className="text-red">{sinRegistro} {sinRegistro === 1 ? 'parada' : 'paradas'} con un cliente sin registro</b></>}
        {sinIdentificar > 0 && <> · <b className="text-amber">{sinIdentificar} en lugares sin identificar</b></>}
      </p>
      {resultado.puntos === 0 && (
        <p className="mt-2 rounded-xl border border-amber/40 bg-amber/10 p-3 text-[13px] leading-snug">
          No hay rastreo de este técnico en estas fechas (no usa el teléfono de la empresa, o ya pasaron 90 días). Solo se ven sus servicios y reportes.
        </p>
      )}
      <div className="mt-3 flex flex-col gap-2 max-h-[560px] overflow-y-auto">
        {dias.length === 0 && <p className="text-[13.5px] text-muted">{soloAvisos ? 'Nada que revisar en estas fechas.' : 'Sin actividad en estas fechas.'}</p>}
        {dias.map((dia) => {
          const reportes = dia.registros.filter((r) => r.tipo === 'reporte').length;
          const servicios = dia.registros.filter((r) => r.tipo === 'servicio').length;
          return (
            <div key={dia.fecha} className={`rounded-xl border p-3 ${dia.sinRegistro > 0 ? 'border-red/40 bg-red/5' : 'border-line bg-surface-2/60'}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <p className="font-semibold text-[14px] first-letter:uppercase">{textoDia(dia.fecha)}</p>
                <p className="flex-1 min-w-[180px] text-[12.5px] text-muted">
                  {dia.paradas.length} {dia.paradas.length === 1 ? 'parada' : 'paradas'} · {servicios} {servicios === 1 ? 'servicio' : 'servicios'} · {reportes} {reportes === 1 ? 'reporte' : 'reportes'}
                </p>
                {dia.paradas.length > 0 && <BotonVer onClick={() => onVer(dia.fecha)} texto="Ver recorrido" />}
              </div>
              {dia.registros.length > 0 && (
                <p className="text-[13px] mt-1.5">
                  <span className="text-muted">Registrado: </span>
                  {dia.registros.map((r, i) => (
                    <span key={i}>{i > 0 && ' · '}{r.tipo === 'servicio' ? 'Servicio' : 'Reporte'} {r.cliente}</span>
                  ))}
                </p>
              )}
              {dia.paradas.map((p, i) => (
                <div key={i} className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                  <span className="font-mono w-[200px] shrink-0">{horaEnMexicoCorta(p.desde)} – {horaEnMexicoCorta(p.hasta)} · {textoDuracion(p.minutos)}
                    {textoSinSenal(p.sinSenal) && <span className="block font-sans text-[11.5px] text-muted">incluye {textoSinSenal(p.sinSenal)}</span>}
                  </span>
                  <span className="flex-1 min-w-[150px] flex items-center gap-1.5">
                    <MapPin size={13} strokeWidth={2.3} className="shrink-0 text-muted" />
                    {p.cliente ? <b>{p.cliente}</b> : (
                      <a href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noopener noreferrer" className="text-teal font-semibold underline inline-flex items-center gap-1">
                        Ver el lugar <ExternalLink size={12} />
                      </a>
                    )}
                  </span>
                  {p.propio && <span className="text-[11.5px] font-semibold px-2 py-0.5 rounded-full bg-surface-2 text-muted border border-line">Lugar propio</span>}
                  {p.cliente && !p.conRegistro && !p.propio && <Aviso tipo="sin_registro" />}
                  {!p.cliente && <Aviso tipo="revisar" />}
                  {!p.cliente && (
                    <button type="button" onClick={() => onPropio(p.lat, p.lng)} className="min-h-[32px] px-2.5 rounded-lg border border-line text-[12px] font-semibold text-ink/80 hover:border-teal/50">
                      Es lugar propio
                    </button>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
