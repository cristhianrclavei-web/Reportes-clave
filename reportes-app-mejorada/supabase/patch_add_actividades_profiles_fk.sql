-- Permite que las consultas puedan traer "actividad + nombre del técnico"
-- en un solo paso. Sin esto, la relación con profiles no se detecta
-- automáticamente y la consulta del dashboard de supervisor falla en
-- silencio (por eso no aparecían las actividades).

alter table public.actividades
  add constraint actividades_created_by_profiles_fkey
  foreign key (created_by) references public.profiles(id);
