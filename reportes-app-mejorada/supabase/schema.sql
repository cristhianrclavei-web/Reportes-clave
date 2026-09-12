-- =========================================================
-- Esquema para Reportes de Servicio · Clave Inteligente
-- Ejecuta este archivo completo en: Supabase > SQL Editor
-- =========================================================

-- Perfiles de usuario (extiende auth.users con rol y nombre)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('tecnico','supervisor')) default 'tecnico',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Cada usuario puede leer su propio perfil; los supervisores pueden leer todos
create policy "profiles_select_own_or_supervisor"
  on public.profiles for select
  using (
    id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'supervisor')
  );

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid());

-- Reportes de servicio
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  empresa_cliente text not null,
  fecha date not null default current_date,
  tipo_servicio text,
  sub_tipo_servicio text,
  data jsonb not null  -- resto de los campos del formato CRM0851
);

alter table public.reports enable row level security;

-- Un técnico solo ve y crea sus propios reportes
create policy "reports_insert_own"
  on public.reports for insert
  with check (created_by = auth.uid());

create policy "reports_select_own"
  on public.reports for select
  using (created_by = auth.uid());

-- El supervisor ve todos los reportes
create policy "reports_select_supervisor"
  on public.reports for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'supervisor')
  );

-- Cuando se crea un usuario nuevo en Supabase Auth, crea automáticamente su perfil
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'tecnico')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
