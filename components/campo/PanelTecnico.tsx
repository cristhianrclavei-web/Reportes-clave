'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowLeftRight, Check, ExternalLink, FileText, MessageCircle, Phone, X } from 'lucide-react';
import { AvatarTecnico } from '@/components/AvatarTecnico';
import { TEXTO_REPORTE, ultimaVez, type EstadoReporte } from '@/lib/campo';
import { textoDuracion } from '@/lib/visitas';
import { enlaceGoogleMaps } from '@/components/servicios/motorMapa';
import { ChipEstado, textoGps } from './TarjetaTecnico';
import type { InfoTecnico } from './useCampo';

// Detalle del técnico elegido (los dos mapas): contacto, «Ahora mismo», la
// línea de tiempo del día (inicio, cada parada, fin), acciones y números.

const COLOR_REPORTE: Record<EstadoReporte, string> = { entregado: '#16a34a', pendiente: '#f59e0b', sin_reporte: '#dc2626' };

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });
}

function Accion({ href, icono, texto, externo = false }: { href: string | null; icono: React.ReactNode; texto: string; externo?: boolean }) {
  const clases = 'min-h-[48px] rounded-xl border border-line bg-surface-2 text-[13px] font-semibold flex items-center justify-center gap-1.5 px-2';
  if (!href) return <span className={`${clases} opacity-40`} aria-disabled="true">{icono} {texto}</span>;
  if (externo) return <a href={href} target="_blank" rel="noopener noreferrer" className={`${clases} hover:border-teal/60`}>{icono} {texto}</a>;
  return <Link href={href} className={`${clases} hover:border-teal/60`}>{icono} {texto}</Link>;
}

export default function PanelTecnico({ info, ahora, esHoy, onCerrar }: {
  info: InfoTecnico;
  ahora: number;
  esHoy: boolean;
  onCerrar: () => void;
}) {
  const digitos = (info.telefono || '').replace(/\D/g, '');
  const whatsapp = digitos.length === 10 ? `52${digitos}` : digitos;
  const posicion = info.ultimo || info.conocido;
  // El reporte que se puede ver: el del servicio actual o el último con reporte.
  const conReporte = [...info.servicios].reverse().find((s) => s.report_id);
  const verReporte = conReporte ? `/api/reports/${conReporte.report_id}/pdf` : info.actual ? `/dashboard/servicios/${info.actual.id}` : null;
  const llegada = info.actual?.hora_llegada || info.actual?.hora_inicio || null;
  const primero = info.recorrido[0];
  const ultimo = info.recorrido[info.recorrido.length - 1];
  const gps = textoGps(info, ahora);

  return (
    <aside className="rounded-3xl border border-line bg-surface p-4 flex flex-col gap-4" aria-label={`Detalle de ${info.nombre}`}>
      <div className="flex items-start gap-3">
        <AvatarTecnico id={info.id} nombre={info.nombre} size={52} />
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-[18px] leading-tight">{info.nombre}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2"><ChipEstado estado={info.estado} /></div>
          <p className="text-[12.5px] text-muted mt-1">{info.telefono || 'Sin teléfono en su perfil'}</p>
          {posicion && esHoy && <p className={`text-[12px] mt-0.5 ${gps.mal ? 'text-amber' : 'text-muted'}`}>Visto {ultimaVez(posicion.registrado_en, ahora)} · {gps.texto}{typeof posicion.bateria === 'number' ? ` · batería ${posicion.bateria}%` : ''}</p>}
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar el detalle" className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center hover:bg-surface-2"><X size={19} /></button>
      </div>

      {info.alertas.length > 0 && (
        <div className="rounded-2xl border border-red/40 bg-red/10 p-3 flex flex-col gap-1">
          {info.alertas.map((a) => (
            <p key={a.texto} className="text-[13px] text-red font-semibold flex items-start gap-1.5"><AlertTriangle size={15} className="shrink-0 mt-0.5" /> {a.texto}</p>
          ))}
        </div>
      )}

      {esHoy && (
        <div className="rounded-2xl bg-surface-2/70 border border-line p-3">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-faint mb-1">Ahora mismo</p>
          {info.actual ? (
            <>
              <p className="font-semibold text-[15px] leading-snug">{info.actual.proyecto}</p>
              {info.actual.ubicacion?.direccion && <p className="text-[12.5px] text-muted leading-snug">{info.actual.ubicacion.direccion}</p>}
              {llegada && (
                <p className="text-[13px] mt-1">Llegó {hora(llegada)} · <b>{textoDuracion(Math.max(0, Math.round((ahora - Date.parse(llegada)) / 60000)))}</b> en sitio</p>
              )}
            </>
          ) : (
            <p className="text-[13.5px]">{info.estado === 'terminado' ? 'Terminó su día.' : info.estado === 'sin_salir' ? 'Todavía no sale.' : 'En camino.'}
              {info.siguiente && <> Sigue: <b>{info.siguiente.proyecto}</b>{info.siguiente.hora_programada ? ` a las ${info.siguiente.hora_programada}` : ''}.</>}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Accion href={digitos ? `tel:${digitos}` : null} icono={<Phone size={16} />} texto="Llamar" externo />
        <Accion href={whatsapp ? `https://wa.me/${whatsapp}` : null} icono={<MessageCircle size={16} />} texto="WhatsApp" externo />
        <Accion href={verReporte} icono={<FileText size={16} />} texto="Ver reporte" externo={Boolean(conReporte)} />
        <Accion href={posicion ? enlaceGoogleMaps(posicion.lat, posicion.lng) : null} icono={<ExternalLink size={16} />} texto="Google Maps" externo />
        <div className="col-span-2"><Accion href="/dashboard/servicios?sub=hoy" icono={<ArrowLeftRight size={16} />} texto="Reasignar servicios (tablero de hoy)" /></div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        {[
          ['Km recorridos', info.km.toLocaleString('es-MX')],
          ['Paradas', String(info.paradas.length)],
          ['En sitio / en ruta', `${textoDuracion(info.tiempos.enSitio)} / ${textoDuracion(info.tiempos.enRuta)}`],
          ['Reportes entregados', String(info.reportes)],
        ].map(([titulo, valor]) => (
          <div key={titulo} className="rounded-xl bg-surface-2/70 border border-line px-2 py-2">
            <p className="font-display font-bold text-[16px] leading-tight">{valor}</p>
            <p className="text-[11px] text-muted mt-0.5">{titulo}</p>
          </div>
        ))}
      </div>

      {/* Línea de tiempo del día */}
      <div>
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-faint mb-2">Línea de tiempo</p>
        {info.recorrido.length === 0 ? (
          <p className="text-[13px] text-muted">Sin rastreo este día.</p>
        ) : (
          <ol className="relative border-l-2 border-line ml-3 flex flex-col gap-3">
            <li className="pl-4 relative">
              <span className="absolute -left-[11px] top-0.5 w-5 h-5 rounded-full bg-[#16a34a] text-white flex items-center justify-center"><Check size={12} strokeWidth={3} /></span>
              <p className="text-[13.5px]"><b>Inicio</b> · {hora(primero.registrado_en)}</p>
            </li>
            {info.paradas.map((p) => (
              <li key={p.numero} className="pl-4 relative">
                <span className="absolute -left-[13px] top-0 min-w-6 h-6 px-1 rounded-full bg-surface border-[2.5px] text-[11.5px] font-bold flex items-center justify-center"
                  style={{ borderColor: p.reporte ? COLOR_REPORTE[p.reporte] : '#64748b' }}>{p.numero}</span>
                <p className="text-[13.5px] leading-snug"><b>{hora(p.desde)}</b> · {p.lugar || 'Lugar sin identificar'}{p.propio ? ' (lugar propio)' : ''}</p>
                <p className="text-[12.5px] text-muted">
                  {textoDuracion(p.minutos)}{p.enCurso ? ' · sigue ahí' : ''}
                  {p.reporte && <> · <span style={{ color: COLOR_REPORTE[p.reporte] }} className="font-semibold">{TEXTO_REPORTE[p.reporte]}</span></>}
                </p>
              </li>
            ))}
            <li className="pl-4 relative">
              <span className={`absolute -left-[11px] top-0.5 w-5 h-5 rounded-full ${info.estado === 'terminado' ? 'bg-ink' : 'bg-[#3b82f6] animate-pulse'}`} />
              <p className="text-[13.5px]">
                {info.estado === 'terminado' ? <><b>Fin</b> · {hora(ultimo.registrado_en)}</> : <><b>Ahora</b> · último punto {hora(ultimo.registrado_en)}</>}
              </p>
            </li>
          </ol>
        )}
      </div>
    </aside>
  );
}
