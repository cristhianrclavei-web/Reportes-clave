-- Radio de 50 m para clientes pegados (casas vecinas).
--
-- La ficha del cliente ya permitía guardar 50 m (radio_m between 50 and 2000).
-- Lo que faltaba: las ubicaciones de sus servicios agendados usaban siempre al
-- menos 200 m, así que un servicio en una de las casas volvía a cubrir a la
-- vecina. Ahora, si el cliente tiene un radio menor a 200 m (alguien lo achicó
-- a propósito), sus servicios usan ese mismo radio. Si no, al menos el del
-- cliente (antes: al menos 200 m fijos; el radio por omisión es 200, así que
-- para casi todos no cambia nada). Misma regla en lib/visitasDatos.ts.

create or replace function public.lugares_de_clientes()
returns table (cliente_id uuid, lat double precision, lng double precision, radio double precision)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, (c.ubicacion ->> 'lat')::double precision, (c.ubicacion ->> 'lng')::double precision, c.radio_m::double precision
  from public.clientes c
  where jsonb_typeof(c.ubicacion -> 'lat') = 'number' and jsonb_typeof(c.ubicacion -> 'lng') = 'number'
  union
  -- El radio del servicio (120 m) es para marcar la llegada; aquí se usa el del cliente.
  select sp.cliente_id, (sp.ubicacion_programada ->> 'lat')::double precision, (sp.ubicacion_programada ->> 'lng')::double precision,
         (case when c.radio_m < 200 then c.radio_m
               else greatest(coalesce(sp.radio_geocerca_m, 0), c.radio_m) end)::double precision
  from public.servicios_programados sp
  join public.clientes c on c.id = sp.cliente_id
  where jsonb_typeof(sp.ubicacion_programada -> 'lat') = 'number' and jsonb_typeof(sp.ubicacion_programada -> 'lng') = 'number';
$$;

revoke all on function public.lugares_de_clientes() from public, anon, authenticated;

-- Comprobar: select count(*) from public.lugares_de_clientes();
