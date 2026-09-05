-- Ejecuta esto en Supabase > SQL Editor
-- Faltaba una política de UPDATE en 'reports': por eso el segundo paso
-- (adjuntar las rutas de las fotos al reporte ya creado) fallaba en silencio.

drop policy if exists "reports_update_own" on public.reports;
create policy "reports_update_own"
  on public.reports for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());
