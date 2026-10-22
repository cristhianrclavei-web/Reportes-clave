-- ============================================================
-- Tope diario de búsquedas de Google (Places)
-- ============================================================
-- La búsqueda de direcciones (/api/lugares) usa Google Places, que cobra
-- por consulta al pasar de la cuota gratis. Este parche cuenta las consultas
-- de cada día (hora de México) y, al llegar al tope, la app busca con
-- OpenStreetMap hasta el día siguiente. Así el costo nunca se dispara.
--
-- Ejecutar completo en el SQL Editor de Supabase. Aditivo e idempotente.

create table if not exists public.google_lugares_uso (
  fecha date primary key,
  consultas integer not null default 0
);

-- Nadie la lee ni la escribe directo: solo la función de abajo.
alter table public.google_lugares_uso enable row level security;

-- Suma una consulta al día de hoy si no se ha llegado al tope. Devuelve
-- true si se puede consultar a Google, false si ya se llegó al tope.
create or replace function public.usar_consulta_google(p_tope integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_consultas integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  insert into public.google_lugares_uso (fecha, consultas)
  values (v_hoy, 1)
  on conflict (fecha) do update
    set consultas = public.google_lugares_uso.consultas + 1
    where public.google_lugares_uso.consultas < p_tope
  returning consultas into v_consultas;

  -- Sin fila devuelta = el update no se hizo porque ya estaba en el tope.
  return v_consultas is not null;
end;
$$;

revoke all on function public.usar_consulta_google(integer) from public, anon;
grant execute on function public.usar_consulta_google(integer) to authenticated;

-- Verificación: debe decir 1 y 1.
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'google_lugares_uso') as tabla,
  (select count(*) from pg_proc where proname = 'usar_consulta_google') as funcion;
