'use client';

import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import { usePerfiles } from '@/lib/perfiles';
import { actualizarProyecto, crearProyecto, validarProyecto, type NuevoProyecto, type Proyecto } from '@/lib/proyectos';
import { SISTEMAS, etapaValida, etapasDe, nombreEtapa, type Etapa, type SistemaClave } from '@/lib/proyectosEtapas';

// Alta y edición de un proyecto (una obra del cliente): nombre, sistemas
// que lleva, etapa, fechas, monto y quién lo lleva.

export const CAMPO = 'w-full px-3.5 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]';
const ETIQUETA = 'block text-[12.5px] text-muted mb-1';
const ERROR = 'block text-red font-semibold text-[13px] mt-1';

export default function FormProyecto({ clienteId, clienteNombre, proyecto, sistemaInicial, onCerrar, onGuardado }: {
  clienteId: string;
  clienteNombre: string;
  // Con proyecto: editarlo. Sin él: crear uno nuevo.
  proyecto?: Proyecto | null;
  sistemaInicial?: SistemaClave;
  onCerrar: () => void;
  onGuardado: (id: string) => void;
}) {
  const perfiles = usePerfiles();
  const supervisores = useMemo(
    () => Object.values(perfiles).filter((p) => p.role === 'supervisor').sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'es')),
    [perfiles],
  );
  const [nombre, setNombre] = useState(proyecto?.nombre || '');
  const [sistemas, setSistemas] = useState<SistemaClave[]>(proyecto?.sistemas || (sistemaInicial ? [sistemaInicial] : []));
  const [etapa, setEtapa] = useState<Etapa>(proyecto?.etapa || 'prospecto');
  const [descripcion, setDescripcion] = useState(proyecto?.descripcion || '');
  const [fechaInicio, setFechaInicio] = useState(proyecto?.fecha_inicio || '');
  const [fechaEntrega, setFechaEntrega] = useState(proyecto?.fecha_entrega || '');
  const [monto, setMonto] = useState(proyecto?.monto != null ? String(proyecto.monto) : '');
  const [moneda, setMoneda] = useState<'MXN' | 'USD'>(proyecto?.moneda || 'MXN');
  const [responsableId, setResponsableId] = useState(proyecto?.responsable_id || '');
  const [errores, setErrores] = useState<ReturnType<typeof validarProyecto>>({});
  const [guardando, setGuardando] = useState(false);

  const montoNumero = monto.trim() === '' ? null : Number(monto.replace(/[$,\s]/g, ''));

  function alternarSistema(clave: SistemaClave) {
    const nuevos = sistemas.includes(clave) ? sistemas.filter((s) => s !== clave) : [...sistemas, clave];
    setSistemas(nuevos);
    setEtapa((e) => etapaValida(e, nuevos));
  }

  async function guardar() {
    const datos: Omit<NuevoProyecto, 'clienteId'> = {
      nombre, sistemas, etapa, descripcion, fechaInicio: fechaInicio || null, fechaEntrega: fechaEntrega || null,
      monto: montoNumero, moneda, responsableId: responsableId || null,
    };
    const faltas = validarProyecto(datos);
    setErrores(faltas);
    if (Object.keys(faltas).length > 0) return;
    setGuardando(true);
    try {
      if (proyecto) {
        await actualizarProyecto(proyecto.id, datos);
        showToast('Proyecto guardado', 'success');
        onGuardado(proyecto.id);
      } else {
        const id = await crearProyecto({ clienteId, ...datos });
        showToast('Proyecto creado', 'success');
        onGuardado(id);
      }
    } catch (e: any) {
      showToast(e?.message || 'No se pudo guardar el proyecto.', 'error');
      setGuardando(false);
    }
  }

  return (
    <ModalOverlay onClose={() => !guardando && onCerrar()}>
      <div className="glass-strong rounded-3xl max-w-lg w-full p-5 max-h-[92vh] overflow-y-auto">
        <p className="font-display font-bold text-[19px]">{proyecto ? 'Editar proyecto' : 'Nuevo proyecto'}</p>
        <p className="text-[13px] text-muted mt-1 mb-4">{clienteNombre}. Un proyecto es una obra o contrato; adentro va cada sistema con sus planos, cotizaciones y servicios.</p>

        <label className="block mb-3"><span className={ETIQUETA}>Nombre</span>
          <input className={CAMPO} value={nombre} maxLength={120} placeholder="Torre A, Casa Ávila 10 kWp, Póliza 2027…" onChange={(e) => setNombre(e.target.value)} />
          {errores.nombre && <span className={ERROR}>{errores.nombre}</span>}</label>

        <fieldset className="mb-3">
          <legend className={ETIQUETA}>Sistemas que lleva</legend>
          <div className="grid grid-cols-2 gap-1.5">
            {SISTEMAS.map((s) => {
              const activo = sistemas.includes(s.clave);
              return (
                <button key={s.clave} type="button" aria-pressed={activo} onClick={() => alternarSistema(s.clave)}
                  className={`min-h-[44px] px-3 rounded-xl border text-left text-[14px] flex items-center gap-2 ${activo ? 'border-teal bg-teal/10 font-semibold' : 'border-line bg-surface-2'}`}>
                  <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${activo ? 'bg-teal border-teal text-inkOnAccent' : 'border-line-strong'}`}>
                    {activo && <Check size={13} strokeWidth={3} />}
                  </span>
                  {s.nombre}
                </button>
              );
            })}
          </div>
          {errores.sistemas && <span className={ERROR}>{errores.sistemas}</span>}
        </fieldset>

        <label className="block mb-3"><span className={ETIQUETA}>Etapa</span>
          <select className={CAMPO} value={etapa} onChange={(e) => setEtapa(e.target.value as Etapa)}>
            {[...etapasDe(sistemas), 'cancelado' as Etapa].map((x) => <option key={x} value={x}>{nombreEtapa(x, sistemas)}</option>)}
          </select></label>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <label><span className={ETIQUETA}>Inicio</span>
            <input type="date" className={CAMPO} value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} /></label>
          <label><span className={ETIQUETA}>Entrega comprometida</span>
            <input type="date" className={CAMPO} value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} /></label>
          {errores.fechas && <span className={`${ERROR} col-span-2 -mt-1`}>{errores.fechas}</span>}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2 mb-3">
          <label><span className={ETIQUETA}>Monto del proyecto (opcional)</span>
            <input className={CAMPO} inputMode="decimal" value={monto} placeholder="Sin IVA" onChange={(e) => setMonto(e.target.value)} />
            {errores.monto && <span className={ERROR}>{errores.monto}</span>}</label>
          <label><span className={ETIQUETA}>Moneda</span>
            <select className={CAMPO} value={moneda} onChange={(e) => setMoneda(e.target.value as 'MXN' | 'USD')}>
              <option value="MXN">MXN</option><option value="USD">USD</option>
            </select></label>
        </div>

        <label className="block mb-3"><span className={ETIQUETA}>Responsable</span>
          <select className={CAMPO} value={responsableId} onChange={(e) => setResponsableId(e.target.value)}>
            <option value="">Sin asignar</option>
            {supervisores.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select></label>

        <label className="block mb-3"><span className={ETIQUETA}>Descripción (opcional)</span>
          <textarea className={`${CAMPO} py-2.5 min-h-[72px]`} value={descripcion} maxLength={2000} placeholder="Alcance, notas del sitio…" onChange={(e) => setDescripcion(e.target.value)} /></label>

        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCerrar} disabled={guardando} className="flex-1 min-h-[50px] rounded-2xl border border-line-strong font-semibold text-[14.5px] disabled:opacity-60">Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando} className="flex-1 min-h-[50px] rounded-2xl bg-teal text-inkOnAccent font-semibold text-[14.5px] disabled:opacity-60">
            {guardando ? 'Guardando…' : proyecto ? 'Guardar' : 'Crear proyecto'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
