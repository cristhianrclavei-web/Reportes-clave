-- Vales de almacén: que el técnico pueda firmar de recibido ahí mismo, en el
-- dispositivo del almacén, cuando está frente al almacenista.
--
-- Hasta ahora la firma solo se aceptaba desde la cuenta del técnico, en su
-- propio celular (firmar_vale). Esa forma sigue igual. Esta agrega la otra:
-- quien gestiona el almacén captura la firma del técnico en su pantalla. Queda
-- registrado quién la capturó, para distinguir una firma de la otra.
--
-- Se puede correr varias veces.

alter table public.almacen_vales
  add column if not exists firma_tomada_por uuid references public.profiles(id) on delete set null;

create or replace function public.firmar_vale_en_almacen(p_vale uuid, p_firma text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v record;
begin
  if not public.puedo_gestionar_almacen() or not public.mi_cuenta_activa() then
    raise exception 'Solo el almacén puede tomar la firma aquí';
  end if;
  select * into v from public.almacen_vales where id = p_vale for update;
  if v.id is null then raise exception 'No se encontró el vale'; end if;
  if v.estado <> 'por_firmar' then raise exception 'Este vale no está pendiente de firma'; end if;
  if p_firma is null or p_firma not like 'data:image/png;base64,%' or length(p_firma) > 400000 then
    raise exception 'Firma inválida';
  end if;
  update public.almacen_vales
  set estado = 'en_uso', firma_recepcion = p_firma, firmado_en = now(), firma_tomada_por = auth.uid()
  where id = p_vale;
end;
$$;

revoke all on function public.firmar_vale_en_almacen(uuid, text) from public, anon;
grant execute on function public.firmar_vale_en_almacen(uuid, text) to authenticated;
