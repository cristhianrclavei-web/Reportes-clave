'use client';

import { useEffect, useState } from 'react';
import { Building2, ChevronDown, Plus, Trash2 } from 'lucide-react';
import CampoUbicacionSitio, { ubicacionDeCampos, UBICACION_VACIA, type CamposUbicacion } from '@/components/servicios/CampoUbicacionSitio';
import { showToast } from '@/components/Toast';
import { confirmar } from '@/lib/dialogos';
import { borrarLugarPropio, crearLugarPropio, listarLugaresPropios, type LugarPropio } from '@/lib/visitasDatos';

// Lugares de la empresa (oficina, almacén) para el buscador de visitas: una
// parada ahí sale con su nombre y no como «lugar sin identificar».
// `version` cambia cuando se agrega uno desde los resultados, para recargar la lista.

const RADIOS = [100, 150, 300, 500];

export default function LugaresPropios({ version, onCambio }: { version: number; onCambio: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [lugares, setLugares] = useState<LugarPropio[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [campos, setCampos] = useState<CamposUbicacion>(UBICACION_VACIA);
  const [radio, setRadio] = useState(150);
  const [errorForma, setErrorForma] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function cargar() {
    listarLugaresPropios().then((lista) => { setLugares(lista); setError(null); }).catch((e) => setError(e.message));
  }
  useEffect(cargar, [version]);

  async function guardar() {
    const { ubicacion, incompleta } = ubicacionDeCampos(campos);
    if (!nombre.trim()) {
      setErrorForma('Ponle nombre al lugar, por ejemplo «Oficina».');
      return;
    }
    if (!ubicacion || incompleta) {
      setErrorForma('Falta la ubicación: elige una dirección de la lista, márcala en el mapa o pega un enlace de Google Maps.');
      return;
    }
    setGuardando(true);
    setErrorForma(null);
    try {
      await crearLugarPropio(nombre, ubicacion.lat, ubicacion.lng, radio);
      showToast('Lugar guardado');
      setNombre('');
      setCampos(UBICACION_VACIA);
      setAgregando(false);
      cargar();
      onCambio();
    } catch (e: any) {
      setErrorForma(e?.message || 'No se pudo guardar el lugar. Intenta de nuevo.');
    }
    setGuardando(false);
  }

  async function quitar(lugar: LugarPropio) {
    const seguro = await confirmar(`¿Quitar «${lugar.nombre}» de los lugares propios?\n\nLas paradas ahí volverán a salir como «lugar sin identificar».`);
    if (!seguro) return;
    try {
      await borrarLugarPropio(lugar.id);
      showToast('Lugar quitado');
      cargar();
      onCambio();
    } catch (e: any) {
      showToast(e?.message || 'No se pudo quitar el lugar. Intenta de nuevo.', 'error');
    }
  }

  return (
    <div className="mt-3 rounded-2xl border border-line bg-surface-2/60">
      <button type="button" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto}
        className="w-full min-h-[46px] px-3.5 flex items-center gap-2.5 text-left">
        <Building2 size={17} strokeWidth={2.2} className="text-teal shrink-0" />
        <span className="flex-1 text-[13.5px] font-semibold">Lugares propios (oficina, almacén) · {lugares.length}</span>
        <ChevronDown size={17} className={`text-muted transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div className="px-3.5 pb-3.5">
          <p className="text-[12.5px] text-muted leading-snug mb-2">
            Una parada en estos lugares sale con su nombre y no pide servicio ni reporte.
          </p>
          {error && <p className="text-red font-semibold text-[13px] mb-2">{error}</p>}
          {lugares.map((lugar) => (
            <div key={lugar.id} className="flex items-center gap-2 py-1.5 border-t border-line first:border-t-0">
              <p className="flex-1 min-w-0 text-[13.5px]">
                <b>{lugar.nombre}</b> <span className="text-muted">· {lugar.radio_m} m</span>{' '}
                <a href={`https://www.google.com/maps?q=${lugar.lat},${lugar.lng}`} target="_blank" rel="noopener noreferrer" className="text-teal font-semibold underline text-[12.5px]">ver</a>
              </p>
              <button type="button" onClick={() => quitar(lugar)} aria-label={`Quitar ${lugar.nombre}`} className="w-10 h-10 rounded-lg text-red flex items-center justify-center hover:bg-red/10">
                <Trash2 size={16} strokeWidth={2.2} />
              </button>
            </div>
          ))}

          {!agregando ? (
            <button type="button" onClick={() => setAgregando(true)} className="mt-2 min-h-[42px] px-3.5 rounded-xl border border-teal/50 text-teal text-[13.5px] font-semibold flex items-center gap-1.5">
              <Plus size={16} strokeWidth={2.5} /> Agregar lugar
            </button>
          ) : (
            <div className="mt-2 rounded-xl border border-line bg-surface p-3">
              <label className="block text-[12px] font-semibold text-muted mb-1" htmlFor="lugar-nombre">Nombre</label>
              <input id="lugar-nombre" type="text" maxLength={60} value={nombre} onChange={(ev) => setNombre(ev.target.value)} placeholder="Oficina"
                className="w-full px-3.5 min-h-[44px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14.5px] mb-2.5" />
              <CampoUbicacionSitio valor={campos} onCambio={setCampos} />
              <p className="text-[12px] font-semibold text-muted mt-2.5 mb-1.5">Tamaño del lugar</p>
              <div className="flex flex-wrap gap-1.5">
                {RADIOS.map((metros) => (
                  <button key={metros} type="button" onClick={() => setRadio(metros)}
                    className={`min-h-[38px] px-3 rounded-full border text-[13px] font-semibold ${radio === metros ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line text-ink/80'}`}>
                    {metros} m
                  </button>
                ))}
              </div>
              {errorForma && <p className="text-red font-semibold text-[13px] mt-2">{errorForma}</p>}
              <div className="flex gap-2 mt-3">
                <button type="button" onClick={() => { setAgregando(false); setErrorForma(null); }} disabled={guardando} className="flex-1 min-h-[42px] rounded-xl border border-line-strong text-[13.5px]">Cancelar</button>
                <button type="button" onClick={guardar} disabled={guardando} className="flex-1 min-h-[42px] rounded-xl bg-teal text-inkOnAccent text-[13.5px] font-semibold disabled:opacity-60">
                  {guardando ? 'Guardando…' : 'Guardar lugar'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
