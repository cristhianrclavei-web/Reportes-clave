-- Permite que un supervisor programe un proyecto de varios días (seguidos o
-- salteados). Cada "día" sigue siendo su propia fila en servicios_programados
-- (con su propia llegada/inicio/cierre/checklist/evidencias/reporte
-- vinculado), pero todas las filas de un mismo proyecto comparten un
-- "grupo_id" para poder agruparlas visualmente como "Proyecto X — día 2/5".

alter table public.servicios_programados
  add column if not exists grupo_id uuid,
  add column if not exists numero_dia integer not null default 1,
  add column if not exists dias_totales integer not null default 1;

-- Para los registros que ya existían antes de este cambio, cada uno se
-- vuelve su propio "grupo" de 1 solo día (así no se rompe nada existente).
update public.servicios_programados
set grupo_id = id
where grupo_id is null;

create index if not exists idx_servicios_grupo on public.servicios_programados(grupo_id);
