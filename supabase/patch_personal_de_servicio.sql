-- ============================================================
-- El técnico puede ver a TODO el personal asignado a su servicio
-- ============================================================
-- Problema: la política servicio_tecnicos_tecnico_read solo deja al técnico
-- ver su PROPIA fila (tecnico_id = auth.uid()), así que en el formulario de
-- reporte solo aparecía su nombre y no el de sus compañeros de cuadrilla.
--
-- No se puede arreglar ampliando la política con una subconsulta a
-- servicio_tecnicos dentro de su propia regla: eso provoca el
-- "infinite recursion" de RLS ya conocido. Tampoco conviene abrir la tabla
-- profiles a todos los técnicos.
--
-- Solución: una función SECURITY DEFINER que devuelve los nombres del
-- personal de un servicio. Al ser SECURITY DEFINER salta RLS, y la
-- autorización se hace explícita dentro de la propia función: solo responde
-- si quien llama es supervisor o está asignado a ese mismo servicio.
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

create or replace function public.personal_de_servicio(p_servicio_id uuid)
returns table (full_name text)
language sql
security definer
set search_path = public
as $$
  select p.full_name
  from public.servicio_tecnicos st
  join public.profiles p on p.id = st.tecnico_id
  where st.servicio_id = p_servicio_id
    and (
      public.get_my_role() = 'supervisor'
      or exists (
        select 1
        from public.servicio_tecnicos mio
        where mio.servicio_id = p_servicio_id
          and mio.tecnico_id = auth.uid()
      )
    )
  order by p.full_name;
$$;

grant execute on function public.personal_de_servicio(uuid) to authenticated;
