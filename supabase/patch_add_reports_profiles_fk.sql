-- Ejecuta esto en Supabase > SQL Editor
-- Agrega la relación entre reports.created_by y profiles.id
-- para que la consulta con profiles(full_name) funcione.

alter table public.reports
  add constraint reports_created_by_profiles_fkey
  foreign key (created_by) references public.profiles(id);
