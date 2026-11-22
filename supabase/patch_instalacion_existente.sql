-- Instalaciones que ya operan (mantenimiento) como un tipo de proyecto.
--
-- · proyectos.tipo: 'obra' (lo de siempre: se vende, se instala, se entrega)
--   o 'instalacion' (lo que el cliente ya tiene funcionando; ahí viven sus
--   planos, lazos y guías y se ligan los mantenimientos). Una instalación
--   nace en la etapa «terminado» y en pantalla se ve «En operación».
-- · instalacion_del_cliente(cliente, sistema): la instalación existente del
--   cliente (la crea si no tiene) y le suma el sistema. La usa el técnico al
--   capturar un lazo o un plano desde un servicio que no tiene proyecto: los
--   técnicos no crean proyectos de otra forma.
--
-- Aditivo e idempotente.

alter table public.proyectos add column if not exists tipo text not null default 'obra';
alter table public.proyectos drop constraint if exists proyectos_tipo_check;
alter table public.proyectos add constraint proyectos_tipo_check check (tipo in ('obra', 'instalacion'));

create or replace function public.instalacion_del_cliente(p_cliente uuid, p_sistema text default 'otro')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_sistema text := coalesce(nullif(p_sistema, ''), 'otro');
begin
  if public.get_my_role() not in ('tecnico', 'supervisor') or not public.mi_cuenta_activa() then
    raise exception 'Sin permiso';
  end if;
  if v_sistema not in ('deteccion', 'cctv', 'acceso', 'solar', 'intrusion', 'otro') then
    raise exception 'Sistema no válido';
  end if;
  if not exists (select 1 from public.clientes where id = p_cliente) then
    raise exception 'El cliente no existe';
  end if;

  select id into v_id from public.proyectos
    where cliente_id = p_cliente and tipo = 'instalacion' and etapa <> 'cancelado'
    order by created_at limit 1;

  if v_id is null then
    insert into public.proyectos (cliente_id, nombre, sistema, sistemas, etapa, tipo, created_by)
      values (p_cliente, 'Instalación existente', case v_sistema
          when 'deteccion' then 'Detección de incendio' when 'cctv' then 'CCTV' when 'acceso' then 'Control de acceso'
          when 'solar' then 'Paneles solares' when 'intrusion' then 'Alarma de intrusión' else 'Otro sistema' end,
        array[v_sistema], 'terminado', 'instalacion', auth.uid())
      returning id into v_id;
  else
    update public.proyectos set sistemas = array_append(sistemas, v_sistema)
      where id = v_id and not (v_sistema = any(sistemas)) and cardinality(sistemas) < 8;
  end if;
  return v_id;
end;
$$;

revoke all on function public.instalacion_del_cliente(uuid, text) from public;
grant execute on function public.instalacion_del_cliente(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- Comprobar: select tipo, count(*) from public.proyectos group by 1;
