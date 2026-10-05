import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabaseServer';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import PanelSupervisor from '@/components/PanelSupervisor';
import { ChevronDown, ChevronLeft, BookOpen, Lightbulb } from 'lucide-react';
import { MANUAL_SUPERVISOR, MANUAL_TECNICO, SeccionManual } from '@/lib/manual';
import { MARCA } from '@/lib/marca';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Manual de uso. Muestra lo que corresponde al rol de quien entra; quien
// supervisa puede consultar también el del personal técnico, para poder
// explicarlo. Los temas se abren y cierran sin JavaScript (<details>).
function Secciones({ secciones }: { secciones: SeccionManual[] }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-6 gap-y-7 items-start">
      {secciones.map((sec) => (
        <section key={sec.titulo}>
          <h2 className="font-display font-bold text-[19px] tracking-wide mb-2.5">{sec.titulo}</h2>
          <div className="rounded-2xl bg-surface border border-line divide-y divide-line overflow-hidden">
            {sec.temas.map((t) => (
              <details key={t.titulo} className="group">
                <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-surface-2/60">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold">{t.titulo}</span>
                    <span className="block text-[12.5px] text-muted">{t.resumen}</span>
                  </span>
                  <ChevronDown size={17} className="text-muted shrink-0 transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <div className="px-4 pb-4 pt-1">
                  <ol className="space-y-2">
                    {t.pasos.map((p, i) => (
                      <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed text-ink/90">
                        <span className="w-5 h-5 rounded-full bg-teal/12 text-teal text-[11.5px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ol>
                  {t.nota && (
                    <p className="mt-3 rounded-xl bg-surface-2 border border-line px-3 py-2.5 text-[12.5px] text-ink/85 leading-relaxed flex items-start gap-2">
                      <Lightbulb size={15} className="text-amber shrink-0 mt-0.5" />
                      <span>{t.nota}</span>
                    </p>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default async function AyudaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/ayuda');

  const { data: profile } = await supabase.from('profiles').select('full_name, role').eq('id', user.id).single();
  const esSupervisor = profile?.role === 'supervisor';
  const volverA = esSupervisor ? '/dashboard' : '/mis-reportes';

  const contenido = (
    <div className={`max-w-2xl lg:max-w-none mx-auto pb-24 lg:pb-16 ${esSupervisor ? 'lg:px-8 2xl:px-10' : 'lg:px-6'}`}>
      <div className={`sticky top-0 z-20 glass-strong !bg-bg px-5 py-3.5 flex items-center justify-between gap-3 ${esSupervisor ? 'lg:hidden' : ''}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <Link href={volverA} aria-label="Volver" className="shrink-0 w-11 h-11 -ml-1.5 rounded-full flex items-center justify-center active:scale-90 transition-transform">
            <ChevronLeft size={24} strokeWidth={2.4} />
          </Link>
          <Logo variante="completo" size={32} className="min-w-0" compactoEnMovil />
        </div>
        <ThemeToggle />
      </div>

      <div className={`px-4 pt-5 ${esSupervisor ? 'lg:px-0 lg:pt-8' : ''}`}>
        <div className="flex items-center gap-3 mb-1.5">
          <span className="w-10 h-10 rounded-xl bg-teal/12 text-teal flex items-center justify-center shrink-0">
            <BookOpen size={21} strokeWidth={2.1} />
          </span>
          <h1 className={`font-display font-bold text-2xl tracking-wide ${esSupervisor ? 'lg:text-[34px] lg:leading-tight' : 'lg:text-3xl'}`}>Manual de uso</h1>
        </div>
        <p className="text-[15px] text-muted font-medium mb-6 max-w-2xl">
          {esSupervisor
            ? `Cómo se usa ${MARCA.appNombre} para coordinar la operación. Toca un tema para ver los pasos.`
            : `Cómo se usa ${MARCA.appNombre} en campo. Toca un tema para ver los pasos.`}
        </p>

        <Secciones secciones={esSupervisor ? MANUAL_SUPERVISOR : MANUAL_TECNICO} />

        {esSupervisor && (
          <div className="mt-10 pt-7 border-t border-line">
            <h2 className="font-display font-bold text-[22px] tracking-wide mb-1">Lo que ve el personal técnico</h2>
            <p className="text-[14px] text-muted mb-5 max-w-2xl">
              El mismo manual que tiene tu equipo en su app, por si necesitas explicarle algo.
            </p>
            <Secciones secciones={MANUAL_TECNICO} />
          </div>
        )}

        <p className="text-[12.5px] text-muted mt-9">
          ¿Algo no funciona como dice aquí? {esSupervisor ? 'Avisa a quien administra la app en tu empresa.' : 'Avísale a tu supervisor.'}
        </p>
      </div>
    </div>
  );

  return esSupervisor ? <PanelSupervisor userName={profile?.full_name || user.email || ''}>{contenido}</PanelSupervisor> : contenido;
}
