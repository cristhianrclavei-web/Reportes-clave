'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SupervisorShell from '@/components/SupervisorShell';
import CotizacionForm from '@/components/CotizacionForm';
import SignaturePad, { SignaturePadHandle } from '@/components/SignaturePad';
import {
  Cotizacion, LineaCotizacion, EstadoCotizacion,
  aprobarCotizacion, marcarEnviada, puedeMarcarEnviada, actualizarEstadoCotizacion,
  eliminarCotizacion, agruparPorSistema, obtenerCotizacion,
} from '@/lib/cotizaciones';
import { showToast } from '@/components/Toast';
import { FileText, Pencil, Trash2, ChevronLeft, X, Check, Send, Ban, MessageCircle } from 'lucide-react';

// WhatsApp necesita el código de país adelante — los teléfonos se capturan
// a 10 dígitos "a la mexicana", así que si ya trae más dígitos se asume que
// alguien ya incluyó el código y se deja tal cual.
function limpiarTelefonoWhatsapp(telefono: string): string {
  const soloDigitos = telefono.replace(/\D/g, '');
  return soloDigitos.length === 10 ? '52' + soloDigitos : soloDigitos;
}

const cardCls = 'glass rounded-2xl p-4';

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
}: {
  cotizacionInicial: Cotizacion;
  lineasIniciales: LineaCotizacion[];
  userName?: string;
  correoUsuario?: string;
  puedeAprobar: boolean;
}) {
  const router = useRouter();
  const [cotizacion, setCotizacion] = useState(cotizacionInicial);
  const [lineas, setLineas] = useState(lineasIniciales);
  const [editando, setEditando] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  const [mostrandoFirma, setMostrandoFirma] = useState(false);
  const [nombreAprobador, setNombreAprobador] = useState(userName || '');
  const [guardandoFirma, setGuardandoFirma] = useState(false);
  const [errorFirma, setErrorFirma] = useState<string | null>(null);
  const [procesandoAccion, setProcesandoAccion] = useState(false);
  const firmaRef = useRef<SignaturePadHandle>(null);

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
      alert('No se pudo actualizar: ' + (e?.message || 'error'));
    } finally {
      setProcesandoAccion(false);
    }
  }

  async function handleRechazar() {
    if (!confirm('¿Marcar esta cotización como rechazada?')) return;
    setProcesandoAccion(true);
    try {
      await actualizarEstadoCotizacion(cotizacion.id, 'rechazada');
      setCotizacion((prev) => ({ ...prev, estado: 'rechazada' }));
      showToast('Marcada como rechazada', 'success');
    } catch (e: any) {
      alert('No se pudo actualizar: ' + (e?.message || 'error'));
    } finally {
      setProcesandoAccion(false);
    }
  }

  // El enlace público solo resuelve si ya está aprobada/enviada (ver
  // supabase/patch_cotizaciones_publico.sql) — antes de eso no tiene caso
  // ofrecer el botón.
  function handleEnviarWhatsapp() {
    const tel = limpiarTelefonoWhatsapp(cotizacion.telefono || '');
    const link = `${window.location.origin}/api/cotizaciones/${cotizacion.id}/pdf-cliente`;
    const saludo = cotizacion.atencion ? `Hola ${cotizacion.atencion}` : 'Hola';
    const mensaje = `${saludo}, te comparto la cotización ${cotizacion.folio} de Clave Inteligente para ${cotizacion.empresa}. Puedes verla aquí: ${link}`;
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`, '_blank');
  }

  async function handleGuardadoEdicion() {
    try {
      const { cotizacion: actualizada, lineas: lineasActualizadas } = await obtenerCotizacion(cotizacion.id);
      setCotizacion(actualizada);
      setLineas(lineasActualizadas);
    } catch {
      // El guardado ya tuvo éxito (CotizacionForm lo confirma antes de
      // llamar aquí); si falla nada más este refetch, se sale del modo
      // edición igual y el usuario ve los datos frescos al recargar.
    } finally {
      setEditando(false);
    }
  }

  async function handleEliminar() {
    if (!confirm(`¿Eliminar la cotización de «${cotizacion.empresa}» (folio ${cotizacion.folio})?\n\nEsta acción es permanente.`)) return;
    setEliminando(true);
    try {
      await eliminarCotizacion(cotizacion.id);
      showToast('Cotización eliminada', 'success');
      router.push('/dashboard/cotizaciones');
    } catch (e: any) {
      alert('No se pudo eliminar: ' + (e?.message || 'error'));
      setEliminando(false);
    }
  }

  if (editando) {
    return (
      <SupervisorShell active="cotizaciones" title={`Editar · ${cotizacion.folio}`} userName={userName}>
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
          onGuardado={handleGuardadoEdicion}
        />
      </SupervisorShell>
    );
  }

  const grupos = agruparPorSistema(lineas);
  const habilitaEnviar = puedeMarcarEnviada(cotizacion);
  const puedeCompartir = cotizacion.estado === 'aprobada' || cotizacion.estado === 'enviada';
  const habilitaWhatsapp = puedeCompartir && !!cotizacion.telefono;
  // Solo informativo para quien la arma — nunca se muestra en el PDF que
  // recibe el cliente.
  const costoTotal = lineas.reduce((acc, l) => acc + l.costo * l.cantidad, 0);
  const gananciaTotal = cotizacion.subtotal - costoTotal;

  return (
    <SupervisorShell active="cotizaciones" title={cotizacion.empresa} userName={userName}>
      <Link href="/dashboard/cotizaciones" className="inline-flex items-center gap-1.5 text-[13.5px] text-teal font-medium mb-4 min-h-[40px]">
        <ChevronLeft size={16} strokeWidth={2.4} />
        Todas las cotizaciones
      </Link>

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

      {grupos.map((g) => {
        const importeGrupo = g.lineas.reduce((acc, l) => acc + l.importe, 0);
        return (
          <div key={g.sistema} className={`${cardCls} mb-4`}>
            <p className="font-display font-semibold text-[13px] uppercase tracking-wider text-teal mb-3">{g.sistema}</p>
            <div className="flex flex-col gap-2.5">
              {g.lineas.map((l) => (
                <div key={l.id} className="flex justify-between gap-3 p-3 rounded-xl bg-surface-2 border border-line text-[13px]">
                  <div className="min-w-0">
                    <p className="leading-relaxed">{l.descripcion}</p>
                    <p className="text-muted text-[12px] mt-1">{l.unidad} · Cant. {l.cantidad} · {money(l.precio_unitario)} c/u</p>
                    {l.costo > 0 && (
                      <p className="text-amber/80 text-[11.5px] mt-0.5">Costo {money(l.costo)} · {l.margen_pct}% ganancia</p>
                    )}
                  </div>
                  <span className="shrink-0 font-semibold">{money(l.importe)}</span>
                </div>
              ))}
            </div>
            <p className="text-right text-[13.5px] mt-3 pt-3 border-t border-dashed border-line-strong">
              Importe: <span className="font-display font-bold text-teal">{money(importeGrupo)}</span>
            </p>
          </div>
        );
      })}

      <div className={`${cardCls} mb-4`}>
        <div className="flex justify-between text-[14px] mb-1">
          <span className="text-muted">Subtotal</span>
          <span className="font-medium">{cotizacion.moneda === 'USD' ? 'USD ' : ''}{money(cotizacion.subtotal)}</span>
        </div>
        <div className="flex justify-between text-[14px] mb-1">
          <span className="text-muted">IVA ({cotizacion.iva_pct}%)</span>
          <span className="font-medium">{cotizacion.moneda === 'USD' ? 'USD ' : ''}{money(cotizacion.iva)}</span>
        </div>
        <div className="flex justify-between text-[19px] pt-2 border-t border-line-strong">
          <span className="font-display font-bold">Total</span>
          <span className="font-display font-bold text-teal">{cotizacion.moneda === 'USD' ? 'USD ' : ''}{money(cotizacion.total)}</span>
        </div>
        {cotizacion.moneda === 'USD' && cotizacion.tipo_cambio > 0 && (
          <p className="text-right text-[12.5px] text-muted mt-1">
            ≈ {money(cotizacion.total * cotizacion.tipo_cambio)} MXN <span className="text-faint">(TC {cotizacion.tipo_cambio.toFixed(2)})</span>
          </p>
        )}

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
          </div>
        ) : (
          <div>
            <p className="text-[13px] text-ink/80 mb-3 leading-relaxed">
              Esta cotización está <b>pendiente de aprobación</b>. No se puede marcar como enviada hasta que alguien la revise y la firme.
            </p>

            {!puedeAprobar && (
              <p className="text-[12.5px] text-muted">No tienes permiso para aprobar cotizaciones.</p>
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
                  <SignaturePad ref={firmaRef} height={130} />
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
          </div>
        )}
      </div>

      {/* Marcar como enviada, rechazar y mandar por WhatsApp son acciones de
          quien firma/aprueba cotizaciones — no de cualquiera que solo tenga
          acceso de supervisor a esta pantalla. Ver el PDF sigue siendo de
          todos. */}
      {puedeAprobar && (
        <div className="flex gap-2.5 mb-1.5">
          {cotizacion.estado === 'enviada' ? (
            <button
              disabled
              className="flex-1 min-h-[52px] rounded-2xl bg-surface-2 border border-line text-muted font-display font-semibold text-[15px] flex items-center justify-center gap-2 cursor-not-allowed"
            >
              <Check size={17} strokeWidth={2.6} />
              Enviada
            </button>
          ) : (
            <button
              onClick={handleMarcarEnviada}
              disabled={!habilitaEnviar || procesandoAccion}
              title={!habilitaEnviar ? 'Primero hay que aprobarla y firmarla' : undefined}
              className="flex-1 min-h-[52px] rounded-2xl bg-amber text-inkOnAccent font-display font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-40"
            >
              <Send size={17} strokeWidth={2.4} />
              Marcar como enviada
            </button>
          )}
          {cotizacion.estado !== 'rechazada' && (
            <button
              onClick={handleRechazar}
              disabled={procesandoAccion}
              className="min-h-[52px] px-4 rounded-2xl border border-red/40 text-red font-semibold text-[14.5px] flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
            >
              <Ban size={16} strokeWidth={2.4} />
              Rechazar
            </button>
          )}
        </div>
      )}

      {/* Compartir: ver el PDF (para todos) o mandarlo directo por WhatsApp
          (solo quien aprueba cotizaciones) — el de WhatsApp queda activo
          siempre, sin importar el estado, para poder reenviarla cuando haga
          falta. */}
      <div className="flex gap-2.5 mb-2.5">
        <a
          href={`/api/cotizaciones/${cotizacion.id}/pdf?t=${Date.now()}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 min-h-[52px] rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-glow-teal"
        >
          <FileText size={18} strokeWidth={2.4} />
          Ver PDF
        </a>
        {puedeAprobar && (
          <button
            onClick={handleEnviarWhatsapp}
            disabled={!habilitaWhatsapp}
            title={
              !puedeCompartir
                ? 'Primero hay que aprobarla y firmarla'
                : !cotizacion.telefono
                ? 'Agrega un teléfono del cliente para poder enviarla'
                : undefined
            }
            className="flex-1 min-h-[52px] rounded-2xl bg-[#25D366] text-white font-display font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-40"
          >
            <MessageCircle size={18} strokeWidth={2.4} />
            WhatsApp
          </button>
        )}
      </div>

      {/* Editar: una vez firmada la cotización, el documento queda cerrado —
          nadie la edita ya, ni siquiera quien la aprobó. */}
      {!cotizacion.aprobada_firma && (
        <button
          onClick={() => setEditando(true)}
          className="w-full min-h-[48px] mb-3 rounded-xl border border-line-strong text-ink/80 font-semibold text-[14.5px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
        >
          <Pencil size={16} strokeWidth={2.3} />
          Editar
        </button>
      )}

      {/* Cancelar (eliminar): libre mientras sigue en borrador; una vez
          firmada, solo quien puede aprobar cotizaciones (Clara/Everardo)
          puede seguir cancelándola. */}
      {(!cotizacion.aprobada_firma || puedeAprobar) && (
        <button
          onClick={handleEliminar}
          disabled={eliminando}
          className="w-full min-h-[48px] rounded-xl border border-red/40 text-red text-[14.5px] font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
        >
          <Trash2 size={16} strokeWidth={2.4} />
          {eliminando ? 'Eliminando...' : 'Eliminar esta cotización'}
        </button>
      )}
    </SupervisorShell>
  );
}
