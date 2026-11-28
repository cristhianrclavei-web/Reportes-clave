'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, RefreshCw } from 'lucide-react';
import type { CotizacionInput } from '@/lib/cotizaciones';
import { abrirPdf, imagenDeHoja } from '@/lib/leerPlanoPdf';

// Ventana con la vista previa del PDF de la cotización tal como está
// capturada, sin guardarla. El servidor arma el mismo PDF que al descargarlo
// y aquí cada hoja se convierte en imagen: en el celular y en el APK un PDF
// dentro de la página no se ve, una imagen sí.

// Ancho de cada hoja en pixeles: nítida en pantalla sin pesar demasiado.
const LADO_MAYOR_HOJA = 1600;

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'listo'; hojas: string[] };

async function pedirPdf(cotizacion: CotizacionInput, folio: string): Promise<File> {
  let respuesta: Response;
  try {
    respuesta = await fetch('/api/cotizaciones/vista-previa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cotizacion, folio }),
    });
  } catch {
    throw new Error('Sin conexión: revisa tu señal e intenta de nuevo.');
  }
  if (!respuesta.ok) {
    const datos = await respuesta.json().catch(() => null);
    throw new Error(datos?.error || 'No se pudo armar la vista previa. Intenta de nuevo.');
  }
  const bytes = await respuesta.arrayBuffer();
  return new File([bytes], 'vista-previa.pdf', { type: 'application/pdf' });
}

export default function VistaPreviaCotizacion({
  cotizacion,
  folio,
  onClose,
}: {
  cotizacion: CotizacionInput;
  folio: string;
  onClose: () => void;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });

  const cargar = useCallback(async () => {
    setEstado({ tipo: 'cargando' });
    try {
      const archivo = await pedirPdf(cotizacion, folio);
      const pdf = await abrirPdf(archivo);
      const hojas: string[] = [];
      for (let numero = 1; numero <= pdf.paginas; numero++) {
        hojas.push(await imagenDeHoja(pdf, numero, LADO_MAYOR_HOJA));
      }
      setEstado({ tipo: 'listo', hojas });
    } catch (e: any) {
      setEstado({ tipo: 'error', mensaje: e?.message || 'No se pudo armar la vista previa.' });
    }
  }, [cotizacion, folio]);

  // Se arma una sola vez al abrir: los datos son los del momento del toque.
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape cierra, como cualquier ventana en computadora.
  useEffect(() => {
    function alPresionar(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 flex flex-col" role="dialog" aria-modal="true" aria-label="Vista previa de la cotización">
      <div className="flex items-center gap-3 px-4 py-3 bg-surface border-b border-line">
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold text-[15px] leading-tight">Vista previa</p>
          <p className="text-[12px] text-muted leading-tight">Así saldrá el PDF. Todavía no se guarda.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] px-4 rounded-xl border border-line-strong text-[14px] font-semibold flex items-center gap-1.5 active:scale-95 transition-transform"
        >
          <X size={17} strokeWidth={2.4} /> Cerrar
        </button>
      </div>

      {/* Tocar fuera de las hojas también cierra. */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-6" onClick={onClose}>
        {estado.tipo === 'cargando' && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-white/85">
            <RefreshCw size={26} className="animate-spin" />
            <p className="text-[14px]">Armando la vista previa…</p>
          </div>
        )}

        {estado.tipo === 'error' && (
          <div className="h-full flex items-center justify-center">
            <div className="max-w-sm rounded-2xl bg-surface border border-line p-5 text-center" onClick={(e) => e.stopPropagation()}>
              <p className="text-[14px] text-red mb-4">{estado.mensaje}</p>
              <button
                type="button"
                onClick={cargar}
                className="min-h-[44px] px-5 rounded-xl bg-teal text-inkOnAccent font-semibold text-[14px] active:scale-95 transition-transform"
              >
                Reintentar
              </button>
            </div>
          </div>
        )}

        {estado.tipo === 'listo' && (
          <div className="flex flex-col items-center gap-4">
            {estado.hojas.map((hoja, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={hoja}
                alt={`Hoja ${i + 1} de ${estado.hojas.length}`}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-[860px] bg-white rounded-sm shadow-[0_10px_40px_rgba(0,0,0,0.5)]"
              />
            ))}
            <p className="text-[12px] text-white/70 pb-4">
              {estado.hojas.length === 1 ? '1 hoja' : `${estado.hojas.length} hojas`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
