-- Reportes impresos: quién imprimió cada reporte y cuándo.
--
-- Supervisión (Braulio) entrega los reportes de servicio impresos. Desde
-- Reportes → «Imprimir varios» arma un solo PDF con los reportes que elige;
-- al imprimirlo o descargarlo se anota aquí cada reporte, para que la lista
-- diga «Impreso el …» y se pueda filtrar «Solo sin imprimir».
--
-- Un reporte puede imprimirse varias veces: cada vez es un renglón nuevo y
-- la app muestra la más reciente. Idempotente.

create table if not exists public.reportes_impresos (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  impreso_por uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  impreso_en timestamptz not null default now()
);

create index if not exists reportes_impresos_report_idx on public.reportes_impresos (report_id, impreso_en desc);

alter table public.reportes_impresos enable row level security;

drop policy if exists "reportes_impresos_select_supervisor" on public.reportes_impresos;
create policy "reportes_impresos_select_supervisor"
  on public.reportes_impresos for select
  using (public.get_my_role() = 'supervisor' and public.mi_cuenta_activa());

-- Solo se anota a nombre propio: impreso_por siempre es quien imprime.
drop policy if exists "reportes_impresos_insert_supervisor" on public.reportes_impresos;
create policy "reportes_impresos_insert_supervisor"
  on public.reportes_impresos for insert
  with check (
    public.get_my_role() = 'supervisor'
    and public.mi_cuenta_activa()
    and impreso_por = auth.uid()
  );

grant select, insert on public.reportes_impresos to authenticated;
