import { createClient } from '@supabase/supabase-js';
import { ShieldCheck, AlertTriangle, SearchX, CalendarClock, User, Hash, ClipboardCheck } from 'lucide-react';
import Logo from '@/components/Logo';
import { MARCA } from '@/lib/marca';
import { ETIQUETA_FRECUENCIA, Frecuencia } from '@/lib/formatosMantenimiento';
import { fechaDMA, proximoServicio } from '@/lib/etiquetaMantenimiento';

// Página pública a la que lleva el QR de la etiqueta de mantenimiento. No
// pide sesión: consulta solo la función verificar_mantenimiento(), que
// devuelve lo mínimo para comprobar el servicio.

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `Verificación de mantenimiento · ${MARCA.nombre}`,
  robots: { index: false, follow: false },
};

type FormatoVerificado = {
  titulo: string;
  visita: Frecuencia;
  normas: string[];
  frecuencias: string[];
  total: number;
  cumple: number;
  noCumple: number;
  na: number;
};

type Verificacion = {
  folio: string;
  fecha: string;
  cliente: string;
  tecnico: string | null;
  revisado: boolean;
  revisadoFecha: string | null;
  formatos: FormatoVerificado[];
};

async function consultar(token: string): Promise<Verificacion | null> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.rpc('verificar_mantenimiento', { p_token: token });
  if (error || !data) return null;
  return data as Verificacion;
}

export default async function VerificarPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const v = await consultar(token);

  return (
    <div className="min-h-screen max-w-xl mx-auto px-4 pt-6 pb-16">
      <div className="flex items-center justify-between mb-6">
        <Logo variante="completo" size={30} />
        <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">Verificación</span>
      </div>

      {!v || v.formatos.length === 0 ? (
        <div className="rounded-3xl bg-surface border border-line p-6 text-center">
          <span className="mx-auto w-14 h-14 rounded-2xl bg-amber/15 text-amber flex items-center justify-center mb-3">
            <SearchX size={26} strokeWidth={2.2} />
          </span>
          <h1 className="font-display font-bold text-[22px] mb-1.5">No encontramos este registro</h1>
          <p className="text-[14px] text-ink/75 leading-relaxed">
            El código no corresponde a un mantenimiento registrado, o el reporte todavía no se ha subido. Para confirmar, comunícate con {MARCA.nombre} al {MARCA.telefonos}.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-3xl bg-surface border border-line p-5 mb-4">
            <div className="flex items-start gap-3">
              <span className="w-12 h-12 rounded-2xl bg-teal/15 text-teal flex items-center justify-center shrink-0">
                <ShieldCheck size={26} strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <p className="text-[12px] uppercase tracking-wider text-teal font-semibold">Mantenimiento registrado</p>
                <h1 className="font-display font-bold text-[24px] leading-tight">{v.cliente}</h1>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4 text-[13.5px]">
              <Dato Icono={CalendarClock} label="Fecha del servicio" valor={fechaDMA(v.fecha)} />
              <Dato Icono={Hash} label="Folio" valor={v.folio} />
              <Dato Icono={User} label="Técnico responsable" valor={v.tecnico || '—'} />
              <Dato
                Icono={ClipboardCheck}
                label="Revisión de supervisor"
                valor={v.revisado ? `Aprobado${v.revisadoFecha ? ` · ${v.revisadoFecha}` : ''}` : 'Pendiente'}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {v.formatos.map((f, i) => {
              const proximo = proximoServicio(v.fecha, f.frecuencias);
              const ok = f.noCumple === 0;
              return (
                <div key={i} className="rounded-2xl bg-surface border border-line p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[15px] leading-tight">{f.titulo}</p>
                      <p className="text-[12.5px] text-muted mt-0.5">
                        Visita {ETIQUETA_FRECUENCIA[f.visita]?.toLowerCase() || f.visita} · Ref. {f.normas.join(', ')}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-[12px] font-bold px-2.5 py-1 rounded-full ${
                        ok ? 'bg-teal/15 text-teal' : 'bg-amber/15 text-amber'
                      }`}
                    >
                      {ok ? 'Cumple' : 'Con observaciones'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[13px] text-ink/80">
                    <span>{f.total} puntos revisados</span>
                    <span>{f.cumple} cumplen</span>
                    {f.noCumple > 0 && (
                      <span className="text-amber font-semibold flex items-center gap-1">
                        <AlertTriangle size={13} strokeWidth={2.5} /> {f.noCumple} con observación
                      </span>
                    )}
                    {f.na > 0 && <span>{f.na} no aplican</span>}
                  </div>
                  {proximo && (
                    <p className="text-[13px] mt-2">
                      <span className="text-muted">Próximo servicio: </span>
                      <b>{fechaDMA(proximo)}</b>
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-[12px] text-muted mt-5 leading-relaxed">
            Registro de la inspección y pruebas realizadas por {MARCA.nombre} en la fecha indicada, con base en las normas de referencia de
            cada formato. No constituye un dictamen ni una certificación de cumplimiento normativo. Para solicitar el reporte completo:{' '}
            {MARCA.telefonos} · {MARCA.correoSoporte}.
          </p>
        </>
      )}
    </div>
  );
}

function Dato({ Icono, label, valor }: { Icono: typeof User; label: string; valor: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] uppercase tracking-wider text-muted font-semibold flex items-center gap-1">
        <Icono size={12} strokeWidth={2.4} /> {label}
      </p>
      <p className="font-semibold truncate">{valor}</p>
    </div>
  );
}
