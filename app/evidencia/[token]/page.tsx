import { SearchX, CalendarClock, Hash } from 'lucide-react';
import Logo from '@/components/Logo';
import { MARCA } from '@/lib/marca';
import { fechaDMA } from '@/lib/etiquetaMantenimiento';
import { createAdminClient, hayClienteAdmin } from '@/lib/supabaseAdmin';
import { leerTokenVideo, coincideVideo } from '@/lib/videoPublico';
import { evidenciasDe } from '@/lib/evidencias';

// Página pública a la que lleva el QR de un video en el PDF del reporte. No
// pide sesión: el enlace va firmado por el servidor (lib/videoPublico) y solo
// abre ese video, mientras siga en el reporte y no esté marcado como interno.

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `Video de evidencia · ${MARCA.nombre}`,
  robots: { index: false, follow: false },
};

type Video = { cliente: string; fecha: string; folio: string; comentario: string; url: string; portada: string | null };

async function consultar(token: string): Promise<Video | null> {
  const t = leerTokenVideo(token);
  if (!t || !hayClienteAdmin()) return null;
  const admin = createAdminClient();
  const { data: r } = await admin.from('reports').select('id, empresa_cliente, fecha, data').eq('id', t.reportId).maybeSingle();
  if (!r) return null;
  const foto = evidenciasDe(r.data?.fotos).find((f) => f.video && !f.interna && coincideVideo(f.video, t.huella));
  if (!foto?.video) return null;
  const { data: firmadas } = await admin.storage.from('evidencias').createSignedUrls([foto.video, foto.path], 3600);
  const url = firmadas?.[0]?.signedUrl;
  if (!url) return null;
  return {
    cliente: r.empresa_cliente || '',
    fecha: r.fecha,
    folio: String(r.id).slice(0, 8).toUpperCase(),
    comentario: foto.caption,
    url,
    portada: firmadas?.[1]?.signedUrl || null,
  };
}

export default async function EvidenciaPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const v = await consultar(token);

  return (
    <div className="min-h-screen max-w-xl mx-auto px-4 pt-6 pb-16">
      <div className="flex items-center justify-between mb-6">
        <Logo variante="completo" size={30} />
        <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">Evidencia</span>
      </div>

      {!v ? (
        <div className="rounded-3xl bg-surface border border-line p-6 text-center">
          <span className="mx-auto w-14 h-14 rounded-2xl bg-amber/15 text-amber flex items-center justify-center mb-3">
            <SearchX size={26} strokeWidth={2.2} />
          </span>
          <h1 className="font-display font-bold text-[22px] mb-1.5">Este video ya no está disponible</h1>
          <p className="text-[14px] text-ink/75 leading-relaxed">
            El enlace no es válido o el video se retiró del reporte. Para consultarlo, comunícate con {MARCA.nombre} al {MARCA.telefonos}.
          </p>
        </div>
      ) : (
        <div className="rounded-3xl bg-surface border border-line overflow-hidden">
          <video src={v.url} poster={v.portada || undefined} controls playsInline preload="metadata" className="w-full max-h-[70vh] bg-black" />
          <div className="p-5">
            <p className="text-[12px] uppercase tracking-wider text-teal font-semibold">Video de evidencia</p>
            <h1 className="font-display font-bold text-[24px] leading-tight">{v.cliente}</h1>
            {v.comentario && <p className="text-[14px] text-ink/80 mt-2 leading-relaxed">{v.comentario}</p>}
            <div className="grid grid-cols-2 gap-3 mt-4 text-[13.5px]">
              <div className="min-w-0">
                <p className="text-[10.5px] uppercase tracking-wider text-muted font-semibold flex items-center gap-1">
                  <CalendarClock size={12} strokeWidth={2.4} /> Fecha del servicio
                </p>
                <p className="font-semibold truncate">{fechaDMA(v.fecha)}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[10.5px] uppercase tracking-wider text-muted font-semibold flex items-center gap-1">
                  <Hash size={12} strokeWidth={2.4} /> Folio del reporte
                </p>
                <p className="font-semibold truncate">{v.folio}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
