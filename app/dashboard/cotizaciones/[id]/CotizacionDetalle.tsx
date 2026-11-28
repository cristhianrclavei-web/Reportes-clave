'use client';

import { alTocarEnlace } from '@/lib/abrirArchivo';
import { arreglarEnlaceSyscom } from '@/lib/syscomEnlace';
import { avisar, confirmar } from '@/lib/dialogos';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SupervisorShell from '@/components/SupervisorShell';
import CotizacionForm from '@/components/CotizacionForm';
import OpcionesCotizacion from '@/components/cotizaciones/OpcionesCotizacion';
import SignaturePad, { SignaturePadHandle } from '@/components/SignaturePad';
import {
  Cotizacion, LineaCotizacion, EstadoCotizacion,
  aprobarCotizacion, avisarAprobacionEnApp, quitarAprobacionCotizacion, modoIvaDe, marcarEnviada, puedeMarcarEnviada, actualizarEstadoCotizacion,
  eliminarCotizacion, agruparPorSistema, obtenerCotizacion, tituloDeSistema,
} from '@/lib/cotizaciones';
import { showToast } from '@/components/Toast';
import type { FirmanteSugerido } from '@/lib/firmantesCotizacion';
import PedirAprobacion from '@/components/cotizaciones/PedirAprobacion';
import OrigenLevantamiento from '@/components/cotizaciones/OrigenLevantamiento';
import HistorialCambios from '@/components/cotizaciones/HistorialCambios';
import { describirCambiosCotizacion } from '@/lib/cambiosCotizacion';
import { createClient } from '@/lib/supabaseClient';
import { FileText, Pencil, Trash2, ChevronLeft, X, Check, Send, Ban, MessageCircle, ExternalLink, Copy, Sparkles, Undo2 } from 'lucide-react';
import { MARCA, MARCA_MAYUS } from '@/lib/marca';

// WhatsApp necesita el código de país adelante — los teléfonos se capturan
// a 10 dígitos "a la mexicana", así que si ya trae más dígitos se asume que
// alguien ya incluyó el código y se deja tal cual.
function limpiarTelefonoWhatsapp(telefono: string): string {
  const soloDigitos = telefono.replace(/\D/g, '');
  return soloDigitos.length === 10 ? '52' + soloDigitos : soloDigitos;
}

const cardCls = 'glass rounded-2xl p-4';

// En computadora la cotización no se estira a todo el ancho: con renglones
// cortos, el importe quedaba lejísimos de su descripción. En celular no cambia.
const anchoCotizacion = 'max-w-2xl lg:max-w-3xl mx-auto pb-10 lg:px-8';

// Botones de la fila de arriba: ícono sobre el texto, todos del mismo ancho.
// Botones de estado (enviada, quitar aprobación, rechazar): más bajos y
// con el texto al lado, para que no compitan con los de arriba.
const botonEstadoCls = 'flex-1 min-w-0 min-h-[44px] rounded-xl font-semibold text-[13px] leading-tight flex items-center justify-center gap-1.5 text-center active:scale-95 transition-transform disabled:opacity-40';

const botonAccionCls = 'flex-1 min-w-0 min-h-[56px] rounded-xl font-display font-semibold text-[12px] leading-tight flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform';

function money(n: number): string {
  return '$' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatFecha(fecha: string): string {
  if (!fecha) return '—';
  const [y, m, d] = fecha.split('-');
  if (!y || !m || !d) return fecha;
  return `${d}/${m}/${y}`;
}

function nombreCreador(profiles: Cotizacion['profiles']): string {
  if (!profiles) return '—';
  return Array.isArray(profiles) ? profiles[0]?.full_name || '—' : profiles.full_name || '—';
}

const ESTADO_LABEL: Record<EstadoCotizacion, string> = {
  borrador: 'Borrador', aprobada: 'Aprobada', enviada: 'Enviada', rechazada: 'Rechazada',
};
const ESTADO_CLS: Record<EstadoCotizacion, string> = {
  borrador: 'bg-surface-2 text-muted border-line',
  aprobada: 'bg-teal/15 text-teal border-teal/30',
  enviada: 'bg-amber/15 text-amber border-amber/30',
  rechazada: 'bg-red/15 text-red border-red/30',
};

export default function CotizacionDetalle({
  cotizacionInicial,
  lineasIniciales,
  userName,
  correoUsuario,
  puedeAprobar,
  firmantes,
  abrirEditor = false,
}: {
  cotizacionInicial: Cotizacion;
  lineasIniciales: LineaCotizacion[];
  userName?: string;
  correoUsuario?: string;
  puedeAprobar: boolean;
  firmantes: FirmanteSugerido[];
  // Viene del enlace de aprobación (?editar=1): abre el editor y, al guardar,
  // deja lista la firma para aprobar ahí mismo.
  abrirEditor?: boolean;
}) {
  const router = useRouter();
  const [cotizacion, setCotizacion] = useState(cotizacionInicial);
  const [lineas, setLineas] = useState(lineasIniciales);
  const [editando, setEditando] = useState(false);
  // Cambios hechos en esta visita, para el aviso al aprobar; y un contador
  // para que el historial se vuelva a leer después de guardar.
  const [cambiosHechos, setCambiosHechos] = useState<string[]>([]);
  const [recargaHistorial, setRecargaHistorial] = useState(0);
  // Se abre ya en el navegador y no desde el servidor: el formulario crea ids
  // al azar y en el servidor saldrían distintos (error de hidratación).
  useEffect(() => {
    if (abrirEditor && !cotizacionInicial.aprobada_firma) setEditando(true);
    // Solo al llegar desde el enlace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const modoIva = modoIvaDe(cotizacion);
  const totalNeto = modoIva === 'incluido' && Boolean(cotizacion.total_neto);
  const [eliminando, setEliminando] = useState(false);

  const [mostrandoFirma, setMostrandoFirma] = useState(false);
  const [nombreAprobador, setNombreAprobador] = useState(userName || '');
  const [guardandoFirma, setGuardandoFirma] = useState(false);
  const [errorFirma, setErrorFirma] = useState<string | null>(null);
  const [procesandoAccion, setProcesandoAccion] = useState(false);
  const firmaRef = useRef<SignaturePadHandle>(null);

  // Conceptos ligados a SYSCOM sin modelo (de antes de guardarlo): se completan
  // una vez para que el reporte se los sugiera al técnico. Si falla, no pasa
  // nada visible: solo no habrá modelo en la sugerencia.
  useEffect(() => {
    if (!lineas.some((l) => l.enlace && !l.modelo)) return;
    fetch(`/api/cotizaciones/${cotizacion.id}/modelos`, { method: 'POST' })
      .then((r) => (r.ok ? null : r.json().then((d) => console.error('Completar modelos:', d?.error))))
      .catch((e) => console.error('Completar modelos:', e));
    // Solo al abrir la cotización.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cotizacion.id]);

  async function handleAprobar() {
    if (!nombreAprobador.trim()) {
      setErrorFirma('Falta el nombre de quien aprueba.');
      return;
    }
    if (!firmaRef.current || firmaRef.current.isEmpty()) {
      setErrorFirma('Falta la firma.');
      return;
    }
    setGuardandoFirma(true);
    setErrorFirma(null);
    try {
      const firmaData = firmaRef.current.getDataURL();
      if (!firmaData) throw new Error('No se pudo leer la firma');
      await aprobarCotizacion(cotizacion.id, nombreAprobador.trim(), firmaData);
      setCotizacion((prev) => ({
        ...prev,
        estado: 'aprobada',
        aprobada_por: nombreAprobador.trim(),
        aprobada_firma: firmaData,
        aprobada_en: new Date().toISOString(),
      }));
      setMostrandoFirma(false);
      showToast('Cotización aprobada', 'success');
      await avisarAprobacionEnApp(cotizacion, nombreAprobador.trim(), cambiosHechos);
    } catch (e: any) {
      setErrorFirma(e?.message || 'No se pudo guardar la firma. Intenta de nuevo.');
    } finally {
      setGuardandoFirma(false);
    }
  }

  async function handleMarcarEnviada() {
    setProcesandoAccion(true);
    try {
      await marcarEnviada(cotizacion.id);
      setCotizacion((prev) => ({ ...prev, estado: 'enviada' }));
      showToast('Marcada como enviada', 'success');
    } catch (e: any) {
      avisar('No se pudo actualizar: ' + (e?.message || 'error'));
    } finally {
      setProcesandoAccion(false);
    }
  }

  async function handleQuitarAprobacion() {
    let aviso = '¿Quitar la aprobación para corregir la cotización? Vuelve a borrador y habrá que firmarla otra vez.';
    if (cotizacion.estado === 'enviada') {
      aviso += ' El enlace que ya mandaste al cliente dejará de abrir hasta que la vuelvas a aprobar.';
    }
    if (!await confirmar(aviso)) return;
    setProcesandoAccion(true);
    try {
      await quitarAprobacionCotizacion(cotizacion.id);
      setCotizacion((prev) => ({
        ...prev,
        estado: 'borrador',
        aprobada_por: null,
        aprobada_firma: null,
        aprobada_en: null,
      }));
      showToast('Aprobación quitada: ya puedes editarla', 'success');
    } catch (e: any) {
      avisar('No se pudo quitar la aprobación: ' + (e?.message || 'revisa tu conexión e intenta de nuevo.'));
    } finally {
      setProcesandoAccion(false);
    }
  }

  async function handleRechazar() {
    if (!await confirmar('¿Marcar esta cotización como rechazada?')) return;
    setProcesandoAccion(true);
    try {
      await actualizarEstadoCotizacion(cotizacion.id, 'rechazada');
      setCotizacion((prev) => ({ ...prev, estado: 'rechazada' }));
      showToast('Marcada como rechazada', 'success');
    } catch (e: any) {
      avisar('No se pudo actualizar: ' + (e?.message || 'error'));
    } finally {
      setProcesandoAccion(false);
    }
  }

  // El enlace público solo resuelve si ya está aprobada/enviada (ver
  // supabase/patch_cotizaciones_publico.sql) — antes de eso no tiene caso
  // ofrecer el botón.
  //
  // Se probó adjuntar el PDF de verdad vía Web Share API, pero requería un
  // fetch antes de abrir el share/link — en el celular eso rompe el gesto
  // de usuario que WhatsApp y los navegadores exigen (el share/popup se
  // bloquea en silencio si no ocurre al toque, sin ningún error visible).
  // Por eso se quedó en el link, que dispara al instante y sí funciona.
  function handleEnviarWhatsapp() {
    const link = `${window.location.origin}/api/cotizaciones/${cotizacion.id}/pdf-cliente`;
    const saludo = cotizacion.atencion ? `Hola ${cotizacion.atencion}` : 'Hola';
    const mensaje = `${saludo}, te comparto la cotización ${cotizacion.folio} de ${MARCA.nombre} para ${cotizacion.empresa}. Puedes verla aquí: ${link}`;
    // Sin teléfono del cliente, wa.me sin número abre WhatsApp con el
    // mensaje listo y deja elegir el contacto ahí mismo — no hace falta
    // tenerlo capturado para poder mandarla.
    const tel = cotizacion.telefono ? limpiarTelefonoWhatsapp(cotizacion.telefono) : '';
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`, '_blank');
    // Ya aprobada y mandada al cliente: queda como enviada sin otro paso
    // (antes se quedaban en borrador o aprobada aunque ya se hubieran mandado).
    if (cotizacion.estado === 'aprobada') {
      marcarEnviada(cotizacion.id)
        .then(() => setCotizacion((prev) => ({ ...prev, estado: 'enviada' })))
        .catch((e: any) => avisar('Se abrió WhatsApp, pero no se pudo marcar como enviada: ' + (e?.message || 'revisa tu señal') + '. Márcala a mano.'));
    }
  }

  // Compara con lo que había antes de editar y lo anota en el historial.
  // Si no se puede anotar, la edición ya quedó guardada: solo se avisa.
  async function anotarCambios(actualizada: Cotizacion, lineasActualizadas: LineaCotizacion[]) {
    const cambios = describirCambiosCotizacion({ cotizacion, lineas }, { cotizacion: actualizada, lineas: lineasActualizadas });
    if (cambios.length === 0) return;
    setCambiosHechos((previos) => [...previos, ...cambios]);
    const { error } = await createClient().from('cotizacion_cambios').insert({ cotizacion_id: cotizacion.id, cambios });
    if (error) {
      console.error('Historial de cambios:', error.message);
      showToast('Se guardó la cotización, pero no se pudo anotar en el historial de cambios.', 'error');
      return;
    }
    setRecargaHistorial((n) => n + 1);
  }

  async function handleGuardadoEdicion() {
    try {
      const { cotizacion: actualizada, lineas: lineasActualizadas } = await obtenerCotizacion(cotizacion.id);
      await anotarCambios(actualizada, lineasActualizadas);
      setCotizacion(actualizada);
      setLineas(lineasActualizadas);
    } catch {
      // El guardado ya tuvo éxito (CotizacionForm lo confirma antes de
      // llamar aquí); si falla nada más este refetch, se sale del modo
      // edición igual y el usuario ve los datos frescos al recargar.
    } finally {
      setEditando(false);
      if (abrirEditor && puedeAprobar) setMostrandoFirma(true);
    }
  }

  async function handleEliminar() {
    if (!await confirmar(`¿Eliminar la cotización de «${cotizacion.empresa}» (folio ${cotizacion.folio})?\n\nEsta acción es permanente.`)) return;
    setEliminando(true);
    try {
      await eliminarCotizacion(cotizacion.id);
      showToast('Cotización eliminada', 'success');
      router.push('/dashboard/cotizaciones');
    } catch (e: any) {
      avisar('No se pudo eliminar: ' + (e?.message || 'error'));
      setEliminando(false);
    }
  }

  if (editando) {
    return (
      <SupervisorShell active="cotizaciones" title={`Editar · ${cotizacion.folio}`} userName={userName} wrapperClassName={anchoCotizacion}>
        <button
          onClick={() => setEditando(false)}
          className="flex items-center gap-1.5 mb-4 text-[13.5px] text-ink/70 font-medium active:scale-95 transition-transform"
        >
          <X size={16} strokeWidth={2.4} />
          Cancelar edición
        </button>
        <CotizacionForm
          modo="editar"
          cotizacionId={cotizacion.id}
          inicial={{ cotizacion, lineas }}
          nombreUsuario={userName}
          correoUsuario={correoUsuario}
          firmantes={firmantes}
          puedeAprobar={puedeAprobar}
          onGuardado={handleGuardadoEdicion}
        />
      </SupervisorShell>
    );
  }

  const grupos = agruparPorSistema(lineas);
  const habilitaEnviar = puedeMarcarEnviada(cotizacion);
  // Solo informativo para quien la arma — nunca se muestra en el PDF que
  // recibe el cliente.
  // Los opcionales no están en el subtotal: tampoco su costo.
  const costoTotal = lineas.filter((l) => !l.opcional).reduce((acc, l) => acc + l.costo * l.cantidad, 0);
  const gananciaTotal = cotizacion.subtotal - costoTotal;

  return (
    <SupervisorShell active="cotizaciones" title={cotizacion.empresa} userName={userName} wrapperClassName={anchoCotizacion}>
      <Link href="/dashboard/cotizaciones" className="inline-flex items-center gap-1.5 text-[13.5px] text-teal font-medium mb-4 min-h-[40px]">
        <ChevronLeft size={16} strokeWidth={2.4} />
        Todas las cotizaciones
      </Link>

      {cotizacion.levantamiento_id && <OrigenLevantamiento levantamientoId={cotizacion.levantamiento_id} />}

      {/* Solo en pantalla y mientras siga en borrador: es un recordatorio
          para quien la revisa, no parte de la cotización. */}
      {cotizacion.generada_por_ia && cotizacion.estado === 'borrador' && (() => {
        // Un punto por renglón; se quitan guiones o viñetas que traiga el texto.
        const puntos = (cotizacion.notas_ia || '').split(/\r?\n/).map((t) => t.replace(/^\s*[-•·]\s*/, '').trim()).filter(Boolean);
        return (
          <div role="note" className="mb-4 rounded-2xl border border-amber/35 bg-amber/[0.07] overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber/15 text-amber">
                <Sparkles size={17} strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold leading-tight text-amber">Cotización generada por IA</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-muted">Puede haber errores. Revísala antes de aprobar.</p>
              </div>
            </div>
            {puntos.length > 0 && (
              // Cerrado por defecto: el detalle está a un toque, sin llenar la pantalla.
              <details className="group border-t border-amber/20">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-[13px] font-medium text-ink/85 [&::-webkit-details-marker]:hidden">
                  <span>{puntos.length === 1 ? '1 punto por revisar' : `${puntos.length} puntos por revisar`}</span>
                  <ChevronLeft size={16} strokeWidth={2.4} className="-rotate-90 text-muted transition-transform group-open:rotate-90" />
                </summary>
                <ul className="flex flex-col gap-2.5 px-4 pb-3.5 pt-0.5">
                  {puntos.map((t, n) => (
                    <li key={n} className="flex gap-2.5 text-[13px] leading-snug text-ink/80">
                      <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber/70" />
                      <span className="min-w-0">{t}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        );
      })()}

      <div className={`${cardCls} mb-4`}>
        <div className="flex justify-between items-start gap-3 mb-3 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Folio</div>
            <span className="text-[15px] font-mono font-semibold text-teal">{cotizacion.folio}</span>
          </div>
          <div className="flex items-center gap-2">
            {cotizacion.moneda === 'USD' && (
              <span className="text-[12.5px] font-semibold px-3 py-1.5 rounded-full border bg-surface-2 text-muted border-line">USD</span>
            )}
            <span className={`text-[12.5px] font-semibold px-3 py-1.5 rounded-full border ${ESTADO_CLS[cotizacion.estado]}`}>
              {ESTADO_LABEL[cotizacion.estado]}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 text-[13px]">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Fecha</div>
            <span className="font-medium">{formatFecha(cotizacion.fecha)}</span>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Hecha por</div>
            <span className="font-medium">{nombreCreador(cotizacion.profiles)}</span>
          </div>
          {cotizacion.atencion && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Atención</div>
              <span className="font-medium">{cotizacion.atencion}</span>
            </div>
          )}
          {cotizacion.telefono && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Teléfono</div>
              <span className="font-medium">{cotizacion.telefono}</span>
            </div>
          )}
        </div>
      </div>

      {/* Acciones de todos los días arriba, en una sola fila, para no bajar
          hasta el final de una cotización larga: ver el PDF (todos), mandarlo
          por WhatsApp (quien aprueba, o cualquiera ya aprobada; la deja como
          «enviada»), editar (cerrado una vez firmada), copiar para otro
          cliente y eliminar. Cada botón es ícono + texto corto para que
          quepan los cinco en el ancho de un celular. */}
      <div className="flex gap-2 mb-4">
        <a
          // La versión sale de updated_at y no de Date.now(): el reloj en el
          // render da un href distinto en servidor y navegador (hidratación).
          // El PDF ya se sirve con no-store; esto solo evita reusar la
          // pestaña vieja después de editar.
          href={`/api/cotizaciones/${cotizacion.id}/pdf?v=${encodeURIComponent(cotizacion.updated_at || '')}`}
          onClick={alTocarEnlace}
          target="_blank"
          rel="noopener noreferrer"
          className={`${botonAccionCls} bg-teal text-inkOnAccent shadow-glow-teal`}
        >
          <FileText size={18} strokeWidth={2.4} />
          PDF
        </a>
        {(puedeAprobar || !!cotizacion.aprobada_firma) && (
          <button onClick={handleEnviarWhatsapp} className={`${botonAccionCls} bg-[#25D366] text-white`}>
            <MessageCircle size={18} strokeWidth={2.4} />
            WhatsApp
          </button>
        )}
        {!cotizacion.aprobada_firma && (
          <button onClick={() => setEditando(true)} className={`${botonAccionCls} border border-teal/60 text-teal`}>
            <Pencil size={17} strokeWidth={2.4} />
            Editar
          </button>
        )}
        {/* Copiar: la misma cotización como base para otro cliente. */}
        <Link href={`/dashboard/cotizaciones?copiar=${cotizacion.id}`} className={`${botonAccionCls} border border-line-strong text-ink/80 hover:bg-surface-2`}>
          <Copy size={17} strokeWidth={2.3} />
          Copiar
        </Link>
        {/* Eliminar: libre mientras sigue en borrador; una vez firmada, solo
            quien puede aprobar cotizaciones puede seguir cancelándola. */}
        {(!cotizacion.aprobada_firma || puedeAprobar) && (
          <button
            onClick={handleEliminar}
            disabled={eliminando}
            className={`${botonAccionCls} border border-red/40 text-red disabled:opacity-60`}
          >
            <Trash2 size={17} strokeWidth={2.4} />
            {eliminando ? '...' : 'Eliminar'}
          </button>
        )}
      </div>

      {/* Segunda fila, también arriba: el estado de la cotización. Marcar
          como enviada, rechazar y quitar la aprobación son de quien firma o
          aprueba cotizaciones, no de cualquiera con acceso de supervisor. */}
      {puedeAprobar && (
        <div className="flex gap-2 -mt-2 mb-4">
          {cotizacion.estado === 'enviada' ? (
            <button disabled className={`${botonEstadoCls} bg-surface-2 border border-line text-muted cursor-not-allowed`}>
              <Check size={16} strokeWidth={2.6} />
              Enviada
            </button>
          ) : (
            <button
              onClick={handleMarcarEnviada}
              disabled={!habilitaEnviar || procesandoAccion}
              title={!habilitaEnviar ? 'Primero hay que aprobarla y firmarla' : undefined}
              className={`${botonEstadoCls} bg-amber text-inkOnAccent`}
            >
              <Send size={16} strokeWidth={2.4} />
              Marcar como enviada
            </button>
          )}
          {/* Si se aprobó con errores, se regresa a borrador para corregirla;
              la firma se borra y hay que volver a revisarla. */}
          {cotizacion.aprobada_firma && (
            <button onClick={handleQuitarAprobacion} disabled={procesandoAccion} className={`${botonEstadoCls} border border-line-strong text-ink/80`}>
              <Undo2 size={16} strokeWidth={2.3} />
              Quitar aprobación
            </button>
          )}
          {cotizacion.estado !== 'rechazada' && (
            <button onClick={handleRechazar} disabled={procesandoAccion} className={`${botonEstadoCls} flex-none px-4 border border-red/40 text-red`}>
              <Ban size={16} strokeWidth={2.4} />
              Rechazar
            </button>
          )}
        </div>
      )}

      {grupos.map((g) => {
        const importeGrupo = g.lineas.reduce((acc, l) => acc + l.importe, 0);
        return (
          <div key={g.clave} className={`${cardCls} mb-4`}>
            <p className="font-display font-semibold text-[13px] uppercase tracking-wider text-teal">
              {g.sistema}
              {g.opcional && <span className="ml-2 px-2 py-0.5 rounded-full bg-amber/15 text-amber text-[11px] normal-case tracking-normal">Opcional · no suma al total</span>}
            </p>
            {tituloDeSistema(g.lineas) && <p className="text-[14px] font-semibold mt-0.5">{tituloDeSistema(g.lineas)}</p>}
            <div className="mb-3" />
            <div className="flex flex-col gap-2.5">
              {g.lineas.map((l) => (
                <div key={l.id} className="flex justify-between gap-3 p-3 rounded-xl bg-surface-2 border border-line text-[13px]">
                  <div className="min-w-0">
                    <p className="leading-relaxed whitespace-pre-wrap">{l.descripcion}</p>
                    <p className="text-muted text-[12px] mt-1">{l.unidad} · Cant. {l.cantidad} · {money(l.precio_unitario)} c/u</p>
                    {l.costo > 0 && (
                      <p className="text-amber/80 text-[11.5px] mt-0.5">Costo {money(l.costo)} · {l.margen_pct}% ganancia</p>
                    )}
                    {l.enlace && (
                      <a href={arreglarEnlaceSyscom(l.enlace)} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-1.5 text-[12px] font-semibold text-teal hover:underline break-all">
                        <ExternalLink size={12} /> Ver equipo{(() => { try { return ` · ${new URL(l.enlace).hostname.replace(/^www\./, '')}`; } catch { return ''; } })()}
                      </a>
                    )}
                  </div>
                  <span className="shrink-0 font-semibold">{money(l.importe)}</span>
                </div>
              ))}
            </div>
            <p className="text-right text-[13.5px] mt-3 pt-3 border-t border-dashed border-line-strong">
              {g.opcional ? 'Importe opcional' : 'Importe'}: <span className="font-display font-bold text-teal">{money(importeGrupo)}</span>
            </p>
          </div>
        );
      })}

      <div className={`${cardCls} mb-4`}>
        {modoIva === 'sumar' && (
          <div className="flex justify-between text-[14px] mb-1">
            <span className="text-muted">Subtotal</span>
            <span className="font-medium">{cotizacion.moneda === 'USD' ? 'USD ' : ''}{money(cotizacion.subtotal)}</span>
          </div>
        )}
        {modoIva === 'sin' && (
          <div className="flex justify-between text-[14px] mb-1">
            <span className="text-muted">IVA</span>
            <span className="font-medium">No lleva</span>
          </div>
        )}
        {modoIva !== 'sin' && !totalNeto && (
          <div className="flex justify-between text-[14px] mb-1">
            <span className="text-muted">{modoIva === 'incluido' ? 'IVA incluido' : 'IVA'} ({cotizacion.iva_pct}%)</span>
            <span className="font-medium">{cotizacion.moneda === 'USD' ? 'USD ' : ''}{money(cotizacion.iva)}</span>
          </div>
        )}
        <div className="flex justify-between text-[19px] pt-2 border-t border-line-strong">
          <span className="font-display font-bold">{totalNeto ? 'Importe total neto' : 'Total'}</span>
          <span className="font-display font-bold text-teal">{cotizacion.moneda === 'USD' ? 'USD ' : ''}{money(cotizacion.total)}</span>
        </div>
        {cotizacion.moneda === 'USD' && cotizacion.tipo_cambio > 0 && (
          <p className="text-right text-[12.5px] text-muted mt-1">
            ≈ {money(cotizacion.total * cotizacion.tipo_cambio)} MXN <span className="text-faint">(TC {cotizacion.tipo_cambio.toFixed(2)})</span>
          </p>
        )}

        <OpcionesCotizacion cotizacion={cotizacion} lineas={lineas} />

        {costoTotal > 0 && (
          <div className="flex justify-between text-[13px] mt-3 pt-3 border-t border-dashed border-line-strong">
            <span className="text-amber">Ganancia estimada (interno, no sale en el PDF)</span>
            <span className="font-semibold text-amber">{money(gananciaTotal)}</span>
          </div>
        )}
      </div>

      {/* Aprobación interna: firma de quien revisa antes de que salga al
          cliente. Solo hasta que quede firmada se habilita "Marcar como
          enviada" — mandarla sin que nadie la revisara sería justo lo que
          se quiere evitar con este paso. */}
      <div className={`${cardCls} mb-4`}>
        <p className="font-display font-semibold text-[13px] uppercase tracking-wider text-teal mb-3">Aprobación</p>

        {cotizacion.aprobada_firma ? (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Check size={17} strokeWidth={3} className="text-teal shrink-0" />
              <span className="text-[14px] font-semibold">Aprobada por {cotizacion.aprobada_por}</span>
            </div>
            {cotizacion.aprobada_en && (
              <p className="text-[12px] text-muted mb-2">
                {new Date(cotizacion.aprobada_en).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
              </p>
            )}
            <img src={cotizacion.aprobada_firma} alt="Firma de aprobación" className="w-full max-w-[300px] rounded-xl border border-line bg-white" />
            <PedirAprobacion cotizacion={{ id: cotizacion.id, folio: cotizacion.folio, empresa: cotizacion.empresa }} soloHistorial />
          </div>
        ) : (
          <div>
            <p className="text-[13px] text-ink/80 mb-3 leading-relaxed">
              Esta cotización está <b>pendiente de aprobación</b>. No se puede marcar como enviada hasta que alguien la revise y la firme.
            </p>

            {!puedeAprobar && (
              <p className="text-[12.5px] text-muted">No tienes permiso para aprobar cotizaciones: pídele la aprobación a quien sí.</p>
            )}

            {puedeAprobar && !mostrandoFirma && (
              <button
                onClick={() => setMostrandoFirma(true)}
                className="min-h-[48px] px-5 rounded-xl bg-teal text-inkOnAccent text-[14.5px] font-semibold active:scale-95 transition-transform"
              >
                Firmar y aprobar cotización
              </button>
            )}

            {puedeAprobar && mostrandoFirma && (
              <div>
                <label className="text-[11px] uppercase tracking-wider text-muted block mb-1.5">Nombre de quien aprueba</label>
                <input
                  value={nombreAprobador}
                  onChange={(e) => setNombreAprobador(e.target.value)}
                  className="w-full px-3.5 py-2.5 mb-3 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14.5px]"
                />
                <div className="rounded-xl overflow-hidden border border-line mb-2">
                  <SignaturePad ref={firmaRef} height={130} titulo="Firma de aprobación" />
                </div>
                {errorFirma && <p className="text-red text-[12px] mb-2">{errorFirma}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setMostrandoFirma(false); setErrorFirma(null); }}
                    className="flex-1 min-h-[48px] rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium active:scale-95 transition-transform"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleAprobar}
                    disabled={guardandoFirma}
                    className="flex-1 min-h-[48px] rounded-xl bg-teal text-inkOnAccent text-[14.5px] font-semibold active:scale-95 transition-transform disabled:opacity-60"
                  >
                    {guardandoFirma ? 'Guardando...' : 'Confirmar aprobación'}
                  </button>
                </div>
              </div>
            )}

            <PedirAprobacion cotizacion={{ id: cotizacion.id, folio: cotizacion.folio, empresa: cotizacion.empresa }} />
          </div>
        )}
      </div>

      <HistorialCambios cotizacionId={cotizacion.id} recarga={recargaHistorial} />

    </SupervisorShell>
  );
}
