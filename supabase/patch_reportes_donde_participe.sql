-- Reportes donde participé: que el técnico pueda consultar lo esencial de
-- los reportes que hizo un compañero y en los que él también trabajó.
--
-- Hoy cada técnico solo ve los reportes creados desde su cuenta. Si regresa
-- a un sitio y necesita recordar qué se hizo la vez anterior, y el reporte
-- lo capturó otro, no tiene cómo verlo. Esta función devuelve SOLO lo
-- relevante para dar seguimiento (cliente, fecha, horas, actividades, folio
-- y quién lo hizo): ni fotos, ni firmas, ni materiales, ni costos.
--
-- Cuenta como «participé» cuando:
--   · estoy asignado al servicio programado ligado a ese reporte, o
--   · mi nombre aparece en el personal del reporte (o como responsable).
--
-- No cambia permisos de la tabla: es una función de solo lectura que corre
-- con permisos propios y filtra por el usuario que la llama. Se puede
-- correr varias veces.

create or replace function public.reportes_donde_participe()
returns table (
  id uuid,
  fecha date,
  empresa_cliente text,
  folio text,
  hora_llegada text,
  hora_salida text,
  actividades jsonb,
  autor text
)
language sql
stable
security definer
set search_path = public
as $$
  with yo as (
    select p.id, lower(btrim(regexp_replace(coalesce(p.full_name, ''), '\s+', ' ', 'g'))) as nombre
    from public.profiles p
    where p.id = auth.uid()
  )
  select
    r.id,
    r.fecha::date,
    r.empresa_cliente::text,
    r.data ->> 'claveFormato',
    r.data ->> 'horaLlegada',
    r.data ->> 'horaSalida',
    case when jsonb_typeof(r.data -> 'actividades') = 'array' then r.data -> 'actividades' else '[]'::jsonb end,
    autor.full_name::text
  from public.reports r
  cross join yo
  left join public.profiles autor on autor.id = r.created_by
  where public.mi_cuenta_activa()
    and r.created_by is distinct from yo.id
    and (
      -- Asignado al servicio programado de ese reporte.
      exists (
        select 1
        from public.servicios_programados sp
        join public.servicio_tecnicos st on st.servicio_id = sp.id
        where st.tecnico_id = yo.id
          and (sp.report_id = r.id or sp.id::text = r.data ->> 'servicioProgramadoId')
      )
      -- O mi nombre está en el personal del reporte.
      or (
        yo.nombre <> ''
        and (
          lower(btrim(regexp_replace(coalesce(r.data ->> 'ingACargo', ''), '\s+', ' ', 'g'))) = yo.nombre
          or exists (
            select 1
            from jsonb_array_elements_text(
              case when jsonb_typeof(r.data -> 'personal') = 'array' then r.data -> 'personal' else '[]'::jsonb end
            ) as persona(nombre)
            where lower(btrim(regexp_replace(persona.nombre, '\s+', ' ', 'g'))) = yo.nombre
          )
        )
      )
    )
  order by r.fecha desc, r.created_at desc
  limit 300;
$$;

revoke all on function public.reportes_donde_participe() from public, anon;
grant execute on function public.reportes_donde_participe() to authenticated;
