import { Servicio } from './serviciosProgramados';

// Ventana de fecha en la que un servicio se puede operar. Evita el error más
// común en campo: marcar llegada, iniciar o vincular un reporte al servicio
// equivocado — casi siempre uno de otra fecha con nombre de cliente parecido.
//
// Reglas:
//   - Nunca antes de la fecha programada. Un servicio del 10 no se toca el 9.
//   - Solo el día exacto para el que está programado, incluidos los días de un
//     proyecto multi-día: ahora cada día tiene su propia fecha.
//   - Si la fecha ya pasó, el día queda bloqueado y el supervisor tiene que
//     reprogramarlo. Eso deja rastro en Eventos, que es justo lo que se busca:
//     que un día no se ejecute "cuando se pueda" sin que nadie se entere.
//
// Esto no bloquea cerrar un servicio ni completar tareas: si ya inició, el
// técnico siempre puede terminarlo, aunque se le haya hecho de madrugada.

export type VentanaServicio = {
  permitido: boolean;
  motivo: string | null;
  fechaTexto: string;
};

// 'YYYY-MM-DD' → Date local. new Date('2026-09-10') se interpreta como UTC y
// en México se corre un día; por eso se arma a mano.
function fechaLocal(fecha: string): Date {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatoLargo(fecha: string): string {
  return fechaLocal(fecha).toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

// Un día ya concluido al que le falta su reporte es un caso aparte: el trabajo
// se hizo, lo que falta es el papeleo. Bloquearlo porque «la fecha ya pasó»
// dejaba al técnico sin forma de documentar lo que acababa de terminar — el
// reporte casi nunca se captura el mismo día, se captura al volver.
export function evaluarVentanaServicio(
  servicio: Pick<Servicio, 'fecha'> & Partial<Pick<Servicio, 'estado' | 'report_id'>>,
  ahora: Date = new Date()
): VentanaServicio {
  const fechaTexto = formatoLargo(servicio.fecha);

  if (servicio.estado === 'concluido' && !servicio.report_id) {
    return { permitido: true, motivo: null, fechaTexto };
  }
  const programada = fechaLocal(servicio.fecha);
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());

  const diffDias = Math.round((hoy.getTime() - programada.getTime()) / 86400000);

  if (diffDias < 0) {
    const falta = Math.abs(diffDias);
    return {
      permitido: false,
      fechaTexto,
      motivo: `Este servicio está programado para el ${fechaTexto}. ${falta === 1 ? 'Falta 1 día' : `Faltan ${falta} días`} y todavía no se puede iniciar ni vincular a un reporte. Si la fecha cambió, repórtalo con un supervisor para que la ajuste.`,
    };
  }

  if (diffDias > 0) {
    return {
      permitido: false,
      fechaTexto,
      motivo: `Este servicio estaba programado para el ${fechaTexto} y esa fecha ya pasó. No se puede iniciar ni vincular a un reporte fuera de su fecha. Pide a un supervisor que lo reprograme.`,
    };
  }

  return { permitido: true, motivo: null, fechaTexto };
}

// Antes de que empiece la jornada (por defecto 08:00, se ajusta en
// ajustes_operacion.jornada_inicio) no se marca llegada ni se inicia: así el
// tiempo de un servicio no arranca de madrugada por un toque adelantado o
// porque el técnico pasó cerca del sitio camino a casa. Devuelve el aviso
// para el técnico, o null si ya se puede.
export function motivoAntesDeLaJornada(jornadaInicio: string, ahora: Date = new Date()): string | null {
  const [horas, minutos] = jornadaInicio.split(':').map(Number);
  const minutoActual = ahora.getHours() * 60 + ahora.getMinutes();
  const minutoInicio = (horas || 0) * 60 + (minutos || 0);
  if (minutoActual >= minutoInicio) return null;
  const hora = jornadaInicio.slice(0, 5);
  return `La jornada empieza a las ${hora}. Podrás marcar tu llegada e iniciar el servicio a partir de esa hora.`;
}
