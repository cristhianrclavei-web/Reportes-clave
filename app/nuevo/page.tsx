'use client';

import { reducirFoto } from '@/lib/reducirFoto';
import { ContactoCatalogo, catalogoEnCache, normalizar as normalizarNombre } from '@/lib/clientesCatalogo';
import AutocompletarCliente from '@/components/AutocompletarCliente';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { listarMisServicios, vincularReporteAServicio, Servicio, filtrarSiguienteDiaPorGrupo, listarTecnicosDeServicio, listarFotosDelDia, FotoDelDia } from '@/lib/serviciosProgramados';
import { X, Camera, Images, Plus, AlertTriangle, Eye, ChevronDown, Tag, History } from 'lucide-react';
import { generarUUID } from '@/lib/uuid';
import { registrarAccionGlobal } from '@/lib/auditoriaGlobal';
import { notificar } from '@/lib/push';
import { evaluarVentanaServicio } from '@/lib/ventanaServicio';
import Logo from '@/components/Logo';
import { hoyLocal } from '@/lib/fechaHoy';
import { MARCA, MARCA_MAYUS } from '@/lib/marca';
import { SelectorFormatos, PasoFormato, pendientesFormatos } from '@/components/FormatoMantenimiento';
import { FormatoLlenado } from '@/lib/formatosMantenimiento';
import { usePlan, tieneModulo } from '@/lib/planes';
import EtiquetasMantenimiento from '@/components/EtiquetasMantenimiento';
import { guardarCamposBorrador, guardarFotosBorrador, leerBorrador, borrarBorrador } from '@/lib/borradorReporte';
import EquipoInstaladoRenglon, { EquipoFila, ArticuloCatalogo } from '@/components/EquipoInstaladoRenglon';
import { sinRegistroDeReporte } from '@/lib/equiposInstalados';
import { FilaTuberia, FilaCable, FilaSoporteria, tuberiasDe, cablesDe, soporteriaDe } from '@/lib/materialesReporte';
import { SeccionTuberia, SeccionCable, SeccionSoporteria, tuberiaVacia, cableVacio, soporteriaVacia } from '@/components/reporte/MaterialesReporte';
import TraerDelVale from '@/components/reporte/TraerDelVale';

// Hora "HH:mm" del reloj del dispositivo — igual al formato que ya entrega
// el <input type="time">, así que sirve tal cual como valor de respaldo.
function horaActualStr(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const TIPOS = ['Instalación nueva', 'Mantenimiento', 'Otro'];
const SUBTIPOS = ['Correctivo', 'Preventivo'];
const SEGURIDAD_OPTS = ['CCTV', 'Automatización', 'Alarma&Det', 'Control de acceso', 'Alarma intrusión', 'Red contra incendio', 'Supresión', 'Inst. eléctricas', 'Paneles solares', 'Otra'];

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal-glow text-[15px] transition-colors placeholder:text-faint';
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5';
const cardCls = 'glass rounded-2xl p-4';
// El paso «Formato» solo aparece cuando un mantenimiento preventivo lleva
// formato de mantenimiento.
type PasoKey = 'datos' | 'trabajo' | 'formato' | 'evidencia' | 'firmas';
const ETIQUETA_PASO: Record<PasoKey, string> = {
  datos: 'Datos', trabajo: 'Trabajo', formato: 'Formato', evidencia: 'Evidencia', firmas: 'Firmas',
};

// Secciones que muchos servicios no llevan (tubería, cable, montaje): un
// renglón compacto que se abre al tocarlo. Si ya tiene algo capturado se
// muestra cuánto, para no esconder información.
function Plegable({ titulo, cuenta, children }: { titulo: string; cuenta: number; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className={cardCls}>
      <button type="button" onClick={() => setAbierto((v) => !v)} className="w-full flex items-center justify-between gap-2 text-left">
        <span className={`${cardTitleCls} !mb-0`}>
          <span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> {titulo}
          {cuenta > 0 && <span className="ml-1.5 text-teal normal-case tracking-normal">· {cuenta}</span>}
        </span>
        <span className="text-[12.5px] text-muted flex items-center gap-1 shrink-0">
          {abierto ? 'Ocultar' : cuenta > 0 ? 'Ver' : 'Agregar'}
          <ChevronDown size={15} className={`transition-transform ${abierto ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {abierto && <div className="mt-3">{children}</div>}
    </div>
  );
}
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
  const router = useRouter();
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
  // Cliente de la sección Clientes al que quedó ligado lo escrito (null =
  // nuevo o sin reconocer; la base lo resuelve al guardar).
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [contactosCliente, setContactosCliente] = useState<ContactoCatalogo[]>([]);
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
  // La copia local se lee después de montar (efecto de abajo), no en el
  // primer render: el servidor no tiene localStorage y el HTML no coincidiría.
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [personal, setPersonal] = useState<Persona[]>([]);
  const [vehiculoOtro, setVehiculoOtro] = useState(false);
  const [manejadoPor, setManejadoPor] = useState('');
  const [ingACargo, setIngACargo] = useState('');
  const [personalAdicional, setPersonalAdicional] = useState<string[]>(['']);
  const [tipoServicio, setTipoServicio] = useState<string | null>(null);
  const [subTipo, setSubTipo] = useState<string | null>(null);
  const [tipoServicioOtroTexto, setTipoServicioOtroTexto] = useState('');
  const [seguridad, setSeguridad] = useState<string[]>([]);
  const [seguridadOtraTexto, setSeguridadOtraTexto] = useState('');
  // Materiales: listas con cantidad numérica y unidad, ligables al almacén
  // (lib/materialesReporte.ts lee también el formato de reportes viejos).
  const [tuberias, setTuberias] = useState<FilaTuberia[]>([tuberiaVacia()]);
  const [cables, setCables] = useState<FilaCable[]>([cableVacio()]);
  const [soporteria, setSoporteria] = useState<FilaSoporteria[]>([soporteriaVacia()]);
  const [observaciones, setObservaciones] = useState('');
  const [actividades, setActividades] = useState<string[]>(['']);
  const [showCaso, setShowCaso] = useState(false);
  const [casoPuntos, setCasoPuntos] = useState<CasoPunto[]>([{ ...EMPTY_PUNTO }]);
  const [equipos, setEquipos] = useState<EquipoFila[]>([{ cant: '', desc: '', modelo: '', marca: '', serie: '' }]);
  // Catálogo del almacén para ligar el equipo instalado (Fase C). Sin red o
  // sin permiso queda en null y los renglones funcionan como texto libre.
  const [catalogoEquipos, setCatalogoEquipos] = useState<ArticuloCatalogo[] | null>(null);
  useEffect(() => {
    createClient()
      .from('almacen_articulos')
      .select('id, descripcion, marca, modelo, unidad')
      .eq('activo', true)
      .in('categoria', ['equipo', 'material'])
      .then(({ data, error }) => { if (!error && data) setCatalogoEquipos(data as ArticuloCatalogo[]); });
  }, []);
  const [firmaIngNombre, setFirmaIngNombre] = useState('');
  const [firmaClienteNombre, setFirmaClienteNombre] = useState('');
  // Cliente que no estaba para firmar: queda registrado quién recibió y el
  // reporte se marca «firma pendiente» para mandarle el enlace después.
  const [clienteAusente, setClienteAusente] = useState(false);
  const [motivoAusente, setMotivoAusente] = useState('');
  const [recibioNombre, setRecibioNombre] = useState('');
  const [recibioPuesto, setRecibioPuesto] = useState('');
  const [recibioFirma, setRecibioFirma] = useState<string | null>(null);
  const [servicioConcluido, setServicioConcluido] = useState<'si' | 'no' | null>(null);
  // Formulario por pasos. Todo sigue en un solo componente (el estado no se
  // pierde al ir y venir); solo se muestra un paso a la vez. Las firmas se
  // montan la primera vez que se llega a ese paso y después solo se ocultan:
  // el lienzo toma su tamaño al montarse y oculto mediría 0.
  const [paso, setPaso] = useState(1);
  const [firmasMontadas, setFirmasMontadas] = useState(false);
  // Formato de mantenimiento preventivo (se anexa al PDF).
  const [usaFormato, setUsaFormato] = useState(false);
  const [formatos, setFormatos] = useState<FormatoLlenado[]>([]);
  // Los formatos de mantenimiento son parte de los planes Profesional y
  // Empresa (lib/planes.ts).
  const plan = usePlan();
  const esPreventivo = tipoServicio === 'Mantenimiento' && subTipo === 'Preventivo' && tieneModulo(plan, 'formatos');
  const conFormato = esPreventivo && usaFormato && formatos.length > 0;
  // Token del QR de la etiqueta. Se crea en el teléfono (no en la base) para
  // que la etiqueta se pueda imprimir aunque no haya señal; el QR funciona
  // en cuanto el reporte se sube.
  const tokenRef = useRef<string | null>(null);
  function tokenVerificacion(): string {
    if (!tokenRef.current) tokenRef.current = generarUUID();
    return tokenRef.current;
  }
  const [showEtiquetas, setShowEtiquetas] = useState(false);
  const PASOS: PasoKey[] = conFormato
    ? ['datos', 'trabajo', 'formato', 'evidencia', 'firmas']
    : ['datos', 'trabajo', 'evidencia', 'firmas'];
  const pasoKey = PASOS[Math.min(paso, PASOS.length) - 1];
  const [avisoPaso, setAvisoPaso] = useState<string | null>(null);
  const sigIngRef = useRef<SignaturePadHandle>(null);
  const sigClienteRef = useRef<SignaturePadHandle>(null);
  const [fotos, setFotos] = useState<{ file: File; previewUrl: string; caption: string }[]>([]);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const fotoGaleriaRef = useRef<HTMLInputElement>(null);
  // Fotos que ya se tomaron en campo ese día (avances, evidencia extra,
  // retraso, tareas completadas) y se precargan solas al elegir el servicio,
  // para que el técnico no tenga que volver a tomarlas. Siguen siendo
  // editables: se pueden quitar o ajustar el comentario antes de guardar.
  const [fotosServicio, setFotosServicio] = useState<FotoDelDia[]>([]);
  const [cargandoFotosServicio, setCargandoFotosServicio] = useState(false);

  // ---------------- Borrador en el dispositivo ----------------
  // Todo lo capturado se guarda solo en el celular mientras se llena; si la
  // página se recarga por accidente (p. ej. jalar hacia abajo estando hasta
  // arriba), al volver se recupera. Se borra al guardar o al empezar otro.
  const [firmaIngData, setFirmaIngData] = useState<string | null>(null);
  const [firmaClienteData, setFirmaClienteData] = useState<string | null>(null);
  const [borradorUid, setBorradorUid] = useState<string | null>(null);
  // Hasta revisar si hay borrador no se guarda nada (se borraría el anterior).
  const [borradorListo, setBorradorListo] = useState(false);
  const [recuperadoEn, setRecuperadoEn] = useState<number | null>(null);

  const camposBorrador = {
    empresaCliente, clienteId, contactosCliente, servicioSeleccionadoId, personalAsignado, fecha, ordCompra,
    horaLlegada, horaSalida, listaConceptos, contactoUsuario, puestoArea, vehiculo, placas, vehiculoOtro,
    manejadoPor, ingACargo, personalAdicional, tipoServicio, subTipo, tipoServicioOtroTexto, seguridad,
    seguridadOtraTexto, tuberias, cables, soporteria, observaciones, actividades, showCaso, casoPuntos, equipos,
    firmaIngNombre, firmaClienteNombre, servicioConcluido, paso, usaFormato, formatos, fotosServicio,
    firmaIngData, firmaClienteData,
    clienteAusente, motivoAusente, recibioNombre, recibioPuesto, recibioFirma,
  };
  const hayDatos = Boolean(
    empresaCliente.trim() || tipoServicio || ordCompra.trim() || observaciones.trim() || horaLlegada ||
    actividades.some((a) => a.trim()) || fotos.length || formatos.length || firmaIngData || firmaClienteData || recibioFirma
  );

  // Llena el formulario desde campos guardados (borrador o reporte a corregir).
  function aplicarCampos(c: any) {
    const set = <T,>(fn: (v: T) => void, v: unknown) => { if (v !== undefined) fn(v as T); };
    set(setEmpresaCliente, c.empresaCliente); set(setClienteId, c.clienteId); set(setContactosCliente, c.contactosCliente);
    set(setServicioSeleccionadoId, c.servicioSeleccionadoId); set(setPersonalAsignado, c.personalAsignado);
    set(setFecha, c.fecha); set(setOrdCompra, c.ordCompra); set(setHoraLlegada, c.horaLlegada); set(setHoraSalida, c.horaSalida);
    set(setListaConceptos, c.listaConceptos); set(setContactoUsuario, c.contactoUsuario); set(setPuestoArea, c.puestoArea);
    set(setVehiculo, c.vehiculo); set(setPlacas, c.placas); set(setVehiculoOtro, c.vehiculoOtro); set(setManejadoPor, c.manejadoPor);
    set(setIngACargo, c.ingACargo); set(setPersonalAdicional, c.personalAdicional); set(setTipoServicio, c.tipoServicio);
    set(setSubTipo, c.subTipo); set(setTipoServicioOtroTexto, c.tipoServicioOtroTexto); set(setSeguridad, c.seguridad);
    set(setSeguridadOtraTexto, c.seguridadOtraTexto);
    // Borradores viejos guardaban «tuberia» como objeto y cables con «metros».
    if (c.tuberias !== undefined || c.tuberia !== undefined) { const t = tuberiasDe(c); setTuberias(t.length ? t : [tuberiaVacia()]); }
    if (c.cables !== undefined) { const cb = cablesDe(c); setCables(cb.length ? cb : [cableVacio()]); }
    if (c.soporteria !== undefined) setSoporteria(c.soporteria.length ? c.soporteria : [soporteriaVacia()]);
    set(setObservaciones, c.observaciones); set(setActividades, c.actividades); set(setShowCaso, c.showCaso);
    set(setCasoPuntos, c.casoPuntos); set(setEquipos, c.equipos); set(setFirmaIngNombre, c.firmaIngNombre);
    set(setFirmaClienteNombre, c.firmaClienteNombre); set(setServicioConcluido, c.servicioConcluido);
    set(setClienteAusente, c.clienteAusente); set(setMotivoAusente, c.motivoAusente);
    set(setRecibioNombre, c.recibioNombre); set(setRecibioPuesto, c.recibioPuesto); set(setRecibioFirma, c.recibioFirma);
    set(setUsaFormato, c.usaFormato); set(setFormatos, c.formatos); set(setFotosServicio, c.fotosServicio);
    if (typeof c.tokenVerificacion === 'string') tokenRef.current = c.tokenVerificacion;
    if (c.firmaIngData || c.firmaClienteData || c.recibioFirma) {
      setFirmaIngData(c.firmaIngData || null);
      setFirmaClienteData(c.firmaClienteData || null);
      setFirmasMontadas(true);
    }
    set(setPaso, c.paso);
  }

  // ---------------- Corregir un reporte (?editar=<id>) ----------------
  // Con corrección autorizada por el supervisor y sin firma del cliente, el
  // técnico edita el reporte completo en este mismo formulario. Al guardar se
  // actualiza el reporte (no se crea otro) y la corrección se cierra.
  const [editarId, setEditarId] = useState<string | null>(null);
  const reporteOriginal = useRef<any>(null);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);

  async function cargarParaEditar(id: string, uid: string) {
    const { data: r, error } = await supabase.from('reports').select('*').eq('id', id).single();
    if (error || !r) { setErrorEdicion('No se encontró el reporte.'); return; }
    if (r.created_by !== uid) { setErrorEdicion('Solo quien hizo el reporte puede corregirlo.'); return; }
    if (!r.correccion_habilitada) { setErrorEdicion('Este reporte no tiene una corrección autorizada.'); return; }
    if (r.data?.firmaClienteData) { setErrorEdicion('El cliente ya firmó este reporte: solo se pueden agregar fotos y cambiar el servicio desde su detalle.'); return; }
    reporteOriginal.current = r;
    const d = r.data || {};
    const personal: string[] = Array.isArray(d.personal) ? d.personal : [];
    const adicional = d.ingACargo && personal[0] === d.ingACargo ? personal.slice(1) : personal.filter((x) => x !== d.ingACargo);
    const casos = Array.isArray(d.casoPuntos) && d.casoPuntos.length ? d.casoPuntos : null;
    // Fotos ya subidas: se muestran como existentes (se pueden quitar o
    // cambiar su comentario) y se pueden agregar nuevas.
    const fotosPrevias: { path: string; caption: string }[] = Array.isArray(d.fotos) ? d.fotos : [];
    let conUrl: FotoDelDia[] = [];
    if (fotosPrevias.length) {
      const { data: urls } = await supabase.storage.from('evidencias').createSignedUrls(fotosPrevias.map((f) => f.path), 3600);
      conUrl = fotosPrevias.map((f, i) => ({ path: f.path, caption: f.caption || '', previewUrl: urls?.[i]?.signedUrl || '' }));
    }
    aplicarCampos({
      empresaCliente: r.empresa_cliente || '', clienteId: r.cliente_id || null,
      servicioSeleccionadoId: d.servicioProgramadoId || null,
      fecha: r.fecha, ordCompra: d.ordCompra || '', horaLlegada: d.horaLlegada || '', horaSalida: d.horaSalida || '',
      listaConceptos: d.listaConceptos || '', contactoUsuario: d.contactoUsuario || '', puestoArea: d.puestoArea || '',
      vehiculo: d.vehiculo || '', placas: d.placas || '', manejadoPor: d.manejadoPor || '',
      ingACargo: d.ingACargo || '', personalAdicional: adicional.length ? adicional : [''],
      tipoServicio: r.tipo_servicio, subTipo: r.sub_tipo_servicio, tipoServicioOtroTexto: d.tipoServicioOtroTexto || '',
      seguridad: Array.isArray(d.sistemaSeguridad) ? d.sistemaSeguridad : [], seguridadOtraTexto: d.seguridadOtraTexto || '',
      tuberias: tuberiasDe(d), cables: cablesDe(d), soporteria: soporteriaDe(d),
      observaciones: d.observaciones || '',
      actividades: Array.isArray(d.actividades) && d.actividades.length ? d.actividades : [''],
      showCaso: Boolean(casos), casoPuntos: casos || [{ ...EMPTY_PUNTO }],
      equipos: Array.isArray(d.equipos) && d.equipos.length ? d.equipos : [{ cant: '', desc: '', modelo: '', marca: '', serie: '' }],
      firmaIngNombre: d.firmaIngNombre || '', firmaClienteNombre: d.firmaClienteNombre || '',
      servicioConcluido: d.servicioConcluido === true ? 'si' : d.servicioConcluido === false ? 'no' : null,
      clienteAusente: Boolean(d.clienteAusente), motivoAusente: d.clienteAusente?.motivo || '',
      recibioNombre: d.clienteAusente?.recibioNombre || '', recibioPuesto: d.clienteAusente?.recibioPuesto || '',
      recibioFirma: d.clienteAusente?.recibioFirma || null,
      usaFormato: Array.isArray(d.formatosMtto) && d.formatosMtto.length > 0, formatos: Array.isArray(d.formatosMtto) ? d.formatosMtto : [],
      fotosServicio: conUrl,
      tokenVerificacion: d.tokenVerificacion,
      firmaIngData: d.firmaIngData || null, firmaClienteData: null,
      paso: 1,
    });
    setEditarId(id);
  }

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        // getSession es local (sirve sin señal); getUser iría a la red.
        const { data } = await supabase.auth.getSession();
        const uid = data.session?.user.id;
        if (!uid || cancelado) return;
        // Modo corregir: carga el reporte y no usa el borrador (el borrador
        // es del reporte nuevo que el técnico pudiera tener a medias).
        const editar = new URLSearchParams(window.location.search).get('editar');
        if (editar) {
          await cargarParaEditar(editar, uid);
          return;
        }
        setBorradorUid(uid);
        const r = await leerBorrador(uid);
        if (!r || cancelado) return;
        aplicarCampos(r.borrador.campos as any);
        if (r.fotos.length) {
          setFotos(r.fotos.map((f) => {
            const file = new File([f.blob], f.name, { type: f.type });
            return { file, previewUrl: URL.createObjectURL(file), caption: f.caption };
          }));
        }
        setRecuperadoEn(r.borrador.guardadoEn);
      } catch {
        // sin IndexedDB (modo privado, etc.): el formulario funciona igual
      } finally {
        if (!cancelado) setBorradorListo(true);
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Campos: se guardan medio segundo después del último cambio.
  const camposJson = JSON.stringify(camposBorrador);
  useEffect(() => {
    if (!borradorListo || !borradorUid) return;
    const t = setTimeout(() => {
      const accion = hayDatos
        ? guardarCamposBorrador(borradorUid, { ...JSON.parse(camposJson), tokenVerificacion: tokenRef.current })
        : borrarBorrador(borradorUid);
      accion.catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [camposJson, hayDatos, borradorListo, borradorUid]);

  // Fotos: solo cuando cambian (son pesadas).
  useEffect(() => {
    if (!borradorListo || !borradorUid) return;
    const t = setTimeout(() => {
      guardarFotosBorrador(
        borradorUid,
        fotos.map((f) => ({ name: f.file.name, type: f.file.type, blob: f.file, caption: f.caption }))
      ).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [fotos, borradorListo, borradorUid]);

  // Bloquea el «jalar para recargar» del celular mientras está esta
  // pantalla, y si aun así se intenta salir con datos, el navegador avisa.
  useEffect(() => {
    const html = document.documentElement;
    const antes = [html.style.overscrollBehaviorY, document.body.style.overscrollBehaviorY];
    html.style.overscrollBehaviorY = 'none';
    document.body.style.overscrollBehaviorY = 'none';
    return () => {
      html.style.overscrollBehaviorY = antes[0];
      document.body.style.overscrollBehaviorY = antes[1];
    };
  }, []);
  useEffect(() => {
    if (!hayDatos || saving) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [hayDatos, saving]);

  // Al elegir un servicio asignado: se llena el cliente, se traen los
  // técnicos que el supervisor le asignó (para ofrecerlos como sugerencia) y
  // las fotos que ya se capturaron ese día en el servicio.
  async function handleSeleccionServicio(id: string) {
    if (!id) {
      setServicioSeleccionadoId(null);
      setPersonalAsignado([]);
      setFotosServicio([]);
      return;
    }
    setServicioSeleccionadoId(id);
    const s = serviciosAsignados.find((x) => x.id === id);
    if (s) {
      // Si el servicio ya está ligado a un cliente, el reporte usa ese cliente
      // (no el nombre del proyecto, que suele llevar la etapa).
      const c = s.cliente_id ? catalogoEnCache().find((x) => x.id === s.cliente_id) : null;
      setEmpresaCliente(c?.nombre || s.proyecto);
      setClienteId(s.cliente_id || null);
      setContactosCliente(c?.contactos || []);
    }
    try {
      const nombres = await listarTecnicosDeServicio(id);
      setPersonalAsignado(nombres);
    } catch {
      // sin conexión no se puede consultar: los campos siguen siendo manuales
      setPersonalAsignado([]);
    }
    // Al corregir, las fotos son las del reporte: no se reemplazan por las del servicio.
    if (s && !editarId) {
      setCargandoFotosServicio(true);
      try {
        setFotosServicio(await listarFotosDelDia(s));
      } catch {
        // sin conexión no se pueden traer: el técnico las agrega a mano
        setFotosServicio([]);
      } finally {
        setCargandoFotosServicio(false);
      }
    }
  }

  function removeFotoServicio(i: number) {
    setFotosServicio((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateFotoServicioCaption(i: number, caption: string) {
    setFotosServicio((prev) => prev.map((f, idx) => (idx === i ? { ...f, caption } : f)));
  }

  // Campos sin los que el reporte no sirve como comprobante del servicio.
  // Se calcula en vivo para avisar antes de que el técnico intente guardar,
  // no después.
  const faltantes = useMemo(() => {
    const f: string[] = [];
    if (!empresaCliente.trim()) f.push('empresa / cliente');
    if (!horaLlegada) f.push('hora de llegada');
    // Hora de salida ya no bloquea guardar: si se deja en blanco, se toma la
    // hora actual sola al momento de guardar (ver handleSave).
    if (!ingACargo.trim() && !personalAdicional.some((p) => p.trim())) f.push('al menos una persona en el servicio');
    if (clienteAusente && !motivoAusente.trim()) f.push('el motivo de que el cliente no firmara');
    return f;
  }, [empresaCliente, horaLlegada, horaSalida, ingACargo, personalAdicional, clienteAusente, motivoAusente]);

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

  // Desde el aviso de «días sin reporte» se llega con ?fecha=AAAA-MM-DD para
  // capturar el reporte de un día que quedó pendiente.
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get('fecha');
    if (f && /^\d{4}-\d{2}-\d{2}$/.test(f)) setFecha(f);
  }, []);

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
    setVehiculos(vehiculosEnCache());
    setPersonal(personalEnCache());
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

  function updateActividad(i: number, value: string) {
    setActividades((acts) => acts.map((a, idx) => (idx === i ? value : a)));
  }

  function removeActividad(i: number) {
    setActividades((acts) => (acts.length > 1 ? acts.filter((_, idx) => idx !== i) : ['']));
  }

  // `descartar`: el técnico deja el borrador para empezar otro; el servicio
  // elegido NO se quita de sus pendientes (no se reportó).
  function resetAll(descartar = false) {
    if (borradorUid && !editarId) borrarBorrador(borradorUid).catch(() => {});
    setRecuperadoEn(null);
    if (descartar) setFecha(hoyLocal());
    setIngACargo(''); setPersonalAdicional(['']);
    setPersonalAsignado([]);
    setServicioConcluido(null);
    if (servicioSeleccionadoId && !descartar) {
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
    setEmpresaCliente(''); setClienteId(null); setContactosCliente([]); setOrdCompra(''); setHoraLlegada(''); setHoraSalida('');
    setListaConceptos(''); setContactoUsuario(''); setPuestoArea(''); setTipoServicio(null);
    setVehiculo(''); setPlacas(''); setManejadoPor('');
    setSubTipo(null); setTipoServicioOtroTexto('');
    setUsaFormato(false); setFormatos([]); tokenRef.current = null;
    setShowEtiquetas(false); setShowPreview(false); setPaso(1);
    setSeguridad([]); setSeguridadOtraTexto(''); setObservaciones(''); setActividades(['']); setShowCaso(false);
    setCasoPuntos([{ ...EMPTY_PUNTO }]);
    setTuberias([tuberiaVacia()]);
    setCables([cableVacio()]);
    setSoporteria([soporteriaVacia()]);
    setEquipos([{ cant: '', desc: '', modelo: '', marca: '', serie: '' }]);
    setFirmaIngNombre(''); setFirmaClienteNombre('');
    setClienteAusente(false); setMotivoAusente(''); setRecibioNombre(''); setRecibioPuesto(''); setRecibioFirma(null);
    sigIngRef.current?.clear();
    sigClienteRef.current?.clear();
    fotos.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    setFotos([]);
    setFotosServicio([]);
  }

  function buildSharedData() {
    const personalList = [ingACargo.trim(), ...personalAdicional.map((p) => p.trim())].filter(Boolean);
    const tuberiasOut = tuberias.filter((t) => t.tipo || t.medida || t.cantidad || t.articuloId);
    // «metros» se sigue escribiendo para lectores viejos del formato.
    const cablesOut = cables.filter((c) => c.tipo || c.calibre || c.cantidad || c.articuloId)
      .map((c) => ({ ...c, metros: c.unidad === 'm' ? c.cantidad : '' }));
    const soporteriaOut = soporteria.filter((x) => x.desc || x.medida || x.cantidad || x.articuloId);
    return {
      ingACargo, personal: personalList,
      ordCompra, horaLlegada, horaSalida, listaConceptos, contactoUsuario, puestoArea,
      vehiculo, placas, manejadoPor,
      tipoServicioOtroTexto: tipoServicio === 'Otro' ? tipoServicioOtroTexto : '',
      sistemaSeguridad: seguridad, seguridadOtraTexto: seguridad.includes('Otra') ? seguridadOtraTexto : '',
      observaciones,
      tuberias: tuberiasOut,
      cables: cablesOut,
      soporteria: soporteriaOut,
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
      // Marca de versión: el trigger del almacén solo revisa reportes hechos
      // con el formulario que ya liga equipos al catálogo.
      equiposAlmacen: true,
      servicioProgramadoId: servicioSeleccionadoId || null,
      formatosMtto: conFormato ? formatos : [],
      ...(conFormato ? { tokenVerificacion: tokenVerificacion() } : {}),
      ...(clienteAusente
        ? {
            firmaPendiente: true,
            clienteAusente: {
              motivo: motivoAusente.trim(),
              recibioNombre: recibioNombre.trim(),
              recibioPuesto: recibioPuesto.trim(),
              recibioFirma: recibioFirma || null,
            },
          }
        : {}),
    };
  }

  function getPreviewData(): PreviewData {
    return {
      empresaCliente,
      fecha,
      tipoServicio,
      subTipo,
      data: buildSharedData(),
      fotos: [
        ...fotosServicio.map((f) => ({ previewUrl: f.previewUrl, caption: f.caption })),
        ...fotos.map((f) => ({ previewUrl: f.previewUrl, caption: f.caption })),
      ],
      firmaIngListo: Boolean(sigIngRef.current && !sigIngRef.current.isEmpty()),
      firmaClienteListo: !clienteAusente && Boolean(sigClienteRef.current && !sigClienteRef.current.isEmpty()),
    };
  }

  function irAPaso(n: number) {
    setAvisoPaso(null);
    if (PASOS[n - 1] === 'firmas') setFirmasMontadas(true);
    setPaso(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function siguientePaso() {
    // Lo obligatorio está todo en el paso 1: se avisa ahí mismo en vez de
    // descubrirlo al final.
    if (pasoKey === 'datos' && faltantes.length > 0) {
      setAvisoPaso('Falta por llenar: ' + faltantes.join(', '));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (pasoKey === 'trabajo' && esPreventivo && usaFormato && formatos.length === 0) {
      setAvisoPaso('Elige un formato de mantenimiento o marca «No, solo el reporte».');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (pasoKey === 'formato') {
      const falta = pendientesFormatos(formatos);
      if (falta) {
        setAvisoPaso(falta);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }
    irAPaso(Math.min(PASOS.length, paso + 1));
  }

  // Guarda la corrección completa sobre el mismo reporte. Se conservan los
  // datos que no son del formulario (folio, QR, facturación, firma a
  // distancia) y la revisión final se borra: el contenido cambió y el
  // supervisor debe volver a firmarla.
  async function guardarCorreccion(sharedData: Record<string, any>) {
    const orig = reporteOriginal.current;
    if (!orig || !editarId) return;
    if (!navigator.onLine) {
      setSaving(false);
      setMsg('Para guardar la corrección necesitas conexión.');
      return;
    }
    try {
      const { revisionEstado, facturaEstado, fechaConcluido, ...formulario } = sharedData;
      const fotoData: { path: string; caption: string }[] = fotosServicio.map((f) => ({ path: f.path, caption: f.caption.trim() }));
      for (let i = 0; i < fotos.length; i++) {
        const f = await reducirFoto(fotos[i].file);
        const ext = f.name.split('.').pop() || 'jpg';
        const path = `${editarId}/${Date.now()}-${i}.${ext}`;
        const { error: eUp } = await supabase.storage.from('evidencias').upload(path, f, { contentType: f.type || 'image/jpeg' });
        if (!eUp) fotoData.push({ path, caption: fotos[i].caption.trim() });
      }
      const anterior = orig.data || {};
      const concluyoAhora = sharedData.servicioConcluido && !anterior.servicioConcluido;
      const data = {
        ...anterior,
        ...formulario,
        fotos: fotoData,
        ...(clienteAusente ? {} : { clienteAusente: null, firmaPendiente: false }),
        revisionEstado: 'pendiente',
        firmaRevisionData: null, firmaRevisionNombre: null, firmaRevisionFecha: null,
        ...(concluyoAhora ? { facturaEstado: anterior.facturaEstado || 'pendiente', fechaConcluido: fecha } : {}),
        ...(!sharedData.servicioConcluido && !anterior.facturaEstado ? { facturaEstado: null, fechaConcluido: null } : {}),
      };
      const { error } = await supabase.from('reports').update({
        empresa_cliente: empresaCliente,
        cliente_id: clienteId,
        fecha,
        tipo_servicio: tipoServicio,
        sub_tipo_servicio: subTipo,
        data,
        correccion_habilitada: false,
        correccion_solicitada: false,
        correccion_motivo: null,
        correccion_solicitada_en: null,
      }).eq('id', editarId);
      if (error) throw error;

      // Servicio ligado: si cambió, se libera el anterior y se liga el nuevo.
      const antes = anterior.servicioProgramadoId || null;
      const ahora = servicioSeleccionadoId || null;
      if (antes !== ahora) {
        if (antes) await supabase.from('servicios_programados').update({ report_id: null }).eq('id', antes);
        if (ahora) { try { await vincularReporteAServicio(ahora, editarId); } catch { /* no crítico */ } }
      }

      const folio = anterior.claveFormato ? ` (folio ${anterior.claveFormato})` : '';
      await registrarAccionGlobal('aplico_correccion', 'reporte', editarId, `Corrigió el reporte completo de «${empresaCliente.trim()}»${folio}`);
      await notificar({
        destino: 'supervisores',
        tipo: 'correccion_solicitada',
        titulo: 'Reporte corregido',
        mensaje: `${empresaCliente.trim()}${folio}: ya está corregido y pendiente de revisión`,
        url: '/dashboard/reportes',
        tag: `correccion-${editarId}`,
      });
      setSaving(false);
      showToast('Corrección guardada', 'success');
      resetAll();
      router.push('/mis-reportes');
    } catch (e: any) {
      setSaving(false);
      setMsg('No se pudo guardar la corrección: ' + (e?.message || 'error de conexión'));
    }
  }

  async function handleSave() {
    if (errorEdicion) { setMsg(errorEdicion); return; }
    if (faltantes.length > 0) {
      setMsg('Falta por llenar: ' + faltantes.join(', '));
      // El primer campo pendiente suele estar arriba, fuera de vista.
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Si no se capturó la hora de salida, se toma la hora actual sola en
    // vez de detener el guardado — no se actualiza vía setHoraSalida porque
    // ese cambio de estado no se reflejaría a tiempo aquí abajo (React lo
    // aplica hasta el siguiente render); horaSalidaFinal es lo que de verdad
    // se guarda.
    const horaSalidaFinal = horaSalida || horaActualStr();

    setSaving(true);
    setMsg(null);

    // Datos compartidos entre el guardado en línea y el guardado local (sin conexión).
    const sharedDataBase = { ...buildSharedData(), horaSalida: horaSalidaFinal };
    const sharedData = {
      ...sharedDataBase,
      firmaIngNombre, firmaClienteNombre,
      revisionEstado: 'pendiente',
      servicioConcluido: servicioConcluido === 'si',
      facturaEstado: servicioConcluido === 'si' ? 'pendiente' : null,
      fechaConcluido: servicioConcluido === 'si' ? fecha : null,
      firmaIngData: sigIngRef.current && !sigIngRef.current.isEmpty() ? sigIngRef.current.getDataURL() : null,
      firmaClienteData: !clienteAusente && sigClienteRef.current && !sigClienteRef.current.isEmpty() ? sigClienteRef.current.getDataURL() : null,
      ...(clienteAusente ? { firmaClienteNombre: '' } : {}),
    };

    if (editarId) {
      await guardarCorreccion(sharedData);
      return;
    }

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
          clienteId,
          fecha,
          tipoServicio,
          subTipoServicio: subTipo,
          data: sharedData,
          fotos: fotosForOffline,
          fotosExistentes: fotosServicio.map((f) => ({ path: f.path, caption: f.caption.trim() })),
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
            cliente_id: clienteId,
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

      // Fotos ya capturadas en el servicio: solo se referencia su path, ya
      // están subidas en el mismo bucket — no hace falta volver a subirlas.
      const fotoData: { path: string; caption: string }[] = fotosServicio.map((f) => ({
        path: f.path,
        caption: f.caption.trim(),
      }));
      // Subir fotos de evidencia nuevas, si hay
      for (let i = 0; i < fotos.length; i++) {
        const f = await reducirFoto(fotos[i].file);
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
      // Equipo instalado que no está en el almacén: el reporte ya quedó
      // guardado; se avisa para que el almacenista lo registre.
      const sinRegistro = await sinRegistroDeReporte(reportId);
      if (sinRegistro > 0) {
        const aviso = {
          tipo: 'equipo_sin_registro' as const,
          titulo: 'Equipo instalado sin registro en almacén',
          mensaje: `${sinRegistro} equipo(s) · folio ${claveFormato} · ${empresaCliente.trim()}`,
          url: '/dashboard/almacen?sub=instalados',
          tag: 'equipo-sin-registro',
        };
        await Promise.all([notificar({ destino: 'almacen', ...aviso }), notificar({ destino: 'supervisores', ...aviso })]);
      }
      resetAll();
      // Guardado completo: se cierra el formulario y se regresa a la lista.
      // (Sin conexión se queda aquí: la lista necesita red para cargar.)
      showToast('Reporte guardado', 'success');
      router.push('/mis-reportes');
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
            <h1 className="font-display font-semibold text-base tracking-wide leading-tight truncate">{editarId ? 'Corregir reporte' : 'Nuevo reporte'}</h1>
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

        {editarId && (
          <div className="rounded-2xl px-4 py-3 bg-amber/10 border border-amber/30 text-[13px]">
            <p className="font-semibold text-amber">Corrigiendo el reporte</p>
            <p className="text-muted">Puedes cambiar cualquier dato, el formato y las fotos. Al guardar se actualiza el mismo reporte (mismo folio), vuelve a quedar pendiente de revisión y la corrección se cierra.</p>
          </div>
        )}
        {errorEdicion && (
          <div className="rounded-2xl px-4 py-3 bg-red/10 border border-red/30 text-[13px] text-red font-semibold">
            {errorEdicion} <Link href="/mis-reportes" className="underline">Volver a mis reportes</Link>
          </div>
        )}

        {recuperadoEn && (
          <div className="rounded-2xl px-4 py-3 bg-teal/10 border border-teal/30 flex items-start gap-2.5">
            <History size={18} className="text-teal shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 text-[13px]">
              <p className="font-semibold text-teal">Recuperamos el reporte que estabas llenando</p>
              <p className="text-muted">Guardado en este dispositivo el {new Date(recuperadoEn).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}.</p>
            </div>
            <button type="button" onClick={() => { resetAll(true); window.scrollTo({ top: 0 }); }} className="shrink-0 text-[12.5px] font-semibold text-muted underline py-0.5">
              Empezar otro
            </button>
          </div>
        )}

        {/* Pasos del reporte */}
        <div className="flex gap-1.5" role="tablist" aria-label="Pasos del reporte">
          {PASOS.map((key, i) => {
            const n = i + 1;
            const nombre = ETIQUETA_PASO[key];
            const activo = paso === n;
            const hecho = paso > n;
            return (
              <button
                key={nombre}
                type="button"
                role="tab"
                aria-selected={activo}
                onClick={() => irAPaso(n)}
                className="flex-1 min-w-0 text-left"
              >
                <span className={`block h-1.5 rounded-full mb-1.5 transition-colors ${activo || hecho ? 'bg-teal' : 'bg-line-strong'}`} />
                <span className={`block text-[12px] font-semibold truncate ${activo ? 'text-teal' : hecho ? 'text-ink/80' : 'text-muted'}`}>
                  {n}. {nombre}
                </span>
              </button>
            );
          })}
        </div>

        {avisoPaso && (
          <div className="p-3.5 rounded-2xl bg-amber/10 border border-amber/30 flex items-start gap-2.5">
            <AlertTriangle size={17} strokeWidth={2.4} className="text-amber shrink-0 mt-0.5" />
            <p className="text-[13.5px] text-ink/85">{avisoPaso}</p>
          </div>
        )}

        <div className={pasoKey === 'datos' ? 'flex flex-col gap-4' : 'hidden'}>
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
                Llena el cliente y el personal; puedes cambiarlos.
              </p>

              {serviciosVinculables.length === 0 && (
                <p className="text-[12.5px] text-amber mt-2 leading-relaxed">
                  Ninguno de tus servicios es de hoy; llena el reporte manualmente.
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

          <div className="mb-3"><label className={labelCls}>Empresa / Cliente</label><AutocompletarCliente value={empresaCliente} onChange={(nombre, id, contactos) => { setEmpresaCliente(nombre); setClienteId(id); setContactosCliente(contactos); }} className={inputCls} placeholder="Escribe para buscar en Clientes" /></div>
          {/* Datos del cliente: van junto al cliente. El contacto se sugiere de
              los ya registrados; si es nuevo, al guardar se agrega a Clientes. */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className={labelCls}>Contacto/Usuario</label>
              <AutocompletarPersona
                value={contactoUsuario}
                onChange={(v) => {
                  setContactoUsuario(v);
                  const k = contactosCliente.find((c) => normalizarNombre(c.nombre) === normalizarNombre(v));
                  if (k?.puesto && !puestoArea.trim()) setPuestoArea(k.puesto);
                }}
                grupos={contactosCliente.length > 0 ? [{ etiqueta: 'Contactos de este cliente', nombres: contactosCliente.map((c) => c.nombre) }] : []}
                className={inputCls}
              />
            </div>
            <div><label className={labelCls}>Puesto/Área</label><input type="text" className={inputCls} value={puestoArea} onChange={(e) => setPuestoArea(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div><label className={labelCls}>Fecha</label><input type="date" className={inputCls} value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
            <div><label className={labelCls}>Orden de compra</label><input type="text" className={inputCls} value={ordCompra} onChange={(e) => setOrdCompra(e.target.value)} /></div>
            <div><label className={labelCls}>Hora llegada</label><input type="time" className={inputCls} value={horaLlegada} onChange={(e) => setHoraLlegada(e.target.value)} /></div>
            <div>
              <label className={labelCls}>Hora salida</label>
              <input type="time" className={inputCls} value={horaSalida} onChange={(e) => setHoraSalida(e.target.value)} />
              <p className="text-[11px] text-faint mt-1">Si se deja en blanco, se toma la hora actual al guardar.</p>
            </div>
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

        </div>

        <div className={pasoKey === 'trabajo' ? 'flex flex-col gap-4' : 'hidden'}>
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

        {esPreventivo && (
          <SelectorFormatos
            usaFormato={usaFormato}
            setUsaFormato={setUsaFormato}
            formatos={formatos}
            setFormatos={setFormatos}
            sistemas={seguridad}
            onAgregarSistema={(s) => setSeguridad((prev) => (prev.includes(s) ? prev : [...prev, s]))}
          />
        )}

        {/* Lo que salió del almacén para este servicio: se carga en las
            secciones de abajo con un toque. */}
        {servicioSeleccionadoId && (
          <TraerDelVale
            servicioId={servicioSeleccionadoId}
            onTraer={(m) => {
              const sinVacios = <T,>(lista: T[], vacio: (x: T) => boolean) => lista.filter((x) => !vacio(x));
              if (m.tuberias.length) setTuberias((p) => [...sinVacios(p, (x) => !x.tipo && !x.medida && !x.cantidad && !x.articuloId), ...m.tuberias]);
              if (m.cables.length) setCables((p) => [...sinVacios(p, (x) => !x.tipo && !x.calibre && !x.cantidad && !x.articuloId), ...m.cables]);
              if (m.soporteria.length) setSoporteria((p) => [...sinVacios(p, (x) => !x.desc && !x.medida && !x.cantidad && !x.articuloId), ...m.soporteria]);
              if (m.equipos.length) setEquipos((p) => [...sinVacios(p, (x) => !x.cant && !x.desc && !x.modelo && !x.marca && !x.serie), ...m.equipos]);
            }}
          />
        )}

        {/* Tubería */}
        <Plegable titulo="Tubería" cuenta={tuberias.filter((t) => t.tipo || t.cantidad || t.articuloId).length}>
          <SeccionTuberia filas={tuberias} onCambiar={setTuberias} catalogo={catalogoEquipos} inputCls={inputCls} />
        </Plegable>

        {/* Cable instalado */}
        <Plegable titulo="Cable instalado" cuenta={cables.filter((c) => c.tipo || c.cantidad || c.articuloId).length}>
          <SeccionCable filas={cables} onCambiar={setCables} catalogo={catalogoEquipos} inputCls={inputCls} />
        </Plegable>

        {/* Montaje de soportería y fijación */}
        <Plegable titulo="Montaje de soportería y fijación" cuenta={soporteria.filter((x) => x.desc || x.cantidad || x.articuloId).length}>
          <SeccionSoporteria filas={soporteria} onCambiar={setSoporteria} catalogo={catalogoEquipos} inputCls={inputCls} />
        </Plegable>

        {/* Montaje de equipo */}
        <Plegable titulo="Montaje de equipo" cuenta={equipos.filter((e) => e.cant || e.desc || e.modelo || e.marca || e.serie).length}>
          {equipos.map((eq, i) => (
            <EquipoInstaladoRenglon
              key={i}
              eq={eq}
              catalogo={catalogoEquipos}
              inputCls={inputCls}
              onCambiar={(nuevo) => setEquipos((eqs) => eqs.map((e, idx) => (idx === i ? nuevo : e)))}
              onQuitar={equipos.length > 1 ? () => setEquipos((eqs) => eqs.filter((_, idx) => idx !== i)) : undefined}
            />
          ))}
          <button
            type="button"
            onClick={() => setEquipos([...equipos, { cant: '', desc: '', modelo: '', marca: '', serie: '' }])}
            className="w-full mt-1 border border-dashed border-teal/50 text-teal py-2 rounded-xl text-[13px] font-medium active:scale-95 transition-transform"
          >
            + Agregar equipo
          </button>
        </Plegable>

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

        </div>

        {conFormato && (
          <div className={pasoKey === 'formato' ? 'flex flex-col gap-4' : 'hidden'}>
            <PasoFormato formatos={formatos} setFormatos={setFormatos} clienteId={clienteId} />
          </div>
        )}

        <div className={pasoKey === 'evidencia' ? 'flex flex-col gap-4' : 'hidden'}>
        {/* Fotos de evidencia */}
        <div className={cardCls}>
          <p className={cardTitleCls}><span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Fotos de evidencia</p>

          {(servicioSeleccionadoId || editarId) && (cargandoFotosServicio || fotosServicio.length > 0) && (
            <div className="mb-4">
              <p className="text-[11px] font-semibold text-teal uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Camera size={12} strokeWidth={2.6} /> {editarId ? 'Fotos del reporte' : 'Capturadas en este servicio'}
              </p>
              {cargandoFotosServicio ? (
                <p className="text-[12px] text-muted">Buscando fotos que ya tomaste en campo hoy…</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {fotosServicio.map((f, i) => (
                      <div key={f.path} className="relative">
                        <img src={f.previewUrl} alt={`Foto del servicio ${i + 1}`} className="w-full h-20 object-cover rounded-lg border border-line" />
                        <button
                          type="button"
                          onClick={() => removeFotoServicio(i)}
                          aria-label="Quitar foto"
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red text-white text-[11px] leading-none active:scale-90 transition-transform"
                        >
                          <X size={19} strokeWidth={2.6} />
                        </button>
                        <input
                          type="text"
                          placeholder="Comentario..."
                          value={f.caption}
                          onChange={(e) => updateFotoServicioCaption(i, e.target.value)}
                          className="w-full mt-1.5 px-2 py-1 text-[11px] rounded-md bg-surface-2 border border-line focus:border-teal focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted mt-2.5">{editarId ? 'Son las fotos que ya tenía el reporte: quita las que sobren o agrega nuevas abajo.' : 'Se agregaron solas porque ya las tomaste en el servicio de hoy — quita las que no apliquen.'}</p>
                </>
              )}
            </div>
          )}

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

        </div>

        {firmasMontadas && (
        <div className={pasoKey === 'firmas' ? 'flex flex-col gap-4' : 'hidden'}>
        {/* Firmas */}
        <div className={cardCls}>
          <p className={cardTitleCls}><span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Firmas</p>
          <div className="mb-2.5"><label className={labelCls}>Ing. responsable de ejecución</label><input type="text" className={inputCls} value={firmaIngNombre} onChange={(e) => setFirmaIngNombre(e.target.value)} /></div>
          <div className="rounded-xl overflow-hidden border border-line">
            <SignaturePad ref={sigIngRef} titulo="Firma del ingeniero responsable" inicial={firmaIngData} onCambio={setFirmaIngData} />
          </div>
          <div className="mb-4" />

          <label className={labelCls}>Firma del cliente</label>
          <span className={chipCls(!clienteAusente)} onClick={() => setClienteAusente(false)}>Firma aquí</span>
          <span className={chipCls(clienteAusente)} onClick={() => setClienteAusente(true)}>El cliente no está</span>

          {!clienteAusente ? (
            <>
              <div className="mb-2.5"><label className={labelCls}>Nombre del cliente</label><input type="text" className={inputCls} value={firmaClienteNombre} onChange={(e) => setFirmaClienteNombre(e.target.value)} /></div>
              <div className="rounded-xl overflow-hidden border border-line">
                <SignaturePad ref={sigClienteRef} titulo="Firma del cliente" inicial={firmaClienteData} onCambio={setFirmaClienteData} />
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-amber/40 bg-amber/5 p-3 flex flex-col gap-2.5">
              <p className="text-[12.5px] text-ink/80 leading-snug">
                El reporte se guarda con <b>firma pendiente</b>. Después, desde el detalle del reporte, le mandas al cliente un enlace por WhatsApp para que firme desde su celular.
              </p>
              <div>
                <label className={labelCls}>Motivo</label>
                {['Salió del sitio', 'No estaba en la bodega', 'No contestó', 'Fuera de horario'].map((m) => (
                  <span key={m} className={chipCls(motivoAusente === m)} onClick={() => setMotivoAusente(motivoAusente === m ? '' : m)}>{m}</span>
                ))}
                <input type="text" className={inputCls} value={motivoAusente} onChange={(e) => setMotivoAusente(e.target.value)} placeholder="Otro motivo" />
              </div>
              <div className="grid grid-cols-[1.3fr_1fr] gap-2">
                <div><label className={labelCls}>Quién recibió</label><input type="text" className={inputCls} value={recibioNombre} onChange={(e) => setRecibioNombre(e.target.value)} placeholder="Nombre" /></div>
                <div><label className={labelCls}>Puesto</label><input type="text" className={inputCls} value={recibioPuesto} onChange={(e) => setRecibioPuesto(e.target.value)} placeholder="Vigilante" /></div>
              </div>
              <div>
                <label className={labelCls}>Firma de quien recibió (opcional)</label>
                <div className="rounded-xl overflow-hidden border border-line">
                  <SignaturePad titulo="Firma de quien recibió" inicial={recibioFirma} onCambio={setRecibioFirma} />
                </div>
              </div>
            </div>
          )}

          <p className="text-[11px] text-muted mt-3 leading-relaxed">
            El reporte quedará como <b>pendiente de revisión</b> hasta que {MARCA.revisor} lo firme desde el panel.
          </p>
        </div>

        {msg && (
          <div className={`text-sm px-4 py-3 rounded-xl ${msg.startsWith('Error') ? 'bg-red/10 text-red border border-red/30' : 'bg-teal/10 text-teal border border-teal/30'}`}>
            {msg}
          </div>
        )}

        {conFormato && (
          <button
            type="button"
            onClick={() => {
              const falta = pendientesFormatos(formatos);
              if (falta) {
                setMsg(falta);
                return;
              }
              setShowEtiquetas(true);
            }}
            className="w-full min-h-[52px] rounded-2xl border border-teal/50 text-teal font-display font-semibold text-[15px] tracking-wide flex items-center justify-center gap-2 active:scale-95 transition-transform mb-3"
          >
            <Tag size={17} strokeWidth={2.3} />
            Etiqueta{formatos.length > 1 ? 's' : ''} de mantenimiento
          </button>
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
              <button type="button" onClick={() => irAPaso(1)} className="mt-2 text-[13px] font-semibold text-teal">
                Ir a Datos
              </button>
            </div>
          </div>
        )}

        </div>
        )}
      </div>

      {showEtiquetas && (
        <EtiquetasMantenimiento
          formatos={formatos}
          token={tokenVerificacion()}
          cliente={empresaCliente}
          fecha={fecha}
          tecnico={ingACargo || firmaIngNombre}
          onClose={() => setShowEtiquetas(false)}
        />
      )}

      {showPreview && <ReportPreviewModal preview={getPreviewData()} onClose={() => setShowPreview(false)} />}

      {/* Barra inferior: moverse entre pasos y guardar al final */}
      <div
        className="fixed bottom-0 inset-x-0 z-30 glass-strong border-t border-line px-4 pt-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-2xl mx-auto flex items-center gap-2.5">
          {paso === 1 ? (
            <Link href="/mis-reportes" className="min-h-[50px] px-4 rounded-2xl border border-line-strong text-[14px] font-medium text-ink/80 flex items-center">
              Cancelar
            </Link>
          ) : (
            <button type="button" onClick={() => irAPaso(paso - 1)} className="min-h-[50px] px-4 rounded-2xl border border-line-strong text-[14px] font-medium text-ink/80">
              Atrás
            </button>
          )}
          {paso < PASOS.length ? (
            <button
              type="button"
              onClick={siguientePaso}
              className="flex-1 min-h-[50px] rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15px] tracking-wide shadow-glow-teal active:scale-95 transition-transform"
            >
              Siguiente: {ETIQUETA_PASO[PASOS[paso]]}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || faltantes.length > 0}
              className="flex-1 min-h-[50px] rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15px] tracking-wide shadow-glow-teal active:scale-95 transition-transform disabled:opacity-50"
            >
              {saving ? 'Guardando...' : editarId ? 'Guardar corrección' : 'Guardar reporte'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
