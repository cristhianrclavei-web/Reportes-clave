-- ============================================================
-- Rutinas de tareas para mantenimientos preventivos
-- ============================================================
-- Listas guardadas de tareas (por etapas: antes de iniciar, pruebas,
-- inspección visual, mediciones, cierre) que se cargan con un clic al
-- agendar un servicio. Un mantenimiento recurrente puede tener su rutina y
-- se precarga sola al programarlo.
--
-- Trae 5 rutinas iniciales (general, CCTV, detección de incendio, control
-- de acceso y alarma de intrusión) que se pueden editar o borrar desde
-- Servicios → Plantillas. Solo se cargan si la tabla está vacía.
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

create table if not exists public.rutinas_tareas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) >= 2),
  sistema text,
  descripcion text,
  -- [{"titulo": "Pruebas", "tareas": ["...", "..."]}]
  secciones jsonb not null default '[]',
  activo boolean not null default true,
  creado_por uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rutinas_tareas enable row level security;
drop policy if exists rutinas_supervisor on public.rutinas_tareas;
create policy rutinas_supervisor on public.rutinas_tareas for all to authenticated
  using (public.get_my_role() = 'supervisor')
  with check (public.get_my_role() = 'supervisor');

alter table public.mantenimientos_recurrentes
  add column if not exists rutina_id uuid references public.rutinas_tareas(id) on delete set null;

-- ---------- Rutinas iniciales ----------
insert into public.rutinas_tareas (nombre, sistema, descripcion, secciones, creado_por)
select * from (values
  ('Mantenimiento preventivo general', 'General', 'Base para cualquier sistema', $j$[
    {"titulo": "Antes de iniciar", "tareas": ["Avisar al personal del cliente del mantenimiento y coordinar acceso a las áreas", "Revisar bitácora y fallas reportadas desde la última visita", "Verificar herramienta, refacciones y equipo de seguridad"]},
    {"titulo": "Pruebas con equipos", "tareas": ["Pruebas de funcionamiento de cada equipo", "Probar respaldo de energía (baterías / UPS)"]},
    {"titulo": "Inspección visual", "tareas": ["Inspección visual de equipos, cableado, canalizaciones y conexiones", "Limpieza de equipos y gabinetes", "Revisar fijación, etiquetado y estado físico"]},
    {"titulo": "Medición de parámetros", "tareas": ["Medir voltaje de alimentación y de baterías", "Registrar parámetros fuera de rango"]},
    {"titulo": "Cierre", "tareas": ["Dejar el sistema en estado normal y sin fallas", "Tomar evidencias fotográficas", "Informar al cliente los resultados y recomendaciones"]}
  ]$j$::jsonb),
  ('Mantenimiento preventivo CCTV', 'CCTV', 'Cámaras, grabador y almacenamiento', $j$[
    {"titulo": "Antes de iniciar", "tareas": ["Avisar al personal del cliente del mantenimiento", "Revisar fallas reportadas y cámaras sin video"]},
    {"titulo": "Pruebas con equipos", "tareas": ["Verificar video en vivo de todas las cámaras", "Revisar grabación y días de retención", "Probar acceso remoto (app / navegador)", "Verificar fecha y hora del grabador"]},
    {"titulo": "Inspección visual", "tareas": ["Limpieza de lentes y domos", "Ajuste de ángulo y enfoque", "Revisar conectores, cableado y fijación de cámaras", "Limpieza de grabador y gabinete"]},
    {"titulo": "Medición de parámetros", "tareas": ["Medir voltaje en cámaras y fuente de alimentación", "Revisar estado del disco duro (salud y capacidad)"]},
    {"titulo": "Cierre", "tareas": ["Respaldar configuración del grabador", "Tomar evidencias", "Informar al cliente los resultados"]}
  ]$j$::jsonb),
  ('Mantenimiento preventivo detección de incendio', 'Detección de incendio', 'Pruebas conforme a NFPA 72', $j$[
    {"titulo": "Antes de iniciar", "tareas": ["Avisar al personal del cliente y a la central de monitoreo antes de las pruebas", "Revisar eventos y fallas registradas en el panel"]},
    {"titulo": "Pruebas con equipos", "tareas": ["Prueba funcional de detectores de humo", "Prueba funcional de detectores de calor", "Prueba de estaciones manuales", "Prueba de sirenas y estrobos", "Prueba de módulos de control y monitoreo"]},
    {"titulo": "Inspección visual", "tareas": ["Inspección visual de detectores (limpieza, obstrucciones, daños)", "Revisar panel, fuentes y canalizaciones", "Verificar señalización y accesibilidad de estaciones manuales"]},
    {"titulo": "Medición de parámetros", "tareas": ["Medir voltaje y carga de baterías del panel", "Medir voltaje de lazos y circuitos de notificación"]},
    {"titulo": "Cierre", "tareas": ["Restablecer el panel y dejarlo en estado normal", "Avisar a monitoreo que terminaron las pruebas", "Llenar el formato de pruebas NFPA 72", "Tomar evidencias"]}
  ]$j$::jsonb),
  ('Mantenimiento preventivo control de acceso', 'Control de acceso', 'Lectores, chapas y controlador', $j$[
    {"titulo": "Antes de iniciar", "tareas": ["Avisar al personal del cliente del mantenimiento", "Revisar fallas reportadas en puertas"]},
    {"titulo": "Pruebas con equipos", "tareas": ["Probar lectores con tarjeta / huella / rostro", "Probar chapas y electroimanes", "Probar botones de salida y liberación de emergencia", "Verificar sincronización de fecha y hora"]},
    {"titulo": "Inspección visual", "tareas": ["Revisar fijación de lectores, chapas y contactos", "Limpieza de lectores", "Revisar cableado y gabinete del controlador"]},
    {"titulo": "Medición de parámetros", "tareas": ["Medir voltaje de la fuente y de las chapas", "Medir voltaje de baterías de respaldo"]},
    {"titulo": "Cierre", "tareas": ["Respaldar base de usuarios", "Tomar evidencias", "Informar al cliente los resultados"]}
  ]$j$::jsonb),
  ('Mantenimiento preventivo alarma de intrusión', 'Alarma de intrusión', 'Panel, sensores y comunicación', $j$[
    {"titulo": "Antes de iniciar", "tareas": ["Avisar al personal del cliente y a la central de monitoreo", "Revisar eventos y zonas con falla"]},
    {"titulo": "Pruebas con equipos", "tareas": ["Prueba de sensores de movimiento", "Prueba de contactos magnéticos", "Prueba de sirena", "Prueba de comunicación con la central"]},
    {"titulo": "Inspección visual", "tareas": ["Revisar fijación y estado de sensores", "Revisar teclados y panel"]},
    {"titulo": "Medición de parámetros", "tareas": ["Medir voltaje y carga de la batería del panel"]},
    {"titulo": "Cierre", "tareas": ["Dejar el sistema armado/desarmado según indique el cliente", "Avisar a monitoreo que terminaron las pruebas", "Tomar evidencias"]}
  ]$j$::jsonb)
) as v(nombre, sistema, descripcion, secciones)
cross join lateral (select null::uuid as creado_por) c
where not exists (select 1 from public.rutinas_tareas);

-- Verificación: tabla, rutinas cargadas y columna en recurrentes.
select
  to_regclass('public.rutinas_tareas') is not null as tabla,
  (select count(*) from public.rutinas_tareas) as rutinas,
  exists (select 1 from information_schema.columns where table_name = 'mantenimientos_recurrentes' and column_name = 'rutina_id') as recurrentes;
