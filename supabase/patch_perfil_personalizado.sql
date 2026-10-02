-- ============================================================
-- Perfil personalizado: foto, avatar, apodo, puesto, especialidades
-- y contacto de emergencia
-- ============================================================
-- Cada quien edita lo suyo desde «Mi perfil». La foto (o el avatar
-- genérico con el color de uniforme elegido) aparece en Servicios, en la
-- lista de reportes y en el recuadro «Elaborado por» de cada reporte.
--
-- Las fotos van en el bucket público «avatares» con nombre aleatorio
-- dentro de la carpeta del usuario: cada quien solo puede subir, cambiar o
-- borrar las suyas.
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

alter table public.profiles
  add column if not exists foto_path text,
  add column if not exists avatar_color smallint check (avatar_color is null or avatar_color between 0 and 9),
  add column if not exists apodo text check (apodo is null or length(apodo) <= 24),
  add column if not exists puesto text check (puesto is null or length(puesto) <= 60),
  add column if not exists especialidades text[] not null default '{}',
  add column if not exists emergencia_nombre text check (emergencia_nombre is null or length(emergencia_nombre) <= 80),
  add column if not exists emergencia_telefono text check (emergencia_telefono is null or length(emergencia_telefono) <= 20);

-- ---------- Bucket de fotos ----------
insert into storage.buckets (id, name, public)
values ('avatares', 'avatares', true)
on conflict (id) do update set public = true;

drop policy if exists avatares_subir on storage.objects;
create policy avatares_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text and public.mi_cuenta_activa());
drop policy if exists avatares_cambiar on storage.objects;
create policy avatares_cambiar on storage.objects for update to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatares_borrar on storage.objects;
create policy avatares_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Guardar lo mío ----------
-- Solo toca las columnas de personalización (nunca rol ni permisos).
-- p: {"foto_path","avatar_color","apodo","puesto","especialidades","emergencia_nombre","emergencia_telefono"}
-- Las llaves que no vienen no se cambian.
create or replace function public.actualizar_mi_perfil(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_foto text;
begin
  if auth.uid() is null or not public.mi_cuenta_activa() then raise exception 'Sin sesión'; end if;

  if p ? 'foto_path' then
    v_foto := nullif(trim(coalesce(p->>'foto_path', '')), '');
    if v_foto is not null and split_part(v_foto, '/', 1) <> auth.uid()::text then
      raise exception 'Foto no válida';
    end if;
  end if;

  update public.profiles set
    foto_path = case when p ? 'foto_path' then v_foto else foto_path end,
    avatar_color = case when p ? 'avatar_color' then nullif(p->>'avatar_color', '')::smallint else avatar_color end,
    apodo = case when p ? 'apodo' then nullif(trim(coalesce(p->>'apodo', '')), '') else apodo end,
    puesto = case when p ? 'puesto' then nullif(trim(coalesce(p->>'puesto', '')), '') else puesto end,
    especialidades = case when p ? 'especialidades'
      then coalesce((select array_agg(distinct trim(x)) from jsonb_array_elements_text(p->'especialidades') x where length(trim(x)) between 1 and 40), '{}')
      else especialidades end,
    emergencia_nombre = case when p ? 'emergencia_nombre' then nullif(trim(coalesce(p->>'emergencia_nombre', '')), '') else emergencia_nombre end,
    emergencia_telefono = case when p ? 'emergencia_telefono' then nullif(trim(coalesce(p->>'emergencia_telefono', '')), '') else emergencia_telefono end
  where id = auth.uid();
end;
$$;

-- ---------- Lo que todos pueden ver de cada quien ----------
-- Nombre, apodo, foto/avatar, puesto y especialidades de las cuentas
-- activas. El contacto de emergencia NO va aquí (solo supervisores, por
-- la tabla directamente).
create or replace function public.perfiles_publicos()
returns table (id uuid, full_name text, apodo text, foto_path text, avatar_color smallint, puesto text, especialidades text[], role text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.apodo, p.foto_path, p.avatar_color, p.puesto, p.especialidades, p.role
  from public.profiles p
  where public.mi_cuenta_activa() and coalesce(p.activo, true);
$$;

revoke all on function public.actualizar_mi_perfil(jsonb) from public, anon;
grant execute on function public.actualizar_mi_perfil(jsonb) to authenticated;
revoke all on function public.perfiles_publicos() from public, anon;
grant execute on function public.perfiles_publicos() to authenticated;

-- Verificación: deben salir 3 en true.
select
  exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'foto_path') as columnas,
  exists (select 1 from storage.buckets where id = 'avatares' and public) as bucket,
  exists (select 1 from pg_proc where proname = 'perfiles_publicos') as funciones;
