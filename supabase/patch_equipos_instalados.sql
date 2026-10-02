-- ============================================================
-- Equipos instalados ligados al almacén (Fase C)
-- ============================================================
-- Cada renglón de «Montaje de soportería y equipo» del reporte queda
-- registrado aquí, ligado al artículo del almacén cuando:
--   * el técnico lo eligió del catálogo (data.equipos[i].articuloId), o
--   * coincide con un artículo activo por modelo o por descripción exacta.
-- Si no se encuentra, el reporte se guarda igual, pero el renglón queda
-- «sin_registro»: alerta persistente «equipo instalado sin registro en
-- almacén · folio X» para supervisores y almacenista, hasta que el
-- almacenista lo registre (lo liga a un artículo, opcionalmente con entrada
-- y salida para que cuadre el historial) o indique que no pasa por almacén
-- (lo puso el cliente, garantía…).
--
-- Solo aplica a reportes hechos con la versión nueva del formulario
-- (data.equiposAlmacen = true): los reportes viejos no generan alertas.
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

create table if not exists public.almacen_equipos_instalados (
  id uuid primary key default gen_random_uuid(),
  reporte_id uuid not null references public.reports(id) on delete cascade,
  huella text not null,
  folio text,
  servicio_id uuid,
  tecnico_id uuid references public.profiles(id) on delete set null,
  cliente text,
  fecha date,
  cantidad numeric not null default 1,
  descripcion text,
  marca text,
  modelo text,
  serie text,
  articulo_id uuid references public.almacen_articulos(id) on delete set null,
  estado text not null default 'sin_registro'
    check (estado in ('ligado', 'sin_registro', 'registrado', 'no_aplica')),
  nota text,
  resuelto_por uuid references public.profiles(id) on delete set null,
  resuelto_en timestamptz,
  created_at timestamptz not null default now(),
  unique (reporte_id, huella)
);
create index if not exists idx_equipos_instalados_pendientes on public.almacen_equipos_instalados (created_at) where estado = 'sin_registro';
create index if not exists idx_equipos_instalados_articulo on public.almacen_equipos_instalados (articulo_id);

alter table public.almacen_equipos_instalados enable row level security;
drop policy if exists equipos_instalados_lectura on public.almacen_equipos_instalados;
create policy equipos_instalados_lectura on public.almacen_equipos_instalados for select to authenticated
  using (public.puedo_gestionar_almacen() or public.get_my_role() = 'supervisor');
-- Sin políticas de escritura: solo el trigger y la función de abajo escriben.

-- Lee los equipos del reporte y actualiza la tabla.
create or replace function public.sincronizar_equipos_instalados()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  e jsonb;
  v_desc text; v_marca text; v_modelo text; v_serie text; v_cant numeric;
  v_art uuid;
  v_huella text;
  v_huellas text[] := '{}';
begin
  if coalesce(new.data->>'equiposAlmacen', '') <> 'true' then
    return new;
  end if;

  for e in select * from jsonb_array_elements(coalesce(new.data->'equipos', '[]'::jsonb)) loop
    v_desc := nullif(trim(coalesce(e->>'desc', '')), '');
    v_marca := nullif(trim(coalesce(e->>'marca', '')), '');
    v_modelo := nullif(trim(coalesce(e->>'modelo', '')), '');
    v_serie := nullif(trim(coalesce(e->>'serie', '')), '');
    continue when v_desc is null and v_modelo is null;
    v_cant := coalesce(nullif(substring(coalesce(e->>'cant', '') from '[0-9]+(?:\.[0-9]+)?'), '')::numeric, 1);
    if v_cant <= 0 then v_cant := 1; end if;

    v_art := null;
    if coalesce(e->>'articuloId', '') ~ '^[0-9a-fA-F-]{36}$' then
      select id into v_art from public.almacen_articulos where id = (e->>'articuloId')::uuid;
    end if;
    if v_art is null and v_modelo is not null then
      select id into v_art from public.almacen_articulos
      where activo and lower(trim(coalesce(modelo, ''))) = lower(v_modelo) limit 1;
    end if;
    if v_art is null and v_desc is not null then
      select id into v_art from public.almacen_articulos
      where activo and lower(trim(descripcion)) = lower(v_desc) limit 1;
    end if;

    v_huella := md5(lower(coalesce(v_desc, '')) || '|' || lower(coalesce(v_modelo, '')) || '|' || lower(coalesce(v_marca, '')) || '|' || coalesce(v_serie, ''));
    v_huellas := v_huellas || v_huella;

    insert into public.almacen_equipos_instalados as t
      (reporte_id, huella, folio, servicio_id, tecnico_id, cliente, fecha, cantidad, descripcion, marca, modelo, serie, articulo_id, estado)
    values
      (new.id, v_huella, new.data->>'claveFormato',
       case when coalesce(new.data->>'servicioProgramadoId', '') ~ '^[0-9a-fA-F-]{36}$' then (new.data->>'servicioProgramadoId')::uuid end,
       new.created_by, new.empresa_cliente, new.fecha, v_cant, v_desc, v_marca, v_modelo, v_serie, v_art,
       case when v_art is null then 'sin_registro' else 'ligado' end)
    on conflict (reporte_id, huella) do update set
      folio = excluded.folio,
      cliente = excluded.cliente,
      fecha = excluded.fecha,
      cantidad = excluded.cantidad,
      articulo_id = coalesce(t.articulo_id, excluded.articulo_id),
      estado = case when t.estado = 'sin_registro' and excluded.articulo_id is not null then 'ligado' else t.estado end;
  end loop;

  -- Renglones que el técnico quitó al corregir: se borran si nadie los había
  -- resuelto; los ya registrados quedan como historial.
  delete from public.almacen_equipos_instalados
  where reporte_id = new.id and estado in ('sin_registro', 'ligado') and not (huella = any (v_huellas));

  return new;
end;
$$;

drop trigger if exists trg_equipos_instalados on public.reports;
create trigger trg_equipos_instalados
  after insert or update of data on public.reports
  for each row execute function public.sincronizar_equipos_instalados();

-- El almacenista resuelve una alerta:
--   'registrado' → se liga a p_articulo; con p_movimientos registra una
--                  entrada y una salida (al servicio) por la cantidad, para
--                  que el historial del artículo diga dónde quedó.
--   'no_aplica'  → no pasa por almacén (lo puso el cliente, garantía…); nota obligatoria.
create or replace function public.resolver_equipo_instalado(
  p_id uuid, p_estado text, p_articulo uuid, p_movimientos boolean, p_nota text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_nota text := nullif(trim(coalesce(p_nota, '')), '');
  v_ref text;
begin
  if not public.puedo_gestionar_almacen() or not public.mi_cuenta_activa() then
    raise exception 'Solo el almacén puede registrar equipos instalados';
  end if;
  select * into r from public.almacen_equipos_instalados where id = p_id for update;
  if r.id is null then raise exception 'No existe ese equipo'; end if;
  if r.estado <> 'sin_registro' then raise exception 'Este equipo ya se había resuelto'; end if;

  if p_estado = 'registrado' then
    if p_articulo is null or not exists (select 1 from public.almacen_articulos where id = p_articulo) then
      raise exception 'Elige el artículo del catálogo';
    end if;
    if coalesce(p_movimientos, false) then
      v_ref := 'Equipo instalado sin pasar por almacén · folio ' || coalesce(r.folio, '—') || coalesce(' · ' || r.cliente, '');
      insert into public.almacen_movimientos (articulo_id, tipo, cantidad, inventario, creado_por, nota)
      values (p_articulo, 'entrada', r.cantidad, 'general', auth.uid(), v_ref);
      insert into public.almacen_movimientos (articulo_id, tipo, cantidad, inventario, creado_por, nota, servicio_id)
      values (p_articulo, 'salida', r.cantidad, 'general', auth.uid(), v_ref,
              (select sp.id from public.servicios_programados sp where sp.id = r.servicio_id));
    end if;
    update public.almacen_equipos_instalados
    set estado = 'registrado', articulo_id = p_articulo, nota = v_nota, resuelto_por = auth.uid(), resuelto_en = now()
    where id = p_id;
  elsif p_estado = 'no_aplica' then
    if v_nota is null then raise exception 'Escribe por qué no pasa por almacén'; end if;
    update public.almacen_equipos_instalados
    set estado = 'no_aplica', nota = v_nota, resuelto_por = auth.uid(), resuelto_en = now()
    where id = p_id;
  else
    raise exception 'Estado no válido';
  end if;
end;
$$;

-- El técnico que guardó el reporte puede saber cuántos renglones quedaron
-- sin registro (para avisar al almacén), sin ver la tabla completa.
create or replace function public.equipos_sin_registro_de(p_reporte uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.almacen_equipos_instalados t
  join public.reports rp on rp.id = t.reporte_id
  where t.reporte_id = p_reporte and t.estado = 'sin_registro'
    and (rp.created_by = auth.uid() or public.get_my_role() = 'supervisor');
$$;

revoke all on function public.sincronizar_equipos_instalados() from public, anon, authenticated;
revoke all on function public.resolver_equipo_instalado(uuid, text, uuid, boolean, text) from public, anon;
grant execute on function public.resolver_equipo_instalado(uuid, text, uuid, boolean, text) to authenticated;
revoke all on function public.equipos_sin_registro_de(uuid) from public, anon;
grant execute on function public.equipos_sin_registro_de(uuid) to authenticated;

-- Verificación: deben salir 3 en true.
select
  to_regclass('public.almacen_equipos_instalados') is not null as tabla,
  exists (select 1 from pg_trigger where tgname = 'trg_equipos_instalados') as trigger_reportes,
  exists (select 1 from pg_proc where proname = 'resolver_equipo_instalado') as resolver;
