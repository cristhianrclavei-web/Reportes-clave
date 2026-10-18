-- ============================================================
-- Un reporte solo se vincula con un servicio del mismo día
-- ============================================================
-- El reporte del 15 de octubre no puede quedar como comprobante del
-- servicio del 14. La app ya no lo ofrece ni lo deja guardar; este
-- disparador lo respalda para cualquier camino (otra pestaña con datos
-- viejos, la sincronización sin señal, la corrección de un reporte).
--
-- Solo revisa cambios nuevos: los vínculos que ya existan no se tocan.
-- Ejecutar en el SQL Editor de Supabase. Se puede correr varias veces.

create or replace function public.validar_fecha_vinculo_reporte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fecha_reporte date;
begin
  if new.report_id is null then
    return new;
  end if;
  -- Sin cambio en el vínculo ni en la fecha del servicio: nada que revisar.
  if tg_op = 'UPDATE'
     and new.report_id is not distinct from old.report_id
     and new.fecha is not distinct from old.fecha then
    return new;
  end if;

  select r.fecha into v_fecha_reporte from public.reports r where r.id = new.report_id;
  if v_fecha_reporte is not null and v_fecha_reporte <> new.fecha then
    raise exception 'La fecha del reporte (%) no coincide con la del servicio (%). Solo se puede vincular un reporte con un servicio del mismo día.',
      to_char(v_fecha_reporte, 'DD/MM/YYYY'), to_char(new.fecha, 'DD/MM/YYYY');
  end if;
  return new;
end;
$$;

drop trigger if exists validar_fecha_vinculo_reporte on public.servicios_programados;
create trigger validar_fecha_vinculo_reporte
  before insert or update of report_id, fecha on public.servicios_programados
  for each row execute function public.validar_fecha_vinculo_reporte();
