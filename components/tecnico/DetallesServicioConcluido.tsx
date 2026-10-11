'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, ChevronRight } from 'lucide-react';
import { Servicio, Tarea, FotoDelDia, listarTareasDeGrupo, listarFotosDelDia } from '@/lib/serviciosProgramados';
import { ResultadoServicio } from '@/lib/resultadoServicio';
import { formatMinutos } from '@/lib/kpis';
import { MarcaVideo } from '@/components/VisorVideo';

type TareaResumen = Pick<Tarea, 'id' | 'descripcion' | 'completada'>;

function horaCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', hour12: false, minute: '2-digit' });
}

// Lo que se despliega con «Ver detalles» en un servicio concluido: horario,
// tiempos, lista de tareas y fotos. Se monta solo al abrirlo, así las tareas
// y fotos se piden hasta que el técnico las quiere ver.
export default function DetallesServicioConcluido({ servicio, resultado }: { servicio: Servicio; resultado: ResultadoServicio }) {
  const [tareas, setTareas] = useState<TareaResumen[] | null>(null);
  const [fotos, setFotos] = useState<FotoDelDia[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vigente = true;
    Promise.all([listarTareasDeGrupo(servicio.grupo_id), listarFotosDelDia(servicio)])
      .then(([listaTareas, listaFotos]) => {
        if (!vigente) return;
        setTareas(listaTareas);
        setFotos(listaFotos);
      })
      .catch(() => { if (vigente) setError(true); });
    return () => { vigente = false; };
  }, [servicio]);

  const cargando = tareas === null && !error;
  const sinNada = tareas !== null && tareas.length === 0 && fotos.length === 0;

  return (
    <div className="mt-3 pt-3 border-t border-line text-[13px]">
      <p className="text-muted">
        {servicio.hora_llegada && servicio.hora_fin && <>{horaCorta(servicio.hora_llegada)} a {horaCorta(servicio.hora_fin)} · </>}
        Estimado <b className="text-ink">{formatMinutos(servicio.duracion_estimada_min)}</b>
        {resultado.trabajadoMin !== null && <> · Real <b className="text-ink">{formatMinutos(resultado.trabajadoMin)}</b></>}
      </p>

      {cargando && <p className="text-muted mt-2.5">Cargando…</p>}
      {error && <p className="text-amber mt-2.5">No se pudieron cargar las tareas ni las fotos. Revisa tu conexión y vuelve a abrir los detalles.</p>}
      {sinNada && <p className="text-muted mt-2.5">Sin tareas registradas ni evidencias.</p>}

      {tareas !== null && tareas.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {tareas.map((t) => (
            <li key={t.id} className="flex items-start gap-2">
              {t.completada
                ? <CheckCircle2 size={15} strokeWidth={2.5} className="text-teal shrink-0 mt-0.5" aria-label="Terminada" />
                : <Circle size={15} strokeWidth={2.5} className="text-faint shrink-0 mt-0.5" aria-label="Sin terminar" />}
              <span className={t.completada ? 'text-ink/85' : 'text-muted'}>{t.descripcion}</span>
            </li>
          ))}
        </ul>
      )}

      {fotos.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {fotos.map((f, i) => (
            // Un video se ve en la pantalla del servicio, que ya trae el reproductor.
            <a key={`${f.path}-${i}`} href={f.video ? `/servicios/${servicio.id}` : f.previewUrl} target={f.video ? undefined : '_blank'} rel="noreferrer" className="relative shrink-0">
              <img src={f.previewUrl} alt={f.caption} className="w-16 h-16 object-cover rounded-lg border border-line" />
              {f.video && <MarcaVideo dur={f.dur} chico />}
            </a>
          ))}
        </div>
      )}

      <Link href={`/servicios/${servicio.id}`} className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-teal">
        Abrir el servicio <ChevronRight size={15} strokeWidth={2.6} />
      </Link>
    </div>
  );
}
