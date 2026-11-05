'use client';

import { AlertTriangle, Check, CheckCircle2, Scissors, Search } from 'lucide-react';
import VerFoto from '@/components/lazos/VerFoto';
import {
  AnexoFallaTierra, CorteResumen, DispositivoResumen, etiquetaDispositivo, fechaHoraEnMexico, horaEnMexico,
} from '@/lib/anexoFallaTierra';

// Bitácora de una búsqueda de falla a tierra: el resultado arriba y abajo
// cada corte en orden, con lo que la app sugería en ese momento y cuántos
// dispositivos quedaban en duda. Se usa en la tarjeta del lazo, en el
// reporte y en su vista previa (el PDF dibuja lo mismo en lib/pdfFallaTierra).

function duracion(desde: string, hasta: string | null): string {
  if (!hasta) return '';
  const minutos = Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 60000);
  if (minutos < 1) return '';
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}

function Dispositivo({ d }: { d: DispositivoResumen }) {
  return (
    <>
      <span className="font-mono font-semibold">{etiquetaDispositivo(d)}</span>
      {(d.lugar || d.ubicacion) && (
        <span className="block text-[12.5px] text-muted">{[d.lugar, d.ubicacion].filter(Boolean).join(' · ')}</span>
      )}
    </>
  );
}

export default function ResumenFallaTierra({ anexo, conEncabezado = true }: { anexo: AnexoFallaTierra; conEncabezado?: boolean }) {
  const resuelta = anexo.estado === 'resuelta';
  const tiempo = duracion(anexo.abierta_en, anexo.resuelta_en);

  return (
    <div className="flex flex-col gap-3 text-[13.5px]">
      {conEncabezado && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display font-bold text-[17px] leading-tight">
              <span className="text-teal">{anexo.lazo.codigo}</span> {anexo.lazo.nombre}
            </p>
            <p className="text-[12px] text-muted mt-0.5">
              {[anexo.lazo.circuito, anexo.lazo.clase, anexo.lazo.panel, `${anexo.lazo.dispositivos} dispositivos`].filter(Boolean).join(' · ')}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${resuelta ? 'bg-teal/15 text-teal' : 'bg-amber/15 text-amber'}`}>
            {resuelta ? 'Encontrada' : 'En proceso'}
          </span>
        </div>
      )}

      <dl className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-surface-2 border border-line px-2.5 py-2">
          <dt className="text-[11px] text-faint">Inició</dt>
          <dd className="text-[12.5px] font-medium">{fechaHoraEnMexico(anexo.abierta_en)}</dd>
        </div>
        <div className="rounded-xl bg-surface-2 border border-line px-2.5 py-2">
          <dt className="text-[11px] text-faint">{resuelta ? 'Encontrada' : 'Al anexar'}</dt>
          <dd className="text-[12.5px] font-medium">{fechaHoraEnMexico(anexo.resuelta_en || anexo.capturado_en)}</dd>
        </div>
        <div className="rounded-xl bg-surface-2 border border-line px-2.5 py-2">
          <dt className="text-[11px] text-faint">Cortes</dt>
          <dd className="text-[12.5px] font-medium">{anexo.cortes.length}{tiempo ? ` · ${tiempo}` : ''}</dd>
        </div>
      </dl>

      {resuelta ? (
        <div className="rounded-2xl border border-teal/40 bg-teal/10 p-3">
          <p className="flex items-center gap-1.5 font-semibold text-teal"><CheckCircle2 size={17} strokeWidth={2.4} /> Falla encontrada</p>
          <p className="mt-1.5">
            {anexo.encontrada ? <Dispositivo d={anexo.encontrada} /> : <span className="font-semibold">En el cable, entre dispositivos</span>}
          </p>
          {anexo.causa && <p className="mt-1.5"><span className="text-muted">Causa: </span>{anexo.causa}</p>}
          {anexo.foto_path && <VerFoto path={anexo.foto_path} texto="Ver foto de la falla" />}
        </div>
      ) : (
        <div className="rounded-2xl border border-amber/40 bg-amber/10 p-3">
          <p className="flex items-center gap-1.5 font-semibold text-amber"><Search size={16} strokeWidth={2.4} /> Búsqueda en proceso</p>
          {anexo.final.contradictorio ? (
            <p className="mt-1.5 flex gap-1.5 text-red"><AlertTriangle size={16} strokeWidth={2.4} className="shrink-0 mt-0.5" /> Los cortes se contradicen: hay que volver a medir.</p>
          ) : (
            <>
              <p className="mt-1.5">
                La falla sigue en <b>{anexo.final.quedan} {anexo.final.quedan === 1 ? 'dispositivo' : 'dispositivos'}</b>
                {anexo.final.tramo ? ` (${anexo.final.tramo})` : ''}.
              </p>
              {!anexo.final.siguiente && anexo.final.quedan > 1 && (
                <p className="mt-1.5 text-[12.5px] text-muted">No hay un corte a la salida de un dispositivo que los separe (por ejemplo, ramas en estrella): desconecta y mide cada rama por separado.</p>
              )}
              {anexo.final.siguiente && (
                <p className="mt-1.5 flex gap-2">
                  <Scissors size={16} strokeWidth={2.4} className="text-teal shrink-0 mt-0.5" />
                  <span><span className="text-muted">Siguiente corte recomendado: salida de </span><Dispositivo d={anexo.final.siguiente} /></span>
                </p>
              )}
            </>
          )}
        </div>
      )}

      <div>
        <h4 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted mb-2">Bitácora de cortes</h4>
        {anexo.cortes.length === 0 && <p className="text-muted">No se registraron cortes.</p>}
        <ol className="relative">
          {anexo.cortes.map((c, i) => (
            <PasoCorte key={c.numero} corte={c} ultimo={i === anexo.cortes.length - 1} total={anexo.lazo.dispositivos} />
          ))}
        </ol>
      </div>
    </div>
  );
}

function PasoCorte({ corte, ultimo, total }: { corte: CorteResumen; ultimo: boolean; total: number }) {
  const avance = total > 0 ? Math.max(4, Math.round((corte.quedan / total) * 100)) : 0;
  return (
    <li className="relative pl-9 pb-4">
      {/* Línea que une los cortes, como una línea de tiempo. */}
      {!ultimo && <span className="absolute left-[13px] top-7 bottom-0 w-0.5 bg-line" aria-hidden="true" />}
      <span className="absolute left-0 top-0 w-7 h-7 rounded-full bg-ink text-bg font-mono text-[12px] font-semibold flex items-center justify-center">
        {corte.numero}
      </span>
      <p className="text-[12px] text-faint">Corte {corte.numero} · {horaEnMexico(corte.hecho_en)}</p>
      <p className="mt-0.5">
        <span className="text-muted">Abrí a la salida de </span>
        {corte.donde ? <Dispositivo d={corte.donde} /> : <span className="italic">un dispositivo que ya se borró</span>}
      </p>

      <div className="flex flex-wrap gap-1.5 mt-1.5">
        <span className={`rounded-md px-2 py-0.5 text-[12px] font-semibold ${corte.lado === 'campo' ? 'bg-amber/15 text-amber' : 'bg-surface-2 text-ink border border-line'}`}>
          Falla del lado {corte.lado}
        </span>
        {corte.medicion && <span className="rounded-md px-2 py-0.5 text-[12px] bg-surface-2 border border-line font-mono">{corte.medicion}</span>}
        {corte.sugerido && (
          corte.siguioSugerencia
            ? <span className="rounded-md px-2 py-0.5 text-[12px] bg-teal/15 text-teal font-semibold inline-flex items-center gap-1"><Check size={12} strokeWidth={3} /> Corte sugerido</span>
            : <span className="rounded-md px-2 py-0.5 text-[12px] bg-surface-2 border border-line text-muted">Se sugería {corte.sugerido.direccion || corte.sugerido.nombre}</span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2" title={`Quedaban ${corte.quedan} de ${total}`}>
        <span className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden" aria-hidden="true">
          <span className="block h-full rounded-full bg-amber" style={{ width: `${avance}%` }} />
        </span>
        <span className="text-[12px] text-muted shrink-0">
          Quedaban {corte.quedan}{corte.tramo ? ` · ${corte.tramo}` : ''}
        </span>
      </div>

      {corte.notas && <p className="text-[12.5px] text-muted mt-1">{corte.notas}</p>}
      {corte.foto_path && <VerFoto path={corte.foto_path} texto="Ver foto del corte" />}
    </li>
  );
}
