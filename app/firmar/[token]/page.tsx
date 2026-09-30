import { createClient } from '@supabase/supabase-js';
import { SearchX, CheckCircle2, Clock } from 'lucide-react';
import Logo from '@/components/Logo';
import { MARCA } from '@/lib/marca';
import { fechaDMA } from '@/lib/etiquetaMantenimiento';
import FormFirma from './FormFirma';

// Página pública a la que lleva el enlace de firma que el técnico manda por
// WhatsApp cuando el cliente no estaba. No pide sesión: solo usa
// firma_remota_info() y, al firmar, /api/firmar.

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `Firma de reporte de servicio · ${MARCA.nombre}`,
  robots: { index: false, follow: false },
};

type InfoFirma = {
  estado: 'pendiente' | 'firmado' | 'vencido';
  folio: string;
  fecha: string;
  cliente: string;
  tipoServicio: string | null;
  tecnico: string | null;
  actividades: string[];
  observaciones: string | null;
  equipos: { cant: string | null; desc: string; marca: string | null; modelo: string | null }[];
  formatos: { titulo: string; total: number; noCumple: number }[];
  recibio: string | null;
  firmadoPor: string | null;
};

async function consultar(token: string): Promise<InfoFirma | null> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.rpc('firma_remota_info', { p_token: token });
  if (error || !data) return null;
  return data as InfoFirma;
}

function Aviso({ icono, color, titulo, texto }: { icono: React.ReactNode; color: string; titulo: string; texto: string }) {
  return (
    <div className="rounded-3xl bg-surface border border-line p-6 text-center">
      <span className={`mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-3 ${color}`}>{icono}</span>
      <h1 className="font-display font-bold text-[22px] mb-1.5">{titulo}</h1>
      <p className="text-[14px] text-ink/75 leading-relaxed">{texto}</p>
    </div>
  );
}

export default async function FirmarPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const v = await consultar(token);

  return (
    <div className="min-h-screen max-w-xl mx-auto px-4 pt-6 pb-16">
      <div className="flex items-center justify-between mb-6">
        <Logo variante="completo" size={30} />
        <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">Firma de reporte</span>
      </div>

      {!v ? (
        <Aviso
          icono={<SearchX size={26} strokeWidth={2.2} />}
          color="bg-amber/15 text-amber"
          titulo="Enlace no válido"
          texto={`Este enlace no corresponde a un reporte pendiente de firma. Para confirmar, comunícate con ${MARCA.nombre} al ${MARCA.telefonos}.`}
        />
      ) : v.estado === 'firmado' ? (
        <Aviso
          icono={<CheckCircle2 size={26} strokeWidth={2.2} />}
          color="bg-teal/15 text-teal"
          titulo="Reporte firmado"
          texto={`El reporte de servicio del ${fechaDMA(v.fecha)} (folio ${v.folio}) ya fue firmado${v.firmadoPor ? ` por ${v.firmadoPor}` : ''}. Gracias.`}
        />
      ) : v.estado === 'vencido' ? (
        <Aviso
          icono={<Clock size={26} strokeWidth={2.2} />}
          color="bg-amber/15 text-amber"
          titulo="El enlace venció"
          texto={`Pide a ${MARCA.nombre} que te envíe un enlace nuevo para firmar el reporte del ${fechaDMA(v.fecha)} (folio ${v.folio}).`}
        />
      ) : (
        <>
          <div className="rounded-3xl bg-surface border border-line p-5 mb-4">
            <p className="text-[12px] uppercase tracking-wider text-teal font-semibold">Reporte de servicio</p>
            <h1 className="font-display font-bold text-[24px] leading-tight">{v.cliente}</h1>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 text-[13px]">
              <div><span className="block text-[11px] uppercase tracking-wider text-muted">Fecha</span>{fechaDMA(v.fecha)}</div>
              <div><span className="block text-[11px] uppercase tracking-wider text-muted">Folio</span>{v.folio}</div>
              {v.tipoServicio && <div><span className="block text-[11px] uppercase tracking-wider text-muted">Servicio</span>{v.tipoServicio}</div>}
              {v.tecnico && <div><span className="block text-[11px] uppercase tracking-wider text-muted">Ing. responsable</span>{v.tecnico}</div>}
            </div>
            {v.recibio && <p className="text-[12.5px] text-muted mt-3">En sitio recibió: {v.recibio}</p>}
          </div>

          {v.actividades.length > 0 && (
            <div className="rounded-3xl bg-surface border border-line p-5 mb-4">
              <p className="text-[12px] uppercase tracking-wider text-muted font-semibold mb-2">Trabajo realizado</p>
              <ul className="list-disc pl-5 text-[14px] space-y-1">
                {v.actividades.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}

          {v.equipos.length > 0 && (
            <div className="rounded-3xl bg-surface border border-line p-5 mb-4">
              <p className="text-[12px] uppercase tracking-wider text-muted font-semibold mb-2">Equipos y materiales</p>
              <ul className="text-[14px] space-y-1">
                {v.equipos.map((e, i) => (
                  <li key={i}>{e.cant ? `${e.cant} × ` : ''}{e.desc}{[e.marca, e.modelo].filter(Boolean).length ? ` (${[e.marca, e.modelo].filter(Boolean).join(' ')})` : ''}</li>
                ))}
              </ul>
            </div>
          )}

          {v.formatos.length > 0 && (
            <div className="rounded-3xl bg-surface border border-line p-5 mb-4">
              <p className="text-[12px] uppercase tracking-wider text-muted font-semibold mb-2">Formatos de mantenimiento</p>
              <ul className="text-[14px] space-y-1">
                {v.formatos.map((f, i) => (
                  <li key={i}>
                    {f.titulo}: {f.total} puntos{f.noCumple > 0 ? <b className="text-red"> · {f.noCumple} con observaciones</b> : <span className="text-teal"> · cumple</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {v.observaciones && (
            <div className="rounded-3xl bg-surface border border-line p-5 mb-4">
              <p className="text-[12px] uppercase tracking-wider text-muted font-semibold mb-2">Observaciones</p>
              <p className="text-[14px] whitespace-pre-line">{v.observaciones}</p>
            </div>
          )}

          <FormFirma token={token} />
        </>
      )}
    </div>
  );
}
