'use client';

import { useEffect, useRef, useState } from 'react';
import { Building2, Fuel, Hourglass, MapPinned, MoreHorizontal, ShoppingCart, UtensilsCrossed } from 'lucide-react';
import { createClient } from '@/lib/supabaseClient';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import CamposGasto from '@/components/gastos/CamposGasto';
import { horaActualMexico } from '@/lib/horaMexico';
import { fechaCorta, inicioVentana } from '@/lib/coberturaReportes';
import {
  GASTO_VACIO, MOTIVOS_PARADA, enlaceMapa, errorDeParada, infoMotivoParada, paradasPorJustificar, textoHorarioParada,
  type DatosGasto, type MotivoParada, type Parada,
} from '@/lib/paradas';
import { cargarParadas, justificarParada } from '@/lib/paradasDatos';
import { faltaElParche } from '@/lib/visitasExigiblesDatos';

const ICONOS: Record<MotivoParada, any> = {
  combustible: Fuel,
  compra_material: ShoppingCart,
  comida: UtensilsCrossed,
  espera: Hourglass,
  cliente: Building2,
  otro: MoreHorizontal,
};

// Paradas que el rastreo del teléfono detectó fuera de un cliente (5 minutos
// o más en un mismo lugar). El técnico dice qué fue con un toque; si fue
// combustible o material, sube el ticket. Va en «Mis reportes», junto a los
// demás pendientes. La fecha de hoy se lee en el efecto (Vercel corre en UTC).
export default function AvisoParadasSinJustificar() {
  const [pendientes, setPendientes] = useState<Parada[]>([]);
  const [hoy, setHoy] = useState('');
  const [abierta, setAbierta] = useState<Parada | null>(null);
  const [motivo, setMotivo] = useState<MotivoParada | ''>('');
  const [detalle, setDetalle] = useState('');
  const [gasto, setGasto] = useState<DatosGasto>(GASTO_VACIO);
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // El mensaje de error queda al fondo de la ventana: se lleva a la vista.
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    if (errorFormulario) errorRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [errorFormulario]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const { data } = await createClient().auth.getSession();
        const usuario = data.session?.user;
        if (!usuario) return;
        const { fecha } = horaActualMexico();
        const paradas = await cargarParadas(inicioVentana(fecha), fecha, usuario.id);
        if (cancelado) return;
        setHoy(fecha);
        setPendientes(paradasPorJustificar(paradas));
      } catch (error: any) {
        // Es un aviso de apoyo: si no carga (sin señal o sin el parche) la
        // pantalla sigue igual; el recordatorio también llega por notificación.
        if (!faltaElParche(error)) console.error('No se pudieron leer las paradas:', error?.message);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  if (pendientes.length === 0) return null;

  function abrir(parada: Parada) {
    setAbierta(parada);
    setMotivo('');
    setDetalle('');
    setGasto(GASTO_VACIO);
    setErrorFormulario(null);
  }

  async function guardar() {
    if (!abierta) return;
    const problema = errorDeParada(motivo, detalle, gasto);
    if (problema || !motivo) {
      setErrorFormulario(problema || 'Elige qué fue la parada.');
      return;
    }
    setErrorFormulario(null);
    setGuardando(true);
    try {
      await justificarParada(abierta.id, motivo, detalle, gasto);
      setPendientes((prev) => prev.filter((p) => p.id !== abierta.id));
      setAbierta(null);
      showToast(infoMotivoParada(motivo)?.sinAutorizacion ? 'Listo, parada registrada.' : 'Enviado. Tu supervisor lo revisará.', 'success');
    } catch (error: any) {
      setErrorFormulario(error?.message || 'No se pudo guardar. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  const info = infoMotivoParada(motivo);

  return (
    <>
      <div className="mb-4 p-4 rounded-2xl bg-amber/12 border-2 border-amber/40">
        <p className="text-[14px] font-semibold text-amber mb-0.5 flex items-center gap-2">
          <MapPinned size={17} strokeWidth={2.4} className="shrink-0" />
          {pendientes.length === 1 ? '1 parada por justificar' : `${pendientes.length} paradas por justificar`}
        </p>
        <p className="text-[12.5px] text-ink/80 leading-relaxed mb-3">
          El rastreo te ubica detenido en estos lugares. Di qué fue; si cargaste combustible o compraste material, sube el ticket.
        </p>
        <ul className="flex flex-col gap-2">
          {pendientes.map((parada) => (
            <li key={parada.id} className="p-2.5 rounded-xl bg-surface border border-line flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold leading-snug">
                  {parada.fecha === hoy ? 'Hoy' : fechaCorta(parada.fecha)} · {textoHorarioParada(parada)}
                </p>
                <a href={enlaceMapa(parada.lat, parada.lng)} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-teal font-semibold">
                  Ver el lugar en el mapa
                </a>
                {parada.estado === 'rechazada' && (
                  <p className="text-[12px] text-red font-semibold mt-0.5">Tu supervisor la rechazó: vuelve a justificarla.</p>
                )}
              </div>
              <button type="button" onClick={() => abrir(parada)}
                className="shrink-0 min-h-[40px] px-3.5 rounded-xl bg-teal text-white text-[13px] font-semibold active:scale-95 transition-transform">
                ¿Qué fue?
              </button>
            </li>
          ))}
        </ul>
      </div>

      {abierta && (
        <ModalOverlay onClose={() => !guardando && setAbierta(null)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[92vh] overflow-y-auto">
            <p className="font-display font-semibold text-[17px] mb-0.5">¿Qué fue esta parada?</p>
            <p className="text-[13px] text-muted mb-4">
              {abierta.fecha === hoy ? 'Hoy' : fechaCorta(abierta.fecha)} · {textoHorarioParada(abierta)}
            </p>

            <div className="grid grid-cols-2 gap-2 mb-3" role="radiogroup" aria-label="Qué fue la parada">
              {MOTIVOS_PARADA.map((m) => {
                const Icono = ICONOS[m.valor];
                const elegido = motivo === m.valor;
                return (
                  <button key={m.valor} type="button" role="radio" aria-checked={elegido} disabled={guardando}
                    onClick={() => { setMotivo(m.valor); setErrorFormulario(null); }}
                    className={`min-h-[64px] p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-colors ${elegido ? 'border-teal bg-teal/10' : 'border-line bg-surface'}`}>
                    <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${elegido ? 'bg-teal text-white' : 'bg-surface-2 text-ink/70'}`}>
                      <Icono size={18} strokeWidth={2.2} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-semibold leading-tight">{m.label}</span>
                      <span className="block text-[11.5px] text-muted leading-tight mt-0.5">{m.ejemplo}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {info && (
              <div className="flex flex-col gap-3">
                <label className="block">
                  <span className="text-[13px] text-ink/75 block mb-1.5">{info.pregunta}{info.detalleObligatorio ? ' (obligatorio)' : ''}</span>
                  <textarea value={detalle} rows={2} maxLength={500} disabled={guardando}
                    onChange={(e) => { setDetalle(e.target.value); setErrorFormulario(null); }}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[15px]" />
                </label>
                {info.gasto && (
                  <CamposGasto tipo={info.gasto} valor={gasto} deshabilitado={guardando}
                    onCambio={(g) => { setGasto(g); setErrorFormulario(null); }} />
                )}
                <p className="text-[12px] text-muted">
                  {info.sinAutorizacion ? 'No necesita autorización.' : 'Tu supervisor lo revisa y autoriza.'}
                </p>
              </div>
            )}

            {errorFormulario && <p ref={errorRef} role="alert" className="text-[13px] text-red font-semibold mt-2">{errorFormulario}</p>}
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={() => setAbierta(null)} disabled={guardando}
                className="flex-1 min-h-[48px] rounded-xl bg-surface-2 border border-line font-semibold text-[14px]">
                Cancelar
              </button>
              <button type="button" onClick={guardar} disabled={guardando || !motivo}
                className="flex-1 min-h-[48px] rounded-xl bg-teal text-white font-semibold text-[14px] disabled:opacity-50">
                {guardando ? 'Guardando…' : 'Enviar'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </>
  );
}
