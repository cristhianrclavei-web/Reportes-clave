'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Images, X, Check, ClipboardList, PackageCheck, PenLine, Undo2, ShieldCheck, Ban, Minus, Plus } from 'lucide-react';
import { Vale, urlsFotos } from '@/lib/vales';

// Piezas de la evidencia de un vale: la línea de tiempo de ida y vuelta, las
// galerías de fotos, el selector de fotos y el contador de cantidades.

function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}

type Paso = { titulo: string; detalle: string; cuando: string | null | undefined; Icono: any };

// Pedido → Entregado → Firmado → Devuelto → Recibido. Lo hecho en verde, lo
// que toca ahora en ámbar y lo que falta en gris: de un vistazo se sabe quién
// tiene la pelota.
export function LineaDelVale({ vale }: { vale: Vale }) {
  const nFotosEntrega = vale.fotos_entrega?.length || 0;
  const nFotosDevolucion = vale.fotos_devolucion?.length || 0;
  const pasos: Paso[] = [
    { titulo: 'Pedido', detalle: vale.tecnico || 'Personal técnico', cuando: vale.created_at, Icono: ClipboardList },
    { titulo: 'Entregado por el almacén', detalle: nFotosEntrega ? `${nFotosEntrega} foto${nFotosEntrega > 1 ? 's' : ''} de lo entregado` : 'Con foto de lo entregado', cuando: vale.entregado_en, Icono: PackageCheck },
    { titulo: 'Firmado de recibido', detalle: vale.firma_tomada_por ? 'Firmó en el dispositivo del almacén' : 'Firma del técnico', cuando: vale.firmado_en, Icono: PenLine },
    { titulo: 'Devuelto', detalle: nFotosDevolucion ? `${nFotosDevolucion} foto${nFotosDevolucion > 1 ? 's' : ''} de lo que regresó` : 'Con foto de lo que regresa', cuando: vale.devuelto_en, Icono: Undo2 },
    { titulo: 'Recibido y firmado por el almacén', detalle: 'Revisado concepto por concepto', cuando: vale.firma_almacen_en || vale.recibido_en, Icono: ShieldCheck },
  ];

  if (vale.estado === 'rechazado' || vale.estado === 'cancelado') {
    return (
      <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-line bg-surface-2/50 px-3 py-2.5">
        <Ban size={16} className="text-muted shrink-0" />
        <p className="text-[12.5px] text-muted">{vale.estado === 'rechazado' ? 'El almacén rechazó este vale' : 'Se canceló antes de entregarse'}{vale.motivo_rechazo ? `: ${vale.motivo_rechazo}` : '.'}</p>
      </div>
    );
  }

  // El paso actual es el primero sin fecha.
  const actual = pasos.findIndex((p) => !p.cuando);
  return (
    <ol className="mt-3 rounded-2xl border border-line bg-surface-2/40 px-3.5 py-3">
      {pasos.map((p, i) => {
        const hecho = actual === -1 || i < actual;
        const ahora = i === actual;
        const ultimo = i === pasos.length - 1;
        return (
          <li key={p.titulo} className="relative flex gap-3 pb-3 last:pb-0">
            {!ultimo && <span className={`absolute left-[13px] top-7 bottom-0 w-[2px] rounded-full ${hecho ? 'bg-teal/60' : 'bg-line'}`} aria-hidden="true" />}
            <span className={`relative z-[1] w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2 ${
              hecho ? 'bg-teal border-teal text-inkOnAccent' : ahora ? 'bg-amber/15 border-amber text-amber' : 'bg-surface border-line text-faint'
            }`}>
              {hecho ? <Check size={14} strokeWidth={3} /> : <p.Icono size={13} strokeWidth={2.4} />}
              {ahora && <span className="absolute inset-0 rounded-full border-2 border-amber animate-ping opacity-40" aria-hidden="true" />}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className={`text-[13px] font-semibold leading-tight ${hecho ? 'text-ink' : ahora ? 'text-amber' : 'text-muted'}`}>{p.titulo}</p>
                {p.cuando && <span className="text-[11px] text-muted tabular-nums shrink-0">{fechaCorta(p.cuando)}</span>}
              </div>
              <p className="text-[11.5px] text-muted leading-snug">{ahora ? 'Pendiente · ' : ''}{p.detalle}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// Galería de fotos ya guardadas (se abren en grande al tocarlas).
export function FotosDelVale({ titulo, paths }: { titulo: string; paths: string[] }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => { urlsFotos(paths).then(setUrls).catch(() => setError(true)); }, [paths]);
  return (
    <div className="mt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">{titulo}</p>
      {error && <p className="text-[12px] text-red">No se pudieron cargar las fotos. Revisa tu conexión.</p>}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {(urls.length ? urls : paths.map(() => '')).map((u, i) => (u ? (
          <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="group relative block rounded-xl overflow-hidden border border-line">
            <img src={u} alt={`${titulo} ${i + 1}`} className="w-full h-24 object-cover transition-transform duration-200 group-hover:scale-105" />
          </a>
        ) : (
          <div key={i} className="h-24 rounded-xl bg-surface-2 animate-pulse" />
        )))}
      </div>
    </div>
  );
}

// Tomar o elegir fotos antes de guardar, con miniaturas que se pueden quitar.
export function SelectorFotos({ fotos, onChange, titulo, ayuda }: {
  fotos: File[];
  onChange: (f: File[]) => void;
  titulo: string;
  ayuda: string;
}) {
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => fotos.map((f) => URL.createObjectURL(f)), [fotos]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p)), [previews]);
  const falta = fotos.length === 0;
  return (
    <div className={`rounded-xl border-2 border-dashed p-3 transition-colors ${falta ? 'border-amber/50 bg-amber/5' : 'border-teal/40 bg-teal/5'}`}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <p className="text-[13px] font-semibold">{titulo}</p>
        <span className={`text-[11px] font-semibold ${falta ? 'text-amber' : 'text-teal'}`}>{falta ? 'Obligatoria' : `${fotos.length} lista${fotos.length > 1 ? 's' : ''}`}</span>
      </div>
      <p className="text-[12px] text-muted mb-2.5 leading-snug">{ayuda}</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => camara.current?.click()} className="min-h-[44px] rounded-xl bg-surface border border-line text-[13px] font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-transform"><Camera size={16} /> Tomar foto</button>
        <button type="button" onClick={() => galeria.current?.click()} className="min-h-[44px] rounded-xl bg-surface border border-line text-[13px] font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-transform"><Images size={16} /> Galería</button>
      </div>
      <input ref={camara} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onChange([...fotos, ...Array.from(e.target.files || [])]); e.target.value = ''; }} />
      <input ref={galeria} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onChange([...fotos, ...Array.from(e.target.files || [])]); e.target.value = ''; }} />
      {fotos.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mt-2.5">
          {previews.map((p, k) => (
            <div key={p} className="relative">
              <img src={p} alt={`Foto ${k + 1}`} className="w-full h-16 object-cover rounded-lg border border-line" />
              <button type="button" aria-label="Quitar foto" onClick={() => onChange(fotos.filter((_, j) => j !== k))}
                className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red text-white flex items-center justify-center shadow"><X size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// − [n] + con tope. Botones grandes: se usa con el celular en una mano.
export function Cantidad({ valor, max, onChange, unidad }: { valor: number; max: number; onChange: (n: number) => void; unidad?: string }) {
  const fijar = (n: number) => onChange(Math.max(0, Math.min(max, Math.round(n * 100) / 100)));
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" aria-label="Uno menos" onClick={() => fijar(valor - 1)} disabled={valor <= 0}
        className="w-9 h-9 rounded-lg bg-surface-2 border border-line flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40"><Minus size={15} /></button>
      <input type="number" inputMode="decimal" min={0} max={max} value={valor} onChange={(e) => fijar(Number(e.target.value) || 0)}
        className="w-14 h-9 rounded-lg bg-surface-2 border border-line text-[15px] font-semibold text-center tabular-nums" />
      <button type="button" aria-label="Uno más" onClick={() => fijar(valor + 1)} disabled={valor >= max}
        className="w-9 h-9 rounded-lg bg-surface-2 border border-line flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40"><Plus size={15} /></button>
      {unidad && <span className="text-[12px] text-muted ml-0.5">{unidad}</span>}
    </div>
  );
}
