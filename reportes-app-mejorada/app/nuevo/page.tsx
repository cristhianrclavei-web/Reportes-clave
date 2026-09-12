'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabaseClient';
import { listarVehiculos, listarPersonal, vehiculosEnCache, personalEnCache, Vehiculo, Persona } from '@/lib/catalogos';
import AutocompletarPersona, { GrupoSugerencias } from '@/components/AutocompletarPersona';
import SignaturePad, { SignaturePadHandle } from '@/components/SignaturePad';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/LogoutButton';
import { saveOfflineReport, fileToDataUrl, countOfflineReports } from '@/lib/offlineQueue';
import { showToast } from '@/components/Toast';
import SavingOverlay from '@/components/SavingOverlay';
import ReportPreviewModal, { PreviewData } from '@/components/ReportPreviewModal';
import { listarMisServicios, vincularReporteAServicio, Servicio, filtrarSiguienteDiaPorGrupo, listarTecnicosDeServicio } from '@/lib/serviciosProgramados';
import { X, Camera, Images, Plus, AlertTriangle, Eye } from 'lucide-react';
import { generarUUID } from '@/lib/uuid';
import { notificar } from '@/lib/push';
import { evaluarVentanaServicio } from '@/lib/ventanaServicio';
import Logo from '@/components/Logo';
import { hoyLocal } from '@/lib/fechaHoy';

const TIPOS = ['Instalación nueva', 'Mantenimiento', 'Otro'];
const SUBTIPOS = ['Correctivo', 'Preventivo'];
const SEGURIDAD_OPTS = ['CCTV', 'Automatización', 'Alarma&Det', 'Control de acceso', 'Alarma intrusión', 'Red contra incendio', 'Supresión', 'Inst. eléctricas', 'Paneles solares', 'Otra'];

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal-glow text-[15px] transition-colors placeholder:text-faint';
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5';
const cardCls = 'glass rounded-2xl p-4';
const cardTitleCls = 'font-display font-semibold text-[13px] uppercase tracking-wider text-teal mb-3.5 flex items-center gap-2';

function chipCls(selected: boolean) {
  return `px-3.5 py-2 rounded-full text-[13px] font-medium mr-2 mb-2 inline-block cursor-pointer active:scale-95 transition-all border ${
    selected ? 'bg-teal text-inkOnAccent border-teal shadow-glow-teal' : 'bg-surface-2 text-ink/80 border-line'
  }`;
}

type CasoPunto = { definicion: string; descripcion: string; analisis: string; plan: string; resultados: string; pasosFuturos: string };
const EMPTY_PUNTO: CasoPunto = { definicion: '', descripcion: '', analisis: '', plan: '', resultados: '', pasosFuturos: '' };
const CASO_FIELDS: Array<{ key: keyof CasoPunto; label: string }> = [
  { key: 'definicion', label: 'Definición del problema' },
  { key: 'descripcion', label: 'Descripción del problema' },
  { key: 'analisis', label: 'Análisis del problema' },
  { key: 'plan', label: 'Plan de implementación' },
  { key: 'resultados', label: 'Resultados' },
  { key: 'pasosFuturos', label: 'Pasos futuros' },
];

// Evita que una llamada de red se quede esperando para siempre (por ejemplo,
// si el celular "cree" que tiene señal pero en realidad no hay datos reales).
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Tiempo de espera agotado (${label})`)), ms)),
  ]);
}

function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
}

function PuntoList({ puntos, onChange }: { puntos: CasoPunto[]; onChange: (v: CasoPunto[]) => void }) {
  function updateField(i: number, field: keyof CasoPunto, value: string) {
    onChange(puntos.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)));
  }
  function remove(i: number) {
    onChange(puntos.length > 1 ? puntos.filter((_, idx) => idx !== i) : [EMPTY_PUNTO]);
  }
  function add() {
    onChange([...puntos, { ...EMPTY_PUNTO }]);
  }
  return (
    <div>
      {puntos.map((p, i) => (
        <div key={i} className="mb-4 p-3 rounded-xl bg-surface-2 border border-line">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-teal">Punto {i + 1}</span>
            <button type="button" onClick={() => remove(i)} className="text-red text-sm active:scale-90 transition-transform">
              <X size={19} strokeWidth={2.6} />
            </button>
          </div>
          {CASO_FIELDS.map(({ key, label }) => (
            <div key={key} className="mb-2 last:mb-0">
              <label className={labelCls}>{label}</label>
              <textarea
                value={p[key]}
                onChange={(e) => updateField(i, key, e.target.value)}
                className={`${inputCls} min-h-[34px] resize-y`}
              />
            </div>
          ))}
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="w-full mt-1 border border-dashed border-teal/50 text-teal py-2 rounded-xl text-[13px] font-medium active:scale-95 transition-transform"
      >
        + Agregar punto
      </button>
    </div>
  );
}


function PointList({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  function update(i: number, value: string) {
    onChange(items.map((it, idx) => (idx === i ? value : it)));
  }
  function remove(i: number) {
    onChange(items.length > 1 ? items.filter((_, idx) => idx !== i) : ['']);
  }
  function add() {
    onChange([...items, '']);
  }
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-2 mb-2">
          <div className="w-5 h-[38px] flex items-center justify-center text-xs font-bold text-muted shrink-0">{i + 1}.</div>
          <textarea
            value={it}
            onChange={(e) => update(i, e.target.value)}
            placeholder={`${placeholder} ${i + 1}...`}
            className={`${inputCls} min-h-[38px] flex-1 resize-y`}
          />
          <button type="button" onClick={() => remove(i)} className="text-red text-base shrink-0 mt-2 active:scale-90 transition-transform">
            <X size={19} strokeWidth={2.6} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="w-full mt-1 border border-dashed border-teal/50 text-teal py-2 rounded-xl text-[13px] font-medium active:scale-95 transition-transform"
      >
        + Agregar punto
      </button>
    </div>
  );
}

export default function NuevoReportePage() {
  const supabase = createClient();
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [userId, setUserId] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);


  const [empresaCliente, setEmpresaCliente] = useState('');
  const [serviciosAsignados, setServiciosAsignados] = useState<Servicio[]>([]);
  const [servicioSeleccionadoId, setServicioSeleccionadoId] = useState<string | null>(null);
  // Personal que el supervisor asignó al servicio elegido — se ofrece como
  // sugerencia tocable; los campos siguen siendo de escritura libre por si
  // fue alguien que no estaba agendado.
  const [personalAsignado, setPersonalAsignado] = useState<string[]>([]);
  const [fecha, setFecha] = useState(hoyLocal());
  const [ordCompra, setOrdCompra] = useState('');
  const [horaLlegada, setHoraLlegada] = useState('');
  const [horaSalida, setHoraSalida] = useState('');
  const [listaConceptos, setListaConceptos] = useState('');
  const [contactoUsuario, setContactoUsuario] = useState('');
  const [puestoArea, setPuestoArea] = useState('');
  const [vehiculo, setVehiculo] = useState('');
  const [placas, setPlacas] = useState('');
  // Se parte de la copia local para que la lista esté desde el primer render
  // aunque no haya señal; después se refresca si se puede.
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>(() => vehiculosEnCache());
  const [personal, setPersonal] = useState<Persona[]>(() => personalEnCache());
  const [vehiculoOtro, setVehiculoOtro] = useState(false);
  const [manejadoPor, setManejadoPor] = useState('');
  const [ingACargo, setIngACargo] = useState('');
  const [personalAdicional, setPersonalAdicional] = useState<string[]>(['']);
  const [tipoServicio, setTipoServicio] = useState<string | null>(null);
  const [subTipo, setSubTipo] = useState<string | null>(null);
  const [tipoServicioOtroTexto, setTipoServicioOtroTexto] = useState('');
  const [seguridad, setSeguridad] = useState<string[]>([]);
  const [seguridadOtraTexto, setSeguridadOtraTexto] = useState('');
  const TUBERIA_TYPES = ['Roscada', 'Ajuste', 'Ranurada', 'Otra'] as const;
  const [tuberia, setTuberia] = useState<Record<string, { active: boolean; medida: string; metros: string; especifica: string }>>({
    Roscada: { active: false, medida: '', metros: '', especifica: '' },
    Ajuste: { active: false, medida: '', metros: '', especifica: '' },
    Ranurada: { active: false, medida: '', metros: '', especifica: '' },
    Otra: { active: false, medida: '', metros: '', especifica: '' },
  });
  const [cables, setCables] = useState([{ tipo: '', calibre: '', metros: '' }]);
  const [observaciones, setObservaciones] = useState('');
  const [actividades, setActividades] = useState<string[]>(['']);
  const [showCaso, setShowCaso] = useState(false);
  const [casoPuntos, setCasoPuntos] = useState<CasoPunto[]>([{ ...EMPTY_PUNTO }]);
  const [equipos, setEquipos] = useState([{ cant: '', desc: '', modelo: '', marca: '', serie: '' }]);
  const [firmaIngNombre, setFirmaIngNombre] = useState('');
  const [firmaClienteNombre, setFirmaClienteNombre] = useState('');
  const [servicioConcluido, setServicioConcluido] = useState<'si' | 'no' | null>(null);
  const sigIngRef = useRef<SignaturePadHandle>(null);
  const sigClienteRef = useRef<SignaturePadHandle>(null);
  const [fotos, setFotos] = useState<{ file: File; previewUrl: string; caption: string }[]>([]);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const fotoGaleriaRef = useRef<HTMLInputElement>(null);

  // Al elegir un servicio asignado: se llena el cliente y se traen los
  // técnicos que el supervisor le asignó, para ofrecerlos como sugerencia.
  async function handleSeleccionServicio(id: string) {
    if (!id) {
      setServicioSeleccionadoId(null);
      setPersonalAsignado([]);
      return;
    }
    setServicioSeleccionadoId(id);
    const s = serviciosAsignados.find((x) => x.id === id);
    if (s) setEmpresaCliente(s.proyecto);
    try {
      const nombres = await listarTecnicosDeServicio(id);
      setPersonalAsignado(nombres);
    } catch {
      // sin conexión no se puede consultar: los campos siguen siendo manuales
      setPersonalAsignado([]);
    }
  }

  // Campos sin los que el reporte no sirve como comprobante del servicio.
  // Se calcula en vivo para avisar antes de que el técnico intente guardar,
  // no después.
  const faltantes = useMemo(() => {
    const f: string[] = [];
    if (!empresaCliente.trim()) f.push('empresa / cliente');
    if (!horaLlegada) f.push('hora de llegada');
    if (!horaSalida) f.push('hora de salida');
    if (!ingACargo.trim() && !personalAdicional.some((p) => p.trim())) f.push('al menos una persona en el servicio');
    return f;
  }, [empresaCliente, horaLlegada, horaSalida, ingACargo, personalAdicional]);

  // Duración entre llegada y salida, para que un 7:30 puesto en lugar de 19:30
  // salte a la vista antes de firmar.
  const duracionTexto = (() => {
    if (!horaLlegada || !horaSalida) return '';
    const [hl, ml] = horaLlegada.split(':').map(Number);
    const [hs, ms] = horaSalida.split(':').map(Number);
    if ([hl, ml, hs, ms].some((n) => Number.isNaN(n))) return '';
    const min = (hs * 60 + ms) - (hl * 60 + ml);
    if (min < 0) return 'la salida es antes que la llegada';
    if (min === 0) return 'misma hora';
    const h = Math.floor(min / 60);
    const m = min % 60;
    const dur = h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
    return min > 14 * 60 ? `${dur} — revisa si es correcto` : dur;
  })();

  // Nombres de todo el personal dado de alta, menos los asignados a este
  // servicio, que se listan aparte y primero: son los más probables.
  const otroPersonal = personal
    .map((p) => p.full_name)
    .filter((n) => !personalAsignado.includes(n));

  // Ya capturado en algún campo: no tiene caso volver a ofrecerlo.
  const yaCapturado = (n: string) =>
    n === ingACargo || personalAdicional.some((p) => p.trim() === n);

  const asignadosDisponibles = personalAsignado.filter((n) => !yaCapturado(n));
  const otrosDisponibles = otroPersonal.filter((n) => !yaCapturado(n));

  // Quien está asignado a este servicio va primero: es lo más probable.
  const gruposPersonal: GrupoSugerencias[] = [
    { etiqueta: 'Asignado a este servicio', nombres: personalAsignado },
    { etiqueta: personalAsignado.length > 0 ? 'Resto del equipo' : 'Equipo', nombres: otroPersonal },
  ].filter((g) => g.nombres.length > 0);

  // Para «personal adicional», se ocultan los que ya están capturados en otro
  // campo del mismo reporte.
  const gruposDisponibles: GrupoSugerencias[] = [
    { etiqueta: 'Asignado a este servicio', nombres: asignadosDisponibles },
    { etiqueta: asignadosDisponibles.length > 0 ? 'Resto del equipo' : 'Equipo', nombres: otrosDisponibles },
  ].filter((g) => g.nombres.length > 0);

  // Servicios que hoy sí se pueden vincular, y los que no por fecha.
  const serviciosVinculables = serviciosAsignados.filter((s) => evaluarVentanaServicio(s).permitido);
  const serviciosFueraDeFecha = serviciosAsignados.filter((s) => !evaluarVentanaServicio(s).permitido);

  function handleFotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const nuevas = files.map((file) => ({ file, previewUrl: URL.createObjectURL(file), caption: '' }));
    setFotos((prev) => [...prev, ...nuevas]);
    if (fotoInputRef.current) fotoInputRef.current.value = '';
    if (fotoGaleriaRef.current) fotoGaleriaRef.current.value = '';
  }

  function removeFoto(i: number) {
    setFotos((prev) => {
      URL.revokeObjectURL(prev[i].previewUrl);
      return prev.filter((_, idx) => idx !== i);
    });
  }

  function updateFotoCaption(i: number, caption: string) {
    setFotos((prev) => prev.map((f, idx) => (idx === i ? { ...f, caption } : f)));
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setUserEmail(data.user?.email || '');
      setUserId(data.user?.id || '');
      if (data.user) {
        const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', data.user.id).single();
        setUserName(profile?.full_name || '');
      }
    });
    // Servicios que el supervisor ya le asignó y todavía no tienen un reporte generado.
    // Se guarda una copia local (localStorage) para que la lista siga disponible
    // aunque el técnico llene el formulario sin conexión.
    try {
      const cached = localStorage.getItem('serviciosAsignadosCache');
      if (cached) setServiciosAsignados(JSON.parse(cached));
    } catch {
      // si la caché local está corrupta, simplemente se ignora
    }
    // Catálogos de vehículos y personal. Si falla, se quedan los de la copia
    // local y los campos siguen aceptando texto libre.
    listarVehiculos().then(setVehiculos).catch(() => {});
    listarPersonal().then(setPersonal).catch(() => {});
    listarMisServicios()
      .then((lista) => {
        const pendientes = filtrarSiguienteDiaPorGrupo(lista.filter((s) => !s.report_id), true);
        setServiciosAsignados(pendientes);
        // Si el técnico ya había elegido un servicio del que después lo
        // quitaron (reasignación), la selección se descarta: la lista fresca
        // manda sobre la copia local.
        setServicioSeleccionadoId((actual) => {
          if (actual && !pendientes.some((s) => s.id === actual)) {
            setPersonalAsignado([]);
            return null;
          }
          return actual;
        });
        try {
          localStorage.setItem('serviciosAsignadosCache', JSON.stringify(pendientes));
        } catch {
          // si no hay espacio o está bloqueado, no es crítico
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    countOfflineReports().then(setPendingCount);

    function handleOnline() {
      setIsOnline(true);
      // dar un momento a que OfflineSyncManager termine de subir los pendientes
      setTimeout(() => countOfflineReports().then(setPendingCount), 3000);
    }
    function handleOffline() {
      setIsOnline(false);
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  function toggleSeguridad(v: string) {
    setSeguridad((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));
  }

  function updateEquipo(i: number, field: string, value: string) {
    setEquipos((eqs) => eqs.map((e, idx) => (idx === i ? { ...e, [field]: value } : e)));
  }

  function updateActividad(i: number, value: string) {
    setActividades((acts) => acts.map((a, idx) => (idx === i ? value : a)));
  }

  function removeActividad(i: number) {
    setActividades((acts) => (acts.length > 1 ? acts.filter((_, idx) => idx !== i) : ['']));
  }

  function resetAll() {
    setIngACargo(''); setPersonalAdicional(['']);
    setPersonalAsignado([]);
    setServicioConcluido(null);
    if (servicioSeleccionadoId) {
      setServiciosAsignados((prev) => {
        const actualizada = prev.filter((s) => s.id !== servicioSeleccionadoId);
        try {
          localStorage.setItem('serviciosAsignadosCache', JSON.stringify(actualizada));
        } catch {
          // no crítico
        }
        return actualizada;
      });
    }
    setServicioSeleccionadoId(null);
    setEmpresaCliente(''); setOrdCompra(''); setHoraLlegada(''); setHoraSalida('');
    setListaConceptos(''); setContactoUsuario(''); setPuestoArea(''); setTipoServicio(null);
    setVehiculo(''); setPlacas(''); setManejadoPor('');
    setSubTipo(null); setTipoServicioOtroTexto('');
    setSeguridad([]); setSeguridadOtraTexto(''); setObservaciones(''); setActividades(['']); setShowCaso(false);
    setCasoPuntos([{ ...EMPTY_PUNTO }]);
    setTuberia({
      Roscada: { active: false, medida: '', metros: '', especifica: '' },
      Ajuste: { active: false, medida: '', metros: '', especifica: '' },
      Ranurada: { active: false, medida: '', metros: '', especifica: '' },
      Otra: { active: false, medida: '', metros: '', especifica: '' },
    });
    setCables([{ tipo: '', calibre: '', metros: '' }]);
    setEquipos([{ cant: '', desc: '', modelo: '', marca: '', serie: '' }]);
    setFirmaIngNombre(''); setFirmaClienteNombre('');
    sigIngRef.current?.clear();
    sigClienteRef.current?.clear();
    fotos.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    setFotos([]);
  }

  function buildSharedData() {
    const tuberiaOut: Record<string, { medida: string; metros: string; especifica?: string }> = {};
    TUBERIA_TYPES.forEach((t) => {
      if (tuberia[t].active) {
        tuberiaOut[t] = { medida: tuberia[t].medida, metros: tuberia[t].metros };
        if (t === 'Otra') tuberiaOut[t].especifica = tuberia[t].especifica;
      }
    });
    const personalList = [ingACargo.trim(), ...personalAdicional.map((p) => p.trim())].filter(Boolean);
    const cablesOut = cables.filter((c) => c.tipo || c.calibre || c.metros);
    return {
      ingACargo, personal: personalList,
      ordCompra, horaLlegada, horaSalida, listaConceptos, contactoUsuario, puestoArea,
      vehiculo, placas, manejadoPor,
      tipoServicioOtroTexto: tipoServicio === 'Otro' ? tipoServicioOtroTexto : '',
      sistemaSeguridad: seguridad, seguridadOtraTexto: seguridad.includes('Otra') ? seguridadOtraTexto : '',
      observaciones,
      tuberia: tuberiaOut,
      cables: cablesOut,
      actividades: actividades.map((a) => a.trim()).filter(Boolean),
      casoPuntos: casoPuntos
        .map((p) => ({
          definicion: p.definicion.trim(),
          descripcion: p.descripcion.trim(),
          analisis: p.analisis.trim(),
          plan: p.plan.trim(),
          resultados: p.resultados.trim(),
          pasosFuturos: p.pasosFuturos.trim(),
        }))
        .filter((p) => p.definicion || p.descripcion || p.analisis || p.plan || p.resultados || p.pasosFuturos),
      equipos: equipos.filter((e) => e.cant || e.desc || e.modelo || e.marca || e.serie),
      servicioProgramadoId: servicioSeleccionadoId || null,
    };
  }

  function getPreviewData(): PreviewData {
    return {
      empresaCliente,
      fecha,
      tipoServicio,
      subTipo,
      data: buildSharedData(),
      fotos: fotos.map((f) => ({ previewUrl: f.previewUrl, caption: f.caption })),
      firmaIngListo: Boolean(sigIngRef.current && !sigIngRef.current.isEmpty()),
      firmaClienteListo: Boolean(sigClienteRef.current && !sigClienteRef.current.isEmpty()),
    };
  }

  async function handleSave() {
    if (faltantes.length > 0) {
      setMsg('Falta por llenar: ' + faltantes.join(', '));
      // El primer campo pendiente suele estar arriba, fuera de vista.
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSaving(true);
    setMsg(null);

    // Datos compartidos entre el guardado en línea y el guardado local (sin conexión).
    const sharedDataBase = buildSharedData();
    const sharedData = {
      ...sharedDataBase,
      firmaIngNombre, firmaClienteNombre,
      revisionEstado: 'pendiente',
      servicioConcluido: servicioConcluido === 'si',
      facturaEstado: servicioConcluido === 'si' ? 'pendiente' : null,
      fechaConcluido: servicioConcluido === 'si' ? fecha : null,
      firmaIngData: sigIngRef.current && !sigIngRef.current.isEmpty() ? sigIngRef.current.getDataURL() : null,
      firmaClienteData: sigClienteRef.current && !sigClienteRef.current.isEmpty() ? sigClienteRef.current.getDataURL() : null,
    };

    async function saveOffline(): Promise<boolean> {
      try {
        // Usamos el userId que ya guardamos en memoria al abrir la pantalla —
        // nunca llamamos a Supabase aquí, así el guardado sin conexión no
        // depende de ninguna respuesta de red que se pueda quedar esperando.
        if (!userId) throw new Error('No se pudo identificar tu sesión. Vuelve a iniciar sesión con conexión al menos una vez.');

        const fotosForOffline = await Promise.all(
          fotos.map(async (f) => ({
            fileName: f.file.name,
            fileType: f.file.type,
            fileDataUrl: await fileToDataUrl(f.file),
            caption: f.caption.trim(),
          }))
        );

        await saveOfflineReport({
          localId: generarUUID(),
          createdAtLocal: new Date().toISOString(),
          userId,
          userName,
          userEmail,
          empresaCliente,
          fecha,
          tipoServicio,
          subTipoServicio: subTipo,
          data: sharedData,
          fotos: fotosForOffline,
          servicioProgramadoId: servicioSeleccionadoId,
        });

        setMsg('Sin conexión — el reporte se guardó en este dispositivo y se subirá automáticamente en cuanto vuelvas a tener internet.');
        setPendingCount((c) => c + 1);
        showToast('Reporte guardado localmente (sin conexión)', 'success');
        resetAll();
        return true;
      } catch (e: any) {
        setMsg('No se pudo guardar ni en línea ni localmente: ' + (e?.message || 'error desconocido'));
        return false;
      }
    }

    // Si ya sabemos que no hay conexión, ni siquiera intentamos la red.
    if (!navigator.onLine) {
      await saveOffline();
      setSaving(false);
      return;
    }

    try {
      const { data: { user } } = await withTimeout(supabase.auth.getUser(), 10000, 'sesión');

      // Folio automático: iniciales del técnico + "-A-" + consecutivo (por técnico)
      const { count } = await withTimeout(
        Promise.resolve(supabase.from('reports').select('id', { count: 'exact', head: true }).eq('created_by', user!.id)),
        10000,
        'consecutivo de folio'
      );
      const seq = (count || 0) + 1;
      const claveFormato = `${iniciales(userName || userEmail)}-A-${String(seq).padStart(3, '0')}`;

      const reportId = generarUUID();
      const baseData = { ...sharedData, fotos: [] as { path: string; caption: string }[], claveFormato };

      const { error } = await withTimeout(
        Promise.resolve(
          supabase.from('reports').insert({
            id: reportId,
            created_by: user!.id,
            empresa_cliente: empresaCliente,
            fecha,
            tipo_servicio: tipoServicio,
            sub_tipo_servicio: subTipo,
            data: baseData,
          })
        ),
        15000,
        'guardar reporte'
      );

      if (error) {
        setSaving(false);
        setMsg('Error al guardar: ' + error.message);
        return;
      }

      // Subir fotos de evidencia, si hay
      const fotoData: { path: string; caption: string }[] = [];
      for (let i = 0; i < fotos.length; i++) {
        const f = fotos[i].file;
        const ext = f.name.split('.').pop() || 'jpg';
        const path = `${reportId}/${Date.now()}-${i}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('evidencias').upload(path, f, {
          contentType: f.type || 'image/jpeg',
        });
        if (!uploadError) fotoData.push({ path, caption: fotos[i].caption.trim() });
      }

      if (fotoData.length > 0) {
        const { error: updateError } = await supabase.from('reports').update({ data: { ...baseData, fotos: fotoData } }).eq('id', reportId);
        if (updateError) {
          setSaving(false);
          setMsg('Reporte guardado, pero hubo un error al adjuntar las fotos: ' + updateError.message);
          resetAll();
          return;
        }
      }

      if (servicioSeleccionadoId) {
        try {
          await vincularReporteAServicio(servicioSeleccionadoId, reportId);
        } catch {
          // No es crítico: el reporte ya se guardó bien; solo no quedó enlazado al servicio.
        }
      }

      setSaving(false);
      setMsg('Reporte guardado');
      // Avisar a quien revisa y factura: es el punto donde el reporte entra a
      // su bandeja.
      await notificar({
        destino: 'supervisores',
        tipo: 'reporte_nuevo',
        titulo: 'Reporte de servicio nuevo',
        mensaje: `${empresaCliente.trim()}${ingACargo.trim() ? ` · ${ingACargo.trim()}` : ''}`,
        url: '/dashboard/reportes',
        tag: 'reporte-nuevo',
      });
      resetAll();
    } catch (e: any) {
      // Se perdió la conexión a media subida (u otro error de red): guardamos
      // el reporte localmente en vez de perder la información capturada.
      const ok = await saveOffline();
      if (!ok) {
        setMsg('Error al guardar: ' + (e?.message || 'error de conexión'));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto pb-32">
      <SavingOverlay show={saving} />
      {/* Header */}
      <div className="sticky top-0 z-20 glass-strong px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/mis-reportes" className="shrink-0 w-8 h-8 rounded-full border border-line-strong flex items-center justify-center active:scale-90 transition-transform">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <Logo variante="completo" size={30} className="min-w-0" compactoEnMovil />
          <div className="min-w-0">
            <h1 className="font-display font-semibold text-base tracking-wide leading-tight truncate">Nuevo reporte</h1>
            <p className="text-[11px] text-muted truncate">{userName || userEmail}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ThemeToggle />
          <LogoutButton compacto />
        </div>
      </div>

      <div className="px-4 pt-5 flex flex-col gap-4">
        {/* Estado de conexión / reportes pendientes */}
        {(!isOnline || pendingCount > 0) && (
          <div className={`rounded-xl px-4 py-2.5 text-[13px] font-medium flex items-center gap-2 ${!isOnline ? 'bg-amber/15 text-amber border border-amber/30' : 'bg-teal/15 text-teal border border-teal/30'}`}>
            <span className={`w-2 h-2 rounded-full shrink-0 ${!isOnline ? 'bg-amber' : 'bg-teal'}`} />
            {!isOnline
              ? 'Sin conexión — los reportes se guardarán en este dispositivo y se subirán solos al recuperar internet.'
              : `${pendingCount} reporte${pendingCount > 1 ? 's' : ''} pendiente${pendingCount > 1 ? 's' : ''} por sincronizar…`}
          </div>
        )}

        {/* Datos del servicio — va primero: elegir el servicio asignado
            autocompleta cliente y personal del resto del formulario */}
        <div className={cardCls}>
          <p className={cardTitleCls}>
            <span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Datos del servicio
          </p>

          {serviciosAsignados.length > 0 && (
            <div className="mb-4 p-3.5 rounded-xl bg-teal/[0.07] border border-teal/25">
              <label className={labelCls}>¿Este reporte es de un servicio que te asignaron?</label>
              <select
                value={servicioSeleccionadoId || ''}
                onChange={(e) => handleSeleccionServicio(e.target.value)}
                className={inputCls}
              >
                <option value="">No aplica — llenar manualmente</option>
                {serviciosVinculables.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.proyecto}{s.dias_totales > 1 ? ` · Día ${s.numero_dia} de ${s.dias_totales}` : ` · ${s.fecha.split('-').reverse().join('/')}`}
                  </option>
                ))}
              </select>
              <p className="text-[12.5px] text-muted mt-1.5">
                Al elegirlo se llena el cliente y se sugiere el personal asignado. Puedes cambiar cualquier dato después.
              </p>

              {serviciosVinculables.length === 0 && (
                <p className="text-[12.5px] text-amber mt-2 leading-relaxed">
                  Ninguno de tus servicios asignados corresponde a hoy, así que no hay nada que vincular. Llena el reporte manualmente o repórtalo con un supervisor.
                </p>
              )}

              {serviciosFueraDeFecha.length > 0 && (
                <div className="mt-3 pt-3 border-t border-line">
                  <p className="text-[12.5px] font-semibold text-amber mb-1.5">No disponibles hoy por fecha:</p>
                  {serviciosFueraDeFecha.map((s) => (
                    <p key={s.id} className="text-[12.5px] text-muted leading-relaxed">
                      {s.proyecto} — programado para el {evaluarVentanaServicio(s).fechaTexto}
                    </p>
                  ))}
                  <p className="text-[12.5px] text-muted mt-1.5 leading-relaxed">
                    Si alguno debía ser hoy, repórtalo con un supervisor para que ajuste la fecha.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="mb-3"><label className={labelCls}>Empresa / Cliente</label><input type="text" className={inputCls} value={empresaCliente} onChange={(e) => setEmpresaCliente(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div><label className={labelCls}>Fecha</label><input type="date" className={inputCls} value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
            <div><label className={labelCls}>Orden de compra</label><input type="text" className={inputCls} value={ordCompra} onChange={(e) => setOrdCompra(e.target.value)} /></div>
            <div><label className={labelCls}>Hora llegada</label><input type="time" className={inputCls} value={horaLlegada} onChange={(e) => setHoraLlegada(e.target.value)} /></div>
            <div><label className={labelCls}>Hora salida</label><input type="time" className={inputCls} value={horaSalida} onChange={(e) => setHoraSalida(e.target.value)} /></div>
          </div>

          {/* El reloj que abre el teléfono lo dibuja el sistema con a.m./p.m. y
              no se puede cambiar desde aquí. Esto repite lo capturado en 24 h y
              saca la cuenta: si alguien puso 7:30 queriendo decir 19:30, la
              duración sale absurda y se nota antes de firmar. */}
          {horaLlegada && horaSalida && (
            <div className="mb-3 px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line">
              <p className="text-[13.5px]">
                <span className="font-mono font-semibold">{horaLlegada}</span>
                <span className="text-muted"> a </span>
                <span className="font-mono font-semibold">{horaSalida}</span>
                <span className="text-muted"> · {duracionTexto}</span>
              </p>
            </div>
          )}
          {/* Vehículo y placas van juntos en una sola lista: si fueran dos
              campos sueltos se podría elegir una camioneta con las placas de
              la otra, y el reporte lo firma el cliente. */}
          <div className="mb-3">
            <label className={labelCls}>Vehículo</label>
            {vehiculos.length > 0 && (
              <select
                value={vehiculoOtro ? 'otro' : (vehiculos.find((v) => v.placas === placas)?.id || '')}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'otro') {
                    setVehiculoOtro(true);
                    setVehiculo('');
                    setPlacas('');
                    return;
                  }
                  setVehiculoOtro(false);
                  const v = vehiculos.find((x) => x.id === val);
                  setVehiculo(v?.nombre || '');
                  setPlacas(v?.placas || '');
                }}
                className={`${inputCls} ${vehiculoOtro ? 'mb-2' : ''}`}
              >
                <option value="">Sin vehículo</option>
                {vehiculos.map((v) => (
                  <option key={v.id} value={v.id}>{v.nombre} · {v.placas}</option>
                ))}
                <option value="otro">Otro vehículo…</option>
              </select>
            )}

            {/* Texto libre cuando se usa uno prestado o rentado, y también
                cuando el catálogo no alcanzó a descargarse. */}
            {(vehiculoOtro || vehiculos.length === 0) && (
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  className={inputCls}
                  value={vehiculo}
                  onChange={(e) => setVehiculo(e.target.value)}
                  placeholder="Vehículo"
                />
                <input
                  type="text"
                  className={inputCls}
                  value={placas}
                  onChange={(e) => setPlacas(e.target.value)}
                  placeholder="Placas"
                />
              </div>
            )}
          </div>

          <div className="mb-3">
            <label className={labelCls}>Manejado por</label>
            <AutocompletarPersona
              value={manejadoPor}
              onChange={setManejadoPor}
              grupos={gruposPersonal}
              className={inputCls}
              placeholder="Escribe las primeras letras"
            />
          </div>
          <div className="mb-3"><label className={labelCls}>Lista de conceptos</label><input type="text" className={inputCls} value={listaConceptos} onChange={(e) => setListaConceptos(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Contacto/Usuario</label><input type="text" className={inputCls} value={contactoUsuario} onChange={(e) => setContactoUsuario(e.target.value)} /></div>
            <div><label className={labelCls}>Puesto/Área</label><input type="text" className={inputCls} value={puestoArea} onChange={(e) => setPuestoArea(e.target.value)} /></div>
          </div>
        </div>

        {/* Personal en el servicio */}
        <div className={cardCls}>
          <p className={cardTitleCls}>
            <span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Personal en el servicio
          </p>

          <p className="text-[12.5px] text-muted mb-3">
            {personalAsignado.length > 0
              ? 'Arriba de la lista va el personal asignado a este servicio. Debajo, el resto del equipo. Si fue alguien de fuera, escribe su nombre.'
              : 'Elige de la lista o escribe el nombre si fue alguien de fuera.'}
          </p>

          <div className="mb-3">
            <label className={labelCls}>Ing a cargo</label>
            <AutocompletarPersona
              id="ing-a-cargo"
              value={ingACargo}
              onChange={setIngACargo}
              grupos={gruposPersonal}
              className={inputCls}
              placeholder="Escribe las primeras letras"
            />
          </div>

          <label className={labelCls}>Personal adicional</label>
          {personalAdicional.map((p, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <AutocompletarPersona
                  value={p}
                  onChange={(v) => setPersonalAdicional((prev) => prev.map((x, idx) => (idx === i ? v : x)))}
                  grupos={gruposDisponibles}
                  className={inputCls}
                  placeholder="Escribe las primeras letras"
                />
              </div>
              <button
                type="button"
                aria-label="Quitar persona"
                onClick={() => setPersonalAdicional((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : ['']))}
                className="text-red w-11 h-11 flex items-center justify-center shrink-0 active:scale-90 transition-transform"
              >
                <X size={19} strokeWidth={2.6} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setPersonalAdicional((prev) => [...prev, ''])}
            className="w-full mt-1 border border-dashed border-teal/50 text-teal min-h-[46px] rounded-xl text-[14px] font-medium flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
          >
            <Plus size={16} strokeWidth={2.6} />
            Agregar persona
          </button>
        </div>

        {/* Tipo de servicio */}
        <div className={cardCls}>
          <p className={cardTitleCls}><span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Tipo de servicio</p>
          {TIPOS.map((t) => (
            <span key={t} className={chipCls(tipoServicio === t)} onClick={() => { setTipoServicio(t); if (t !== 'Mantenimiento') setSubTipo(null); }}>{t}</span>
          ))}
          {tipoServicio === 'Mantenimiento' && (
            <div className="mt-1">
              {SUBTIPOS.map((s) => (
                <span key={s} className={chipCls(subTipo === s)} onClick={() => setSubTipo(s)}>{s}</span>
              ))}
            </div>
          )}
          {tipoServicio === 'Otro' && (
            <div className="mt-2">
              <label className={labelCls}>Especifica</label>
              <input type="text" className={inputCls} value={tipoServicioOtroTexto} onChange={(e) => setTipoServicioOtroTexto(e.target.value)} />
            </div>
          )}
        </div>

        {/* Sistema de seguridad */}
        <div className={cardCls}>
          <p className={cardTitleCls}><span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Sistema de seguridad</p>
          {SEGURIDAD_OPTS.map((s) => (
            <span key={s} className={chipCls(seguridad.includes(s))} onClick={() => toggleSeguridad(s)}>{s}</span>
          ))}
          {seguridad.includes('Otra') && (
            <div className="mt-2">
              <label className={labelCls}>Especifica</label>
              <input type="text" className={inputCls} value={seguridadOtraTexto} onChange={(e) => setSeguridadOtraTexto(e.target.value)} />
            </div>
          )}
        </div>

        {/* Tubería */}
        <div className={cardCls}>
          <p className={cardTitleCls}><span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Tubería</p>
          {TUBERIA_TYPES.map((t) => (
            <div key={t} className="mb-2 last:mb-0">
              <span
                className={chipCls(tuberia[t].active)}
                onClick={() => setTuberia((prev) => ({ ...prev, [t]: { ...prev[t], active: !prev[t].active } }))}
              >
                {t}
              </span>
              {tuberia[t].active && (
                <div className="mt-2">
                  {t === 'Otra' && (
                    <div className="mb-2">
                      <label className={labelCls}>Especifica</label>
                      <input
                        type="text"
                        className={inputCls}
                        value={tuberia[t].especifica}
                        onChange={(e) => setTuberia((prev) => ({ ...prev, [t]: { ...prev[t], especifica: e.target.value } }))}
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Medida</label>
                      <input
                        type="text"
                        className={inputCls}
                        value={tuberia[t].medida}
                        onChange={(e) => setTuberia((prev) => ({ ...prev, [t]: { ...prev[t], medida: e.target.value } }))}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Metros</label>
                      <input
                        type="text"
                        className={inputCls}
                        value={tuberia[t].metros}
                        onChange={(e) => setTuberia((prev) => ({ ...prev, [t]: { ...prev[t], metros: e.target.value } }))}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Cable instalado */}
        <div className={cardCls}>
          <p className={cardTitleCls}><span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Cable instalado</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {cables.map((c, i) => (
              <div key={i} className="p-3 rounded-xl bg-surface-2 border border-line relative">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Cable {i + 1}</p>
                  {cables.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setCables((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-red text-sm active:scale-90 transition-transform"
                    >
                      <X size={19} strokeWidth={2.6} />
                    </button>
                  )}
                </div>
                <div className="mb-2">
                  <label className={labelCls}>Tipo</label>
                  <input type="text" className={inputCls} value={c.tipo} onChange={(e) => setCables((prev) => prev.map((x, idx) => (idx === i ? { ...x, tipo: e.target.value } : x)))} />
                </div>
                <div className="mb-2">
                  <label className={labelCls}>Calibre</label>
                  <input type="text" className={inputCls} value={c.calibre} onChange={(e) => setCables((prev) => prev.map((x, idx) => (idx === i ? { ...x, calibre: e.target.value } : x)))} />
                </div>
                <div>
                  <label className={labelCls}>Metros</label>
                  <input type="text" className={inputCls} value={c.metros} onChange={(e) => setCables((prev) => prev.map((x, idx) => (idx === i ? { ...x, metros: e.target.value } : x)))} />
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setCables((prev) => [...prev, { tipo: '', calibre: '', metros: '' }])}
            className="w-full mt-3 border border-dashed border-teal/50 text-teal py-2 rounded-xl text-[13px] font-medium active:scale-95 transition-transform"
          >
            + Agregar cable
          </button>
        </div>

        {/* Montaje de soportería y equipo */}
        <div className={cardCls}>
          <p className={cardTitleCls}><span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Montaje de soportería y equipo</p>
          {equipos.map((eq, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-2">
              <input placeholder="Cant." className={inputCls} value={eq.cant} onChange={(e) => updateEquipo(i, 'cant', e.target.value)} />
              <input placeholder="Descripción" className={`${inputCls} sm:col-span-1`} value={eq.desc} onChange={(e) => updateEquipo(i, 'desc', e.target.value)} />
              <input placeholder="Modelo" className={inputCls} value={eq.modelo} onChange={(e) => updateEquipo(i, 'modelo', e.target.value)} />
              <input placeholder="Marca" className={inputCls} value={eq.marca} onChange={(e) => updateEquipo(i, 'marca', e.target.value)} />
              <input placeholder="No. Serie" className={inputCls} value={eq.serie} onChange={(e) => updateEquipo(i, 'serie', e.target.value)} />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setEquipos([...equipos, { cant: '', desc: '', modelo: '', marca: '', serie: '' }])}
            className="w-full mt-1 border border-dashed border-teal/50 text-teal py-2 rounded-xl text-[13px] font-medium active:scale-95 transition-transform"
          >
            + Agregar equipo
          </button>
        </div>

        {/* Descripción de actividades realizadas */}
        <div className={cardCls}>
          <p className={cardTitleCls}><span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Descripción de actividades realizadas</p>
          <PointList items={actividades} onChange={setActividades} placeholder="Actividad" />
        </div>

        {/* Caso de problema en equipo o instalación */}
        <div className={cardCls}>
          {!showCaso ? (
            <button
              type="button"
              onClick={() => setShowCaso(true)}
              className="w-full border border-dashed border-teal/50 text-teal py-2.5 rounded-xl text-[13px] font-semibold active:scale-95 transition-transform"
            >
              + Agregar caso de problema en equipo o instalación (opcional)
            </button>
          ) : (
            <>
              <div className="flex justify-between items-center mb-3.5">
                <p className={`${cardTitleCls} mb-0`}><span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Caso de problema en equipo o instalación</p>
                <button type="button" onClick={() => setShowCaso(false)} className="text-red text-xs active:scale-95 transition-transform">
                  Quitar sección
                </button>
              </div>
              <p className="text-[11px] text-muted mb-3">Cada punto agrupa sus 6 apartados juntos, para que el punto 1 de un apartado corresponda al punto 1 de los demás.</p>
              <PuntoList puntos={casoPuntos} onChange={setCasoPuntos} />
            </>
          )}
        </div>

        {/* Observaciones */}
        <div className={cardCls}>
          <p className={cardTitleCls}><span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Observaciones</p>
          <textarea className={`${inputCls} min-h-[80px]`} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
        </div>

        {/* Fotos de evidencia */}
        <div className={cardCls}>
          <p className={cardTitleCls}><span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Fotos de evidencia</p>
          <input
            ref={fotoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFotoSelect}
            className="hidden"
            id="foto-input-camara"
          />
          <input
            ref={fotoGaleriaRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFotoSelect}
            className="hidden"
            id="foto-input-galeria"
          />
          <div className="grid grid-cols-2 gap-2.5">
            <label
              htmlFor="foto-input-camara"
              className="w-full min-h-[48px] border border-dashed border-teal/50 text-teal rounded-xl text-[14.5px] font-semibold cursor-pointer flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              <Camera size={17} strokeWidth={2.3} />
              Tomar foto
            </label>
            <label
              htmlFor="foto-input-galeria"
              className="w-full min-h-[48px] border border-dashed border-teal/50 text-teal rounded-xl text-[14.5px] font-semibold cursor-pointer flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              <Images size={17} strokeWidth={2.3} />
              Elegir de galería
            </label>
          </div>
          {fotos.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-3">
              {fotos.map((f, i) => (
                <div key={i} className="relative">
                  <img src={f.previewUrl} alt={`Evidencia ${i + 1}`} className="w-full h-20 object-cover rounded-lg border border-line" />
                  <button
                    type="button"
                    onClick={() => removeFoto(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red text-white text-[11px] leading-none active:scale-90 transition-transform"
                  >
                    <X size={19} strokeWidth={2.6} />
                  </button>
                  <input
                    type="text"
                    placeholder="Comentario..."
                    value={f.caption}
                    onChange={(e) => updateFotoCaption(i, e.target.value)}
                    className="w-full mt-1.5 px-2 py-1 text-[11px] rounded-md bg-surface-2 border border-line focus:border-teal focus:outline-none"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Estatus del servicio/proyecto */}
        <div className={cardCls}>
          <p className={cardTitleCls}><span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Estatus del servicio</p>
          <label className={labelCls}>¿Ya se concluyó el servicio o proyecto?</label>
          <p className="text-[11px] text-muted mb-2.5">Si el proyecto dura varios días, marca "No" en los reportes de avance y "Sí" hasta el reporte final.</p>
          <div className="flex gap-2">
            <span className={chipCls(servicioConcluido === 'si')} onClick={() => setServicioConcluido('si')}>Sí, concluido</span>
            <span className={chipCls(servicioConcluido === 'no')} onClick={() => setServicioConcluido('no')}>No, sigue en curso</span>
          </div>
        </div>

        {/* Firmas */}
        <div className={cardCls}>
          <p className={cardTitleCls}><span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Firmas</p>
          <div className="mb-2.5"><label className={labelCls}>Ing. responsable de ejecución</label><input type="text" className={inputCls} value={firmaIngNombre} onChange={(e) => setFirmaIngNombre(e.target.value)} /></div>
          <div className="rounded-xl overflow-hidden border border-line">
            <SignaturePad ref={sigIngRef} />
          </div>
          <p className="text-[11px] text-muted mt-1.5 mb-4">Firme con el dedo sobre el recuadro</p>

          <div className="mb-2.5"><label className={labelCls}>Nombre del cliente</label><input type="text" className={inputCls} value={firmaClienteNombre} onChange={(e) => setFirmaClienteNombre(e.target.value)} /></div>
          <div className="rounded-xl overflow-hidden border border-line">
            <SignaturePad ref={sigClienteRef} />
          </div>
          <p className="text-[11px] text-muted mt-1.5">Firme con el dedo sobre el recuadro</p>

          <p className="text-[11px] text-muted mt-3 leading-relaxed">
            El reporte quedará como <b>pendiente de revisión</b> hasta que el Ing. Everardo Sánchez lo firme desde el dashboard.
          </p>
        </div>

        {msg && (
          <div className={`text-sm px-4 py-3 rounded-xl ${msg.startsWith('Error') ? 'bg-red/10 text-red border border-red/30' : 'bg-teal/10 text-teal border border-teal/30'}`}>
            {msg}
          </div>
        )}

        <button
          onClick={() => setShowPreview(true)}
          className="w-full min-h-[52px] rounded-2xl border border-teal/50 text-teal font-display font-semibold text-[15px] tracking-wide flex items-center justify-center gap-2 active:scale-95 transition-transform mb-3"
        >
          <Eye size={17} strokeWidth={2.3} />
          Vista previa del reporte
        </button>

        {faltantes.length > 0 && (
          <div className="mb-3 p-4 rounded-2xl bg-amber/10 border border-amber/30 flex items-start gap-2.5">
            <AlertTriangle size={17} strokeWidth={2.4} className="text-amber shrink-0 mt-0.5" />
            <div>
              <p className="text-[14px] font-semibold text-amber mb-1">Falta información obligatoria</p>
              <ul className="text-[13.5px] text-ink/80 leading-relaxed list-disc pl-4">
                {faltantes.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </div>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving || faltantes.length > 0}
          className="w-full min-h-[56px] rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[16px] tracking-wide shadow-glow-teal active:scale-95 transition-transform disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar reporte'}
        </button>
      </div>

      {showPreview && <ReportPreviewModal preview={getPreviewData()} onClose={() => setShowPreview(false)} />}

      {/* Floating bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 z-30 flex justify-center pb-4 px-4 pointer-events-none">
        <div className="pointer-events-auto glass-strong rounded-full px-2 py-2 flex items-center gap-1 shadow-glow">
          <Link
            href="/mis-reportes"
            className="px-4 py-2 rounded-full text-[13px] text-ink/70 font-medium active:scale-95 transition-transform"
          >
            Mis Reportes
          </Link>
          <div className="px-4 py-2 rounded-full bg-teal text-inkOnAccent text-[13px] font-display font-semibold tracking-wide flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-bg/70" /> Nuevo reporte
          </div>
        </div>
      </div>
    </div>
  );
}
