'use client';

import { useState, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabaseClient';
import { registrarAccionGlobal } from '@/lib/auditoriaGlobal';
import { Check, FileText } from 'lucide-react';

// Bloque de facturación del detalle de un reporte.
//
// Se separó de ReportDetailModal porque es la parte con frontera más limpia:
// todo lo que necesita de fuera son tres cosas —el reporte, si el servicio ya
// está concluido, y cómo guardar cambios en report.data—. El resto (subir el
// PDF, registrar el motivo de no facturación, abrir el archivo) vive aquí y
// en ningún otro lado.
//
// El botón de «marcar servicio como finalizado» aparece dentro de este bloque
// pero no pertenece a facturación: es del flujo de revisión. Se renderiza aquí
// porque es donde el usuario lo busca —cuando ve que no puede facturar— y se
// recibe por props para no arrastrar ese flujo dentro del componente.

export type EstadoFactura = 'pendiente' | 'facturado' | 'en_proceso' | null | undefined;

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
}) {
  const [factura, setFactura] = useState<Factura>(datosFactura);
  const [facturaUrl, setFacturaUrl] = useState<string | null>(null);
  const [showNota, setShowNota] = useState(false);
  const [notaTexto, setNotaTexto] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // "Días sin facturar" depende de la hora del navegador, que puede no
  // coincidir con la del servidor (Vercel corre en UTC) — ver el comentario
  // en components/SelectorSemana.tsx. Mismo patrón: arranca en null (mismo
  // valor en servidor y primer render del cliente) y se corrige ya montado.
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => setAhora(Date.now()), []);

  const folio = claveFormato ? ` (folio ${claveFormato})` : '';

  async function handleSubirFactura(file: File) {
    if (file.type !== 'application/pdf') {
      setError('El archivo debe ser un PDF.');
      return;
    }
    setSubiendo(true);
    setError(null);
    try {
      const supabase = createClient();
      const path = `${reportId}/factura-${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from('facturas')
        .upload(path, file, { contentType: 'application/pdf' });
      if (upErr) throw upErr;

      const fecha = new Date().toLocaleDateString('es-MX');
      await onGuardarDatos({
        facturaEstado: 'facturado',
        facturaArchivo: { path, nombre: file.name, fecha },
        facturaNota: null,
      });
      setFactura((f) => ({
        ...f,
        estado: 'facturado',
        archivoPath: path,
        archivoNombre: file.name,
        archivoFecha: fecha,
      }));
      registrarAccionGlobal(
        'subio_factura',
        'reporte',
        reportId,
        `Subió factura del reporte de «${empresaCliente}»${folio}`
      );
    } catch (e: any) {
      setError(e?.message || 'No se pudo subir la factura.');
    } finally {
      setSubiendo(false);
    }
  }

  async function handleGuardarNota() {
    if (!notaTexto.trim()) {
      setError('Escribe el motivo.');
      return;
    }
    setSubiendo(true);
    setError(null);
    try {
      const fecha = new Date().toLocaleDateString('es-MX');
      await onGuardarDatos({
        facturaEstado: 'en_proceso',
        facturaNota: notaTexto.trim(),
        facturaNotaFecha: fecha,
      });
      setFactura((f) => ({ ...f, estado: 'en_proceso', nota: notaTexto.trim(), notaFecha: fecha }));
      registrarAccionGlobal(
        'marco_no_facturable',
        'reporte',
        reportId,
        `Registró motivo de no facturación en «${empresaCliente}»: ${notaTexto.trim()}`
      );
      setShowNota(false);
      setNotaTexto('');
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar la nota.');
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
    if (factura.estado === 'facturado' || ahora === null) return null;
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

      {factura.estado === 'facturado' ? (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Check size={17} strokeWidth={3} className="text-teal shrink-0" />
            <span className="text-[14px] font-semibold">Facturado</span>
          </div>
          <p className="text-[12px] text-muted mb-2.5">
            {factura.archivoNombre} · {factura.archivoFecha}
          </p>

          {error && <p className="text-red text-[12px] mb-2">{error}</p>}

          {!puedeFacturar ? (
            <p className="text-[12px] text-muted">
              Solo quien gestiona la facturación puede abrir el archivo.
            </p>
          ) : facturaUrl ? (
            <a
              href={facturaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs bg-teal text-inkOnAccent rounded-full px-4 py-2 font-semibold inline-block"
            >
              Abrir factura
            </a>
          ) : (
            <button
              onClick={handleVerFactura}
              className="text-xs bg-teal text-inkOnAccent rounded-full px-4 py-2 font-semibold active:scale-95 transition-transform"
            >
              Ver factura (PDF)
            </button>
          )}
        </div>
      ) : (
        <div>
          {factura.estado === 'en_proceso' && (
            <div className="mb-3 p-3 rounded-xl bg-red/10 border border-red/25">
              <p className="text-[12px] font-semibold text-red mb-1">En proceso — no se pudo facturar</p>
              <p className="text-[12px] text-ink/80">{factura.nota}</p>
              <p className="text-[11px] text-muted mt-1">{factura.notaFecha}</p>
            </div>
          )}

          {!puedeFacturar ? (
            <p className="text-[12px] text-muted">
              {factura.estado === 'en_proceso' ? 'Pendiente de resolver.' : 'Aún no se ha facturado.'}{' '}
              Solo Ing. Everardo Sánchez, Lic. María Clara Zepeda o Lic. Julio Gómez pueden
              gestionar la facturación.
            </p>
          ) : (
            <>
              {error && <p className="text-red text-[12px] mb-2">{error}</p>}

              <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleSubirFactura(f);
                }}
              />

              {!showNota ? (
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => inputRef.current?.click()}
                    disabled={subiendo}
                    className="text-[14px] bg-teal text-inkOnAccent rounded-full px-4 min-h-[44px] inline-flex items-center gap-2 font-semibold active:scale-95 transition-transform disabled:opacity-60"
                  >
                    {subiendo ? 'Subiendo...' : <><FileText size={16} strokeWidth={2.4} />Facturar (subir PDF)</>}
                  </button>
                  <button
                    onClick={() => setShowNota(true)}
                    className="text-xs border border-line-strong text-ink/80 rounded-full px-4 py-2 active:scale-95 transition-transform"
                  >
                    No se puede facturar
                  </button>
                </div>
              ) : (
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-muted block mb-1.5">
                    ¿Por qué no se puede facturar?
                  </label>
                  <textarea
                    value={notaTexto}
                    onChange={(e) => setNotaTexto(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[13px] min-h-[70px]"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => { setShowNota(false); setNotaTexto(''); }}
                      className="text-xs border border-line-strong text-ink/80 rounded-full px-4 py-2 active:scale-95 transition-transform"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleGuardarNota}
                      disabled={subiendo}
                      className="text-xs bg-amber text-inkOnAccent rounded-full px-4 py-2 font-semibold active:scale-95 transition-transform disabled:opacity-60"
                    >
                      {subiendo ? 'Guardando...' : 'Guardar nota'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
