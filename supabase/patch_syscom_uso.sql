-- Contador de consultas a SYSCOM por mes.
--
-- Cada llamada a la API de SYSCOM sale por Fixie, que tiene un cupo mensual
-- (2,500 en el plan actual). Antes solo se contaban las búsquedas de los
-- técnicos (syscom_consultas_dia, tope de 20 al día); aquí se cuenta TODA
-- llamada real que sale a SYSCOM (búsquedas, fichas y el token), desde el
-- servidor (lib/syscom.ts). Lo que la app recuerda en memoria no cuenta,
-- porque no sale a internet. Supervisión ve el número en las cotizaciones.
--
-- Idempotente.

create table if not exists public.syscom_uso_mes (
  mes text primary key check (mes ~ '^\d{4}-\d{2}$'),
  cuenta integer not null default 0,
  actualizado_en timestamptz not null default now()
);

alter table public.syscom_uso_mes enable row level security;

drop policy if exists syscom_uso_mes_select on public.syscom_uso_mes;
create policy syscom_uso_mes_select on public.syscom_uso_mes for select
  using (public.get_my_role() = 'supervisor' and public.mi_cuenta_activa());
-- Nadie escribe directo: solo sumar_consulta_syscom() desde el servidor.

-- Suma una consulta al mes en curso (hora de México) y devuelve el total.
create or replace function public.sumar_consulta_syscom()
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.syscom_uso_mes as t (mes, cuenta)
  values (to_char(now() at time zone 'America/Mexico_City', 'YYYY-MM'), 1)
  on conflict (mes) do update set cuenta = t.cuenta + 1, actualizado_en = now()
  returning cuenta;
$$;

-- Solo el servidor (llave secreta) la llama.
revoke all on function public.sumar_consulta_syscom() from public, anon, authenticated;
grant execute on function public.sumar_consulta_syscom() to service_role;

-- Comprobar: select * from public.syscom_uso_mes order by mes desc;
