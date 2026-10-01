-- ============================================================
-- Verificación de patch_auditoria_seguridad.sql — NO CAMBIA NADA
-- ============================================================
-- Simula ser un técnico real (y un supervisor), intenta cambios a uno de
-- sus reportes y anota si la base los permitió o los bloqueó. Al final
-- lanza un error a propósito para DESHACER todo: el mensaje del error es
-- el resultado. Debe decir:
--   1 fecha sin corrección ............ BLOQUEADO
--   2 firma a distancia ............... PERMITIDO
--   3 pedir corrección ................ PERMITIDO
--   4 marcar concluido ................ PERMITIDO
--   5 cambiar trabajo sin corrección .. BLOQUEADO
--   6 fecha CON corrección ............ PERMITIDO
--   7 gestionar usuarios desactivado .. false
--
-- Ejecutar completo en el SQL Editor de Supabase.

do $$
declare
  v_tec uuid;
  v_sup uuid;
  v_rep uuid;
  v_res text := '';
  v_ok boolean;
begin
  select r.created_by, r.id into v_tec, v_rep
  from public.reports r join public.profiles p on p.id = r.created_by
  where p.role = 'tecnico' and p.activo = true
    and r.created_at < now() - interval '1 hour'
    and not r.correccion_habilitada
  order by r.created_at desc limit 1;
  select id into v_sup from public.profiles where role = 'supervisor' and activo = true limit 1;
  if v_rep is null or v_sup is null then
    raise exception 'No hay un reporte de técnico o un supervisor para probar';
  end if;

  -- Desde aquí actúa como el técnico.
  perform set_config('request.jwt.claim.sub', v_tec::text, true);

  begin
    update public.reports set fecha = fecha + 1 where id = v_rep;
    v_res := v_res || E'\n1 fecha sin corrección: PERMITIDO (MAL)';
  exception when others then
    v_res := v_res || E'\n1 fecha sin corrección: BLOQUEADO';
  end;

  begin
    update public.reports set data = data || '{"firmaRemota": {"prueba": true}}'::jsonb where id = v_rep;
    v_res := v_res || E'\n2 firma a distancia: PERMITIDO';
  exception when others then
    v_res := v_res || E'\n2 firma a distancia: BLOQUEADO (MAL) ' || sqlerrm;
  end;

  begin
    update public.reports set correccion_solicitada = true, correccion_motivo = 'prueba' where id = v_rep;
    v_res := v_res || E'\n3 pedir corrección: PERMITIDO';
  exception when others then
    v_res := v_res || E'\n3 pedir corrección: BLOQUEADO (MAL) ' || sqlerrm;
  end;

  begin
    update public.reports set data = data || '{"servicioConcluido": true}'::jsonb where id = v_rep;
    v_res := v_res || E'\n4 marcar concluido: PERMITIDO';
  exception when others then
    v_res := v_res || E'\n4 marcar concluido: BLOQUEADO (MAL) ' || sqlerrm;
  end;

  begin
    update public.reports set data = data || '{"observaciones": "cambio sin corrección"}'::jsonb where id = v_rep;
    v_res := v_res || E'\n5 cambiar trabajo sin corrección: PERMITIDO (MAL)';
  exception when others then
    v_res := v_res || E'\n5 cambiar trabajo sin corrección: BLOQUEADO';
  end;

  -- El supervisor autoriza la corrección; el técnico ya puede cambiar todo.
  perform set_config('request.jwt.claim.sub', v_sup::text, true);
  update public.reports set correccion_habilitada = true where id = v_rep;
  perform set_config('request.jwt.claim.sub', v_tec::text, true);
  begin
    update public.reports set fecha = fecha + 1 where id = v_rep;
    v_res := v_res || E'\n6 fecha CON corrección: PERMITIDO';
  exception when others then
    v_res := v_res || E'\n6 fecha CON corrección: BLOQUEADO (MAL) ' || sqlerrm;
  end;

  -- Un supervisor desactivado ya no puede gestionar usuarios.
  begin
    update public.profiles set activo = false where id = v_sup;
    perform set_config('request.jwt.claim.sub', v_sup::text, true);
    select public.puede_gestionar_usuarios() into v_ok;
    v_res := v_res || E'\n7 gestionar usuarios desactivado: ' || coalesce(v_ok::text, 'null');
  exception when others then
    v_res := v_res || E'\n7 no se pudo simular (otra regla lo impidió): ' || sqlerrm;
  end;

  -- Deshacer todo y mostrar el resultado.
  raise exception 'RESULTADO (todo se deshizo):%', v_res;
end $$;
