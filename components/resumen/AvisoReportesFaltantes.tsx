'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, FileX } from 'lucide-react';
import AvisoPlegable from '@/components/AvisoPlegable';
import { createClient } from '@/lib/supabaseClient';
import { horaActualMexico } from '@/lib/horaMexico';
import { fechaCorta, inicioVentana } from '@/lib/coberturaReportes';
import { reportesFaltantes, type FaltantesDeTecnico } from '@/lib/visitasExigibles';
import { cargarVisitas, faltaElParche } from '@/lib/visitasExigiblesDatos';

// Aviso del Resumen: quién debe reportes (días sin reporte y visitas que
// detectó el rastreo sin reporte) y qué justificaciones esperan
// autorización, de los últimos 30 días. El detalle y los botones para
// autorizar están en Reportes → Cobertura; aquí solo se ve de un vistazo.
//
// La fecha de hoy se lee en el efecto, nunca en el render (Vercel corre en UTC).
export default function AvisoReportesFaltantes() {
  const [faltantes, setFaltantes] = useState<FaltantesDeTecnico[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const { fecha: hoy, horaMin } = horaActualMexico();
      const desde = inicioVentana(hoy);
      try {
        const { data: dias, error: errorDias } = await createClient().rpc('cobertura_dias', { p_desde: desde, p_hasta: hoy });
        if (errorDias) throw new Error(errorDias.message);
        // Las visitas del rastreo son aparte: si la base no las tiene, el aviso sigue con los días.
        let visitas: Awaited<ReturnType<typeof cargarVisitas>> = [];
        try {
          visitas = await cargarVisitas(desde, hoy);
        } catch (e: any) {
          if (!faltaElParche(e)) throw e;
        }
        if (!cancelado) setFaltantes(reportesFaltantes((dias as any[]) || [], visitas, hoy, horaMin));
      } catch (e: any) {
        if (!cancelado) setError(e?.message || 'Revisa tu conexión y recarga la página.');
      }
    })();
    return () => { cancelado = true; };
  }, []);

  if (error) {
    return (
      <p className="mb-2.5 px-4 py-3 rounded-2xl bg-red/10 border border-red/30 text-[13px] text-ink/85">
        <b className="text-red">No se pudo revisar qué reportes faltan.</b> {error}
      </p>
    );
  }
  if (faltantes.length === 0) return null;

  const totalDias = faltantes.reduce((n, f) => n + f.diasSinReporte.length, 0);
  const totalVisitas = faltantes.reduce((n, f) => n + f.visitasSinReporte.length, 0);
  const totalPorAutorizar = faltantes.reduce((n, f) => n + f.porAutorizar, 0);
  const faltan = totalDias + totalVisitas;

  const partes: string[] = [];
  if (totalDias > 0) partes.push(`${totalDias} ${totalDias === 1 ? 'día' : 'días'} sin reporte`);
  if (totalVisitas > 0) partes.push(`${totalVisitas} ${totalVisitas === 1 ? 'visita' : 'visitas'} sin reporte`);
  if (totalPorAutorizar > 0) partes.push(`${totalPorAutorizar} por autorizar`);

  let titulo = 'Justificaciones por autorizar';
  if (faltan > 0) {
    const personas = faltantes.filter((f) => f.diasSinReporte.length + f.visitasSinReporte.length > 0).length;
    titulo = personas === 1 ? 'Falta reporte de 1 persona' : `Faltan reportes de ${personas} personas`;
  }

  return (
    <AvisoPlegable
      tono={faltan > 0 ? 'red' : 'amber'}
      Icono={FileX}
      cuenta={faltan > 0 ? faltan : totalPorAutorizar}
      titulo={titulo}
      resumen={partes.join(' · ')}
    >
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface-2/40 mb-3">
        {faltantes.slice(0, 8).map((f) => (
          <li key={f.tecnicoId} className="px-3 py-2.5 text-[13px]">
            <p className="font-semibold">{f.tecnico}</p>
            {f.diasSinReporte.length > 0 && (
              <p className="text-ink/80 mt-0.5">
                <span className="text-red font-semibold">{f.diasSinReporte.length === 1 ? 'Día sin reporte' : `${f.diasSinReporte.length} días sin reporte`}:</span>{' '}
                {f.diasSinReporte.map(fechaCorta).join(', ')}
              </p>
            )}
            {f.visitasSinReporte.length > 0 && (
              <p className="text-ink/80 mt-0.5">
                <span className="text-red font-semibold">{f.visitasSinReporte.length === 1 ? 'Visita sin reporte' : `${f.visitasSinReporte.length} visitas sin reporte`}:</span>{' '}
                {f.visitasSinReporte.map((v) => `${v.cliente} (${fechaCorta(v.fecha)})`).join(', ')}
              </p>
            )}
            {f.porAutorizar > 0 && (
              <p className="text-amber font-semibold mt-0.5">
                {f.porAutorizar === 1 ? '1 justificación por autorizar' : `${f.porAutorizar} justificaciones por autorizar`}
              </p>
            )}
          </li>
        ))}
        {faltantes.length > 8 && <li className="px-3 py-2 text-[12.5px] text-muted">y {faltantes.length - 8} personas más…</li>}
      </ul>
      <Link href="/dashboard/reportes?sub=cobertura" className={`inline-flex items-center gap-1 text-[13.5px] font-semibold ${faltan > 0 ? 'text-red' : 'text-amber'}`}>
        Ir a Cobertura para revisarlos <ChevronRight size={15} />
      </Link>
    </AvisoPlegable>
  );
}
