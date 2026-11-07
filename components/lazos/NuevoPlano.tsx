'use client';

import { useRef, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import AutocompletarCliente from '@/components/AutocompletarCliente';
import { abrirPdf, miniaturaHoja, renderizarHoja, type PdfAbierto } from '@/lib/leerPlanoPdf';
import { crearPlano } from '@/lib/planosDatos';
import { escalaDesdeProporcion, nombrePlanoSchema } from '@/lib/planos';

const CAMPO = 'w-full px-3.5 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]';
// Los planos de AutoCAD rara vez pasan de 20 MB; el bucket acepta 50.
const PESO_MAXIMO = 40 * 1024 * 1024;

type Errores = Partial<Record<'cliente' | 'nombre' | 'archivo' | 'escala', string>>;

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
    if (nuevo.type !== 'application/pdf' && !nuevo.name.toLowerCase().endsWith('.pdf')) {
      setErrores({ archivo: 'Elige un PDF. Desde AutoCAD: Imprimir → «DWG To PDF.pc3».' });
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

  function validar(): Errores {
    const e: Errores = {};
    if (!clienteId) e.cliente = 'Elige el cliente de la lista.';
    const n = nombrePlanoSchema.safeParse(nombre);
    if (!n.success) e.nombre = n.error.issues[0].message;
    if (!archivo || !pdf) e.archivo = 'Elige el PDF del plano.';
    if (escala.trim() && !escalaDesdeProporcion(Number(escala))) e.escala = 'Escribe solo el número: para 1:100 pon 100.';
    return e;
  }

  async function guardar() {
    const e = validar();
    setErrores(e);
    setErrorGeneral(null);
    if (Object.keys(e).length > 0 || !archivo || !pdf || !clienteId) return;
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

  return (
    <ModalOverlay onClose={() => !guardando && onCerrar()}>
      <div className="glass-strong rounded-3xl max-w-lg w-full p-5 max-h-[88vh] overflow-y-auto">
        <h2 className="font-display font-bold text-[22px]">Nuevo plano</h2>
        <p className="text-[13px] text-muted mt-1 mb-4">Exporta desde AutoCAD a PDF con «DWG To PDF.pc3», una hoja por nivel, en gris y sin cotas ni mobiliario.</p>

        {!clienteInicial && (
          <>
            <label className="block text-[13px] text-muted mb-1.5">Cliente</label>
            <AutocompletarCliente value={cliente} onChange={(n, id) => { setCliente(n); setClienteId(id); }} className={CAMPO} placeholder="Escribe para buscar" soloSugerir />
            {errores.cliente && <p className="text-red font-semibold text-[13px] mt-1">{errores.cliente}</p>}
          </>
        )}

        <span className="block text-[13px] text-muted mt-4 mb-1.5">PDF del plano</span>
        <input ref={entrada} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(ev) => elegirArchivo(ev.target.files?.[0])} />
        <button type="button" onClick={() => entrada.current?.click()} disabled={leyendo || !!guardando}
          className="w-full min-h-[64px] rounded-2xl border-2 border-dashed border-line hover:border-teal/60 bg-surface-2 flex items-center justify-center gap-2.5 text-[14.5px] font-semibold">
          {leyendo ? <Loader2 size={20} className="animate-spin" /> : <FileUp size={20} strokeWidth={2.2} />}
          {leyendo ? 'Leyendo el PDF…' : archivo ? archivo.name : 'Elegir PDF'}
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

        <label htmlFor="plano-nombre" className="block text-[13px] text-muted mt-4 mb-1.5">Nombre</label>
        <input id="plano-nombre" value={nombre} onChange={(ev) => setNombre(ev.target.value)} maxLength={80} placeholder="Planta baja" className={CAMPO} />
        {errores.nombre && <p className="text-red font-semibold text-[13px] mt-1">{errores.nombre}</p>}

        <label htmlFor="plano-escala" className="block text-[13px] text-muted mt-4 mb-1.5">Escala de impresión (opcional)</label>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[15px] whitespace-nowrap shrink-0">1 :</span>
          <input id="plano-escala" inputMode="numeric" value={escala} onChange={(ev) => setEscala(ev.target.value.replace(/[^\d.]/g, '').slice(0, 6))} placeholder="100" className={`${CAMPO} font-mono`} />
        </div>
        <p className="text-[12px] text-faint mt-1.5">Si no la sabes, déjala vacía: en el plano la calibras marcando una medida real.</p>
        {errores.escala && <p className="text-red font-semibold text-[13px] mt-1">{errores.escala}</p>}

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
