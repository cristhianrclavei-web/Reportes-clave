'use client';

import { useState } from 'react';
import ModalOverlay from '@/components/ModalOverlay';
import AutocompletarCliente from '@/components/AutocompletarCliente';
import { showToast } from '@/components/Toast';
import { confirmar } from '@/lib/dialogos';
import { Panel } from '@/lib/lazos';
import { actualizarPanel, borrarPanel, crearPanel } from '@/lib/lazosDatos';

// Alta y edición de un panel: nombre, modelo y dónde está. Sus circuitos
// (SLC, NAC, voceo) se agregan después desde la pantalla del panel. Pide
// señal, como crear un lazo: se hace una vez.

const CAMPO = 'w-full px-3.5 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]';

type Errores = Partial<Record<'cliente' | 'nombre', string>>;

export default function FormPanel({ panel, clienteInicial, esSupervisor, onCerrar, onGuardado }: {
  // Con panel: editar. Sin panel: crear uno nuevo.
  panel?: Panel;
  clienteInicial: { id: string; nombre: string } | null;
  esSupervisor: boolean;
  onCerrar: () => void;
  onGuardado: (panel: Panel | null) => void;
}) {
  const [cliente, setCliente] = useState(clienteInicial?.nombre || '');
  const [clienteId, setClienteId] = useState<string | null>(panel?.cliente_id || clienteInicial?.id || null);
  const [nombre, setNombre] = useState(panel?.nombre || 'Panel principal');
  const [modelo, setModelo] = useState(panel?.modelo || '');
  const [ubicacion, setUbicacion] = useState(panel?.ubicacion || '');
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function validar(): Errores {
    const e: Errores = {};
    if (!clienteId) e.cliente = 'Elige el cliente de la lista. Si no existe, pide a supervisión que lo dé de alta.';
    if (!nombre.trim()) e.nombre = 'Ponle un nombre, por ejemplo «Panel principal» o «Panel torre A».';
    return e;
  }

  async function guardar() {
    const e = validar();
    setErrores(e);
    setErrorGeneral(null);
    if (Object.keys(e).length > 0) return;
    setGuardando(true);
    const datos = { nombre: nombre.trim(), modelo: modelo.trim() || null, ubicacion: ubicacion.trim() || null };
    try {
      if (panel) {
        await actualizarPanel(panel.id, datos);
        showToast('Panel guardado');
        onGuardado({ ...panel, ...datos });
      } else {
        const nuevo = await crearPanel({ ...datos, cliente_id: clienteId as string });
        showToast('Panel creado');
        onGuardado(nuevo);
      }
    } catch (err: any) {
      setErrorGeneral(err?.message || 'No se pudo guardar el panel.');
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!panel) return;
    const ok = await confirmar(`¿Borrar el panel «${panel.nombre}»?`, {
      detalle: 'Sus lazos y circuitos NO se borran: quedan sueltos en la lista del cliente.',
      textoAceptar: 'Borrar panel',
      tono: 'peligro',
    });
    if (!ok) return;
    try {
      await borrarPanel(panel.id);
      showToast('Panel borrado');
      onGuardado(null);
    } catch (err: any) {
      setErrorGeneral(err?.message || 'No se pudo borrar el panel.');
    }
  }

  return (
    <ModalOverlay onClose={() => !guardando && onCerrar()}>
      <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[88vh] overflow-y-auto">
        <h2 className="font-display font-bold text-[22px] mb-4">{panel ? 'Datos del panel' : 'Nuevo panel'}</h2>

        {!panel && (
          <>
            <label className="block text-[13px] text-muted mb-1.5">Cliente</label>
            <AutocompletarCliente
              value={cliente}
              onChange={(n, id) => { setCliente(n); setClienteId(id); }}
              className={CAMPO}
              placeholder="Escribe para buscar"
              soloSugerir
            />
            {errores.cliente && <p className="text-red font-semibold text-[13px] mt-1">{errores.cliente}</p>}
          </>
        )}

        <label htmlFor="panel-nombre" className={`block text-[13px] text-muted mb-1.5 ${panel ? '' : 'mt-4'}`}>Nombre</label>
        <input id="panel-nombre" value={nombre} onChange={(ev) => setNombre(ev.target.value)} maxLength={80} placeholder="Panel principal" className={CAMPO} />
        {errores.nombre && <p className="text-red font-semibold text-[13px] mt-1">{errores.nombre}</p>}

        <label htmlFor="panel-modelo" className="block text-[13px] text-muted mt-4 mb-1.5">Marca y modelo</label>
        <input id="panel-modelo" value={modelo} onChange={(ev) => setModelo(ev.target.value)} maxLength={120} placeholder="Firelite ES-1000X" className={CAMPO} />

        <label htmlFor="panel-ubicacion" className="block text-[13px] text-muted mt-4 mb-1.5">Dónde está</label>
        <input id="panel-ubicacion" value={ubicacion} onChange={(ev) => setUbicacion(ev.target.value)} maxLength={160} placeholder="Cuarto eléctrico, nivel -2" className={CAMPO} />


        {errorGeneral && <p className="text-red font-semibold text-[13px] mt-3">{errorGeneral}</p>}

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onCerrar} disabled={guardando} className="flex-1 min-h-[48px] rounded-xl bg-surface-2 border border-line font-semibold text-[14.5px]">Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando} className="flex-[1.4] min-h-[48px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[14.5px] disabled:opacity-60">
            {guardando ? 'Guardando…' : panel ? 'Guardar' : 'Crear panel'}
          </button>
        </div>
        {panel && esSupervisor && (
          <button type="button" onClick={borrar} className="w-full mt-2 min-h-[44px] rounded-xl text-red text-[13.5px] font-medium hover:bg-red/10">Borrar este panel</button>
        )}
      </div>
    </ModalOverlay>
  );
}
