'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabaseClient';
import { registrarAccionGlobal } from '@/lib/auditoriaGlobal';
import SignaturePad, { SignaturePadHandle } from './SignaturePad';
import { Check } from 'lucide-react';

// Bloque de revisión final: la firma que da por completado un reporte.
//
// El estado `revision` NO vive aquí. Se queda en el modal porque también
// alimenta el chip del encabezado —«Completado» contra «Pendiente de
// revisión»—, y tener dos copias del mismo dato es cómo se llega a que la
// firma aparezca abajo pero el título siga diciendo pendiente.
//
// Así que este componente recibe la revisión ya hecha, y cuando se firma
// avisa hacia arriba. Lo que sí es suyo es todo lo transitorio: si el panel
// de firma está abierto, si se está guardando, el error, y el lienzo.

export type Revision = {
  nombre?: string;
  data?: string;
  fecha?: string;
};

export default function RevisionFinalSection({
  reportId,
  empresaCliente,
  claveFormato,
  reportData,
  revision,
  puedeAprobar,
  onAprobada,
}: {
  reportId: string;
  empresaCliente: string;
  claveFormato?: string;
  reportData: any;
  revision: Revision;
  puedeAprobar: boolean;
  onAprobada: (r: Revision) => void;
}) {
  const [mostrandoFirma, setMostrandoFirma] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firmaRef = useRef<SignaturePadHandle>(null);

  async function handleAprobar() {
    if (!firmaRef.current || firmaRef.current.isEmpty()) {
      setError('Falta la firma.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles').select('full_name').eq('id', user!.id).single();

      const nombre = profile?.full_name || user?.email || 'Revisor';
      const firmaData = firmaRef.current.getDataURL();
      const fecha = new Date().toLocaleDateString('es-MX');

      const newData = {
        ...reportData,
        revisionEstado: 'aprobado',
        firmaRevisionNombre: nombre,
        firmaRevisionData: firmaData,
        firmaRevisionFecha: fecha,
      };
      const { error: errUpdate } = await supabase
        .from('reports').update({ data: newData }).eq('id', reportId);
      if (errUpdate) throw errUpdate;

      onAprobada({ nombre, data: firmaData || undefined, fecha });
      setMostrandoFirma(false);

      const folio = claveFormato ? ` (folio ${claveFormato})` : '';
      registrarAccionGlobal(
        'aprobo_revision',
        'reporte',
        reportId,
        `Aprobó la revisión final del reporte de «${empresaCliente}»${folio}`
      );
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar la firma. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mt-5 p-4 bg-surface-2 rounded-2xl border border-line">
      <div className="text-[11px] uppercase tracking-wider font-bold text-teal mb-3">
        Revisión final
      </div>

      {revision.data ? (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Check size={17} strokeWidth={3} className="text-teal shrink-0" />
            <span className="text-[14px] font-semibold">Aprobado por {revision.nombre}</span>
          </div>
          <p className="text-[12px] text-muted mb-2">{revision.fecha}</p>
          <img
            src={revision.data}
            alt="Firma de revisión"
            className="w-full max-w-[300px] rounded-xl border border-line bg-surface"
          />
        </div>
      ) : (
        <div>
          <p className="text-[13px] text-ink/80 mb-3">
            Este reporte está <b>pendiente de firma del Ing. Everardo Sánchez</b>. No se
            considera completado hasta que la revisión final quede firmada.
          </p>

          {puedeAprobar && !mostrandoFirma && (
            <button
              onClick={() => setMostrandoFirma(true)}
              className="text-xs bg-teal text-inkOnAccent rounded-full px-4 py-2 font-semibold active:scale-95 transition-transform"
            >
              Revisar y firmar
            </button>
          )}

          {puedeAprobar && mostrandoFirma && (
            <div>
              <div className="rounded-xl overflow-hidden border border-line mb-2">
                <SignaturePad ref={firmaRef} height={130} />
              </div>
              {error && <p className="text-red text-[12px] mb-2">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => setMostrandoFirma(false)}
                  className="text-xs border border-line-strong text-ink/80 rounded-full px-4 py-2 active:scale-95 transition-transform"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAprobar}
                  disabled={guardando}
                  className="text-[14px] bg-teal text-inkOnAccent rounded-full px-4 min-h-[44px] inline-flex items-center gap-2 font-semibold active:scale-95 transition-transform disabled:opacity-60"
                >
                  {guardando ? 'Guardando...' : 'Confirmar aprobación'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
