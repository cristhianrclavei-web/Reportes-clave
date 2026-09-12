-- Bucket privado para guardar los PDF de las facturas subidas por los supervisores.

insert into storage.buckets (id, name, public)
values ('facturas', 'facturas', false)
on conflict (id) do nothing;

drop policy if exists "facturas_supervisor_all" on storage.objects;

create policy "facturas_supervisor_all"
on storage.objects for all
using (bucket_id = 'facturas' and public.get_my_role() = 'supervisor')
with check (bucket_id = 'facturas' and public.get_my_role() = 'supervisor');
