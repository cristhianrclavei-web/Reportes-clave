-- ============================================================
-- Checklist compartido entre los días de un proyecto multi-día
-- ============================================================
-- Antes: cada "día" de un proyecto tenía su PROPIA copia del checklist.
-- Ahora: el checklist pertenece al PROYECTO (grupo_id). Todos los días
-- leen y completan la misma lista — lo que quedó pendiente el día 1
-- aparece pendiente el día 2, y lo completado se conserva.
--
-- Ejecutar completo en el SQL Editor de Supabase. Es seguro correrlo
-- más de una vez (idempotente).

-- 1) Nueva columna: a qué proyecto (grupo) pertenece cada tarea.
alter table public.servicio_tareas
  add column if not exists grupo_id uuid;

-- 2) Backfill: cada tarea hereda el grupo de su servicio.
update public.servicio_tareas t
set grupo_id = sp.grupo_id
from public.servicios_programados sp
where sp.id = t.servicio_id
  and t.grupo_id is null;

-- 3) Consolidar proyectos multi-día YA existentes (creados cuando cada
--    día recibía su propia copia del checklist):
--    a) Si una copia de un día posterior está completada y la del primer
--       día no, la completación se pasa a la copia que se conserva.
--    b) Se borran las copias duplicadas (se conserva la del día más bajo).
--    La "misma tarea" se identifica por (grupo_id, orden, descripcion).
with copias as (
  select t.id,
         t.grupo_id,
         t.orden,
         t.descripcion,
         t.completada,
         t.completada_por,
         t.completada_en,
         t.foto_path,
         t.ubicacion,
         t.nota,
         row_number() over (
           partition by t.grupo_id, t.orden, t.descripcion
           order by sp.numero_dia
         ) as rn
  from public.servicio_tareas t
  join public.servicios_programados sp on sp.id = t.servicio_id
  where sp.dias_totales > 1
),
completacion_a_rescatar as (
  select distinct on (grupo_id, orden, descripcion)
         grupo_id, orden, descripcion,
         completada_por, completada_en, foto_path, ubicacion, nota
  from copias
  where rn > 1 and completada
  order by grupo_id, orden, descripcion, completada_en asc
)
update public.servicio_tareas t
set completada = true,
    completada_por = r.completada_por,
    completada_en = r.completada_en,
    foto_path = coalesce(t.foto_path, r.foto_path),
    ubicacion = coalesce(t.ubicacion, r.ubicacion),
    nota = coalesce(t.nota, r.nota)
from copias c
join completacion_a_rescatar r
  on r.grupo_id = c.grupo_id and r.orden = c.orden and r.descripcion = c.descripcion
where t.id = c.id
  and c.rn = 1
  and not t.completada;

delete from public.servicio_tareas t
using (
  select t2.id,
         row_number() over (
           partition by t2.grupo_id, t2.orden, t2.descripcion
           order by sp.numero_dia
         ) as rn
  from public.servicio_tareas t2
  join public.servicios_programados sp on sp.id = t2.servicio_id
  where sp.dias_totales > 1
) d
where d.id = t.id
  and d.rn > 1;

-- 4) Ya con todo respaldado, la columna se vuelve obligatoria e indexada.
alter table public.servicio_tareas
  alter column grupo_id set not null;

create index if not exists idx_servicio_tareas_grupo on public.servicio_tareas(grupo_id);

-- 5) RLS: el técnico puede ver/completar las tareas del proyecto si está
--    asignado a CUALQUIER día del grupo (antes: solo al día exacto de la
--    tarea, lo que rompía el checklist compartido si lo reasignaban).
--    Nota: la subconsulta usa OTRAS tablas (servicio_tecnicos +
--    servicios_programados), nunca servicio_tareas contra sí misma,
--    para no caer en la recursión infinita de RLS ya conocida.
drop policy if exists servicio_tareas_tecnico_all on public.servicio_tareas;
create policy servicio_tareas_tecnico_all on public.servicio_tareas for all
  using (exists (
    select 1
    from public.servicio_tecnicos st
    join public.servicios_programados sp on sp.id = st.servicio_id
    where sp.grupo_id = servicio_tareas.grupo_id
      and st.tecnico_id = auth.uid()
  ))
  with check (exists (
    select 1
    from public.servicio_tecnicos st
    join public.servicios_programados sp on sp.id = st.servicio_id
    where sp.grupo_id = servicio_tareas.grupo_id
      and st.tecnico_id = auth.uid()
  ));

-- (La política del supervisor no cambia: sigue teniendo control total.)
