-- ============================================================
-- Solicitud de herramienta o material por parte del técnico
-- ============================================================
-- Antes el técnico agregaba directo a la lista lo que hiciera falta. Eso
-- alteraba el resguardo que el supervisor programó sin que nadie lo
-- aprobara. Ahora lo SOLICITA: la pieza no aparece en el checklist hasta que
-- un supervisor la autoriza, igual que las correcciones de reportes.
--
-- Ejecutar en el SQL Editor de Supabase, después de
-- patch_insumos_checklist.sql. Idempotente.

alter table public.servicio_insumos
  add column if not exists estado_solicitud text not null default 'aprobado',
  add column if not exists motivo_solicitud text,
  add column if not exists resuelto_por uuid,
  add column if not exists resuelto_en timestamptz;

alter table public.servicio_insumos drop constraint if exists servicio_insumos_estado_solicitud_check;
alter table public.servicio_insumos
  add constraint servicio_insumos_estado_solicitud_check
  check (estado_solicitud in ('aprobado', 'solicitado', 'rechazado'));

-- Lo que ya existía se considera aprobado (lo capturó el supervisor).
update public.servicio_insumos set estado_solicitud = 'aprobado' where estado_solicitud is null;

create index if not exists idx_insumos_estado_solicitud on public.servicio_insumos(estado_solicitud);

-- Un técnico no puede aprobarse su propia solicitud. Se resuelve con trigger
-- y no con política, porque comparar contra el valor anterior exigiría una
-- subconsulta a la misma tabla dentro de su regla, que es lo que dispara la
-- recursión infinita de RLS.
create or replace function public.proteger_solicitud_insumo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_my_role() is distinct from 'supervisor' then
    if new.estado_solicitud is distinct from old.estado_solicitud then
      raise exception 'Solo un supervisor puede aprobar o rechazar una solicitud de herramienta';
    end if;
    new.resuelto_por := old.resuelto_por;
    new.resuelto_en := old.resuelto_en;
  end if;
  return new;
end;
$$;

drop trigger if exists insumos_proteger_solicitud on public.servicio_insumos;
create trigger insumos_proteger_solicitud
  before update on public.servicio_insumos
  for each row execute function public.proteger_solicitud_insumo();

-- Al insertar, el técnico solo puede crear solicitudes, nunca renglones ya
-- aprobados.
create or replace function public.forzar_solicitud_insumo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_my_role() is distinct from 'supervisor' then
    new.estado_solicitud := 'solicitado';
    new.es_del_tecnico := true;
    new.resuelto_por := null;
    new.resuelto_en := null;
  end if;
  return new;
end;
$$;

drop trigger if exists insumos_forzar_solicitud on public.servicio_insumos;
create trigger insumos_forzar_solicitud
  before insert on public.servicio_insumos
  for each row execute function public.forzar_solicitud_insumo();
