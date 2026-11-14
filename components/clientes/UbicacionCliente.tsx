'use client';

import { useEffect, useState } from 'react';
import { Check, ExternalLink, MapPin, Pencil } from 'lucide-react';
import CampoUbicacionSitio, { camposDeUbicacion, ubicacionDeCampos, UBICACION_VACIA, type CamposUbicacion } from '@/components/servicios/CampoUbicacionSitio';
import { showToast } from '@/components/Toast';
import { RADIOS_CLIENTE, RADIO_CLIENTE_M } from '@/lib/visitas';
import { guardarUbicacionCliente, ubicacionDeCliente, type UbicacionCliente as Ubicacion } from '@/lib/visitasDatos';

// Ubicación del cliente en el mapa (ficha del cliente). Sirve para dos cosas:
// el buscador de visitas la compara con el rastreo de los técnicos, y al
// agendar un servicio de este cliente la ubicación se llena sola.

const textoRadio = (metros: number) => (metros >= 1000 ? `${metros / 1000} km` : `${metros} m`);

export default function UbicacionCliente({ clienteId }: { clienteId: string }) {
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null);
  const [radio, setRadio] = useState<number>(RADIO_CLIENTE_M);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState(false);
  const [campos, setCampos] = useState<CamposUbicacion>(UBICACION_VACIA);
  const [radioEdit, setRadioEdit] = useState<number>(RADIO_CLIENTE_M);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ubicacionDeCliente(clienteId)
      .then((r) => { setUbicacion(r.ubicacion); setRadio(r.radio); })
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [clienteId]);

  function abrirEdicion() {
    setCampos(camposDeUbicacion(ubicacion));
    setRadioEdit(radio);
    setError(null);
    setEditando(true);
  }

  async function guardar() {
    const { ubicacion: nueva, incompleta } = ubicacionDeCampos(campos);
    if (incompleta) {
      setError('La ubicación está incompleta: faltan la latitud o la longitud. Elige una dirección de la lista o márcala en el mapa.');
      return;
    }
    if (nueva && (Math.abs(nueva.lat) > 90 || Math.abs(nueva.lng) > 180)) {
      setError('Esas coordenadas no existen. Revisa la latitud y la longitud.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await guardarUbicacionCliente(clienteId, nueva, radioEdit);
      setUbicacion(nueva);
      setRadio(radioEdit);
      setEditando(false);
      showToast(nueva ? 'Ubicación del cliente guardada' : 'Ubicación quitada');
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar la ubicación. Intenta de nuevo.');
    }
    setGuardando(false);
  }

  return (
    <div className="glass rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5"><MapPin size={13} strokeWidth={2.4} /> Ubicación en el mapa</p>
        {!editando && !cargando && (
          <button type="button" onClick={abrirEdicion} className="text-teal text-[12.5px] font-semibold flex items-center gap-1 active:scale-95 transition-transform">
            <Pencil size={13} strokeWidth={2.4} /> {ubicacion ? 'Cambiar' : 'Capturar'}
          </button>
        )}
      </div>

      {cargando && <p className="text-[13px] text-muted">Cargando…</p>}

      {!cargando && !editando && (
        ubicacion ? (
          <div>
            <p className="text-[14px] leading-snug">{ubicacion.direccion || `${ubicacion.lat.toFixed(5)}, ${ubicacion.lng.toFixed(5)}`}</p>
            <p className="text-[12.5px] text-muted mt-1">
              Cuenta como visita estar a {textoRadio(radio)} o menos.{' '}
              <a href={`https://www.google.com/maps?q=${ubicacion.lat},${ubicacion.lng}`} target="_blank" rel="noopener noreferrer" className="text-teal font-semibold inline-flex items-center gap-1">
                Abrir en Maps <ExternalLink size={12} />
              </a>
            </p>
          </div>
        ) : (
          <p className="text-[13px] text-muted leading-snug">
            Sin ubicación. Con ella, el mapa de técnicos puede decir qué días estuvieron aquí y al agendar un servicio la ubicación se llena sola.
          </p>
        )
      )}
      {!editando && error && <p className="text-red font-semibold text-[13px] mt-1.5">{error}</p>}

      {editando && (
        <div>
          <CampoUbicacionSitio valor={campos} onCambio={setCampos} />
          <p className="text-[12px] font-semibold text-muted mt-3 mb-1.5">¿Qué tan cerca cuenta como «estuvo con el cliente»?</p>
          <div className="flex flex-wrap gap-1.5">
            {RADIOS_CLIENTE.map((metros) => (
              <button key={metros} type="button" onClick={() => setRadioEdit(metros)}
                className={`min-h-[38px] px-3 rounded-full border text-[13px] font-semibold ${radioEdit === metros ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line text-ink/80'}`}>
                {textoRadio(metros)}
              </button>
            ))}
          </div>
          <p className="text-[12px] text-muted mt-1.5 leading-snug">200 m va bien para un edificio o una nave. Usa 500 m o 1 km solo en sitios muy grandes (un parque industrial, un fraccionamiento): mientras más grande, más fácil confundirlo con un vecino.</p>
          {error && <p className="text-red font-semibold text-[13px] mt-2">{error}</p>}
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={() => { setEditando(false); setError(null); }} disabled={guardando} className="flex-1 min-h-[42px] rounded-xl border border-line-strong text-[13.5px]">Cancelar</button>
            <button type="button" onClick={guardar} disabled={guardando} className="flex-1 min-h-[42px] rounded-xl bg-teal text-inkOnAccent text-[13.5px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60">
              <Check size={15} strokeWidth={2.6} /> {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
