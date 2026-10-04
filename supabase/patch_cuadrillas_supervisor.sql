-- ============================================================
-- Cuadrillas, fase 3: supervisor a cargo de cada cuadrilla
-- ============================================================
-- Aditivo e idempotente. Requiere patch_cuadrillas.sql.
--
-- Cada cuadrilla puede tener un supervisor a cargo. No restringe lo que ve
-- cada quien: sirve para que el tablero, la agenda y el control de reportes
-- ofrezcan el filtro «Mis cuadrillas» al supervisor que tiene alguna.
-- Sin este patch la app funciona igual, solo no aparece esa opción.

alter table public.cuadrillas
  add column if not exists supervisor_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_cuadrillas_supervisor on public.cuadrillas (supervisor_id);

-- Solo puede quedar a cargo alguien con rol de supervisión.
create or replace function public.validar_supervisor_cuadrilla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.supervisor_id is not null and not exists (
    select 1 from public.profiles p where p.id = new.supervisor_id and p.role = 'supervisor'
  ) then
    raise exception 'Quien queda a cargo de la cuadrilla debe tener rol de supervisión';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validar_supervisor_cuadrilla on public.cuadrillas;
create trigger trg_validar_supervisor_cuadrilla
  before insert or update of supervisor_id on public.cuadrillas
  for each row execute function public.validar_supervisor_cuadrilla();

-- Comprobación: debe devolver una fila con la columna.
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'cuadrillas' and column_name = 'supervisor_id';
