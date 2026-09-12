'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  InsumoConEstado, CategoriaInsumo, CATEGORIAS, UNIDADES, MOTIVOS_FALTANTE, MotivoFaltante,
  MOTIVOS_NO_ENTREGADO, MotivoNoEntregado, insumosADevolver, insumosNoEntregados,
  Resguardo, obtenerInsumos, calcularProgresoInsumos, marcarInsumo, agregarInsumo, eliminarInsumo,
  obtenerResguardos, firmarResguardo, registrarFaltante, registrarNoEntregado, confirmarRecepcion,
  Insumo, listarSolicitudesInsumo, resolverSolicitudInsumo,
  marcarInsumosEnLote, registrarMotivoEnLote,
} from '@/lib/insumos';
import SignaturePad, { SignaturePadHandle } from '@/components/SignaturePad';
import ProgressBar from '@/components/ProgressBar';
import ModalOverlay from '@/components/ModalOverlay';
import SelectorArticulo from '@/components/SelectorArticulo';
import { createClient } from '@/lib/supabaseClient';
import { showToast } from '@/components/Toast';
import { Plus, X, Check, Square, PackageCheck, PackageX, PackagePlus, AlertTriangle, Wrench, Package, HardHat, PenLine, Info, CheckCheck } from 'lucide-react';

function nombreDe(r: { profiles?: any }): string {
  const p = r.profiles;
  const nombre = Array.isArray(p) ? p[0]?.full_name : p?.full_name;
  return nombre || 'el técnico';
}

function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', hour12: false, minute: '2-digit' });
}

const ICONO_CATEGORIA: Record<CategoriaInsumo, any> = {
  herramienta: Wrench,
  material: Package,
  equipo: HardHat,
};

// Checklist de carga. Lo usan técnico y supervisor sobre los mismos datos; lo
// que cambia es qué puede editar cada quien (`puedeEditarTodo`).
export default function InsumosChecklist({
  grupoId,
  servicioId,
  proyecto,
  puedeEditarTodo = false,
  soloLectura = false,
  // Marcar las casillas es exclusivo del técnico: es quien responde por la
  // herramienta. El supervisor ve, recibe y confirma.
  puedeMarcar = false,
  onCambio,
}: {
  grupoId: string;
  servicioId: string;
  proyecto?: string;
  puedeEditarTodo?: boolean;
  soloLectura?: boolean;
  puedeMarcar?: boolean;
  onCambio?: () => void;
}) {
  const [lista, setLista] = useState<InsumoConEstado[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // La verificación es diaria y en dos momentos: al cargar y al regresar.
  // Un solo modo activo a la vez evita dos casillas por renglón, que en
  // pantalla chica se tocan por error.
  const [modo, setModo] = useState<'salida' | 'retorno'>('salida');
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [resguardos, setResguardos] = useState<Resguardo[]>([]);
  const [showFirma, setShowFirma] = useState(false);
  const firmaRef = useRef<SignaturePadHandle | null>(null);
  // Cuando algo no regresa hay que decir por qué: una casilla en blanco no
  // distingue una pérdida de un olvido al marcar.
  const [faltanteActivo, setFaltanteActivo] = useState<InsumoConEstado | null>(null);
  // Cuando el motivo aplica a varias piezas a la vez, en vez de una.
  const [motivoMasivo, setMotivoMasivo] = useState(false);
  const [showRecepcion, setShowRecepcion] = useState(false);
  const [ajusteActivo, setAjusteActivo] = useState<InsumoConEstado | null>(null);
  const [cantidadAjuste, setCantidadAjuste] = useState('');
  const [motivo, setMotivo] = useState<string>('en_obra');
  const [notaFaltante, setNotaFaltante] = useState('');

  const [showAgregar, setShowAgregar] = useState(false);
  const [nuevaCategoria, setNuevaCategoria] = useState<CategoriaInsumo>('herramienta');
  const [nuevoArticuloId, setNuevoArticuloId] = useState<string | null>(null);
  const [nuevaDescripcion, setNuevaDescripcion] = useState('');
  const [nuevaCantidad, setNuevaCantidad] = useState('1');
  const [nuevaUnidad, setNuevaUnidad] = useState('pza');
  const [unidadLibre, setUnidadLibre] = useState('');
  const [motivoSolicitud, setMotivoSolicitud] = useState('');
  const [solicitudes, setSolicitudes] = useState<Insumo[]>([]);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Cada parte se carga por separado: si falla una (por ejemplo un patch de
  // SQL pendiente), las otras deben seguir funcionando. Antes iban en un solo
  // Promise.all y un fallo dejaba la sección en blanco sin explicación.
  async function cargar() {
    const fallos: string[] = [];

    const [rl, rr, rs] = await Promise.allSettled([
      obtenerInsumos(grupoId, servicioId),
      obtenerResguardos(servicioId),
      listarSolicitudesInsumo(grupoId),
    ]);

    if (rl.status === 'fulfilled') setLista(rl.value);
    else fallos.push(`lista: ${(rl.reason as any)?.message || 'error'}`);

    if (rr.status === 'fulfilled') setResguardos(rr.value);
    else fallos.push(`resguardos: ${(rr.reason as any)?.message || 'error'}`);

    if (rs.status === 'fulfilled') setSolicitudes(rs.value);
    else fallos.push(`solicitudes: ${(rs.reason as any)?.message || 'error'}`);

    setErrorCarga(fallos.length > 0 ? fallos.join(' · ') : null);
    setLoading(false);
  }

  useEffect(() => { cargar(); }, [grupoId, servicioId]);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setUsuarioId(data.user?.id || null));
  }, []);

  const progreso = useMemo(() => calcularProgresoInsumos(lista), [lista]);

  // En el retorno solo se muestra lo que efectivamente salió: no se puede
  // devolver algo que el almacén nunca entregó.
  const listaVisible = useMemo(
    () => (modo === 'retorno' ? insumosADevolver(lista) : lista),
    [lista, modo]
  );

  const noEntregados = useMemo(() => insumosNoEntregados(lista), [lista]);

  const porCategoria = useMemo(() => {
    const mapa: Record<CategoriaInsumo, InsumoConEstado[]> = { herramienta: [], material: [], equipo: [] };
    listaVisible.forEach((i) => mapa[i.categoria].push(i));
    return mapa;
  }, [listaVisible]);

  const resguardoSalida = resguardos.find((r) => r.tipo === 'salida');
  const resguardoDevolucion = resguardos.find((r) => r.tipo === 'devolucion');
  // Una vez firmado, el documento no se altera: eso es lo que le da valor.
  const bloqueado = modo === 'salida' ? !!resguardoSalida : !!resguardoDevolucion;

  function cantidadDe(i: InsumoConEstado): number {
    return modo === 'salida' ? (i.estado?.cantidad_entregada || 0) : (i.estado?.cantidad_retornada || 0);
  }

  // Cuánto se puede devolver: solo lo que se entregó.
  function maximoDe(i: InsumoConEstado): number {
    return modo === 'salida' ? i.cantidad : (i.estado?.cantidad_entregada || 0);
  }

  async function handleMarcar(insumo: InsumoConEstado) {
    if (soloLectura || !puedeMarcar || bloqueado) return;
    const actual = cantidadDe(insumo) > 0;
    // Optimista: en el almacén se marcan muchos seguidos y esperar al servidor
    // en cada uno se siente lento.
    const nuevaCantidad = actual ? 0 : maximoDe(insumo);
    setLista((prev) => prev.map((i) => (i.id === insumo.id
      ? { ...i, estado: { ...(i.estado || {}), [modo]: !actual,
          [modo === 'salida' ? 'cantidad_entregada' : 'cantidad_retornada']: nuevaCantidad } as any }
      : i)));
    try {
      await marcarInsumo(insumo.id, servicioId, modo, nuevaCantidad);
      onCambio?.();
    } catch (e: any) {
      await cargar();
      alert('No se pudo guardar: ' + (e?.message || 'error'));
    }
  }

  // Piezas del modo actual que siguen sin marcar.
  // Cuenta como pendiente lo que no se entregó y también lo entregado a
  // medias: en ambos casos falta algo por explicar.
  const sinMarcar = listaVisible.filter((i) => {
    const cant = modo === 'salida' ? (i.estado?.cantidad_entregada || 0) : (i.estado?.cantidad_retornada || 0);
    const max = modo === 'salida' ? i.cantidad : (i.estado?.cantidad_entregada || 0);
    return cant < max;
  });
  const sinMotivo = sinMarcar.filter((i) =>
    modo === 'salida' ? !i.estado?.motivo_no_entregado : !i.estado?.motivo_faltante
  );

  async function handleMarcarTodas() {
    const pendientes = sinMarcar.map((i) => ({ id: i.id, cantidad: maximoDe(i) })).filter((x) => x.cantidad > 0);
    if (pendientes.length === 0) return;
    const texto = modo === 'salida'
      ? `Vas a marcar ${pendientes.length} pieza(s) como recibidas. Hazlo solo si ya las tienes contigo.`
      : `Vas a marcar ${pendientes.length} pieza(s) como devueltas al almacén.`;
    if (!confirm(texto)) return;

    setBusy(true);
    try {
      await marcarInsumosEnLote(pendientes, servicioId, modo === 'salida' ? 'salida' : 'retorno', true);
      await cargar();
      onCambio?.();
    } catch (e: any) {
      alert('No se pudo marcar: ' + (e?.message || 'error'));
    } finally {
      setBusy(false);
    }
  }

  async function handleQuitarTodas() {
    const marcadas = listaVisible
      .filter((i) => cantidadDe(i) > 0)
      .map((i) => ({ id: i.id, cantidad: maximoDe(i) }));
    if (marcadas.length === 0) return;
    if (!confirm(`Se quitarán las marcas de ${marcadas.length} pieza(s).`)) return;

    setBusy(true);
    try {
      await marcarInsumosEnLote(marcadas, servicioId, modo === 'salida' ? 'salida' : 'retorno', false);
      await cargar();
      onCambio?.();
    } catch (e: any) {
      alert('No se pudo quitar: ' + (e?.message || 'error'));
    } finally {
      setBusy(false);
    }
  }

  async function handleGuardarAjuste() {
    if (!ajusteActivo) return;
    const max = maximoDe(ajusteActivo);
    const valor = parseFloat(cantidadAjuste);
    if (isNaN(valor) || valor < 0) {
      alert('Escribe cuántas piezas.');
      return;
    }
    if (valor > max) {
      alert(`No puedes registrar más de ${max} ${ajusteActivo.unidad}.`);
      return;
    }
    setBusy(true);
    try {
      await marcarInsumo(ajusteActivo.id, servicioId, modo === 'salida' ? 'salida' : 'retorno', valor);
      setAjusteActivo(null);
      setCantidadAjuste('');
      await cargar();
      onCambio?.();
    } catch (e: any) {
      alert('No se pudo guardar: ' + (e?.message || 'error'));
    } finally {
      setBusy(false);
    }
  }

  async function handleGuardarMotivoMasivo() {
    setBusy(true);
    try {
      await registrarMotivoEnLote(
        sinMotivo.map((i) => i.id),
        servicioId,
        modo === 'salida' ? 'salida' : 'retorno',
        motivo,
        notaFaltante
      );
      showToast(`Motivo aplicado a ${sinMotivo.length} pieza(s)`, 'success');
      setMotivoMasivo(false);
      setNotaFaltante('');
      await cargar();
      onCambio?.();
    } catch (e: any) {
      alert('No se pudo guardar: ' + (e?.message || 'error'));
    } finally {
      setBusy(false);
    }
  }

  async function handleGuardarFaltante() {
    if (!faltanteActivo) return;
    try {
      if (modo === 'salida') {
        await registrarNoEntregado(faltanteActivo.id, servicioId, motivo as MotivoNoEntregado, notaFaltante);
      } else {
        await registrarFaltante(faltanteActivo.id, servicioId, motivo as MotivoFaltante, notaFaltante);
      }
      setFaltanteActivo(null);
      setNotaFaltante('');
      setMotivo('en_obra');
      await cargar();
    } catch (e: any) {
      alert('No se pudo guardar: ' + (e?.message || 'error'));
    }
  }

  async function handleFirmar() {
    const dataUrl = firmaRef.current?.getDataURL();
    if (!dataUrl || firmaRef.current?.isEmpty()) {
      alert('Falta la firma.');
      return;
    }
    // Lo que no se marcó necesita motivo antes de cerrar, en los dos sentidos:
    // en la salida para saber qué no entregó el almacén, y en el retorno para
    // saber qué pasó con lo que no volvió.
    if (modo === 'salida') {
      const sinMotivo = lista.filter((i) => !i.estado?.salida && !i.estado?.motivo_no_entregado);
      if (sinMotivo.length > 0) {
        alert(`Falta indicar por qué no se te entregaron ${sinMotivo.length} pieza(s). Toca cada una para elegir el motivo.`);
        return;
      }
    } else {
      const sinMotivo = insumosADevolver(lista).filter((i) => !i.estado?.retorno && !i.estado?.motivo_faltante);
      if (sinMotivo.length > 0) {
        alert(`Falta explicar qué pasó con ${sinMotivo.length} pieza(s) que no regresaron. Toca cada una para indicar el motivo.`);
        return;
      }
    }
    setBusy(true);
    try {
      await firmarResguardo(modo === 'salida' ? 'salida' : 'devolucion', servicioId, proyecto || 'el proyecto', lista, dataUrl);
      showToast(modo === 'salida' ? 'Resguardo firmado' : 'Devolución firmada', 'success');
      setShowFirma(false);
      await cargar();
      onCambio?.();
    } catch (e: any) {
      alert('No se pudo firmar: ' + (e?.message || 'error'));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmarRecepcion(destino: 'general' | 'proyecto') {
    setBusy(true);
    try {
      await confirmarRecepcion(servicioId, proyecto || 'el proyecto', destino);
      setShowRecepcion(false);
      showToast('Recepción confirmada', 'success');
      await cargar();
      onCambio?.();
    } catch (e: any) {
      alert('No se pudo confirmar: ' + (e?.message || 'error'));
    } finally {
      setBusy(false);
    }
  }

  async function handleAgregar() {
    if (!nuevoArticuloId || !nuevaDescripcion.trim()) {
      alert('Elige del catálogo qué necesitas.');
      return;
    }
    if (!(parseFloat(nuevaCantidad) > 0)) {
      alert('Indica la cantidad.');
      return;
    }
    setBusy(true);
    try {
      await agregarInsumo({
        grupoId,
        servicioId,
        categoria: nuevaCategoria,
        descripcion: nuevaDescripcion,
        cantidad: parseFloat(nuevaCantidad) || 1,
        unidad: nuevaUnidad === '__otra' ? (unidadLibre.trim() || 'pza') : nuevaUnidad,
        esDelTecnico: !puedeEditarTodo,
        proyecto,
        motivo: motivoSolicitud,
        articuloId: nuevoArticuloId,
      });
      showToast(puedeEditarTodo ? 'Agregado a la lista' : 'Solicitud enviada al supervisor', 'success');
      setShowAgregar(false);
      setNuevaDescripcion(''); setNuevaCantidad('1'); setNuevaUnidad('pza'); setUnidadLibre(''); setMotivoSolicitud(''); setNuevoArticuloId(null);
      await cargar();
      onCambio?.();
    } catch (e: any) {
      alert('No se pudo agregar: ' + (e?.message || 'error'));
    } finally {
      setBusy(false);
    }
  }

  async function handleResolverSolicitud(sol: Insumo, aprobar: boolean) {
    setBusy(true);
    try {
      await resolverSolicitudInsumo({ ...sol, proyecto }, aprobar);
      showToast(aprobar ? 'Agregado a la lista' : 'Solicitud rechazada', 'success');
      await cargar();
      onCambio?.();
    } catch (e: any) {
      alert('No se pudo procesar: ' + (e?.message || 'error'));
    } finally {
      setBusy(false);
    }
  }

  async function handleEliminar(insumo: InsumoConEstado) {
    if (!confirm(`¿Quitar «${insumo.descripcion}» de la lista?`)) return;
    try {
      await eliminarInsumo(insumo.id);
      await cargar();
      onCambio?.();
    } catch (e: any) {
      alert('No se pudo quitar: ' + (e?.message || 'error'));
    }
  }

  if (loading) {
    return <div className="rounded-2xl bg-surface-2 h-[120px] animate-pulse" aria-busy="true" />;
  }

  const marcados = modo === 'salida' ? progreso.salieron : progreso.regresaron;
  // El retorno se mide contra lo que salió, no contra la lista completa.
  const universo = modo === 'salida' ? progreso.total : progreso.salieron;
  const pct = universo > 0 ? Math.round((marcados / universo) * 100) : 0;

  return (
    <div>
      {errorCarga && (
        <div className="mb-4 p-4 rounded-2xl bg-red/10 border border-red/30">
          <p className="text-[14px] font-semibold text-red mb-1">Algo no se pudo cargar</p>
          <p className="text-[13px] text-ink/80 leading-relaxed">{errorCarga}</p>
          <p className="text-[12.5px] text-muted mt-2 leading-relaxed">
            Si menciona una columna o tabla que no existe, falta correr un patch de SQL en Supabase.
          </p>
        </div>
      )}

      {/* Avance del día */}
      <div className="flex items-baseline justify-between mb-1.5">
        <p className="text-[13px] text-muted">
          {marcados} de {universo} {modo === 'salida' ? 'cargados' : 'de regreso'}
        </p>
        <span className={`font-display font-bold text-[15px] ${pct >= 100 ? 'text-teal' : 'text-amber'}`}>{pct}%</span>
      </div>
      <ProgressBar pct={pct} />

      {/* Estado del ciclo: quién firmó qué y qué falta */}
      {(resguardoSalida || resguardoDevolucion) && (
        <div className="mt-3 p-3.5 rounded-xl bg-surface border border-line">
          {resguardoSalida && (
            <p className="text-[13px] text-ink/85 flex items-start gap-2">
              <PackageCheck size={15} strokeWidth={2.4} className="text-teal shrink-0 mt-0.5" />
              Resguardo firmado por {nombreDe(resguardoSalida)} · {fmtFecha(resguardoSalida.firmado_en)}
            </p>
          )}
          {resguardoDevolucion && (
            <p className="text-[13px] text-ink/85 flex items-start gap-2 mt-1.5">
              <PackageCheck size={15} strokeWidth={2.4} className="text-teal shrink-0 mt-0.5" />
              Devolución firmada por {nombreDe(resguardoDevolucion)} · {fmtFecha(resguardoDevolucion.firmado_en)}
            </p>
          )}
          {resguardoDevolucion && (
            resguardoDevolucion.recibido_en ? (
              <p className="text-[13px] text-teal font-medium flex items-center gap-2 mt-1.5">
                <Check size={15} strokeWidth={3} className="shrink-0" />
                Recibida en almacén · {fmtFecha(resguardoDevolucion.recibido_en)}
              </p>
            ) : puedeEditarTodo ? (
              <button
                onClick={() => setShowRecepcion(true)}
                disabled={busy}
                className="w-full min-h-[46px] mt-2.5 rounded-xl bg-teal text-inkOnAccent text-[14px] font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
              >
                <Check size={16} strokeWidth={3} />
                Confirmar recepción en almacén
              </button>
            ) : (
              <p className="text-[13px] text-amber font-medium mt-1.5">Pendiente de que el supervisor confirme la recepción.</p>
            )
          )}
        </div>
      )}

      {/* Instrucción del ciclo. Cambia según el momento y desaparece cuando
          ya se firmó, porque entonces no hay nada que revisar. */}
      {puedeMarcar && !bloqueado && progreso.total > 0 && (
        <div className="mt-4 p-4 rounded-xl bg-amber/10 border border-amber/30 flex items-start gap-2.5">
          <Info size={17} strokeWidth={2.4} className="text-amber shrink-0 mt-0.5" />
          <p className="text-[13.5px] text-ink/85 leading-relaxed">
            {modo === 'salida' ? (
              <>
                Antes de firmar, verifica que el almacén te haya entregado <strong>cada pieza de la lista</strong>. Marca
                únicamente lo que recibas; si algo no te lo entregaron, indica el motivo. Al firmar, todo lo marcado queda
                bajo tu resguardo.
              </>
            ) : (
              <>
                Marca lo que estés devolviendo al almacén. Si alguna pieza no regresa, indica qué pasó con ella antes de
                firmar. La firma cierra tu responsabilidad sobre lo devuelto.
              </>
            )}
          </p>
        </div>
      )}

      {/* Salida / retorno */}
      <div className="flex gap-2 mt-3 mb-4">
        <button
          onClick={() => setModo('salida')}
          className={`flex-1 min-h-[46px] rounded-xl text-[14px] font-semibold border transition-colors ${
            modo === 'salida' ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line-strong text-ink/80'
          }`}
        >
          Salida
        </button>
        <button
          onClick={() => setModo('retorno')}
          className={`flex-1 min-h-[46px] rounded-xl text-[14px] font-semibold border transition-colors ${
            modo === 'retorno' ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line-strong text-ink/80'
          }`}
        >
          Retorno
        </button>
      </div>

      {/* Solicitudes pendientes: el supervisor decide, el técnico ve en qué van */}
      {solicitudes.length > 0 && (
        <div className="mb-4 p-4 rounded-2xl bg-amber/10 border-2 border-amber/35">
          <p className="font-display font-semibold text-[14.5px] text-amber mb-2.5 flex items-center gap-2">
            <PackagePlus size={17} strokeWidth={2.5} />
            {solicitudes.length === 1
              ? 'Hay 1 solicitud de herramienta'
              : `Hay ${solicitudes.length} solicitudes de herramienta`}
          </p>

          <div className="flex flex-col gap-2.5">
            {solicitudes.map((sol) => (
              <div key={sol.id} className="rounded-xl bg-surface border border-line p-3.5">
                <p className="text-[14.5px] font-medium">
                  {sol.cantidad} {sol.unidad} de {sol.descripcion}
                </p>
                <p className="text-[12.5px] text-muted mt-0.5">
                  {CATEGORIAS.find((c) => c.valor === sol.categoria)?.label}
                  {sol.motivo_solicitud ? ` · ${sol.motivo_solicitud}` : ''}
                </p>

                {puedeEditarTodo ? (
                  <div className="flex gap-2 mt-2.5">
                    <button
                      onClick={() => handleResolverSolicitud(sol, false)}
                      disabled={busy}
                      className="flex-1 min-h-[44px] rounded-xl border border-line-strong text-ink/80 text-[14px] font-medium active:scale-95 transition-transform disabled:opacity-60"
                    >
                      Rechazar
                    </button>
                    <button
                      onClick={() => handleResolverSolicitud(sol, true)}
                      disabled={busy}
                      className="flex-1 min-h-[44px] rounded-xl bg-teal text-inkOnAccent text-[14px] font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-transform disabled:opacity-60"
                    >
                      <Check size={15} strokeWidth={3} />
                      Autorizar
                    </button>
                  </div>
                ) : (
                  <p className="text-[12.5px] text-amber font-medium mt-1.5">
                    Esperando que el supervisor la autorice
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lo que el almacén no entregó: visible en los dos modos, para que ni
          el técnico ni el supervisor lo den por perdido. */}
      {noEntregados.length > 0 && (
        <div className="mb-4 p-3.5 rounded-xl bg-surface border border-line">
          <p className="text-[13px] font-semibold text-amber mb-1.5 flex items-center gap-2">
            <PackageX size={15} strokeWidth={2.4} />
            {noEntregados.length === 1 ? 'Una pieza no se entregó' : `${noEntregados.length} piezas no se entregaron`}
          </p>
          {noEntregados.map((i) => (
            <p key={i.id} className="text-[12.5px] text-muted leading-relaxed">
              {i.cantidad} {i.unidad} de {i.descripcion} — {MOTIVOS_NO_ENTREGADO.find((m) => m.valor === i.estado?.motivo_no_entregado)?.label}
              {i.estado?.nota_no_entregado ? `: ${i.estado.nota_no_entregado}` : ''}
            </p>
          ))}
          {modo === 'retorno' && (
            <p className="text-[12.5px] text-muted mt-1.5 italic">No se cuentan en la devolución.</p>
          )}
        </div>
      )}

      {/* Lo que salió y no ha regresado: es el dato que evita perder herramienta */}
      {modo === 'retorno' && progreso.faltantesAlRetorno > 0 && (
        <div className="mb-4 p-3.5 rounded-xl bg-amber/10 border border-amber/30 flex items-start gap-2.5">
          <AlertTriangle size={17} strokeWidth={2.4} className="text-amber shrink-0 mt-0.5" />
          <p className="text-[13.5px] text-ink/80 leading-relaxed">
            Faltan {progreso.faltantesAlRetorno} de regreso. Revísalos antes de cerrar el día.
          </p>
        </div>
      )}

      {/* Acciones para toda la lista: en una carga de 20 piezas, tocar una por
          una es lento. La confirmación evita que se vuelva un "firmar sin ver". */}
      {puedeMarcar && !bloqueado && listaVisible.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {sinMarcar.length > 0 && (
            <button
              onClick={handleMarcarTodas}
              disabled={busy}
              className="flex-1 min-w-[150px] min-h-[46px] rounded-xl border border-teal/50 text-teal text-[14px] font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
            >
              <CheckCheck size={17} strokeWidth={2.4} />
              {modo === 'salida'
                ? `Recibí todas (${sinMarcar.length})`
                : `Devolví todas (${sinMarcar.length})`}
            </button>
          )}

          {sinMarcar.length < listaVisible.length && (
            <button
              onClick={handleQuitarTodas}
              disabled={busy}
              className="min-h-[46px] px-4 rounded-xl border border-line-strong text-ink/80 text-[14px] font-medium active:scale-95 transition-transform disabled:opacity-60"
            >
              Quitar marcas
            </button>
          )}

          {sinMotivo.length > 1 && (
            <button
              onClick={() => {
                setMotivoMasivo(true);
                setMotivo(modo === 'salida' ? 'sin_stock' : 'en_obra');
                setNotaFaltante('');
              }}
              disabled={busy}
              className="flex-1 min-w-[150px] min-h-[46px] rounded-xl border border-amber/50 text-amber text-[14px] font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
            >
              <AlertTriangle size={16} strokeWidth={2.4} />
              Mismo motivo para {sinMotivo.length}
            </button>
          )}
        </div>
      )}

      {progreso.total === 0 && (
        <p className="text-center text-muted py-6 text-[14px]">
          {puedeEditarTodo
            ? 'Todavía no hay herramienta ni material en la lista.'
            : 'Tu supervisor aún no cargó la lista de herramienta para este proyecto.'}
        </p>
      )}

      {CATEGORIAS.map(({ valor, label }) => {
        const items = porCategoria[valor];
        if (items.length === 0) return null;
        const Icono = ICONO_CATEGORIA[valor];
        return (
          <div key={valor} className="mb-4">
            <p className="text-[13px] font-semibold text-muted mb-1.5 flex items-center gap-2">
              <Icono size={16} strokeWidth={2.3} />
              {label}
            </p>
            <div className="flex flex-col">
              {items.map((i) => {
                const cant = cantidadDe(i);
                const max = maximoDe(i);
                const marcado = cant >= max && max > 0;
                const parcial = cant > 0 && cant < max;
                const salioYNoVolvio = modo === 'retorno' && i.estado?.salida && !i.estado?.retorno;
                // Coincide con la política de la base: en campo solo se quita lo propio.
                const puedeQuitar = puedeEditarTodo || (i.es_del_tecnico && i.agregado_por === usuarioId);
                return (
                  <div key={i.id} className="py-3 border-t border-line">
                    {/* Primera fila: lo que identifica la pieza. Los botones
                        de acción bajan a su propio renglón: en un celular no
                        caben junto a un nombre largo y se encimaban. */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleMarcar(i)}
                        disabled={soloLectura}
                        aria-label={marcado ? 'Desmarcar' : 'Marcar'}
                        className="shrink-0 w-11 h-11 -ml-1.5 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-50"
                      >
                        {marcado ? (
                          <span className="w-7 h-7 rounded-md bg-teal flex items-center justify-center">
                            <Check size={17} strokeWidth={3.2} className="text-inkOnAccent" />
                          </span>
                        ) : parcial ? (
                          <span className="w-7 h-7 rounded-md border-2 border-amber flex items-center justify-center">
                            <span className="w-3 h-[3px] rounded-full bg-amber" />
                          </span>
                        ) : (
                          <Square size={26} strokeWidth={2} className={salioYNoVolvio ? 'text-amber' : 'text-muted'} />
                        )}
                      </button>

                      <span className={`text-[15px] font-semibold shrink-0 ${marcado ? 'text-muted line-through' : parcial ? 'text-amber' : ''}`}>
                        {parcial ? `${cant} de ${max}` : `${i.cantidad}`} {i.unidad}
                      </span>

                      <span className={`flex-1 min-w-0 text-[15px] leading-snug ${marcado ? 'text-muted line-through' : 'text-ink'}`}>
                        {i.descripcion}
                      </span>

                      {!soloLectura && puedeQuitar && (
                        <button
                          onClick={() => handleEliminar(i)}
                          aria-label="Quitar de la lista"
                          className="shrink-0 w-10 h-10 -mr-1.5 flex items-center justify-center text-red active:scale-90 transition-transform"
                        >
                          <X size={17} strokeWidth={2.5} />
                        </button>
                      )}
                    </div>

                    {i.es_del_tecnico && (
                      <p className="text-[11.5px] text-amber font-semibold mt-1 ml-[42px]">Lo agregó el técnico</p>
                    )}

                    {/* Segunda fila: acciones, solo cuando hay algo que hacer */}
                    {puedeMarcar && !bloqueado && !marcado && (
                      <div className="flex gap-2 mt-2 ml-[42px]">
                        {max > 1 && (
                          <button
                            onClick={() => { setAjusteActivo(i); setCantidadAjuste(String(cant || '')); }}
                            className="flex-1 min-h-[40px] text-[13px] font-semibold rounded-xl bg-surface border border-line-strong text-ink/80 active:scale-95 transition-transform"
                          >
                            {parcial ? 'Cambiar cantidad' : modo === 'salida' ? 'Recibí menos' : 'Devolví menos'}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setFaltanteActivo(i);
                            setMotivo(
                              modo === 'salida'
                                ? i.estado?.motivo_no_entregado || 'sin_stock'
                                : i.estado?.motivo_faltante || 'en_obra'
                            );
                            setNotaFaltante((modo === 'salida' ? i.estado?.nota_no_entregado : i.estado?.nota_faltante) || '');
                          }}
                          className={`flex-1 min-h-[40px] text-[13px] font-semibold rounded-xl active:scale-95 transition-transform ${
                            (modo === 'salida' ? i.estado?.motivo_no_entregado : i.estado?.motivo_faltante)
                              ? 'bg-amber/20 text-amber'
                              : 'bg-red/15 text-red'
                          }`}
                        >
                          {modo === 'salida'
                            ? (i.estado?.motivo_no_entregado
                                ? MOTIVOS_NO_ENTREGADO.find((m) => m.valor === i.estado?.motivo_no_entregado)?.label
                                : '¿Por qué no?')
                            : (i.estado?.motivo_faltante
                                ? MOTIVOS_FALTANTE.find((m) => m.valor === i.estado?.motivo_faltante)?.label
                                : '¿Qué pasó?')}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {!soloLectura && (
        showAgregar ? (
          <div className="p-4 rounded-2xl bg-surface-2 border border-line">
            <p className="font-display font-semibold text-[14.5px] mb-1">
              {puedeEditarTodo ? 'Agregar a la lista' : 'Solicitar herramienta o material'}
            </p>
            {!puedeEditarTodo && (
              <p className="text-[12.5px] text-muted mb-3 leading-relaxed">
                No se agrega al resguardo hasta que un supervisor lo autorice.
              </p>
            )}

            <label className="text-[13px] text-ink/75 block mb-1.5">¿Qué necesitas?</label>
            <SelectorArticulo
              valor={nuevoArticuloId}
              cantidadPedida={parseFloat(nuevaCantidad) || 0}
              grupoId={grupoId}
              className="mb-3"
              onChange={(a) => {
                setNuevoArticuloId(a?.id || null);
                if (a) {
                  setNuevaDescripcion(a.descripcion);
                  setNuevaUnidad(a.unidad);
                  setNuevaCategoria(a.categoria);
                }
              }}
            />

            <label className="text-[13px] text-ink/75 block mb-1.5">Cantidad</label>
            <div className="flex items-center gap-2 mb-3">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={nuevaCantidad}
                onChange={(e) => setNuevaCantidad(e.target.value)}
                className="w-[100px] px-3 min-h-[46px] rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[15px]"
              />
              <span className="text-[14px] text-muted">{nuevaUnidad}</span>
            </div>

            {!puedeEditarTodo && (
              <>
                <label className="text-[13px] text-ink/75 block mb-1.5">¿Para qué la necesitas?</label>
                <textarea
                  value={motivoSolicitud}
                  onChange={(e) => setMotivoSolicitud(e.target.value)}
                  placeholder="Ej. la tubería viene más profunda de lo previsto"
                  className="w-full px-3 py-2.5 mb-3 rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[14px] min-h-[70px]"
                />
              </>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setShowAgregar(false)}
                className="flex-1 min-h-[48px] rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium active:scale-95 transition-transform"
              >
                Cancelar
              </button>
              <button
                onClick={handleAgregar}
                disabled={busy}
                className="flex-1 min-h-[48px] rounded-xl bg-teal text-inkOnAccent text-[14.5px] font-semibold active:scale-95 transition-transform disabled:opacity-60"
              >
                {busy ? 'Guardando...' : puedeEditarTodo ? 'Agregar' : 'Enviar solicitud'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAgregar(true)}
            className="w-full min-h-[48px] rounded-xl border border-dashed border-teal/50 text-teal text-[14px] font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <Plus size={17} strokeWidth={2.6} />
            {puedeEditarTodo ? 'Agregar herramienta o material' : 'Solicitar herramienta, material o equipo'}
          </button>
        )
      )}

      {/* Firmar el resguardo: cierra el documento del día */}
      {puedeMarcar && !bloqueado && progreso.total > 0 && (
        <button
          onClick={() => setShowFirma(true)}
          className="w-full min-h-[52px] mt-3 rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
        >
          <PenLine size={18} strokeWidth={2.4} />
          {modo === 'salida' ? 'Firmar resguardo de salida' : 'Firmar devolución'}
        </button>
      )}

      {/* Motivo de lo que no regresó */}
      {/* Al recibir, el almacenista decide a qué inventario vuelve: el
          sobrante de un proyecto a veces se queda reservado y a veces no. */}
      {showRecepcion && (
        <ModalOverlay onClose={() => setShowRecepcion(false)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-5">
            <p className="font-display font-semibold text-[16px] mb-1">Confirmar recepción</p>
            <p className="text-[13px] text-muted mb-4 leading-relaxed">
              Lo devuelto va a volver al inventario. ¿A cuál lo mandas?
            </p>

            <button
              onClick={() => handleConfirmarRecepcion('general')}
              disabled={busy}
              className="w-full min-h-[56px] mb-2.5 rounded-xl bg-teal text-inkOnAccent text-[14.5px] font-semibold disabled:opacity-60"
            >
              Al inventario general
            </button>
            <button
              onClick={() => handleConfirmarRecepcion('proyecto')}
              disabled={busy}
              className="w-full min-h-[56px] mb-4 rounded-xl border border-teal/50 text-teal text-[14.5px] font-semibold disabled:opacity-60"
            >
              Sigue reservado a este proyecto
            </button>

            <button
              onClick={() => setShowRecepcion(false)}
              className="w-full min-h-[48px] rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium"
            >
              Cancelar
            </button>
          </div>
        </ModalOverlay>
      )}

      {ajusteActivo && (
        <ModalOverlay onClose={() => setAjusteActivo(null)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-5">
            <p className="font-display font-semibold text-[16px] mb-1">{ajusteActivo.descripcion}</p>
            <p className="text-[13px] text-muted mb-4 leading-relaxed">
              {modo === 'salida'
                ? `La lista pide ${ajusteActivo.cantidad} ${ajusteActivo.unidad}. ¿Cuántas te entregó el almacén?`
                : `Salieron ${maximoDe(ajusteActivo)} ${ajusteActivo.unidad}. ¿Cuántas estás devolviendo?`}
            </p>

            <div className="flex items-center gap-2 mb-4">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={maximoDe(ajusteActivo)}
                value={cantidadAjuste}
                onChange={(e) => setCantidadAjuste(e.target.value)}
                autoFocus
                className="flex-1 px-3.5 min-h-[52px] rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[18px] font-semibold"
              />
              <span className="text-[16px] text-muted shrink-0">{ajusteActivo.unidad}</span>
            </div>

            {modo === 'salida' && parseFloat(cantidadAjuste) < ajusteActivo.cantidad && parseFloat(cantidadAjuste) >= 0 && (
              <p className="text-[12.5px] text-amber mb-3 leading-relaxed">
                Después indica por qué no te entregaron las {ajusteActivo.cantidad - (parseFloat(cantidadAjuste) || 0)} restantes.
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setAjusteActivo(null)}
                className="flex-1 min-h-[48px] rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardarAjuste}
                disabled={busy}
                className="flex-1 min-h-[48px] rounded-xl bg-teal text-inkOnAccent text-[14.5px] font-semibold disabled:opacity-60"
              >
                {busy ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {(faltanteActivo || motivoMasivo) && (
        <ModalOverlay onClose={() => { setFaltanteActivo(null); setMotivoMasivo(false); }}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[90vh] overflow-y-auto">
            <p className="font-display font-semibold text-[16px] mb-1">
              {motivoMasivo
                ? `${sinMotivo.length} piezas sin marcar`
                : faltanteActivo?.descripcion}
            </p>

            {/* En modo múltiple se listan para que quede claro a qué se aplica */}
            {motivoMasivo && (
              <div className="mb-3 p-3 rounded-xl bg-surface border border-line max-h-[130px] overflow-y-auto">
                {sinMotivo.map((i) => (
                  <p key={i.id} className="text-[12.5px] text-muted leading-relaxed">
                    {i.cantidad} {i.unidad} de {i.descripcion}
                  </p>
                ))}
              </div>
            )}
            <p className="text-[13px] text-muted mb-3.5">
              {modo === 'salida'
                ? `¿Por qué no ${motivoMasivo ? 'te las entregaron' : 'se te entregó'}? Queda registrado para el supervisor.`
                : `¿Qué pasó con ${motivoMasivo ? 'estas piezas' : 'esta pieza'}? Queda registrado para el supervisor.`}
            </p>

            <div className="flex flex-col gap-2 mb-3">
              {(modo === 'salida' ? MOTIVOS_NO_ENTREGADO : MOTIVOS_FALTANTE).map((m) => (
                <button
                  key={m.valor}
                  onClick={() => setMotivo(m.valor)}
                  className={`min-h-[48px] px-4 rounded-xl text-[14.5px] font-medium border text-left transition-colors ${
                    motivo === m.valor ? 'bg-amber text-inkOnAccent border-amber' : 'bg-surface-2 border-line-strong text-ink/80'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <textarea
              value={notaFaltante}
              onChange={(e) => setNotaFaltante(e.target.value)}
              placeholder={modo === 'salida' ? 'Detalle (opcional): qué te dijeron en almacén…' : 'Detalle (opcional): dónde quedó, qué le pasó…'}
              className="w-full px-3 py-2.5 mb-3 rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[14px] min-h-[70px]"
            />

            <div className="flex gap-2">
              <button
                onClick={() => { setFaltanteActivo(null); setMotivoMasivo(false); }}
                className="flex-1 min-h-[48px] rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={motivoMasivo ? handleGuardarMotivoMasivo : handleGuardarFaltante}
                disabled={busy}
                className="flex-1 min-h-[48px] rounded-xl bg-amber text-inkOnAccent text-[14.5px] font-semibold disabled:opacity-60"
              >
                {busy ? 'Guardando...' : motivoMasivo ? `Aplicar a ${sinMotivo.length}` : 'Guardar'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Firma */}
      {showFirma && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
          <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[92vh] overflow-y-auto">
            <p className="font-display font-semibold text-[16px] mb-1">
              {modo === 'salida' ? 'Resguardo de salida' : 'Devolución de herramienta'}
            </p>
            <p className="text-[13px] text-muted mb-3.5 leading-relaxed">
              {modo === 'salida'
                ? `Firmas que el almacén te entregó ${progreso.salieron} de ${progreso.total} piezas y que quedan bajo tu resguardo. Revisa que la cuenta coincida con lo que traes contigo.`
                : `Firmas la devolución de ${progreso.regresaron} de ${progreso.salieron} piezas que salieron a tu nombre.`}
            </p>

            <div className="rounded-xl overflow-hidden border border-line mb-3">
              <SignaturePad ref={firmaRef} height={150} />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => { firmaRef.current?.clear(); }}
                className="min-h-[48px] px-4 rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium"
              >
                Borrar
              </button>
              <button
                onClick={() => setShowFirma(false)}
                className="flex-1 min-h-[48px] rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleFirmar}
                disabled={busy}
                className="flex-1 min-h-[48px] rounded-xl bg-teal text-inkOnAccent text-[14.5px] font-semibold disabled:opacity-60"
              >
                {busy ? 'Guardando...' : 'Firmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
