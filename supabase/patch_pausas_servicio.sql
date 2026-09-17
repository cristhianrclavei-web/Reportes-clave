-- ============================================================
-- Pausas del técnico durante un servicio en curso (ej. hora de comida)
-- ============================================================
-- Antes de esto, la geocerca solo servía para detectar llegada/inicio; en
-- cuanto el servicio pasaba a "en_curso" no había ningún control de que el
-- técnico siguiera en sitio, y tampoco una forma honesta de que avisara que
-- salió a comer sin que eso se viera como un retraso.
--
-- En vez de una alarma automática si el GPS lo detecta fuera del radio (poco
-- confiable: sin la app abierta en pantalla no hay rastreo en segundo plano,
-- sobre todo en iPhone), el técnico pausa y reanuda él mismo. El tiempo
-- pausado se descuenta al calcular si el servicio se pasó del tiempo
-- estimado, y queda registrado en la línea de tiempo con hora y motivo.
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

alter table public.servicios_programados
  add column if not exists pausado_desde timestamptz,
  add column if not exists minutos_pausados integer not null default 0;

alter table public.servicio_eventos drop constraint if exists servicio_eventos_tipo_check;
alter table public.servicio_eventos
  add constraint servicio_eventos_tipo_check
  check (tipo in ('llegada', 'inicio', 'retraso', 'evidencia', 'cierre', 'avance', 'pausa', 'reanudacion'));

-- Pausar/reanudar es seguimiento del día como llegada/inicio: ya se ve en
-- vivo en el panel (banner "En pausa desde..."), así que llega apagado de
-- fábrica igual que esos dos. Quien quiera el push lo enciende él mismo.
create or replace function public.tipo_apagado_por_defecto(p_tipo text)
returns boolean
language sql
immutable
as $$
  select p_tipo in ('llegada_servicio', 'inicio_servicio', 'bitacora_inicio', 'bitacora_fin', 'pausa_servicio', 'reanudacion_servicio');
$$;
