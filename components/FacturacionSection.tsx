'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabaseClient';
import { registrarAccionGlobal } from '@/lib/auditoriaGlobal';
import { Check, ReceiptText, Ban, Undo2 } from 'lucide-react';
import { estadoFacturacion } from '@/lib/reportStatus';

// Bloque de facturación del detalle de un reporte.
//
// Las facturas ya no se suben desde aquí: se arman en la sección Facturación
// juntando todos los reportes del servicio, y cada reporte queda ligado a su
// factura (ese caso lo pinta ReportDetailModal). Este bloque atiende lo
// demás:
//   · pendiente de facturar → ir a armar la factura, o registrar por qué no
//     se va a facturar;
//   · no se factura → el motivo, y poder regresarlo a pendiente;
//   · facturado con el PDF que antes se subía aquí → se puede seguir abriendo.
//
// El botón de «marcar servicio como finalizado» aparece dentro de este bloque
// pero no pertenece a facturación: es del flujo de revisión. Se renderiza aquí
// porque es donde el usuario lo busca —cuando ve que no puede facturar— y se
// recibe por props para no arrastrar ese flujo dentro del componente.

// Motivos frecuentes: un toque llena el texto, que se puede completar.
const MOTIVOS = ['Garantía', 'Cortesía', 'Incluido en póliza o contrato', 'Se cobra en otro servicio', 'Trabajo interno'];

export type EstadoFactura = 'pendiente' | 'facturado' | 'en_proceso' | 'no_facturable' | null | undefined;

type Factura = {
  estado: EstadoFactura;
  archivoPath?: string;
  archivoNombre?: string;
  archivoFecha?: string;
  nota?: string;
  notaFecha?: string;
};

export default function FacturacionSection({
  reportId,
  empresaCliente,
  claveFormato,
  fechaReporte,
  fechaConcluido,
  datosFactura,
  servicioConcluido,
  puedeFacturar,
  marcandoConcluido,
  onMarcarFinalizado,
  onGuardarDatos,
  clienteId,
}: {
  reportId: string;
  empresaCliente: string;
  claveFormato?: string;
  fechaReporte: string;
  fechaConcluido?: string;
  datosFactura: Factura;
  servicioConcluido: boolean;
  puedeFacturar: boolean;
  marcandoConcluido: boolean;
  onMarcarFinalizado: () => void;
  onGuardarDatos: (patch: Record<string, any>) => Promise<void>;
  // Cliente del reporte, para abrir «Nueva factura» ya con él elegido.
  clienteId?: string | null;
}) {
  const [factura, setFactura] = useState<Factura>(datosFactura);
  const [facturaUrl, setFacturaUrl] = useState<string | null>(null);
  const [showNota, setShowNota] = useState(false);
  const [notaTexto, setNotaTexto] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "Días sin facturar" depende de la hora del navegador, que puede no
  // coincidir con la del servidor (Vercel corre en UTC) — ver el comentario
  // en components/SelectorSemana.tsx. Mismo patrón: arranca en null (mismo
  // valor en servidor y primer render del cliente) y se corrige ya montado.
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => setAhora(Date.now()), []);

  const folio = claveFormato ? ` (folio ${claveFormato})` : '';
  const estado = estadoFacturacion({ servicioConcluido: true, facturaEstado: factura.estado });

  async function handleGuardarNota() {
    if (notaTexto.trim().length < 3) {
      setError('Escribe el motivo.');
      return;
    }
    setSubiendo(true);
    setError(null);
    try {
      const fecha = new Date().toLocaleDateString('es-MX');
      await onGuardarDatos({
        facturaEstado: 'no_facturable',
        facturaNota: notaTexto.trim(),
        facturaNotaFecha: fecha,
      });
      setFactura((f) => ({ ...f, estado: 'no_facturable', nota: notaTexto.trim(), notaFecha: fecha }));
      registrarAccionGlobal(
        'marco_no_facturable',
        'reporte',
        reportId,
        `Marcó que no se factura «${empresaCliente}»${folio}: ${notaTexto.trim()}`
      );
      setShowNota(false);
      setNotaTexto('');
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar el motivo.');
    } finally {
      setSubiendo(false);
    }
  }

  // Se equivocaron o cambió la decisión: vuelve a quedar por facturar.
  async function handleVolverAPendiente() {
    setSubiendo(true);
    setError(null);
    try {
      await onGuardarDatos({ facturaEstado: 'pendiente', facturaNota: null, facturaNotaFecha: null });
      setFactura((f) => ({ ...f, estado: 'pendiente', nota: undefined, notaFecha: undefined }));
      registrarAccionGlobal(
        'marco_no_facturable',
        'reporte',
        reportId,
        `Regresó a pendiente de facturar «${empresaCliente}»${folio}`
      );
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar.');
    } finally {
      setSubiendo(false);
    }
  }

  // La política del bucket solo deja leer a quien gestiona la facturación, así
  // que este botón nunca se muestra a los demás. Antes sí aparecía y no hacía
  // nada: createSignedUrl devolvía vacío en silencio y el usuario se quedaba
  // esperando sin explicación.
  async function handleVerFactura() {
    if (!factura.archivoPath) return;
    setError(null);
    const supabase = createClient();
    const { data, error: urlErr } = await supabase.storage
      .from('facturas')
      .createSignedUrl(factura.archivoPath, 3600);

    if (urlErr || !data?.signedUrl) {
      setError('No se pudo abrir la factura. Revisa que tengas permiso de facturación.');
      return;
    }
    setFacturaUrl(data.signedUrl);
  }

  function diasSinFacturar(): number | null {
    if (estado !== 'pendiente' || ahora === null) return null;
    const desde = fechaConcluido || fechaReporte;
    if (!desde) return null;
    const ms = ahora - new Date(desde + 'T00:00:00').getTime();
    const dias = Math.floor(ms / 86400000);
    return dias > 0 ? dias : null;
  }

  const dias = diasSinFacturar();

  if (!servicioConcluido) {
    return (
      <div className="mt-4 p-4 rounded-2xl bg-surface-2 border border-line">
        <p className="text-[12px] text-muted mb-2.5">
          Servicio/proyecto sin finalizar — la facturación se habilita cuando el servicio
          quede marcado como concluido.
        </p>
        {puedeFacturar && (
          <button
            onClick={onMarcarFinalizado}
            disabled={marcandoConcluido}
            className="text-[14px] bg-teal text-inkOnAccent rounded-full px-4 min-h-[44px] inline-flex items-center gap-2 font-semibold active:scale-95 transition-transform disabled:opacity-60"
          >
            {marcandoConcluido ? 'Guardando...' : <><Check size={16} strokeWidth={3} />Marcar servicio como finalizado</>}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 p-4 bg-surface-2 rounded-2xl border border-line">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] uppercase tracking-wider font-bold text-teal">Facturación</div>
        {dias !== null && (
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-red/15 text-red">
            {dias} día{dias === 1 ? '' : 's'} sin facturar
          </span>
        )}
      </div>

      {error && <p className="text-red text-[12.5px] mb-2">{error}</p>}

      {estado === 'facturado' && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Check size={17} strokeWidth={3} className="text-teal shrink-0" />
            <span className="text-[14px] font-semibold">Facturado</span>
          </div>
          {factura.archivoNombre && (
            <p className="text-[12.5px] text-muted mb-2.5">{factura.archivoNombre} · {factura.archivoFecha}</p>
          )}
          {factura.archivoPath && (!puedeFacturar ? (
            <p className="text-[12.5px] text-muted">Solo quien gestiona la facturación puede abrir el archivo.</p>
          ) : facturaUrl ? (
            <a href={facturaUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] bg-teal text-inkOnAccent rounded-full px-4 py-2 font-semibold inline-block">
              Abrir factura
            </a>
          ) : (
            <button onClick={handleVerFactura} className="text-[13px] bg-teal text-inkOnAccent rounded-full px-4 py-2 font-semibold active:scale-95 transition-transform">
              Ver factura (PDF)
            </button>
          ))}
        </div>
      )}

      {estado === 'no_facturable' && (
        <div>
          <p className="text-[14px] font-semibold flex items-center gap-2">
            <Ban size={16} strokeWidth={2.5} className="text-muted shrink-0" />
            No se factura
          </p>
          <p className="text-[13px] text-ink/85 mt-1.5 leading-snug">{factura.nota}</p>
          {factura.notaFecha && <p className="text-[11.5px] text-muted mt-1">Registrado el {factura.notaFecha}</p>}
          {puedeFacturar && (
            <button
              onClick={handleVolverAPendiente}
              disabled={subiendo}
              className="mt-3 text-[13px] border border-line-strong text-ink/80 rounded-full px-4 min-h-[40px] inline-flex items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-60"
            >
              <Undo2 size={14} strokeWidth={2.4} />
              {subiendo ? 'Guardando...' : 'Sí se va a facturar'}
            </button>
          )}
        </div>
      )}

      {estado === 'pendiente' && (
        <div>
          <p className="text-[14px] font-semibold text-amber">Pendiente de facturar</p>
          <p className="text-[12.5px] text-muted mt-1 mb-3 leading-snug">
            {puedeFacturar
              ? 'Se quita cuando este reporte queda ligado a una factura o cuando registras por qué no se factura.'
              : 'Lo atiende quien tiene permiso de facturación.'}
          </p>

          {puedeFacturar && !showNota && (
            <div className="flex gap-2 flex-wrap">
              <a
                href={clienteId ? `/dashboard/facturacion?cliente=${clienteId}&reporte=${reportId}` : '/dashboard/facturacion'}
                className="text-[14px] bg-teal text-inkOnAccent rounded-full px-4 min-h-[44px] inline-flex items-center gap-2 font-semibold active:scale-95 transition-transform"
              >
                <ReceiptText size={16} strokeWidth={2.4} />
                Armar factura
              </a>
              <button
                onClick={() => setShowNota(true)}
                className="text-[13px] border border-line-strong text-ink/80 rounded-full px-4 min-h-[44px] active:scale-95 transition-transform"
              >
                No se va a facturar
              </button>
            </div>
          )}

          {puedeFacturar && showNota && (
            <div>
              <label className="text-[13px] font-medium text-ink/75 block mb-1.5">¿Por qué no se factura?</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {MOTIVOS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setNotaTexto(m)}
                    className={`text-[12.5px] rounded-full px-3 py-1.5 border transition-colors ${notaTexto === m ? 'bg-teal/12 border-teal/45 text-teal font-semibold' : 'border-line bg-surface text-ink/80'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <textarea
                value={notaTexto}
                onChange={(e) => setNotaTexto(e.target.value)}
                placeholder="Elige un motivo o escríbelo"
                className="w-full px-3 py-2 rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[13.5px] min-h-[64px]"
              />
              <p className="text-[12px] text-muted mt-1">El reporte deja de aparecer como pendiente y ya no se ofrece al armar facturas.</p>
              <div className="flex gap-2 mt-2.5">
                <button
                  onClick={() => { setShowNota(false); setNotaTexto(''); setError(null); }}
                  className="text-[13px] border border-line-strong text-ink/80 rounded-full px-4 min-h-[40px] active:scale-95 transition-transform"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleGuardarNota}
                  disabled={subiendo}
                  className="text-[13px] bg-teal text-inkOnAccent rounded-full px-4 min-h-[40px] font-semibold active:scale-95 transition-transform disabled:opacity-60"
                >
                  {subiendo ? 'Guardando...' : 'Guardar motivo'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
