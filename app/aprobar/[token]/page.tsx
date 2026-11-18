import { createClient } from '@supabase/supabase-js';
import { CheckCircle2, Clock, FileText, MessageSquareWarning, RefreshCw, SearchX } from 'lucide-react';
import Logo from '@/components/Logo';
import { MARCA } from '@/lib/marca';
import FormAprobar from './FormAprobar';

// Página a la que lleva el enlace de aprobación que se manda por WhatsApp a
// quien aprueba cotizaciones (supabase/patch_cotizacion_aprobacion_remota.sql).
// No pide sesión: el enlace es de una sola persona, vence y sirve una vez.

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `Aprobar cotización · ${MARCA.nombre}`,
  robots: { index: false, follow: false },
};

type Info = {
  estado: 'pendiente' | 'aprobada' | 'cambios' | 'ya_aprobada' | 'vencido' | 'cambiada';
  folio: string;
  empresa: string;
  proyecto: string | null;
  total: number | null;
  moneda: string | null;
  conceptos: number;
  aprobador: string;
  pedidoPor: string | null;
  pedidoEn: string;
  aprobadaPor: string | null;
};

async function consultar(token: string): Promise<Info | null> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.rpc('aprobacion_remota_info', { p_token: token });
  if (error) console.error('aprobacion_remota_info:', error.message);
  if (error || !data) return null;
  return data as Info;
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

function dinero(total: number | null, moneda: string | null): string {
  if (total === null) return '—';
  return `$${Number(total).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda || 'MXN'}`;
}

export default async function AprobarPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const v = await consultar(token);
  const pedidaPor = v?.pedidoPor || 'quien la armó';

  return (
    <div className="min-h-screen max-w-xl mx-auto px-4 pt-6 pb-16">
      <div className="flex items-center justify-between mb-6">
        <Logo variante="completo" size={30} />
        <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">Aprobación de cotización</span>
      </div>

      {!v ? (
        <Aviso icono={<SearchX size={26} strokeWidth={2.2} />} color="bg-amber/15 text-amber" titulo="Enlace no válido"
          texto="Este enlace no corresponde a una cotización por aprobar. Pide que te lo manden otra vez." />
      ) : v.estado === 'aprobada' || v.estado === 'ya_aprobada' ? (
        <Aviso icono={<CheckCircle2 size={26} strokeWidth={2.2} />} color="bg-teal/15 text-teal" titulo="Cotización aprobada"
          texto={`La cotización ${v.folio} de ${v.empresa} ya está aprobada${v.aprobadaPor ? ` por ${v.aprobadaPor}` : ''}. Ya puedes cerrar esta página.`} />
      ) : v.estado === 'cambios' ? (
        <Aviso icono={<MessageSquareWarning size={26} strokeWidth={2.2} />} color="bg-amber/15 text-amber" titulo="Pediste cambios"
          texto={`Ya le avisamos a ${pedidaPor}. Cuando corrija la cotización ${v.folio}, te mandará un enlace nuevo.`} />
      ) : v.estado === 'vencido' ? (
        <Aviso icono={<Clock size={26} strokeWidth={2.2} />} color="bg-amber/15 text-amber" titulo="El enlace venció"
          texto={`Pide a ${pedidaPor} que te mande un enlace nuevo para la cotización ${v.folio}.`} />
      ) : v.estado === 'cambiada' ? (
        <Aviso icono={<RefreshCw size={26} strokeWidth={2.2} />} color="bg-amber/15 text-amber" titulo="La cotización cambió"
          texto={`La cotización ${v.folio} se editó después de que te la mandaron. Pide a ${pedidaPor} el enlace nuevo para revisar la versión actual.`} />
      ) : (
        <>
          <div className="rounded-3xl bg-surface border border-line p-5 mb-4">
            <p className="text-[12px] uppercase tracking-wider text-teal font-semibold">Cotización {v.folio}</p>
            <h1 className="font-display font-bold text-[24px] leading-tight">{v.empresa}</h1>
            {v.proyecto && <p className="text-[14px] text-ink/80 mt-0.5">{v.proyecto}</p>}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 text-[13px]">
              <div><span className="block text-[11px] uppercase tracking-wider text-muted">Total</span><b className="text-[15px]">{dinero(v.total, v.moneda)}</b></div>
              <div><span className="block text-[11px] uppercase tracking-wider text-muted">Conceptos</span>{v.conceptos}</div>
              <div className="col-span-2"><span className="block text-[11px] uppercase tracking-wider text-muted">Te la manda</span>{pedidaPor}</div>
            </div>
            <a href={`/api/aprobar/${token}/pdf`} target="_blank" rel="noopener noreferrer"
              className="mt-4 w-full min-h-[50px] rounded-2xl bg-teal text-inkOnAccent font-semibold text-[15px] flex items-center justify-center gap-2">
              <FileText size={18} strokeWidth={2.4} /> Ver la cotización (PDF)
            </a>
            <p className="text-[12px] text-muted mt-2 text-center">Es el mismo formato que recibe el cliente.</p>
          </div>
          <FormAprobar token={token} aprobador={v.aprobador} />
        </>
      )}
    </div>
  );
}
