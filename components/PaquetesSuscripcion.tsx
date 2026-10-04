'use client';

import { useState } from 'react';
import { Check, MessageCircle, Mail } from 'lucide-react';
import {
  PLANES, PlanClave, PRECIO_USUARIO_EXTRA, MESES_PAGADOS_EN_ANUAL,
  VENTAS_WHATSAPP, VENTAS_CORREO, dinero,
} from '@/lib/planesDatos';
import { MARCA, DEMO } from '@/lib/marca';

type Periodo = 'mensual' | 'anual';

// Mensaje ya escrito para ventas: pide información del paquete en el que se
// dio clic, con el periodo y el precio que se estaban viendo.
function enlaceContratar(plan: PlanClave, periodo: Periodo, renovar: boolean): string | null {
  const p = PLANES[plan];
  const precio = periodo === 'mensual'
    ? `${dinero(p.precioMensual)} al mes`
    : `${dinero(p.precioMensual * MESES_PAGADOS_EN_ANUAL)} al año`;
  const paquete = `paquete ${p.nombre} con pago ${periodo} (${precio} más IVA, hasta ${p.usuarios} usuarios)`;
  // En el demo quien escribe es un prospecto, no la empresa ficticia.
  const mensaje = DEMO.activo
    ? `Hola, vi el demo de ${MARCA.appNombre} y quiero información del ${paquete}. ¿Me pueden decir cómo contratarlo?`
    : renovar
      ? `Hola, soy de ${MARCA.nombre}. Quiero renovar ${MARCA.appNombre}: ${paquete}.`
      : `Hola, soy de ${MARCA.nombre}. Quiero información para contratar ${MARCA.appNombre}: ${paquete}.`;
  if (VENTAS_WHATSAPP) return `https://wa.me/${VENTAS_WHATSAPP.replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}`;
  if (VENTAS_CORREO) return `mailto:${VENTAS_CORREO}?subject=${encodeURIComponent(`Información del paquete ${p.nombre}`)}&body=${encodeURIComponent(mensaje)}`;
  return null;
}

// Paquetes de la pantalla de Suscripción. Cada tarjeta trae su propio
// «Mensual / Anual», que solo cambia lo que muestra esa tarjeta (precio y
// ahorro); el contacto con ventas es su botón «Contratar», que ya lleva el
// paquete y el periodo elegidos.
export default function PaquetesSuscripcion({ planActual, enPrueba }: { planActual: string; enPrueba: boolean }) {
  const [periodos, setPeriodos] = useState<Record<string, Periodo>>({});
  const hayContacto = !!(VENTAS_WHATSAPP || VENTAS_CORREO);
  const mesesGratis = 12 - MESES_PAGADOS_EN_ANUAL;

  return (
    <section id="paquetes" className="scroll-mt-24">
      <h2 className="font-display font-bold text-[21px] tracking-wide mb-1">Paquetes</h2>
      <p className="text-[13.5px] text-muted mb-4">
        Precios en MXN, más IVA. Pago anual: 12 meses por el precio de {MESES_PAGADOS_EN_ANUAL}.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 mb-4">
        {(Object.keys(PLANES) as PlanClave[]).map((clave) => {
          const p = PLANES[clave];
          const actual = clave === planActual && !enPrueba;
          const destacado = clave === 'profesional';
          const totalAnual = p.precioMensual * MESES_PAGADOS_EN_ANUAL;
          const periodo = periodos[clave] || 'mensual';
          const enlace = enlaceContratar(clave, periodo, actual);
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
              <p className="text-[12.5px] text-muted mb-3 tabular-nums">
                {periodo === 'mensual'
                  ? `o ${dinero(totalAnual)} al año`
                  : `Equivale a ${dinero(Math.round(totalAnual / 12))} al mes · ahorras ${dinero(p.precioMensual * mesesGratis)}`}
              </p>
              {/* Periodo de pago de esta tarjeta */}
              <div className="grid grid-cols-2 p-1 mb-4 rounded-xl bg-surface-2 border border-line" role="group" aria-label={`Periodo de pago del paquete ${p.nombre}`}>
                {(['mensual', 'anual'] as const).map((op) => (
                  <button
                    key={op}
                    type="button"
                    aria-pressed={periodo === op}
                    onClick={() => setPeriodos((v) => ({ ...v, [clave]: op }))}
                    className={`min-h-[36px] rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      periodo === op ? 'bg-surface text-teal shadow-glow ring-1 ring-teal/40' : 'text-ink/65 hover:text-ink'
                    }`}
                  >
                    {op === 'mensual' ? 'Mensual' : 'Anual'}
                    {op === 'anual' && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber/15 text-amber">{mesesGratis} meses gratis</span>}
                  </button>
                ))}
              </div>
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
          ? ` «Contratar» abre ${VENTAS_WHATSAPP ? 'WhatsApp' : 'tu correo'} con un mensaje ya escrito pidiendo información de ese paquete.`
          : ' Para contratar o renovar, contacta a tu proveedor de la app.'}
      </p>
    </section>
  );
}
