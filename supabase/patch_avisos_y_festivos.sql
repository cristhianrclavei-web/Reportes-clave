-- ============================================================
-- Avisos del tecnico sobre un dia programado, y dias festivos
-- ============================================================
-- El tecnico ya podia registrar un retraso, pero ese aviso nace cuando ya
-- esta en el sitio: documenta el viaje perdido en lugar de evitarlo. Lo que
-- falta es poder avisar ANTES sobre un dia que todavia no llega — el cliente
-- no va a estar, es festivo, falta material.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

-- 1. Dias festivos -----------------------------------------------
-- Se resuelve al agendar y no al reportar: si el supervisor elige el 16 de
-- septiembre, el aviso sale antes de guardar y el problema nunca ocurre.
--
-- 'oficial' es asueto de ley; 'costumbre' son dias en que muchos clientes
-- cierran aunque no sean obligatorios, asi que el aviso es mas suave.
-- 'empresa' queda libre para los propios: vacaciones, inventario, etc.

create table if not exists public.dias_festivos (
  fecha date primary key,
  nombre text not null,
  tipo text not null default 'oficial' check (tipo in ('oficial', 'costumbre', 'empresa'))
);

alter table public.dias_festivos enable row level security;

drop policy if exists "festivos_select_autenticados" on public.dias_festivos;
create policy "festivos_select_autenticados"
  on public.dias_festivos for select to authenticated using (true);

insert into public.dias_festivos (fecha, nombre, tipo) values
    ('2026-01-01', 'Año Nuevo', 'oficial'),
    ('2026-02-02', 'Día de la Constitución', 'oficial'),
    ('2026-03-16', 'Natalicio de Benito Juárez', 'oficial'),
    ('2026-04-02', 'Jueves Santo', 'costumbre'),
    ('2026-04-03', 'Viernes Santo', 'costumbre'),
    ('2026-05-01', 'Día del Trabajo', 'oficial'),
    ('2026-09-16', 'Independencia', 'oficial'),
    ('2026-11-02', 'Día de Muertos', 'costumbre'),
    ('2026-11-16', 'Revolución Mexicana', 'oficial'),
    ('2026-12-12', 'Virgen de Guadalupe', 'costumbre'),
    ('2026-12-25', 'Navidad', 'oficial'),
    ('2027-01-01', 'Año Nuevo', 'oficial'),
    ('2027-02-01', 'Día de la Constitución', 'oficial'),
    ('2027-03-15', 'Natalicio de Benito Juárez', 'oficial'),
    ('2027-03-25', 'Jueves Santo', 'costumbre'),
    ('2027-03-26', 'Viernes Santo', 'costumbre'),
    ('2027-05-01', 'Día del Trabajo', 'oficial'),
    ('2027-09-16', 'Independencia', 'oficial'),
    ('2027-11-02', 'Día de Muertos', 'costumbre'),
    ('2027-11-15', 'Revolución Mexicana', 'oficial'),
    ('2027-12-12', 'Virgen de Guadalupe', 'costumbre'),
    ('2027-12-25', 'Navidad', 'oficial'),
    ('2028-01-01', 'Año Nuevo', 'oficial'),
    ('2028-02-07', 'Día de la Constitución', 'oficial'),
    ('2028-03-20', 'Natalicio de Benito Juárez', 'oficial'),
    ('2028-04-13', 'Jueves Santo', 'costumbre'),
    ('2028-04-14', 'Viernes Santo', 'costumbre'),
    ('2028-05-01', 'Día del Trabajo', 'oficial'),
    ('2028-09-16', 'Independencia', 'oficial'),
    ('2028-11-02', 'Día de Muertos', 'costumbre'),
    ('2028-11-20', 'Revolución Mexicana', 'oficial'),
    ('2028-12-12', 'Virgen de Guadalupe', 'costumbre'),
    ('2028-12-25', 'Navidad', 'oficial')
on conflict (fecha) do nothing;

-- 2. Avisos sobre un dia programado ------------------------------

create table if not exists public.servicio_avisos (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references public.servicios_programados(id) on delete cascade,
  tecnico_id uuid not null references public.profiles(id),
  causa text not null check (causa in (
    'cliente_no_disponible', 'dia_festivo', 'falta_material',
    'acceso_restringido', 'clima', 'otro'
  )),
  -- Comentario libre ademas de la causa: la lista sirve para contar, el texto
  -- para entender. Obligatorio cuando la causa es 'otro' (ver restriccion).
  comentario text,
  -- Fecha que el tecnico propone. Opcional: avisar del problema ya vale, aunque
  -- no se sepa cuando si se podra.
  fecha_propuesta date,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'atendido', 'descartado')),
  resuelto_por uuid references public.profiles(id),
  resuelto_en timestamptz,
  resolucion_nota text,
  created_at timestamptz not null default now(),
  -- Una casilla en blanco nunca es respuesta: si la causa es 'otro', hay que
  -- decir cual.
  constraint aviso_otro_explicado
    check (causa <> 'otro' or coalesce(btrim(comentario), '') <> '')
);

create index if not exists servicio_avisos_pendientes
  on public.servicio_avisos (estado, created_at desc);
create index if not exists servicio_avisos_por_servicio
  on public.servicio_avisos (servicio_id);

alter table public.servicio_avisos enable row level security;

-- Solo avisa quien esta asignado a ese dia. Un aviso sobre un servicio ajeno
-- no es informacion, es ruido.
drop policy if exists "avisos_insert_asignado" on public.servicio_avisos;
create policy "avisos_insert_asignado"
  on public.servicio_avisos for insert to authenticated
  with check (
    tecnico_id = auth.uid()
    and exists (
      select 1 from public.servicio_tecnicos st
       where st.servicio_id = servicio_avisos.servicio_id
         and st.tecnico_id = auth.uid()
    )
  );

drop policy if exists "avisos_select_propio_o_supervisor" on public.servicio_avisos;
create policy "avisos_select_propio_o_supervisor"
  on public.servicio_avisos for select to authenticated
  using (tecnico_id = auth.uid() or public.get_my_role() = 'supervisor');

-- Resolver es decision del supervisor: el tecnico avisa, no se contesta solo.
drop policy if exists "avisos_update_supervisor" on public.servicio_avisos;
create policy "avisos_update_supervisor"
  on public.servicio_avisos for update to authenticated
  using (public.get_my_role() = 'supervisor')
  with check (public.get_my_role() = 'supervisor');

-- Al resolver hay que decir como quedo, y queda firmado con quien lo hizo.
create or replace function public.sellar_resolucion_aviso()
returns trigger language plpgsql as $BODY$
begin
  if new.estado is distinct from old.estado and new.estado <> 'pendiente' then
    new.resuelto_por := coalesce(new.resuelto_por, auth.uid());
    new.resuelto_en  := coalesce(new.resuelto_en, now());
  end if;
  return new;
end;
$BODY$;

drop trigger if exists trg_sellar_resolucion_aviso on public.servicio_avisos;
create trigger trg_sellar_resolucion_aviso
  before update on public.servicio_avisos
  for each row execute function public.sellar_resolucion_aviso();

-- 3. Verificacion -------------------------------------------------
-- select count(*) as festivos from public.dias_festivos;           -- 33
-- select count(*) as tabla_avisos from information_schema.tables
--  where table_name = 'servicio_avisos';                           -- 1
