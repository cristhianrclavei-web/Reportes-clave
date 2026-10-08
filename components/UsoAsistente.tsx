'use client';

import { useEffect, useState } from 'react';
import { Sparkles, ChevronRight } from 'lucide-react';

// Panel de uso del asistente, dentro de Mi perfil. Solo aparece para quien
// administra el asistente (lo decide /api/asistente/uso por el correo de la
// cuenta); a los demás la ruta les contesta 403 y aquí no se muestra nada.

type Uso = {
  conCosto: boolean;
  total: { hoy: number; semana: number; mes: number; costoHoy: number; costoSemana: number; costoMes: number; busquedas: number; conFoto: number };
  personas: { nombre: string; rol: string; hoy: number; semana: number; mes: number; costoMes: number }[];
  dias: { dia: string; mensajes: number; costo: number }[];
  herramientas: { nombre: string; veces: number }[];
  sinRespuesta: { cuando: string; quien: string; pregunta: string; respuesta: string }[];
  pulgares?: { arriba: number; abajo: number };
  malCalificadas?: { cuando: string; quien: string; pregunta: string; respuesta: string }[];
};

// Nombre interno de cada función → cómo se le dice en la app.
const FUNCIONES: Record<string, string> = {
  buscar_equipos_instalados: 'Equipos instalados', buscar_reportes: 'Reportes', consultar_servicios: 'Servicios',
  tareas_de_servicio: 'Tareas de un servicio', lista_de_carga_de_servicio: 'Lista de carga', plantillas_de_la_empresa: 'Plantillas',
  existencias_almacen: 'Almacén', consultar_vales: 'Vales', buscar_clientes: 'Clientes', buscar_cotizaciones: 'Cotizaciones',
  tecnicos_disponibles: 'Técnicos disponibles', mantenimientos_recurrentes: 'Mantenimientos recurrentes',
  precios_de_referencia: 'Precios para cotizar', redaccion_de_cotizaciones: 'Redacción de cotizaciones',
  crear_borrador_cotizacion: 'Crear cotización', leer_borrador_cotizacion: 'Leer borrador', actualizar_borrador_cotizacion: 'Modificar cotización',
  programar_servicio: 'Programar servicio', reprogramar_servicio: 'Reprogramar servicio', cancelar_servicio: 'Cancelar servicio',
  cambiar_tecnicos_de_servicio: 'Cambiar técnicos', solicitar_material: 'Pedir material',
  web_search: 'Búsqueda en internet',
};

const usd = (n: number) => `US$${n.toFixed(2)}`;
const fechaCorta = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };

export default function UsoAsistente() {
  const [uso, setUso] = useState<Uso | null>(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    fetch('/api/asistente/uso')
      .then((r) => (r.ok ? r.json() : null))
      .then(setUso)
      .catch(() => { /* sin red: no se muestra */ });
  }, []);

  if (!uso) return null;
  const maxDia = Math.max(1, ...uso.dias.map((d) => d.mensajes));
  const titulo = 'text-[11px] font-semibold uppercase tracking-wider text-muted mb-2';

  return (
    <div className="rounded-2xl bg-surface border border-line overflow-hidden">
      <button type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} className="w-full p-5 flex items-center gap-3 text-left active:scale-[0.99] transition-transform">
        <Sparkles size={20} strokeWidth={2.4} className="text-teal shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-[19px] tracking-wide">Uso del asistente</p>
          <p className="text-[13px] text-muted">
            {uso.total.hoy} hoy · {uso.total.mes} en 30 días{uso.conCosto ? ` · ${usd(uso.total.costoMes)}` : ''}
          </p>
        </div>
        <ChevronRight size={20} className={`text-muted shrink-0 transition-transform ${abierto ? 'rotate-90' : ''}`} />
      </button>

      {abierto && (
        <div className="border-t border-line p-5 pt-4 flex flex-col gap-6">
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { etiqueta: 'Hoy', n: uso.total.hoy, costo: uso.total.costoHoy },
              { etiqueta: '7 días', n: uso.total.semana, costo: uso.total.costoSemana },
              { etiqueta: '30 días', n: uso.total.mes, costo: uso.total.costoMes },
            ].map((t) => (
              <div key={t.etiqueta} className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
                <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted">{t.etiqueta}</p>
                <p className="font-display text-[24px] font-bold leading-tight">{t.n}</p>
                <p className="text-[11.5px] text-muted">{uso.conCosto ? usd(t.costo) : 'mensajes'}</p>
              </div>
            ))}
          </div>
          {!uso.conCosto && (
            <p className="-mt-3 text-[12px] leading-snug text-muted">
              Para ver el costo estimado falta correr en la base el archivo patch_asistente_uso_costo.sql. A partir de entonces se registra en cada consulta.
            </p>
          )}
          {uso.conCosto && (
            <p className="-mt-3 text-[12px] leading-snug text-muted">
              Costo estimado con los precios del modelo, desde que se activó el registro; no incluye el cargo por búsquedas en internet ({uso.total.busquedas} en 30 días). El cobro real está en la consola de Anthropic.
            </p>
          )}

          <div>
            <p className={titulo}>Mensajes por día</p>
            <div className="flex flex-col gap-1.5">
              {uso.dias.map((d) => (
                <div key={d.dia} className="flex items-center gap-2.5 text-[12.5px]">
                  <span className="w-11 shrink-0 font-mono text-muted">{fechaCorta(d.dia)}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <span className="block h-full rounded-full bg-teal" style={{ width: `${Math.max(3, (d.mensajes / maxDia) * 100)}%` }} />
                  </span>
                  <span className="w-8 shrink-0 text-right font-medium">{d.mensajes}</span>
                  {uso.conCosto && <span className="w-16 shrink-0 text-right text-muted">{usd(d.costo)}</span>}
                </div>
              ))}
              {uso.dias.length === 0 && <p className="text-[13px] text-muted">Aún no hay consultas.</p>}
            </div>
          </div>

          <div>
            <p className={titulo}>Por persona · 30 días</p>
            <div className="flex flex-col divide-y divide-line">
              {uso.personas.map((p) => (
                <div key={p.nombre} className="flex items-center gap-3 py-2 text-[13.5px]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.nombre}</span>
                    <span className="block text-[11.5px] text-muted">{p.rol === 'supervisor' ? 'Supervisor' : 'Técnico'} · hoy {p.hoy} · semana {p.semana}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-display text-[17px] font-bold leading-tight">{p.mes}</span>
                    {uso.conCosto && <span className="block text-[11.5px] text-muted">{usd(p.costoMes)}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {uso.herramientas.length > 0 && (
            <div>
              <p className={titulo}>Para qué se usa más</p>
              <div className="flex flex-wrap gap-1.5">
                {uso.herramientas.map((h) => (
                  <span key={h.nombre} className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[12px]">
                    {FUNCIONES[h.nombre] || h.nombre} <span className="font-semibold text-teal">{h.veces}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className={titulo}>Calificación de las respuestas</p>
            <p className="text-[13.5px]">
              <span className="font-semibold text-teal">{uso.pulgares?.arriba || 0}</span> útiles ·{' '}
              <span className="font-semibold text-red">{uso.pulgares?.abajo || 0}</span> que no sirvieron
            </p>
            {(uso.malCalificadas?.length || 0) > 0 && (
              <div className="mt-2 flex flex-col gap-2">
                {uso.malCalificadas!.map((s, n) => (
                  <details key={n} className="group rounded-xl border border-red/30 bg-red/[0.06] px-3 py-2.5">
                    <summary className="flex cursor-pointer list-none items-start gap-2 text-[13px] [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0 flex-1">
                        <span className="block leading-snug">{s.pregunta}</span>
                        <span className="mt-0.5 block text-[11.5px] text-muted">{s.quien}</span>
                      </span>
                      <ChevronRight size={15} className="mt-0.5 shrink-0 text-muted transition-transform group-open:rotate-90" />
                    </summary>
                    <p className="mt-2 border-t border-line pt-2 text-[12.5px] leading-snug text-muted">{s.respuesta}</p>
                  </details>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className={titulo}>Preguntas que no pudo resolver</p>
            {uso.sinRespuesta.length === 0 && <p className="text-[13px] text-muted">Ninguna en los últimos 30 días.</p>}
            <div className="flex flex-col gap-2">
              {uso.sinRespuesta.map((s, n) => (
                <details key={n} className="group rounded-xl border border-line bg-surface-2 px-3 py-2.5">
                  <summary className="flex cursor-pointer list-none items-start gap-2 text-[13px] [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">
                      <span className="block leading-snug">{s.pregunta}</span>
                      <span className="mt-0.5 block text-[11.5px] text-muted">{s.quien}</span>
                    </span>
                    <ChevronRight size={15} className="mt-0.5 shrink-0 text-muted transition-transform group-open:rotate-90" />
                  </summary>
                  <p className="mt-2 border-t border-line pt-2 text-[12.5px] leading-snug text-muted">{s.respuesta}</p>
                </details>
              ))}
            </div>
            <p className="mt-2 text-[12px] leading-snug text-muted">Se detectan por frases como «no encontré» o «no puedo»; algunas son respuestas correctas (no había datos).</p>
          </div>
        </div>
      )}
    </div>
  );
}
