-- Ejecuta esto en Supabase > SQL Editor
-- Corrige las políticas de seguridad para que el supervisor sí vea
-- todos los reportes (usa la función get_my_role() en vez de una
-- subconsulta anidada sobre la propia tabla protegida por RLS).

-- Requiere que ya hayas ejecutado antes: patch_get_my_role.sql
-- (la función public.get_my_role() debe existir)

drop policy if exists "reports_select_supervisor" on public.reports;
create policy "reports_select_supervisor"
  on public.reports for select
  using (public.get_my_role() = 'supervisor');

drop policy if exists "profiles_select_own_or_supervisor" on public.profiles;
create policy "profiles_select_own_or_supervisor"
  on public.profiles for select
  using (id = auth.uid() or public.get_my_role() = 'supervisor');
