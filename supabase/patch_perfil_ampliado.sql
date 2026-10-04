-- ============================================================
-- Perfil ampliado: figura del avatar, datos médicos de emergencia y tallas
-- ============================================================
-- Requiere patch_perfil_personalizado.sql.
--
--   avatar_estilo   figura del avatar genérico (0 clásico, 1 cabello largo,
--                   2 cabello recogido, 3 barba). Es pública, como el color.
--   tipo_sangre,    datos para una emergencia en campo. Como el contacto de
--   alergias        emergencia, NO salen en perfiles_publicos(): solo los ve
--                   la propia persona y los supervisores. Son datos
--                   personales sensibles: opcionales y con aviso en pantalla.
--   talla_camisa,   para pedir uniforme y equipo de protección.
--   talla_calzado
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

alter table public.profiles
  add column if not exists avatar_estilo smallint,
  add column if not exists tipo_sangre text,
  add column if not exists alergias text,
  add column if not exists talla_camisa text,
  add column if not exists talla_calzado text;

alter table public.profiles drop constraint if exists profiles_avatar_estilo_check;
alter table public.profiles add constraint profiles_avatar_estilo_check
  check (avatar_estilo is null or avatar_estilo between 0 and 3);
alter table public.profiles drop constraint if exists profiles_tipo_sangre_check;
alter table public.profiles add constraint profiles_tipo_sangre_check
  check (tipo_sangre is null or tipo_sangre in ('O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'));
alter table public.profiles drop constraint if exists profiles_alergias_check;
alter table public.profiles add constraint profiles_alergias_check
  check (alergias is null or length(alergias) <= 200);
alter table public.profiles drop constraint if exists profiles_tallas_check;
alter table public.profiles add constraint profiles_tallas_check
  check ((talla_camisa is null or length(talla_camisa) <= 10) and (talla_calzado is null or length(talla_calzado) <= 10));

-- Cada quien edita lo suyo (igual que antes, con los campos nuevos).
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
    avatar_estilo = case when p ? 'avatar_estilo' then nullif(p->>'avatar_estilo', '')::smallint else avatar_estilo end,
    apodo = case when p ? 'apodo' then nullif(trim(coalesce(p->>'apodo', '')), '') else apodo end,
    puesto = case when p ? 'puesto' then nullif(trim(coalesce(p->>'puesto', '')), '') else puesto end,
    especialidades = case when p ? 'especialidades'
      then coalesce((select array_agg(distinct trim(x)) from jsonb_array_elements_text(p->'especialidades') x where length(trim(x)) between 1 and 40), '{}')
      else especialidades end,
    emergencia_nombre = case when p ? 'emergencia_nombre' then nullif(trim(coalesce(p->>'emergencia_nombre', '')), '') else emergencia_nombre end,
    emergencia_telefono = case when p ? 'emergencia_telefono' then nullif(trim(coalesce(p->>'emergencia_telefono', '')), '') else emergencia_telefono end,
    tipo_sangre = case when p ? 'tipo_sangre' then nullif(trim(coalesce(p->>'tipo_sangre', '')), '') else tipo_sangre end,
    alergias = case when p ? 'alergias' then nullif(left(trim(coalesce(p->>'alergias', '')), 200), '') else alergias end,
    talla_camisa = case when p ? 'talla_camisa' then nullif(left(trim(coalesce(p->>'talla_camisa', '')), 10), '') else talla_camisa end,
    talla_calzado = case when p ? 'talla_calzado' then nullif(left(trim(coalesce(p->>'talla_calzado', '')), 10), '') else talla_calzado end
  where id = auth.uid();
end;
$$;

-- Lo público: se agrega la figura del avatar. (Cambia el tipo de retorno,
-- por eso se borra y se vuelve a crear.)
drop function if exists public.perfiles_publicos();
create function public.perfiles_publicos()
returns table (id uuid, full_name text, apodo text, foto_path text, avatar_color smallint, puesto text, especialidades text[], role text, avatar_estilo smallint)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.apodo, p.foto_path, p.avatar_color, p.puesto, p.especialidades, p.role, p.avatar_estilo
  from public.profiles p
  where public.mi_cuenta_activa() and coalesce(p.activo, true);
$$;

revoke all on function public.actualizar_mi_perfil(jsonb) from public, anon;
grant execute on function public.actualizar_mi_perfil(jsonb) to authenticated;
revoke all on function public.perfiles_publicos() from public, anon;
grant execute on function public.perfiles_publicos() to authenticated;

-- Verificación: deben salir 5 columnas nuevas.
select count(*) as columnas_nuevas
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('avatar_estilo', 'tipo_sangre', 'alergias', 'talla_camisa', 'talla_calzado');
