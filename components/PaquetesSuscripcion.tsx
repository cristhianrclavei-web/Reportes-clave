'use client';

import { useState } from 'react';
import { Check, MessageCircle, Mail } from 'lucide-react';
import {
  PLANES, PlanClave, PRECIO_USUARIO_EXTRA, MESES_PAGADOS_EN_ANUAL,
  VENTAS_WHATSAPP, VENTAS_CORREO, dinero,
} from '@/lib/planesDatos';
import { MARCA, DEMO } from '@/lib/marca';

type Periodo = 'mensual' | 'anual';

function enlaceContratar(plan: PlanClave, periodo: Periodo): string | null {
  // En el demo quien escribe es un prospecto, no la empresa ficticia.
  const mensaje = DEMO.activo
    ? `Hola, vi el demo de ${MARCA.appNombre} y me interesa el plan ${PLANES[plan].nombre} (${periodo}).`
    : `Hola, soy de ${MARCA.nombre}. Quiero contratar el plan ${PLANES[plan].nombre} (${periodo}) de ${MARCA.appNombre}.`;
  if (VENTAS_WHATSAPP) return `https://wa.me/${VENTAS_WHATSAPP.replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}`;
  if (VENTAS_CORREO) return `mailto:${VENTAS_CORREO}?subject=${encodeURIComponent(`Contratar plan ${PLANES[plan].nombre}`)}&body=${encodeURIComponent(mensaje)}`;
  return null;
}

// Paquetes de la pantalla de Suscripción. «Mensual / Anual» solo cambia lo
// que muestran las tarjetas (precio y ahorro); el contacto con ventas es el
// botón «Contratar» de cada paquete, que ya lleva el periodo elegido.
export default function PaquetesSuscripcion({ planActual, enPrueba }: { planActual: string; enPrueba: boolean }) {
  const [periodo, setPeriodo] = useState<Periodo>('mensual');
  const hayContacto = !!(VENTAS_WHATSAPP || VENTAS_CORREO);
  const mesesGratis = 12 - MESES_PAGADOS_EN_ANUAL;

  return (
    <section id="paquetes" className="scroll-mt-24">
      <div className="flex items-end justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="font-display font-bold text-[21px] tracking-wide mb-1">Paquetes</h2>
          <p className="text-[13.5px] text-muted">
            Precios en MXN, más IVA. Pago anual: 12 meses por el precio de {MESES_PAGADOS_EN_ANUAL}.
          </p>
        </div>
        <div className="inline-flex p-1 rounded-full bg-surface-2 border border-line" role="group" aria-label="Periodo de pago">
          {(['mensual', 'anual'] as const).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={periodo === p}
              onClick={() => setPeriodo(p)}
              className={`min-h-[38px] px-4 rounded-full text-[13.5px] font-semibold flex items-center gap-2 transition-colors ${
                periodo === p ? 'bg-teal text-inkOnAccent shadow-glow-teal' : 'text-ink/70 hover:text-ink'
              }`}
            >
              {p === 'mensual' ? 'Mensual' : 'Anual'}
              {p === 'anual' && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10.5px] font-bold ${periodo === 'anual' ? 'bg-white/20' : 'bg-amber/15 text-amber'}`}>
                  {mesesGratis} meses gratis
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 mb-4">
        {(Object.keys(PLANES) as PlanClave[]).map((clave) => {
          const p = PLANES[clave];
          const actual = clave === planActual && !enPrueba;
          const destacado = clave === 'profesional';
          const totalAnual = p.precioMensual * MESES_PAGADOS_EN_ANUAL;
          const enlace = enlaceContratar(clave, periodo);
          return (
            <div
              key={clave}
              className={`rounded-2xl bg-surface border p-5 flex flex-col ${
                actual ? 'border-teal' : destacado ? 'border-amber/60' : 'border-line'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-display font-bold text-[22px] tracking-wide">{p.nombre}</p>
                {actual ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold bg-teal/12 text-teal">Tu plan</span>
                ) : destacado ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold bg-amber/15 text-amber">Recomendado</span>
                ) : null}
              </div>
              <p className="text-[13px] text-muted mb-3">{p.lema}</p>
              <p className="mb-0.5">
                <span className="font-display font-bold text-[32px] tabular-nums">
                  {dinero(periodo === 'mensual' ? p.precioMensual : totalAnual)}
                </span>
                <span className="text-[13px] text-muted"> {periodo === 'mensual' ? '/mes' : '/año'}</span>
              </p>
              <p className="text-[12.5px] text-muted mb-4 tabular-nums">
                {periodo === 'mensual'
                  ? `o ${dinero(totalAnual)} al año`
                  : `Equivale a ${dinero(Math.round(totalAnual / 12))} al mes · ahorras ${dinero(p.precioMensual * mesesGratis)}`}
              </p>
              <ul className="space-y-1.5 text-[13.5px] mb-5">
                <li className="flex gap-2"><Check size={16} className="text-teal shrink-0 mt-0.5" />Hasta {p.usuarios} usuarios</li>
                {p.incluye.map((i) => (
                  <li key={i} className="flex gap-2"><Check size={16} className="text-teal shrink-0 mt-0.5" />{i}</li>
                ))}
              </ul>
              {enlace && (
                <a
                  href={enlace}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`mt-auto min-h-[46px] rounded-xl font-semibold text-[14px] flex items-center justify-center gap-2 active:scale-95 transition-transform ${
                    destacado || actual ? 'bg-teal text-inkOnAccent shadow-glow-teal' : 'border border-line-strong hover:border-teal/60 hover:text-teal'
                  }`}
                >
                  {VENTAS_WHATSAPP ? <MessageCircle size={16} /> : <Mail size={16} />}
                  {actual ? 'Renovar' : 'Contratar'} · {periodo === 'mensual' ? 'mensual' : 'anual'}
                </a>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[13px] text-muted mb-8">
        ¿Necesitas más usuarios sin cambiar de paquete? Cada usuario extra cuesta {dinero(PRECIO_USUARIO_EXTRA)} al mes.
        {hayContacto
          ? ` «Contratar» abre ${VENTAS_WHATSAPP ? 'WhatsApp' : 'tu correo'} con el paquete y el periodo ya escritos.`
          : ' Para contratar o renovar, contacta a tu proveedor de la app.'}
      </p>
    </section>
  );
}
