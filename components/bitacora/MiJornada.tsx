'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabaseClient';
import { hoyLocal, sumarDias } from '@/lib/fechaHoy';
import { fechaLargaCalendario } from '@/lib/calendarioMes';
import { ActividadJornada, DatosJornadas, cargarDatosJornadas, jornadaDeTecnico } from '@/lib/jornadaDatos';
import { showToast } from '@/components/Toast';
import { listarPersonal } from '@/lib/catalogos';
import { eliminarMiActividad } from '@/lib/actividades';
import JornadaDia from './JornadaDia';
import RegistroManual from './RegistroManual';

// «Mi día» del técnico: su jornada día por día (las últimas 2 semanas) y el
// registro a mano de lo que se le pasó iniciar. Los huecos «sin registrar»
// traen un botón para llenarlos con ese horario ya puesto.
const DIAS_ATRAS = 13;

export default function MiJornada({ onRegistrado, solicitudRegistro = 0 }: {
  onRegistrado?: () => void;
  // Cada vez que cambia, se abre el registro a mano (botón de fuera).
  solicitudRegistro?: number;
}) {
  const [hoy, setHoy] = useState<string | null>(null);
  const [fecha, setFecha] = useState<string | null>(null);
  const [ahora, setAhora] = useState(0);
  const [yoId, setYoId] = useState<string | null>(null);
  const [datos, setDatos] = useState<DatosJornadas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tecnicos, setTecnicos] = useState<{ id: string; full_name: string }[]>([]);
  // Registro a mano abierto: con el tramo del hueco que se tocó, o vacío.
  // Con `editar`, se corrige algo ya registrado a mano.
  const [registro, setRegistro] = useState<{ tramo: { inicio: number; fin: number } | null; editar?: ActividadJornada } | null>(null);

  const cargar = useCallback(async (dia: string) => {
    try {
      setError(null);
      setDatos(await cargarDatosJornadas(sumarDias(dia, -DIAS_ATRAS), dia));
    } catch (e: any) {
      setError('No se pudo cargar tu jornada: ' + (e?.message || 'revisa tu conexión.'));
    }
  }, []);

  useEffect(() => {
    // La fecha y la hora se leen ya montado (el servidor está en UTC).
    const h = hoyLocal();
    setHoy(h);
    setFecha(h);
    setAhora(Date.now());
    const reloj = setInterval(() => setAhora(Date.now()), 60000);
    createClient().auth.getSession().then(({ data }) => setYoId(data.session?.user.id || null));
    // Posibles acompañantes: el personal técnico activo. Por función de la
    // base: un técnico no puede leer los perfiles de los demás.
    listarPersonal()
      .then((lista) => setTecnicos(lista.filter((p) => p.role === 'tecnico')))
      .catch(() => setTecnicos([]));
    cargar(h);
    return () => clearInterval(reloj);
  }, [cargar]);

  useEffect(() => {
    if (solicitudRegistro > 0) setRegistro({ tramo: null });
  }, [solicitudRegistro]);

  if (!hoy || !fecha || !yoId) return <div className="rounded-3xl bg-surface border border-line h-[260px] animate-pulse" aria-busy="true" />;

  const primerDia = sumarDias(hoy, -DIAS_ATRAS);
  const dia = datos ? jornadaDeTecnico(datos, yoId, fecha, ahora) : null;

  return (
    <div className="rounded-3xl bg-surface border border-line p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <p className="min-w-0 flex-1 font-display font-bold text-[19px] tracking-wide leading-tight first-letter:uppercase">
          {fecha === hoy ? 'Hoy · ' : ''}{fechaLargaCalendario(fecha)}
        </p>
        {fecha !== hoy && (
          <button type="button" onClick={() => setFecha(hoy)} className="shrink-0 h-10 px-3.5 rounded-full border border-teal/45 bg-teal/10 text-teal text-[13px] font-semibold active:scale-95 transition-transform">Hoy</button>
        )}
        <button type="button" onClick={() => setFecha(sumarDias(fecha, -1))} disabled={fecha <= primerDia} aria-label="Día anterior" className="shrink-0 w-10 h-10 rounded-full border border-line bg-surface-2 flex items-center justify-center active:scale-90 transition disabled:opacity-35">
          <ChevronLeft size={19} strokeWidth={2.4} />
        </button>
        <button type="button" onClick={() => setFecha(sumarDias(fecha, 1))} disabled={fecha >= hoy} aria-label="Día siguiente" className="shrink-0 w-10 h-10 rounded-full border border-line bg-surface-2 flex items-center justify-center active:scale-90 transition disabled:opacity-35">
          <ChevronRight size={19} strokeWidth={2.4} />
        </button>
      </div>

      {error && <p className="text-[13px] text-red mb-3">{error}</p>}
      {!datos && !error && <div className="h-[200px] rounded-2xl bg-surface-2 animate-pulse" aria-busy="true" />}

      {dia && (
        <>
          <JornadaDia
            dia={dia}
            esHoy={fecha === hoy}
            ahora={ahora}
            hrefServicio={(id) => `/servicios/${id}`}
            hrefActividad={(id) => `/bitacora/${id}`}
            onLlenar={fecha >= sumarDias(hoy, -7) ? (tramo) => setRegistro({ tramo }) : undefined}
            onBorrar={async (actividad) => {
              const aviso = actividad.origen === 'manual'
                ? 'Solo se borra tu registro; a tus acompañantes no les cambia.'
                : 'Se borran también sus avances, notas, fotos y videos.';
              if (!confirm(`¿Borrar «${actividad.titulo}» de tu bitácora?\n\n${aviso} Después la puedes registrar de nuevo a mano. No se puede deshacer.`)) return;
              try {
                await eliminarMiActividad({ id: actividad.id, report_id: actividad.reportId, hora_inicio: new Date(actividad.inicio).toISOString() });
                showToast('Actividad borrada', 'success');
                await cargar(hoy);
                onRegistrado?.();
              } catch (e: any) {
                showToast('No se pudo borrar: ' + (e?.message || 'revisa tu conexión e intenta de nuevo.'), 'error');
              }
            }}
            onEditar={(actividad) => setRegistro({ tramo: { inicio: actividad.inicio, fin: actividad.fin ?? actividad.inicio }, editar: actividad })}
          />
        </>
      )}

      {registro && datos && (
        <RegistroManual
          yoId={yoId}
          fechaInicial={registro.editar ? hoyLocal(new Date(registro.editar.inicio)) : fecha}
          tramo={registro.tramo}
          editar={registro.editar}
          datos={datos}
          tecnicos={tecnicos}
          onCerrar={() => setRegistro(null)}
          onGuardado={async (mensaje) => {
            setRegistro(null);
            showToast(mensaje, 'success');
            await cargar(hoy);
            onRegistrado?.();
          }}
        />
      )}
    </div>
  );
}
