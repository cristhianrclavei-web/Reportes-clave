-- 1) Radio de 25 m en la ubicación del cliente (casas muy pegadas).
-- 2) «No se puede instalar» en el avance de planos: la foto de evidencia pasa a
--    ser opcional. Si viene, se sigue revisando que sea una ruta válida.
-- Cambia las funciones tal como están en la base (pg_get_functiondef) para no
-- pisar ajustes posteriores a sus patch originales. Idempotente.

alter table public.clientes drop constraint if exists clientes_ubicacion_valida;
alter table public.clientes add constraint clientes_ubicacion_valida check (
  radio_m between 25 and 2000
  and (
    ubicacion is null
    or (
      jsonb_typeof(ubicacion -> 'lat') = 'number' and jsonb_typeof(ubicacion -> 'lng') = 'number'
      and (ubicacion ->> 'lat')::numeric between -90 and 90
      and (ubicacion ->> 'lng')::numeric between -180 and 180
    )
  )
);

do $do$
declare
  antes text;
  despues text;
begin
  -- El buscador de visitas subía a 30 m cualquier radio menor.
  antes := pg_get_functiondef('public.visitas_gps(jsonb,date,date)'::regprocedure);
  despues := replace(antes, '200), 30), 2000)', '200), 25), 2000)');
  if despues <> antes then
    execute despues;
  elsif position('200), 25), 2000)' in antes) = 0 then
    raise exception 'visitas_gps no tiene el tope esperado; revisar a mano.';
  end if;

  antes := pg_get_functiondef('public.marcar_avance_plano(uuid,jsonb)'::regprocedure);
  despues := replace(antes,
    $x$if coalesce(cambio.value -> 'bloqueo' ->> 'foto', '') not like 'lazos/%' then
        raise exception '«No se puede instalar» necesita la foto de evidencia.';$x$,
    $x$if coalesce(cambio.value -> 'bloqueo' ->> 'foto', '') <> '' and cambio.value -> 'bloqueo' ->> 'foto' not like 'lazos/%' then
        raise exception 'La foto de evidencia no es válida.';$x$);
  if despues <> antes then
    execute despues;
  elsif position('La foto de evidencia no es válida.' in antes) = 0 then
    raise exception 'marcar_avance_plano no tiene la regla esperada; revisar a mano.';
  end if;
end;
$do$;

-- Comprobar:
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'clientes_ubicacion_valida';
-- select prosrc ilike '%no es válida.%' from pg_proc where proname = 'marcar_avance_plano';
