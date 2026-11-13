-- ============================================================
-- Planos: avance de la instalación por dispositivo
-- ============================================================
-- Cada equipo del plano lleva su estado de obra (pendiente → tubería y cable
-- → instalado → direccionado → probado) y, si no se puede instalar, el
-- motivo. Va en una columna aparte de `sembrado`:
--
--   avance = { "<id del equipo>": { "estado", "bloqueo"?: { "motivo", "nota"? },
--                                   "en", "por", "nombre" } }
--
-- ¿Por qué aparte? El sembrado se guarda completo (gana el último); el
-- avance lo marcan varios técnicos a la vez en la obra. La función de abajo
-- solo toca los equipos que recibe, así nadie pisa lo que marcó otro.
-- La etapa de obra sí va en el sembrado (dato de diseño, como el tamaño).
--
-- Requiere patch_lazos_planos.sql. Ejecutar completo. Idempotente.

alter table public.lazo_planos add column if not exists avance jsonb not null default '{}'::jsonb;

alter table public.lazo_planos drop constraint if exists lazo_planos_avance_valido;
alter table public.lazo_planos add constraint lazo_planos_avance_valido
  check (jsonb_typeof(avance) = 'object' and pg_column_size(avance) < 1000000);

-- Marca uno o varios equipos. Quién y con qué nombre lo pone el servidor.
-- Devuelve el avance completo, con lo que hayan marcado los demás.
create or replace function public.marcar_avance_plano(p_plano uuid, p_cambios jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_nombre text;
  v_sello jsonb;
  v_cambios jsonb;
  v_avance jsonb;
begin
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' then
    raise exception 'Cambios no válidos';
  end if;
  if (select count(*) from jsonb_object_keys(p_cambios)) > 3000 then
    raise exception 'Demasiados equipos en un solo cambio';
  end if;
  if exists (
    select 1 from jsonb_each(p_cambios) c
    where char_length(c.key) > 40
       or jsonb_typeof(c.value) <> 'object'
       or coalesce(c.value ->> 'estado', '') not in ('pendiente', 'canalizado', 'instalado', 'direccionado', 'probado')
       or char_length(coalesce(c.value -> 'bloqueo' ->> 'motivo', '')) > 60
       or char_length(coalesce(c.value -> 'bloqueo' ->> 'nota', '')) > 300
  ) then
    raise exception 'Algún estado no es válido';
  end if;

  select full_name into v_nombre from public.profiles where id = auth.uid();
  v_sello := jsonb_build_object('por', auth.uid(), 'nombre', coalesce(v_nombre, ''));
  select coalesce(jsonb_object_agg(c.key, c.value || v_sello), '{}'::jsonb) into v_cambios from jsonb_each(p_cambios) c;

  update public.lazo_planos set avance = avance || v_cambios where id = p_plano returning avance into v_avance;
  if not found then
    raise exception 'No existe ese plano o no tienes permiso';
  end if;
  return v_avance;
end;
$$;

revoke all on function public.marcar_avance_plano(uuid, jsonb) from public;
grant execute on function public.marcar_avance_plano(uuid, jsonb) to authenticated;

-- Verificación: debe devolver 1 y 1.
-- select (select count(*) from information_schema.columns where table_name = 'lazo_planos' and column_name = 'avance'),
--        (select count(*) from pg_proc where proname = 'marcar_avance_plano');
