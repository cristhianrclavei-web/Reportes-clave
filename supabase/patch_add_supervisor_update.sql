-- Permite que los supervisores (incluyendo al Ing. Everardo, que sigue siendo
-- "supervisor" con el permiso extra can_approve_review) puedan actualizar
-- cualquier reporte — necesario para poder guardar la firma de revisión final
-- en reportes que no crearon ellos mismos.

drop policy if exists reports_update_supervisor on public.reports;

create policy reports_update_supervisor
on public.reports
for update
using (public.get_my_role() = 'supervisor')
with check (public.get_my_role() = 'supervisor');
