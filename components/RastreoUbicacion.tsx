'use client';

import { useEffect, useState } from 'react';
import { MapPinOff } from 'lucide-react';
import { abrirAjustesDeUbicacion, iniciarRastreo } from '@/lib/rastreoUbicacion';
import { iniciarAvisosNativos } from '@/lib/pushNativo';

// Arranca el rastreo en la app de Android de Clave (en el navegador no hace
// nada), y sus notificaciones. Si el teléfono no dio el permiso de ubicación, muestra un aviso
// fijo con el botón para abrir los ajustes.
export default function RastreoUbicacion() {
  const [faltaPermiso, setFaltaPermiso] = useState(false);

  useEffect(() => {
    iniciarRastreo(() => setFaltaPermiso(true));
    // Las notificaciones de la app de Android también arrancan aquí.
    iniciarAvisosNativos();
  }, []);

  if (!faltaPermiso) return null;
  return (
    <div role="alert" className="fixed inset-x-3 bottom-3 z-[60] rounded-2xl bg-red text-white p-3.5 shadow-diffuse flex items-start gap-3">
      <MapPinOff size={20} className="shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 text-[13.5px]">
        <p className="font-semibold">Falta el permiso de ubicación</p>
        <p className="opacity-90">Este teléfono de la empresa debe compartir su ubicación en horario de trabajo. En Permisos → Ubicación elige «Permitir todo el tiempo».</p>
        <button
          type="button"
          onClick={() => { setFaltaPermiso(false); abrirAjustesDeUbicacion(); }}
          className="mt-2 min-h-[40px] px-4 rounded-xl bg-white text-red font-semibold"
        >
          Abrir ajustes
        </button>
      </div>
    </div>
  );
}
