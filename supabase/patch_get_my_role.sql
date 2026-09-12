-- Ejecuta esto en Supabase > SQL Editor
-- Corrige la detección de rol (supervisor vs técnico) evitando
-- posibles problemas de políticas RLS anidadas.

create or replace function public.get_my_role()
returns text
language sql
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

grant execute on function public.get_my_role() to authenticated;
