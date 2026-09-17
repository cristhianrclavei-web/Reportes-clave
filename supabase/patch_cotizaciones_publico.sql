-- ============================================================
-- Acceso público de solo lectura para compartir una cotización
-- ============================================================
-- Permite que el cliente (sin sesión) vea el PDF de una cotización que el
-- supervisor le comparte, por ejemplo por WhatsApp. Nunca expone una
-- lista: solo entrega los datos de una cotización si se conoce su id
-- exacto (un uuid, imposible de adivinar) y solo si ya está aprobada o
-- enviada — una en borrador o rechazada no es visible por esta vía aunque
-- se tenga el id.
--
-- security definer + search_path fijo: la función corre con los permisos
-- de quien la creó, no los de quien la llama, así que puede leer la fila
-- aunque las políticas de RLS solo dejen pasar a supervisores. Es la forma
-- correcta de exponer "un recurso por id" sin abrir una política pública
-- en la tabla completa (eso sí permitiría listar/enumerar todas las
-- cotizaciones enviadas vía la API REST de Supabase con la anon key, que
-- ya es pública porque va en el bundle del navegador).
--
-- Ejecutar después de patch_cotizaciones.sql y patch_cotizaciones_moneda.sql.
-- Idempotente.

create or replace function public.obtener_cotizacion_publica(p_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  cot record;
  resultado json;
begin
  select * into cot from public.cotizaciones
    where id = p_id and estado in ('aprobada', 'enviada');

  if not found then
    return null;
  end if;

  select json_build_object(
    'cotizacion', row_to_json(cot),
    'lineas', (
      select coalesce(json_agg(l order by l.orden), '[]'::json)
      from public.cotizacion_lineas l
      where l.cotizacion_id = p_id
    )
  ) into resultado;

  return resultado;
end;
$$;

grant execute on function public.obtener_cotizacion_publica(uuid) to anon, authenticated;
