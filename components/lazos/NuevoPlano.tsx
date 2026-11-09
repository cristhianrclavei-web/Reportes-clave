'use client';

import { useMemo, useRef, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import AutocompletarCliente from '@/components/AutocompletarCliente';
import { abrirPdf, miniaturaHoja, renderizarHoja, type PdfAbierto } from '@/lib/leerPlanoPdf';
import { crearPlano } from '@/lib/planosDatos';
import { escalaDesdeProporcion, nombrePlanoSchema, tiposSembrables } from '@/lib/planos';
import {
  UNIDADES, cajaDe, capaQueEstorba, cuentaPorCapa, decodificarDxf, leerDxf, primitivasDe, unidadProbable, type DxfLeido, type Primitiva,
} from '@/lib/leerDxf';
import { renderizarDxf, vistaPreviaDxf } from '@/lib/dibujarDxf';
import { bloquesDelDxf, importarDispositivos, pasarAHoja, sinImportados, type BloqueEncontrado } from '@/lib/importarDxf';

const CAMPO = 'w-full px-3.5 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]';
// Los planos de AutoCAD rara vez pasan de 20 MB; el bucket acepta 50.
const PESO_MAXIMO = 40 * 1024 * 1024;

type Errores = Partial<Record<'cliente' | 'nombre' | 'archivo' | 'escala', string>>;

// Un DXF ya leído: lo que se dibuja, sus capas, las unidades y sus bloques.
type DxfAbierto = { leido: DxfLeido; primitivas: Primitiva[]; capas: { nombre: string; cuantos: number }[]; unidadDetectada: number; bloques: BloqueEncontrado[] };

// Lo que se eligió para cada bloque se recuerda en este equipo para el
// siguiente plano (nombre del bloque → código, '' = no es dispositivo).
const LLAVE_TIPOS_BLOQUE = 'planos:tiposDeBloque';

function tiposRecordados(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LLAVE_TIPOS_BLOQUE) || '{}');
  } catch {
    return {};
  }
}

function recordarTipos(tipos: Record<string, string>) {
  try {
    localStorage.setItem(LLAVE_TIPOS_BLOQUE, JSON.stringify({ ...tiposRecordados(), ...tipos }));
  } catch {
    // Sin almacenamiento (ventana privada): solo no se recuerda.
  }
}

const TIPOS_EQUIPO = tiposSembrables();

// Subir un plano: el PDF exportado de AutoCAD, la hoja (si trae varias) y,
// si se sabe, la escala a la que se imprimió.
export default function NuevoPlano({ clienteInicial, onCerrar, onCreado }: {
  clienteInicial: { id: string; nombre: string } | null;
  onCerrar: () => void;
  onCreado: (id: string) => void;
}) {
  const [cliente, setCliente] = useState(clienteInicial?.nombre || '');
  const [clienteId, setClienteId] = useState<string | null>(clienteInicial?.id || null);
  const [nombre, setNombre] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [pdf, setPdf] = useState<PdfAbierto | null>(null);
  const [miniaturas, setMiniaturas] = useState<string[]>([]);
  const [pagina, setPagina] = useState(1);
  const [dxf, setDxf] = useState<DxfAbierto | null>(null);
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const [unidad, setUnidad] = useState(1);
  const [tipoPorBloque, setTipoPorBloque] = useState<Record<string, string>>({});
  const [escala, setEscala] = useState('');
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  async function elegirArchivo(nuevo: File | undefined) {
    if (!nuevo) return;
    setErrores({});
    setErrorGeneral(null);
    const nombreArchivo = nuevo.name.toLowerCase();
    if (nombreArchivo.endsWith('.dwg')) {
      setErrores({ archivo: 'El DWG no se puede leer directo. En AutoCAD: Guardar como → «AutoCAD DXF» y sube ese archivo.' });
      return;
    }
    if (nombreArchivo.endsWith('.dxf')) {
      await elegirDxf(nuevo);
      return;
    }
    if (nuevo.type !== 'application/pdf' && !nombreArchivo.endsWith('.pdf')) {
      setErrores({ archivo: 'Elige un PDF o un DXF. Desde AutoCAD: Imprimir → «DWG To PDF.pc3», o Guardar como → DXF.' });
      return;
    }
    if (nuevo.size > PESO_MAXIMO) {
      setErrores({ archivo: 'El PDF pesa más de 40 MB. Expórtalo con menos capas (sin imágenes ni achurados).' });
      return;
    }
    setLeyendo(true);
    try {
      const abierto = await abrirPdf(nuevo);
      setArchivo(nuevo);
      setDxf(null);
      setPdf(abierto);
      setPagina(1);
      if (!nombre.trim()) setNombre(nuevo.name.replace(/\.pdf$/i, '').slice(0, 80));
      // Miniaturas solo de las primeras hojas: un juego de 40 tardaría mucho.
      const cuantas = Math.min(abierto.paginas, 12);
      const lista: string[] = [];
      for (let i = 1; i <= cuantas; i++) lista.push(await miniaturaHoja(abierto, i));
      setMiniaturas(lista);
    } catch (e: any) {
      setErrores({ archivo: e?.message || 'No se pudo leer el PDF.' });
    }
    setLeyendo(false);
  }

  // Android no conoce el tipo del DXF y lo deja en gris si se filtra: ahí se
  // muestran todos los archivos (elegirArchivo ya revisa que sea DXF o PDF).
  function abrirSelector() {
    const input = entrada.current;
    if (!input) return;
    if (/Android/i.test(navigator.userAgent)) input.removeAttribute('accept');
    input.click();
  }

  // DXF: se lee aquí mismo; se proponen unidades y capas a apagar.
  async function elegirDxf(nuevo: File) {
    if (nuevo.size > PESO_MAXIMO) {
      setErrores({ archivo: 'El DXF pesa más de 40 MB. En AutoCAD purga el dibujo (PURGE) y quita referencias externas.' });
      return;
    }
    setLeyendo(true);
    // Deja que se pinte «Leyendo…» antes de trabajar.
    await new Promise((r) => setTimeout(r, 30));
    try {
      const leido = leerDxf(decodificarDxf(await nuevo.arrayBuffer()));
      const primitivas = primitivasDe(leido);
      const caja = cajaDe(primitivas, new Set());
      if (!caja) throw new Error('El DXF no trae nada que dibujar en el espacio modelo.');
      const capas = [...cuentaPorCapa(primitivas)].map(([nombre, cuantos]) => ({ nombre, cuantos })).sort((a, b) => b.cuantos - a.cuantos);
      const apagar = new Set(capas.filter((c) => leido.capas.get(c.nombre)?.apagada || capaQueEstorba(c.nombre)).map((c) => c.nombre));
      const detectada = unidadProbable(leido.insunits, caja.maxX - caja.minX);
      const bloques = bloquesDelDxf(leido);
      const recordados = tiposRecordados();
      const tipos: Record<string, string> = {};
      for (const b of bloques) tipos[b.nombre] = recordados[b.nombre] ?? b.sugerido ?? '';
      setArchivo(nuevo);
      setPdf(null);
      setMiniaturas([]);
      setPagina(1);
      setDxf({ leido, primitivas, capas, unidadDetectada: detectada, bloques });
      setTipoPorBloque(tipos);
      setOcultas(apagar);
      setUnidad(detectada);
      if (!nombre.trim()) setNombre(nuevo.name.replace(/\.dxf$/i, '').slice(0, 80));
    } catch (e: any) {
      setErrores({ archivo: e?.message || 'No se pudo leer el DXF. Guárdalo de nuevo desde AutoCAD como DXF.' });
    }
    setLeyendo(false);
  }

  function alternarCapa(capa: string) {
    const nuevas = new Set(ocultas);
    if (nuevas.has(capa)) nuevas.delete(capa);
    else nuevas.add(capa);
    setOcultas(nuevas);
  }

  const vistaDxf = useMemo(() => (dxf ? vistaPreviaDxf(dxf.primitivas, ocultas) : null), [dxf, ocultas]);

  // Los bloques elegidos se vuelven equipos de la app con su dirección.
  const importado = useMemo(() => {
    if (!dxf) return null;
    const elegidos = new Map(Object.entries(tipoPorBloque).filter(([, codigo]) => codigo));
    if (elegidos.size === 0) return null;
    return importarDispositivos(dxf.leido, elegidos, () => crypto.randomUUID());
  }, [dxf, tipoPorBloque]);

  function elegirTipoBloque(bloque: string, codigo: string) {
    setTipoPorBloque({ ...tipoPorBloque, [bloque]: codigo });
  }

  function filaBloque(b: BloqueEncontrado) {
    return (
      <label key={b.nombre} className="flex items-center gap-2.5 px-3 min-h-[46px] text-[13.5px]">
        <span className="flex-1 min-w-0 truncate" title={b.nombre}>{b.nombre}</span>
        <span className="text-[12px] text-faint font-mono shrink-0">{b.cuantos}</span>
        <select value={tipoPorBloque[b.nombre] || ''} onChange={(ev) => elegirTipoBloque(b.nombre, ev.target.value)} aria-label={`Qué es el bloque ${b.nombre}`}
          className="w-[46%] shrink-0 min-h-[38px] px-2 rounded-lg bg-surface border border-line text-[13px]">
          <option value="">No es dispositivo</option>
          {TIPOS_EQUIPO.map((t) => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}
        </select>
      </label>
    );
  }

  function validar(): Errores {
    const e: Errores = {};
    if (!clienteId) e.cliente = 'Elige el cliente de la lista.';
    const n = nombrePlanoSchema.safeParse(nombre);
    if (!n.success) e.nombre = n.error.issues[0].message;
    if (!archivo || (!pdf && !dxf)) e.archivo = 'Elige el PDF o el DXF del plano.';
    if (dxf && !vistaDxf) e.archivo = 'Con esas capas apagadas no queda nada que dibujar.';
    if (escala.trim() && !escalaDesdeProporcion(Number(escala))) e.escala = 'Escribe solo el número: para 1:100 pon 100.';
    return e;
  }

  async function guardar() {
    const e = validar();
    setErrores(e);
    setErrorGeneral(null);
    if (Object.keys(e).length > 0 || !archivo || !clienteId) return;
    if (dxf) {
      await guardarDxf(dxf);
      return;
    }
    if (!pdf) return;
    try {
      setGuardando('Preparando el plano…');
      const hoja = await renderizarHoja(pdf, pagina);
      setGuardando('Subiendo…');
      const id = await crearPlano({
        clienteId,
        nombre: nombre.trim(),
        pdf: archivo,
        pagina,
        imagen: hoja.imagen,
        ancho: hoja.ancho,
        alto: hoja.alto,
        metrosPorUnidad: escala.trim() ? escalaDesdeProporcion(Number(escala)) : null,
      });
      onCreado(id);
    } catch (err: any) {
      setErrorGeneral(err?.message || 'No se pudo subir el plano. Revisa tu señal e intenta de nuevo.');
      setGuardando(null);
    }
  }

  // El DXF se dibuja con las capas elegidas; la escala sale de sus unidades.
  async function guardarDxf(abierto: DxfAbierto) {
    if (!archivo || !clienteId) return;
    try {
      setGuardando('Dibujando el plano…');
      await new Promise((r) => setTimeout(r, 30));
      // Lo importado se quita del fondo para que no salga dos veces.
      const fondo = importado ? primitivasDe(sinImportados(abierto.leido, importado.usadas)) : abierto.primitivas;
      const hoja = await renderizarDxf(fondo, ocultas);
      const equipos = importado ? pasarAHoja(importado.equipos, hoja.transformacion, hoja) : [];
      setGuardando('Subiendo…');
      const id = await crearPlano({
        clienteId,
        nombre: nombre.trim(),
        pdf: archivo,
        pagina: 1,
        imagen: hoja.imagen,
        ancho: hoja.ancho,
        alto: hoja.alto,
        metrosPorUnidad: hoja.transformacion.k * unidad,
        dxf: { ...hoja.transformacion, unidad },
        sembrado: equipos.length > 0 ? { equipos, tuberias: [] } : undefined,
      });
      recordarTipos(tipoPorBloque);
      onCreado(id);
    } catch (err: any) {
      setErrorGeneral(err?.message || 'No se pudo subir el plano. Revisa tu señal e intenta de nuevo.');
      setGuardando(null);
    }
  }

  return (
    <ModalOverlay onClose={() => !guardando && onCerrar()}>
      <div className="glass-strong rounded-3xl max-w-lg w-full p-5 max-h-[88vh] overflow-y-auto">
        <h2 className="font-display font-bold text-[22px]">Nuevo plano</h2>
        <p className="text-[13px] text-muted mt-1 mb-4">Sube el <b>DXF</b> (AutoCAD: Guardar como → DXF; el sembrado regresa a AutoCAD en su lugar exacto) o un PDF exportado con «DWG To PDF.pc3», una hoja por nivel.</p>

        {!clienteInicial && (
          <>
            <label className="block text-[13px] text-muted mb-1.5">Cliente</label>
            <AutocompletarCliente value={cliente} onChange={(n, id) => { setCliente(n); setClienteId(id); }} className={CAMPO} placeholder="Escribe para buscar" soloSugerir />
            {errores.cliente && <p className="text-red font-semibold text-[13px] mt-1">{errores.cliente}</p>}
          </>
        )}

        <span className="block text-[13px] text-muted mt-4 mb-1.5">Plano (DXF o PDF)</span>
        <input ref={entrada} type="file" accept=".dxf,application/dxf,image/vnd.dxf,application/pdf,.pdf" className="hidden" onChange={(ev) => elegirArchivo(ev.target.files?.[0])} />
        <button type="button" onClick={abrirSelector} disabled={leyendo || !!guardando}
          className="w-full min-h-[64px] rounded-2xl border-2 border-dashed border-line hover:border-teal/60 bg-surface-2 flex items-center justify-center gap-2.5 text-[14.5px] font-semibold">
          {leyendo ? <Loader2 size={20} className="animate-spin" /> : <FileUp size={20} strokeWidth={2.2} />}
          {leyendo ? 'Leyendo el plano…' : archivo ? archivo.name : 'Elegir DXF o PDF'}
        </button>
        {errores.archivo && <p className="text-red font-semibold text-[13px] mt-1">{errores.archivo}</p>}

        {pdf && pdf.paginas > 1 && (
          <>
            <span className="block text-[13px] text-muted mt-4 mb-1.5">Hoja ({pdf.paginas} en el PDF). Cada hoja es un plano aparte.</span>
            <div className="grid grid-cols-3 gap-2">
              {miniaturas.map((src, i) => (
                <button key={i} type="button" onClick={() => setPagina(i + 1)} aria-pressed={pagina === i + 1}
                  className={`rounded-xl border-2 p-1 bg-white ${pagina === i + 1 ? 'border-teal' : 'border-line'}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Hoja ${i + 1}`} className="w-full aspect-[4/3] object-contain" />
                  <span className="block text-[12px] text-slate-700 font-semibold">Hoja {i + 1}</span>
                </button>
              ))}
            </div>
            {pdf.paginas > miniaturas.length && (
              <label className="flex items-center gap-2 mt-2 text-[13px] text-muted">
                Otra hoja:
                <input inputMode="numeric" value={pagina} onChange={(ev) => setPagina(Math.min(pdf.paginas, Math.max(1, Number(ev.target.value.replace(/\D/g, '')) || 1)))} className={`${CAMPO} !w-24`} />
              </label>
            )}
          </>
        )}

 {dxf && (
          <>
            <span className="block text-[13px] text-muted mt-4 mb-1.5">Así se verá (sin las capas apagadas)</span>
            <div className="rounded-xl border border-line bg-white p-1">
              {vistaDxf
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={vistaDxf} alt="Vista previa del plano" className="w-full max-h-[220px] object-contain" />
                : <p className="text-[13px] text-slate-600 p-4 text-center">Con esas capas apagadas no queda nada.</p>}
            </div>

            <label htmlFor="plano-unidad" className="block text-[13px] text-muted mt-4 mb-1.5">Unidades del dibujo</label>
            <select id="plano-unidad" value={unidad} onChange={(ev) => setUnidad(Number(ev.target.value))} className={CAMPO}>
              {UNIDADES.map((u) => (
                <option key={u.nombre} value={u.metros}>{u.nombre}{u.metros === dxf.unidadDetectada ? ' (detectado)' : ''}</option>
              ))}
            </select>
            <p className="text-[12px] text-faint mt-1.5">Con esto la app ya sabe la escala: no hay que calibrar.</p>

            <span className="block text-[13px] text-muted mt-4 mb-1.5">Capas ({dxf.capas.length - ocultas.size} de {dxf.capas.length} encendidas)</span>
            <div className="rounded-xl border border-line bg-surface-2 max-h-[200px] overflow-y-auto divide-y divide-line">
              {dxf.capas.map((c) => (
                <label key={c.nombre} className="flex items-center gap-2.5 px-3 min-h-[42px] text-[13.5px]">
                  <input type="checkbox" checked={!ocultas.has(c.nombre)} onChange={() => alternarCapa(c.nombre)} className="w-5 h-5 accent-teal" />
                  <span className="flex-1 min-w-0 truncate">{c.nombre}</span>
                  <span className="text-[12px] text-faint font-mono">{c.cuantos}</span>
                </label>
              ))}
            </div>
            <p className="text-[12px] text-faint mt-1.5">Ya vienen apagadas cotas, mobiliario y vegetación; enciende o apaga lo que necesites.</p>

            {dxf.bloques.length > 0 && (
              <>
                <span className="block text-[13px] text-muted mt-4 mb-1.5">Dispositivos del dibujo</span>
                <p className="text-[12px] text-faint mb-1.5">Di qué es cada bloque. Los que elijas pasan a la app con su dirección (el texto junto al símbolo): se pueden mover, editar y conectar.</p>
                <div className="rounded-xl border border-line bg-surface-2 divide-y divide-line">
                  {dxf.bloques.filter((b) => b.sugerido || tipoPorBloque[b.nombre]).map(filaBloque)}
                  {dxf.bloques.some((b) => !b.sugerido && !tipoPorBloque[b.nombre]) && (
                    <details>
                      <summary className="px-3 min-h-[44px] flex items-center text-[13px] font-semibold cursor-pointer">
                        Otros bloques ({dxf.bloques.filter((b) => !b.sugerido && !tipoPorBloque[b.nombre]).length})
                      </summary>
                      <div className="max-h-[220px] overflow-y-auto divide-y divide-line border-t border-line">
                        {dxf.bloques.filter((b) => !b.sugerido && !tipoPorBloque[b.nombre]).map(filaBloque)}
                      </div>
                    </details>
                  )}
                </div>
                <p className={`text-[12.5px] mt-1.5 ${importado ? 'text-teal font-semibold' : 'text-faint'}`}>
                  {importado
                    ? `Pasan ${importado.equipos.length} dispositivos, ${importado.conDireccion} con su dirección.`
                    : 'No se pasa ningún dispositivo: quedan como parte del fondo.'}
                </p>
              </>
            )}
          </>
        )}

        <label htmlFor="plano-nombre" className="block text-[13px] text-muted mt-4 mb-1.5">Nombre</label>
        <input id="plano-nombre" value={nombre} onChange={(ev) => setNombre(ev.target.value)} maxLength={80} placeholder="Planta baja" className={CAMPO} />
        {errores.nombre && <p className="text-red font-semibold text-[13px] mt-1">{errores.nombre}</p>}

        {!dxf && (<>
        <label htmlFor="plano-escala" className="block text-[13px] text-muted mt-4 mb-1.5">Escala de impresión (opcional)</label>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[15px] whitespace-nowrap shrink-0">1 :</span>
          <input id="plano-escala" inputMode="numeric" value={escala} onChange={(ev) => setEscala(ev.target.value.replace(/[^\d.]/g, '').slice(0, 6))} placeholder="100" className={`${CAMPO} font-mono`} />
        </div>
        <p className="text-[12px] text-faint mt-1.5">Si no la sabes, déjala vacía: en el plano la calibras marcando una medida real.</p>
        {errores.escala && <p className="text-red font-semibold text-[13px] mt-1">{errores.escala}</p>}
        </>)}

        {errorGeneral && <p className="text-red font-semibold text-[13px] mt-3">{errorGeneral}</p>}

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onCerrar} disabled={!!guardando} className="flex-1 min-h-[48px] rounded-xl bg-surface-2 border border-line font-semibold text-[14.5px]">Cancelar</button>
          <button type="button" onClick={guardar} disabled={!!guardando || leyendo} className="flex-[1.4] min-h-[48px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[14.5px] disabled:opacity-60 flex items-center justify-center gap-2">
            {guardando && <Loader2 size={18} className="animate-spin" />}
            {guardando || 'Subir y sembrar'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
