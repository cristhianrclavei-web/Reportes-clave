-- ============================================================
-- DEMO: datos ficticios de «ServiTec Integral» y reinicio nocturno
-- ============================================================
-- SOLO para la instalación demo. reiniciar_demo() BORRA toda la operación
-- (clientes, servicios, reportes, cotizaciones, almacén…) y vuelve a cargar
-- datos de ejemplo con fechas relativas a hoy, para que el demo siempre se
-- vea al día.
--
-- Seguro: solo corre si existe la marca del demo (la cuenta de la
-- supervisora guardada en demo_accesos por crear-usuarios-demo.mjs) y hay a
-- lo más 5 cuentas ajenas al dominio @demo.servitec.test. En una base real
-- no pasa ninguno de los dos filtros. Las cuentas que creen los visitantes
-- se borran en cada reinicio.
--
-- Usuarios: se crean antes con scripts/instalacion/crear-usuarios-demo.mjs
-- (supervisora y 15 técnicos; solo «supervisor» y «tecnico» inician sesión).
--
-- Ejecutar completo en el SQL Editor del proyecto DEMO. Idempotente.
-- Después: select public.reiniciar_demo();

-- Contraseñas de las cuentas de acceso rápido (públicas a propósito: van
-- en los botones del login). Las escribe crear-usuarios-demo.mjs con la
-- secret key; la app no puede leer esta tabla (RLS sin políticas).
create table if not exists public.demo_accesos (
  email text primary key,
  contrasena text not null
);
alter table public.demo_accesos enable row level security;
revoke all on public.demo_accesos from anon, authenticated;

-- Mantiene «vivo» el día de hoy: quien abra el demo a cualquier hora ve
-- servicios que empezaron hace un rato y otros por iniciar en un rato, en
-- vez de servicios de la mañana ya excedidos por horas. Corre cada 15
-- minutos y al final de cada reinicio.
--
-- Dos reglas de la base que hay que respetar: no se cambia la hora de un
-- servicio en curso (se pasa un instante a «programado») y cambiar la hora
-- borra el «visto» de los técnicos (se vuelve a marcar).
create or replace function public.demo_al_dia()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  zona constant text := 'America/Mexico_City';
  ahora timestamp := now() at time zone zona;
  hoy date := (now() at time zone zona)::date;
  s record;
  n_campo integer := 0;
  n_prog integer := 0;
  v_hora time;
  v_llegada timestamptz;
begin
  if not exists (select 1 from public.demo_accesos) then
    raise exception 'demo_al_dia() solo corre en la instalación demo';
  end if;

  for s in
    select id, estado from public.servicios_programados
    where fecha = hoy and estado in ('en_curso', 'en_sitio', 'programado') and report_id is null
    order by case estado when 'en_curso' then 0 when 'en_sitio' then 1 else 2 end, hora_programada, id
  loop
    if s.estado in ('en_curso', 'en_sitio') then
      n_campo := n_campo + 1;
      -- Empezaron hace entre 35 y 95 minutos, escalonados (nunca antes de hoy).
      v_llegada := greatest(ahora - make_interval(mins => 20 + n_campo * 15), hoy::timestamp + interval '5 minutes') at time zone zona;
      v_hora := ((v_llegada at time zone zona) + interval '5 minutes')::time;
      update public.servicios_programados set estado = 'programado' where id = s.id;
      update public.servicios_programados set hora_programada = v_hora where id = s.id;
      update public.servicios_programados set
        estado = s.estado,
        hora_llegada = v_llegada,
        hora_inicio = case when s.estado = 'en_curso' then v_llegada + interval '10 minutes' end
      where id = s.id;
    else
      n_prog := n_prog + 1;
      -- Por iniciar: cada 40 minutos a partir de dentro de 40 (tope 23:50).
      v_hora := least(ahora + make_interval(mins => n_prog * 40), hoy::timestamp + interval '23 hours 50 minutes')::time;
      update public.servicios_programados set hora_programada = v_hora where id = s.id;
    end if;
    -- Todos enterados, menos el último por iniciar: queda un «Sin ver» de ejemplo.
    update public.servicio_tecnicos set visto_en = now() - interval '30 minutes', enterado_en = now() - interval '25 minutes'
    where servicio_id = s.id;
  end loop;

  update public.servicio_tecnicos set visto_en = null, enterado_en = null
  where servicio_id = (
    select id from public.servicios_programados
    where fecha = hoy and estado = 'programado' order by hora_programada desc, id limit 1);

  return format('%s en campo y %s por iniciar, al %s', n_campo, n_prog, to_char(ahora, 'HH24:MI'));
end;
$$;

revoke all on function public.demo_al_dia() from public, anon, authenticated;

create or replace function public.reiniciar_demo()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  dominio constant text := '@demo.servitec.test';
  hoy date := (now() at time zone 'America/Mexico_City')::date;
  t text;
  v_sup uuid; v_tec uuid; v_tec2 uuid; v_tec3 uuid; v_id uuid; v_s uuid; x record;
  v_r uuid; v_nom text; v_contacto text; v_puesto text; v_ini timestamptz; i integer := 0;
  -- Rúbricas de ejemplo (trazos ficticios) para que los reportes salgan firmados.
  f1 constant text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQQAAABaBAMAAACs1TUKAAAAGFBMVEX////+/v78/Pzx8fG5ublwcHAzMzMHBwfVgEbpAAAE5UlEQVR42u1YTXeqSBClW5x1N3lv3+AkayYY3Zon6tZRsbdzkig/IED//aluvloEJGee2UxXzknOAQL3Vt26VWBZJkyYMGHChAkTJkyY+A/hkK4z1PM88g0IEPy0B1a/vgEDWfntT0FkEkYHhu+OAP8QH+1pIHYshPjw2b0h0Kc0+6stDXjEs0O4Eh93TwPZ/MO3bRDYLNvBn5XY3jsNTvw6S1qIYlvsLc9zrXVy5zSg0ZnZaYsYGE8sV0IcxX/ftymwnXkP8YK0HF/QHMvmzmnAdopdfl1uVlUH/0xRjdBxfz+EcYLJ5h1d1ScuYaEHvqcVAgD32xtiliD08yrVVJMoGWunwyX6ktQ896aQ2OaNQjFo0xi12oAsSuOgU5EtvpAGOX4wvQlhy9BINDyajlNtPjkVHsJP/AviRNYoXPrWDfkwDqxofEkNeVxXB9u850wQtMkoHp4G9hiL7PR8A4OCAKkglxpNLe0AekxxYeYJZrPBaUB2nEVHkS2tvlogJ4Ya0MZtgbZz0R4iF4OsGijD71QY9nT5sU36bOGXONtbpM8c5Q0bekQPjWSzQgyEv0LK+AfqW36Qhnxhecyyefbcb46uulhn5lyIURZgrsQA0CTecfZMOlYcO4qWrDxJ1il0A3IIYPhFepxJlZlynTbjb7TtqjxZaNIhSESmasHAjVwi8hLvWK856ppv+EDtlXKKoEd1Mdm0V4KB+sLwKAqAuJp+2PqzWz4gRNV9SDfAlrlE1UpBZp9Iwc7aLA+NePoL/pbDHTTu1Lbe588KgpQE0Sizq71G3pfM3wpJtG0xbJ35csEo/53xHbm9pMu75hXQDJnOUtwyTwFpOVEvyqbpf4fkYTZXuUIPwh+0Z8hOv7wrjIfdlZsB8VdSKEKtm/hai+sk734Jl1QSHg6hpk7HbdYjEwALVl4t2fDNStBHsXBLd1fCmb/TQRDcohthUyw7iO9Qu2bkdlMC/0TNgcQ/ypcekLOs2mbY2gvECsqM56DZOGNtcge3wtVagcfilTUGUlrlDqA6Ul0LMhBC0Ql0ru4PLw+J0zpxIM9/lNxlrtnlO0e8xbVwIKN1jyFKHU9G9+ZYPiPzXWieddoOnvC9ZppN64CBpO2XsAhS2MQcqp5cYSV9/pxXYg8WYost6vCwRPOLhnfQsViU6CTpp8Tx5u/FgVEQTMMwio4dtl5vjc4TzNQpTxDrmP3naUb1cY618QSWTWlNGtYNi++DIAxXUXSGiKJDGLbbBJlX0oZFWZzi7l2Abc6JNkfGsm4FafKS+VWlMZBeiSiK4cmnKArDZRD4vbZQvymR0VGcuvdj2fjsYquxStJ2DEmfFKSPkjRP1mkQBNom0/mxhGlDGjEcsL71JlRjvZS3LXYlaQ6ko5J0KEmPk9knnFRXupT2dSflWuJBBbhr0YR8e/KO1flJwLNwdZKkYUE8qHzX2+8kjrfw6EG2cFF7dA23JF2dKOQtScfiBKQna3gDLxStLpWkyezkDjImNfl7TmukR7LSYVHpgvQUpGPZICC/yLdGBvtDt+wfhxvTTJFelZU+5JUu40WIswAEbTPlS6993VUqSeedVdlSLbLp6hwt/bZvcmjwJwnE+iAo0s+XnaXLG4ZJ8C1fBXs6y4EuccmdH05vdBa1TJgwYcKECRMmTJgwYeJ/Ev8Cnb0PDefDSA0AAAAASUVORK5CYII=';
  f2 constant text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQQAAABaBAMAAACs1TUKAAAAGFBMVEX////+/v78/Pzy8vK6urpwcHA1NTUHBwd8byMWAAAFPElEQVR42u1YTVujPBRNAuwTfN0HdFyj1HZbR1q21dqynrEtP2AK+fvvDZ8BgtWn2lXuSqHkfuScc2+CkDFjxowZM2bMmDFjxr5sbOwF9i4UAR59wxG9TAj0ZiQIbD3jyxTh6sD0yfJl/kQvE0K64voiiPRIzi/yZ34zy7SO6DK7zc7cCez6xPdP/ozY4l4TKr5J5ySdn7UTGMobIOSeXIQnup0gdo55vKJnRWBNNvtNhPCpVbz4XVNvtjy6dPbOzgiBW1shUiF2wSlIYSd/GIZJkxVld//OAAOxlmL/HEZLkQXsFGY0nIB98Chx+pRgXxBZuhS74o9FukP8FCeGyWLpnTiZqz50vXFo4T793Fvxxl2P+R56FOsTWwGeBiHwGGCA7TxQFoZwwtHGQcM+FuNdJf6+tc1PUAvUac4HUIBHsEVKCBhNtod9oK8ptg9PnRfUyQOv+phayZG0CxGqpSUdQEGKBU+U2OhjKg4ie9bWlMV5BzeQ1jtpK2KL1cdtl037sMPXhWSqIYCEZc/hJM3nTAvp6KB2FOZkQRs9ptNjgxW+0LQeYndhBxnHhSKANvG2VBkoHbpNjhrdB9TQ5EX1maxwh6BpLTG6bdc9rRSTx39ZW4Q58ZiL7HTNNNpyZPG6deoCwjuB8sesggDssY7aiqsmJvkBnTZ0lZslHzE+zT06XOAPu1NEFlJgPc7WZQH+kU+AQTaI4sO7+jn2k9cSUIT0ly8I9OQrIlKhueOiBged6vrB4JM6pFYeidPkTp3M1xCIWfuGwTweTBqAjvIZ03bFgUZ7JRolTkm96D/W/riPp4JArHlMupJWpWXnT1BH8p/Qz2K9sOv+3YQAI1Tr1hvkWEg8j1/pGMmLMsQZDBBtVsO5RckMeme5L9iq/mBT5UNsDwn0QttN1vY96SN9xT4k64MNhapFW+FwdqyTP5QV5eprxHtZlltDrqunzMmHGsyY5NIcwR5VJ4QBpNVVmzkKyFmEgK+EurkgNJ0ylO0MV5gG4CmTDriWWZcDZJJtkt0kirab7RAsxGk5gf20bjmVQve5zOPOOFW9puWP3esM9LPjGiwMwfVSiPxw2GzfoojrdqLZP4WiVT1ob7Yj1x1eQglxERggAjOUvCiub8KwyPoArjfg+jkMRge91gudHXE3XSrhNq7oUlwxZD179yGyx5zWrhebDbjeS9dh+NBkq1ano/K1iKsFgQEWl3yhPRY2sgmuAay+/MLJELLCNIsW+9L1XmbdzDKFa4/RjyZINpBK/EsWpMG6SrC558olpWuJcguyXuQy61zrGrBx+oxft3Q+ax2WCq2iD7KWroGX5f/S9VJUBU/zKErXvaw/fw6Aaq/dknErZU6RIfgS6qVrv35l53Kvy4KnddZ2uk8y5H7VdQuqRY7kiKwqRNHcO02MFOzabLZCQrxwDbQphwQf5nbtUPX5u47kDfmoAz2QxzkFdXYr1xW7JLEfs5pdtvhdZU3Q5PdZh3HfEWs0SboNazvnHNSO2LXrsCZ2QX9w7U7bMwBD593M4KskB0QF3ba98qQIYKtxjUjpGijIe328OO2cdx1hb+EUiLuK9QpzoK9oCquIDa1gLedDcnXmFUCvpVth744LOrBXyC9mbDCKwUBLMXcygr7PCLTcbiXxrwyN3QTBDBIQbqV/2TeGALnSwY3TIr/XF5rZ6W5uxdn9D1+K0Visx7LkS5HBifWnrwax/RbQ0UuMKM3X+IeLIHmOP3g3eTh1e/EdEPXHs8TA1ktdVI+ay5AxY8aMGTNmzJgxY8YuZf8D9v0h/7p+z0YAAAAASUVORK5CYII=';
  f3 constant text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQQAAABaBAMAAACs1TUKAAAAGFBMVEX////+/v78/Pzy8vK4uLhvb28xMTEHBwdqyuX0AAAFj0lEQVR42u1YQVurOhBN0vauk6j7gNU1XlrvtvdJ7VafrextCz/AAn//DUmAEEL1fr7a972PWVmtZObMOWcmIDTEEEMMMcQQQwwxxP8yMD13Bj7F3nkz8NAoQGfNgaFlsn9A4ls736oYo2WRp/kL+c4UKDLZx+bFLpzF+eIbYcCjdUsM6S5AaJxmDhjIiRhC74sXVn/iNxkijNFZ6oThJGrFF+nroalYrJ44nEPQ/aEDA7lc41OkQK7yScaarujq+agLg1gVC3qSPhwukoA2fdDFiw4M+DKJt6eAQazeRFwXLFZbjQgZF0G7ZDLJfuxOoVWaLrz4SVh9kNnssIXX9jI7QQp4nN8BBfW57L45g9/kdy0YvMencX4CWeKrA4HyNPo03jbMJBYhRfx7lAT/Ph/Z7TuGFLDuf24cASzBLQtLFxepQxKMfZEKv94YvjlgDYnZa3KT+caBZJwxET/bSuVeOd3/YAh2BQFUJBOtP/pry9plCxMvaNnKViVHKAwdzt2TFHZ644JCfbzOp6VX0xrK49mtlQJH09ck2QT2kaRv8Qo7v4fuexRrCmCr1fKPBl7PDV7VN1CUFklSZA/YKjZwqhdPHbY/ge5jTXT40HoS9g1UMIe22CmIOZwehvPUmu10sndKB6bBHe3Y8zuc6il7pLYnM+MXEipomfkNNk73QfnDLG01CF/Exc6lE6jjqTt5nmmJsUwBLIrabaqLUXi1VIvRKl9gjzGO5oUJA/zfMvPc46AzZZg8XNmjhNrWy9+eIQjrK2wO+x1VrFyZ8ACcyO1hUAi3NyY5i3QKrRLtTig9GhOtzGdbKaE928Xjm+ceqeTSJkNpN/LxpeOQq84QghSrJ6tZJlaNN7FJJmq0W7O9TLRHlDS2kC4nhJqBWMKHu717x42BVFhUnHtvTiUmDDztXW2abaC2Z3mCSgFmAnP4hgJOe4SRJr9vKVH8qmHAR6YZtmStBYHUkOCOjbW2Bj3GjWYBVbErWdlen/kQjjyMr5mCQNJxSJeNBiGF2tkaypZblbCSBWZgxn3/6lCZp4sMLWfQglApwJjkrqyLwFNUEEoFv9UT6KPtY7cZ8X35xx+HMIyizca1aVrOoAWBpOnBmHQJCcqH+2WNXzXJ+LSotz0mUUdASIRG4SxaxnmS7Dfr6C8nGVq604JQ8Fpjsmb3tHghPq2UUUkCNkufStR9/V/XYXx43ZRzc/O6fgj7L28tymlBSNPzLpI7J40puDAa51pmOmsOSVd0Iwr1BCbmLnoIfyIUAxxGch3HFR1BSC/xJz3bMYf7ZRRvSW1v8GwPrbZIo64KX8PhQbyVb0iu859e/zJnzr6aY9Khvfv3vmvKtCiyQKiOC1J2HM1yXfhmE0VhWFMXzmbk+KrfkmXzofTd+LnHTgidbYAO6sMojNfL/SbJ96pw/WqoRIaxazmKwX3w8UusMWeuKkhgbXAaU5tuZeGvSVpsotfipXIDiHqFZlKo1OGylumzho317W2STbK71mLeuBuBjkvUVeGz9GUOI5LLwmln8IrK746QoWlUI0NQpVadKtyrUG/RTX95XhT7wOspcEeYSI/fd4AyVY7mtspi2QdeoV7pbN+imyycj5b7RU+z2bQoBewdv1eIuLk7N9squ9mr/6sLd9CN1lcE0ncG2Ha42n1wvYJOcMdyigL5AIV6u3DfurFhrzeDcm3I84/unYYSTRliubpEyt2kIzno9pnXFctk/eELgGoDaOnTvIE5Cv+Dmzq6/vidGNXrjUmF2oxLg/naPZl/4t1xuZroi8sXT/v03dmlCYCBOC423xZ8mi/AACaZT8+VAph4htD4NC/wPvu2c5yuozhD5wOhvHAVRfHCz5gBIiTaRGcFQfkQO2sGctNAQwwxxBBDDDHEEP+p+Af8TTxOLtpa/AAAAABJRU5ErkJggg==';
  c_plaza uuid := gen_random_uuid(); c_hosp uuid := gen_random_uuid();
  c_torre uuid := gen_random_uuid(); c_ind uuid := gen_random_uuid();
  c_cole uuid := gen_random_uuid(); c_hotel uuid := gen_random_uuid();
  s1 uuid := gen_random_uuid(); s2 uuid := gen_random_uuid(); s3 uuid := gen_random_uuid();
  s4 uuid := gen_random_uuid(); s5 uuid := gen_random_uuid(); s6 uuid := gen_random_uuid();
  s7 uuid := gen_random_uuid(); s8 uuid := gen_random_uuid();
  r1 uuid := gen_random_uuid(); r2 uuid := gen_random_uuid(); r3 uuid := gen_random_uuid();
  r4 uuid := gen_random_uuid(); r5 uuid := gen_random_uuid();
  q1 uuid := gen_random_uuid(); q2 uuid := gen_random_uuid(); q3 uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  sis_cctv uuid; sis_inc uuid; sis_acc uuid;
  a record;
begin
  -- ---------- Seguro ----------
  -- 1) La marca del demo: crear-usuarios-demo.mjs guarda aquí la cuenta de
  --    la supervisora con la secret key del demo. En una base real esta
  --    tabla está vacía (o no existe la cuenta) y no se toca nada.
  if not exists (
    select 1 from public.demo_accesos d join auth.users u on u.email = d.email
    where d.email = 'supervisor' || dominio
  ) then
    raise exception 'reiniciar_demo() solo corre en la instalación demo (falta la marca en demo_accesos)';
  end if;
  -- 2) Un demo puede tener alguna cuenta creada por visitantes (se borran
  --    abajo), pero una base con varias cuentas ajenas no es el demo.
  if (select count(*) from auth.users where lower(email) not like '%' || dominio) > 5 then
    raise exception 'reiniciar_demo(): hay demasiadas cuentas que no son %; esto no parece el demo', dominio;
  end if;

  select id into v_sup from auth.users where email = 'supervisor' || dominio;
  select id into v_tec from auth.users where email = 'tecnico' || dominio;
  select id into v_tec2 from auth.users where email = 'tecnico2' || dominio;
  select id into v_tec3 from auth.users where email = 'tecnico3' || dominio;
  if v_sup is null or v_tec is null or v_tec2 is null or v_tec3 is null then
    raise exception 'Faltan usuarios demo: corre scripts/instalacion/crear-usuarios-demo.mjs';
  end if;

  -- ---------- Contraseñas de acceso rápido ----------
  -- Por si un visitante las cambió. Si la base no deja tocar auth.users,
  -- se sigue con el resto del reinicio.
  begin
    update auth.users u
       set encrypted_password = extensions.crypt(d.contrasena, extensions.gen_salt('bf'))
      from public.demo_accesos d
     where u.email = d.email;
  exception when others then
    raise notice 'No se pudieron restablecer contraseñas: %', sqlerrm;
  end;

  -- ---------- Borrar la operación ----------
  foreach t in array array[
    'factura_reportes', 'facturas', 'cotizacion_lineas', 'proyecto_cotizaciones', 'cotizaciones',
    'servicio_insumo_estado', 'servicio_insumos', 'servicio_resguardos', 'servicio_tareas',
    'servicio_eventos', 'servicio_auditoria', 'servicio_avisos', 'servicio_tecnicos',
    'actividad_eventos', 'actividades', 'levantamiento_sistemas', 'levantamientos',
    'almacen_conteo_items', 'almacen_conteos', 'almacen_vale_items', 'almacen_vales',
    'almacen_movimientos', 'almacen_traspasos', 'almacen_equipos_instalados',
    'almacen_altas_solicitadas', 'almacen_articulos', 'almacen_ubicaciones',
    'mantenimientos_recurrentes', 'rutinas_tareas', 'plantillas_insumos',
    'solicitudes_personal', 'justificaciones_dia', 'proyecto_documentos', 'proyectos',
    'cliente_alias', 'cliente_duplicado_descartado', 'cliente_contactos',
    'auditoria_descargas', 'auditoria_global', 'vehiculos'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('truncate table public.%I cascade', t);
    end if;
  end loop;
  -- reports y servicios se referencian entre sí: se vacían juntos.
  truncate table public.reports, public.servicios_programados, public.clientes cascade;

  -- ---------- Cuentas creadas por visitantes ----------
  -- Ya sin operación que las referencie. Si la base no deja borrar de
  -- auth.users, se desactivan y el reinicio sigue.
  begin
    delete from public.profiles p using auth.users u
      where u.id = p.id and lower(u.email) not like '%' || dominio;
    delete from auth.users where lower(email) not like '%' || dominio;
  exception when others then
    raise notice 'No se pudieron borrar cuentas de visitantes: %', sqlerrm;
    update public.profiles p set activo = false from auth.users u
      where u.id = p.id and lower(u.email) not like '%' || dominio;
  end;

  -- ---------- Personal ----------
  update public.profiles set full_name = 'Laura Méndez', role = 'supervisor', puesto = 'Coordinadora de servicio',
    telefono = '3310000001', activo = true, es_cuenta_prueba = false, credenciales_actualizadas = true,
    can_manage_usuarios = true, can_manage_almacen = true, can_manage_billing = true,
    can_approve_review = true, can_approve_cotizacion = true, can_approve_personal = true
  where id = v_sup;
  update public.profiles set full_name = 'Jorge Ramírez', role = 'tecnico', puesto = 'Técnico de campo',
    telefono = '3310000002', activo = true, es_cuenta_prueba = false, credenciales_actualizadas = true,
    especialidades = array['CCTV', 'Control de acceso']
  where id = v_tec;
  update public.profiles set full_name = 'Miguel Torres', role = 'tecnico', puesto = 'Técnico de campo',
    telefono = '3310000003', activo = true, es_cuenta_prueba = false, credenciales_actualizadas = true,
    especialidades = array['Red contra incendio', 'Alarma&Det']
  where id = v_tec2;
  update public.profiles set full_name = 'Daniel Ortiz', role = 'tecnico', puesto = 'Auxiliar técnico',
    telefono = '3310000004', activo = true, es_cuenta_prueba = false, credenciales_actualizadas = true,
    especialidades = array['Inst. eléctricas']
  where id = v_tec3;

  -- Más técnicos (tecnico4…tecnico15) para que el supervisor vea la app con
  -- una plantilla completa. No inician sesión; si alguno no existe, se omite.
  for x in
    select * from (values
      (4, 'Luis Hernández', 'Técnico de campo', array['CCTV', 'Redes']),
      (5, 'Carlos Mendoza', 'Técnico de campo', array['Control de acceso']),
      (6, 'Fernando Aguilar', 'Especialista en incendio', array['Red contra incendio', 'Supresión']),
      (7, 'Rebeca Peña', 'Técnico de campo', array['Alarma intrusión', 'CCTV']),
      (8, 'Óscar Villanueva', 'Técnico electricista', array['Inst. eléctricas', 'Paneles solares']),
      (9, 'Héctor Salazar', 'Técnico de campo', array['CCTV']),
      (10, 'Ivonne Castillo', 'Auxiliar técnico', array['Control de acceso']),
      (11, 'Raúl Domínguez', 'Técnico de campo', array['Alarma&Det']),
      (12, 'Sergio Paredes', 'Técnico especialista', array['Automatización']),
      (13, 'Adriana Fuentes', 'Auxiliar técnico', array['CCTV']),
      (14, 'Marco Rosales', 'Técnico de campo', array['Red contra incendio']),
      (15, 'Emilio Carrillo', 'Auxiliar técnico', array['Inst. eléctricas'])
    ) v(n, nombre, puesto, esp)
  loop
    update public.profiles p set full_name = x.nombre, role = 'tecnico', puesto = x.puesto,
      telefono = '33100001' || lpad(x.n::text, 2, '0'), activo = true, es_cuenta_prueba = false,
      credenciales_actualizadas = true, especialidades = x.esp
    from auth.users u
    where u.id = p.id and u.email = 'tecnico' || x.n || dominio;
  end loop;

  -- Figuras del avatar (si la base ya tiene patch_perfil_ampliado.sql): el
  -- equipo de ejemplo tiene mujeres y hombres.
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_estilo') then
    update public.profiles p set avatar_estilo = v.estilo, avatar_color = v.color
    from (values
      ('supervisor', 2, 4), ('tecnico', 0, 1), ('tecnico2', 3, 2), ('tecnico3', 0, 5),
      ('tecnico4', 0, 6), ('tecnico5', 3, 8), ('tecnico6', 0, 3), ('tecnico7', 1, 4),
      ('tecnico8', 0, 7), ('tecnico9', 0, 0), ('tecnico10', 2, 3), ('tecnico11', 3, 9),
      ('tecnico12', 0, 6), ('tecnico13', 1, 0), ('tecnico14', 0, 2), ('tecnico15', 0, 5)
    ) v(usuario, estilo, color)
    join auth.users u on u.email = v.usuario || dominio
    where p.id = u.id;

    -- Ficha de emergencia y tallas (datos ficticios). Dos personas quedan
    -- sin registrar, para que se vea el aviso en Personal → Equipo.
    update public.profiles p set
      emergencia_nombre = v.contacto, emergencia_telefono = v.tel,
      tipo_sangre = v.sangre, alergias = v.alergias, talla_camisa = v.camisa, talla_calzado = v.calzado
    from (values
      ('supervisor', 'Roberto Méndez (esposo)', '3350000001', 'O+', null, 'M', '24'),
      ('tecnico', 'Ana Ramírez (esposa)', '3350000002', 'A+', null, 'G', '27'),
      ('tecnico2', 'Lucía Torres (mamá)', '3350000003', 'O+', 'Alergia a la penicilina', 'M', '26.5'),
      ('tecnico3', 'Pedro Ortiz (hermano)', '3350000004', 'B+', null, 'G', '28'),
      ('tecnico4', 'Marta Hernández (esposa)', '3350000005', 'O-', null, 'XG', '27.5'),
      ('tecnico5', 'José Mendoza (papá)', '3350000006', 'A+', null, 'M', '26'),
      ('tecnico6', 'Elena Aguilar (esposa)', '3350000007', 'AB+', 'Diabetes tipo 2', 'G', '27'),
      ('tecnico7', 'Raúl Peña (esposo)', '3350000008', 'O+', null, 'CH', '23.5'),
      ('tecnico8', 'Carmen Villanueva (mamá)', '3350000009', 'A-', null, 'XG', '28.5'),
      ('tecnico10', 'Sofía Castillo (hermana)', '3350000011', 'B+', 'Alergia al látex', 'M', '24'),
      ('tecnico11', 'Laura Domínguez (esposa)', '3350000012', 'O+', null, 'G', '27'),
      ('tecnico13', 'Marcos Fuentes (papá)', '3350000014', 'A+', null, 'CH', '23'),
      ('tecnico14', 'Diana Rosales (esposa)', '3350000015', 'O+', null, 'G', '26.5'),
      ('tecnico15', 'Irma Carrillo (mamá)', '3350000016', 'B-', null, 'M', '26')
    ) v(usuario, contacto, tel, sangre, alergias, camisa, calzado)
    join auth.users u on u.email = v.usuario || dominio
    where p.id = u.id;
  end if;

  -- ---------- Cuadrillas de ejemplo ----------
  -- El primero de cada lista queda de líder. Sergio Paredes (12) se deja sin
  -- cuadrilla para mostrar también ese caso.
  if to_regclass('public.cuadrillas') is not null then
    delete from public.cuadrillas;
    for x in
      select * from (values
        ('CCTV y accesos', 1, array[1, 3, 4, 5, 9]),
        ('Incendio', 2, array[2, 6, 11, 14]),
        ('Seguridad electrónica', 3, array[7, 10, 13]),
        ('Eléctrico', 7, array[8, 15])
      ) v(nombre, color, nums)
    loop
      i := i + 1;
      insert into public.cuadrillas (nombre, color, orden) values (x.nombre, x.color, i) returning id into v_s;
      insert into public.cuadrilla_miembros (tecnico_id, cuadrilla_id)
      select u.id, v_s from unnest(x.nums) n
      join auth.users u on u.email = 'tecnico' || case when n = 1 then '' else n::text end || dominio;
      update public.cuadrillas set lider_id = (
        select u.id from auth.users u
        where u.email = 'tecnico' || case when x.nums[1] = 1 then '' else x.nums[1]::text end || dominio)
      where id = v_s;
    end loop;
    i := 0;
  end if;

  insert into public.vehiculos (nombre, placas) values
    ('Nissan NP300 blanca', 'JLX-12-34'), ('Chevrolet Tornado roja', 'JMB-56-78');

  -- ---------- Clientes ----------
  insert into public.clientes (id, nombre, created_by, tipo_persona, calle, num_exterior, colonia, codigo_postal, ciudad, estado, razon_social, rfc) values
    (c_plaza, 'Plaza Comercial Arboleda', v_sup, 'moral', 'Av. de los Robles', '1450', 'Jardines del Valle', '45130', 'Zapopan', 'Jalisco', 'INMOBILIARIA ARBOLEDA SA DE CV', 'IAR150301AB1'),
    (c_hosp, 'Hospital Santa Lucía', v_sup, 'moral', 'Calle Fresno', '220', 'Centro', '44100', 'Guadalajara', 'Jalisco', 'SERVICIOS MÉDICOS SANTA LUCÍA SC', 'SMS0905123C4'),
    (c_torre, 'Corporativo Torre Azul', v_sup, 'moral', 'Av. Patria', '3020', 'Puerta de Hierro', '45116', 'Zapopan', 'Jalisco', 'TORRE AZUL CORPORATIVO SA DE CV', 'TAC180712KL9'),
    (c_ind, 'Industrias Metálicas del Bajío', v_sup, 'moral', 'Carretera a El Salto km', '8.5', 'Parque Industrial', '45680', 'El Salto', 'Jalisco', 'INDUSTRIAS METÁLICAS DEL BAJÍO SA DE CV', 'IMB110215QW2'),
    (c_cole, 'Colegio Los Pinos', v_sup, 'moral', 'Calle Pinar', '77', 'Las Fuentes', '45070', 'Zapopan', 'Jalisco', 'EDUCACIÓN LOS PINOS AC', 'ELP000101ZX8'),
    (c_hotel, 'Hotel Real del Valle', v_sup, 'moral', 'Av. Vallarta', '5100', 'Vallarta Poniente', '44110', 'Guadalajara', 'Jalisco', 'HOTELERA REAL DEL VALLE SA DE CV', 'HRV120530RT6');

  insert into public.cliente_contactos (cliente_id, nombre, puesto, telefono, correo) values
    (c_plaza, 'Ing. Ricardo Salas', 'Gerente de mantenimiento', '3320000101', 'mantenimiento@plaza-arboleda.test'),
    (c_hosp, 'Lic. Patricia Gómez', 'Jefa de servicios generales', '3320000102', 'servicios@santalucia.test'),
    (c_torre, 'Arq. Fernando Ruiz', 'Administrador del edificio', '3320000103', 'admin@torreazul.test'),
    (c_ind, 'Ing. Sofía Navarro', 'Seguridad e higiene', '3320000104', 'seguridad@imb.test'),
    (c_cole, 'Mtra. Elena Castro', 'Dirección administrativa', '3320000105', 'administracion@lospinos.test'),
    (c_hotel, 'Sr. Andrés Vega', 'Gerente de operaciones', '3320000106', 'operaciones@realdelvalle.test');

  -- ---------- Servicios (agenda) ----------
  insert into public.servicios_programados
    (id, creado_por, proyecto, descripcion, fecha, duracion_estimada_min, hora_programada, estado, cliente_id, hora_llegada, hora_inicio, hora_fin) values
    -- concluidos (con reporte)
    (s1, v_sup, 'Hospital Santa Lucía', 'Mantenimiento preventivo de CCTV: 32 cámaras y 2 grabadores', hoy - 9, 240, '09:00', 'programado', c_hosp,
       (((hoy - 9)) + time '08:55') at time zone 'America/Mexico_City', (((hoy - 9)) + time '09:05') at time zone 'America/Mexico_City', (((hoy - 9)) + time '13:10') at time zone 'America/Mexico_City'),
    (s2, v_sup, 'Plaza Comercial Arboleda', 'Revisión de detectores de humo en zona de comida', hoy - 6, 180, '10:00', 'programado', c_plaza,
       (((hoy - 6)) + time '09:50') at time zone 'America/Mexico_City', (((hoy - 6)) + time '10:00') at time zone 'America/Mexico_City', (((hoy - 6)) + time '12:40') at time zone 'America/Mexico_City'),
    (s3, v_sup, 'Corporativo Torre Azul', 'Alta de 15 tarjetas y ajuste de horarios en control de acceso', hoy - 3, 120, '16:00', 'programado', c_torre,
       (((hoy - 3)) + time '16:05') at time zone 'America/Mexico_City', (((hoy - 3)) + time '16:10') at time zone 'America/Mexico_City', (((hoy - 3)) + time '17:45') at time zone 'America/Mexico_City'),
    (s4, v_sup, 'Industrias Metálicas del Bajío', 'Correctivo: falla en tablero de alarma contra incendio', hoy - 1, 180, '08:30', 'programado', c_ind,
       (((hoy - 1)) + time '08:40') at time zone 'America/Mexico_City', (((hoy - 1)) + time '08:50') at time zone 'America/Mexico_City', (((hoy - 1)) + time '11:30') at time zone 'America/Mexico_City'),
    -- hoy
    (s5, v_sup, 'Colegio Los Pinos', 'Instalación de 6 cámaras en accesos y patio', hoy, 600, '09:00', 'programado', c_cole,
       ((hoy) + time '08:58') at time zone 'America/Mexico_City', ((hoy) + time '09:10') at time zone 'America/Mexico_City', null),
    (s6, v_sup, 'Hotel Real del Valle', 'Revisión de cerraduras electrónicas del piso 3', hoy, 120, '15:30', 'programado', c_hotel, null, null, null),
    -- próximos
    (s7, v_sup, 'Plaza Comercial Arboleda', 'Mantenimiento preventivo de CCTV estacionamiento', hoy + 1, 240, '09:00', 'programado', c_plaza, null, null, null),
    (s8, v_sup, 'Hospital Santa Lucía', 'Prueba trimestral de bombas y red contra incendio', hoy + 3, 180, '08:00', 'programado', c_hosp, null, null, null);

  insert into public.servicio_tecnicos (servicio_id, tecnico_id, visto_en, enterado_en) values
    (s1, v_tec, now(), now()), (s1, v_tec3, now(), now()),
    (s2, v_tec2, now(), now()),
    (s3, v_tec, now(), now()),
    (s4, v_tec2, now(), now()), (s4, v_tec3, now(), now()),
    (s5, v_tec, now(), now()), (s5, v_tec3, now(), now()),
    (s6, v_tec2, null, null),
    (s7, v_tec, null, null),
    (s8, v_tec2, null, null);

  -- Servicios del resto de la plantilla: hoy (en curso, en sitio y por
  -- iniciar) y mañana. Tres técnicos quedan libres.
  for x in
    select * from (values
      (4, c_plaza, 'Plaza Comercial Arboleda', 'Cambio de 2 detectores de humo en locales 8 y 11', 0, time '08:30', 'en_curso', 600),
      (5, c_torre, 'Corporativo Torre Azul', 'Instalación de lectora en acceso a sótano 2', 0, time '09:30', 'en_curso', 540),
      (6, c_ind, 'Industrias Metálicas del Bajío', 'Prueba anual de sistema de supresión en cuarto eléctrico', 0, time '10:00', 'en_sitio', 540),
      (7, c_hotel, 'Hotel Real del Valle', 'Revisión de sensores de alarma en bodega', 0, time '12:00', 'programado', 90),
      (8, c_cole, 'Colegio Los Pinos', 'Canalización eléctrica para cámaras del patio', 0, time '13:00', 'programado', 180),
      (9, c_hosp, 'Hospital Santa Lucía', 'Reemplazo de cámara 14 en pasillo de urgencias', 0, time '16:00', 'programado', 60),
      (10, c_torre, 'Corporativo Torre Azul', 'Mantenimiento de torniquetes de recepción', 1, time '09:00', 'programado', 180),
      (11, c_plaza, 'Plaza Comercial Arboleda', 'Prueba de estaciones manuales y sirenas', 1, time '11:00', 'programado', 120),
      (12, c_ind, 'Industrias Metálicas del Bajío', 'Ajuste de PLC en línea de pintura', 2, time '08:00', 'programado', 240)
    ) v(n, cli, nombre, descr, dia, hora, est, dur)
  loop
    select id into v_id from auth.users where email = 'tecnico' || x.n || dominio;
    continue when v_id is null;
    v_s := gen_random_uuid();
    insert into public.servicios_programados
      (id, grupo_id, creado_por, proyecto, descripcion, fecha, duracion_estimada_min, hora_programada, estado, cliente_id)
    values (v_s, v_s, v_sup, x.nombre, x.descr, hoy + x.dia, x.dur, x.hora, 'programado', x.cli);
    insert into public.servicio_tecnicos (servicio_id, tecnico_id, visto_en, enterado_en)
    values (v_s, v_id, case when x.dia = 0 then now() end, case when x.dia = 0 then now() end);
    if x.est <> 'programado' then
      update public.servicios_programados set
        estado = x.est,
        hora_llegada = ((hoy + x.hora) - interval '5 minutes') at time zone 'America/Mexico_City',
        hora_inicio = case when x.est = 'en_curso' then ((hoy + x.hora) + interval '10 minutes') at time zone 'America/Mexico_City' end
      where id = v_s;
    end if;
  end loop;

  -- Cada servicio es su propio «proyecto» (la app siempre llena grupo_id al
  -- agendar; sin él, la pantalla de detalle no puede buscar las tareas).
  update public.servicios_programados set grupo_id = id where grupo_id is null;

  -- El estado se pone después de asignar técnicos (la base no deja cambiar
  -- los técnicos de un servicio ya concluido).
  update public.servicios_programados set estado = 'concluido' where id in (s1, s2, s3, s4);
  update public.servicios_programados set estado = 'en_curso' where id = s5;

  -- ---------- Reportes ----------
  insert into public.reports (id, created_by, empresa_cliente, cliente_id, fecha, tipo_servicio, sub_tipo_servicio, created_at, data) values
    (r1, v_tec, 'Hospital Santa Lucía', c_hosp, hoy - 9, 'Mantenimiento', 'Preventivo', (((hoy - 9)) + time '13:20') at time zone 'America/Mexico_City',
      jsonb_build_object(
        'ingACargo', 'Jorge Ramírez', 'personal', jsonb_build_array('Jorge Ramírez', 'Daniel Ortiz'),
        'horaLlegada', '08:55', 'horaSalida', '13:10', 'contactoUsuario', 'Lic. Patricia Gómez', 'puestoArea', 'Servicios generales',
        'vehiculo', 'Nissan NP300 blanca', 'placas', 'JLX-12-34', 'manejadoPor', 'Jorge Ramírez',
        'sistemaSeguridad', jsonb_build_array('CCTV'),
        'actividades', jsonb_build_array('Limpieza de lentes y domos de 32 cámaras', 'Revisión de enfoque y ángulos de visión',
          'Verificación de grabación continua en 2 NVR (30 días de retención)', 'Actualización de firmware de grabadores'),
        'observaciones', 'Cámara 14 (pasillo urgencias) con IR débil: se recomienda reemplazo. Se entrega respaldo de configuración.',
        'equipos', jsonb_build_array(), 'tuberias', jsonb_build_array(), 'cables', jsonb_build_array(), 'soporteria', jsonb_build_array(),
        'fotos', jsonb_build_array(), 'firmaIngNombre', 'Jorge Ramírez', 'firmaClienteNombre', 'Lic. Patricia Gómez',
        'revisionEstado', 'aprobado', 'servicioConcluido', true, 'facturaEstado', 'facturado', 'fechaConcluido', hoy - 9,
        'servicioProgramadoId', s1)),
    (r2, v_tec2, 'Plaza Comercial Arboleda', c_plaza, hoy - 6, 'Mantenimiento', 'Preventivo', (((hoy - 6)) + time '12:50') at time zone 'America/Mexico_City',
      jsonb_build_object(
        'ingACargo', 'Miguel Torres', 'personal', jsonb_build_array('Miguel Torres'),
        'horaLlegada', '09:50', 'horaSalida', '12:40', 'contactoUsuario', 'Ing. Ricardo Salas', 'puestoArea', 'Mantenimiento',
        'vehiculo', 'Chevrolet Tornado roja', 'placas', 'JMB-56-78', 'manejadoPor', 'Miguel Torres',
        'sistemaSeguridad', jsonb_build_array('Alarma&Det'),
        'actividades', jsonb_build_array('Prueba funcional de 24 detectores de humo con aerosol', 'Limpieza de cámaras de detección',
          'Revisión de baterías del panel'),
        'observaciones', '2 detectores con respuesta lenta en local 8 y 11: se cambian en la siguiente visita.',
        'equipos', jsonb_build_array(), 'tuberias', jsonb_build_array(), 'cables', jsonb_build_array(), 'soporteria', jsonb_build_array(),
        'fotos', jsonb_build_array(), 'firmaIngNombre', 'Miguel Torres', 'firmaClienteNombre', 'Ing. Ricardo Salas',
        'revisionEstado', 'aprobado', 'servicioConcluido', true, 'facturaEstado', 'pendiente', 'fechaConcluido', hoy - 6,
        'servicioProgramadoId', s2)),
    (r3, v_tec, 'Corporativo Torre Azul', c_torre, hoy - 3, 'Otro', null, (((hoy - 3)) + time '17:50') at time zone 'America/Mexico_City',
      jsonb_build_object(
        'ingACargo', 'Jorge Ramírez', 'personal', jsonb_build_array('Jorge Ramírez'),
        'horaLlegada', '16:05', 'horaSalida', '17:45', 'contactoUsuario', 'Arq. Fernando Ruiz', 'puestoArea', 'Administración',
        'tipoServicioOtroTexto', 'Configuración', 'sistemaSeguridad', jsonb_build_array('Control de acceso'),
        'actividades', jsonb_build_array('Alta de 15 tarjetas de proximidad', 'Ajuste de horarios de acceso a estacionamiento'),
        'observaciones', 'Se capacita al administrador para dar de alta tarjetas.',
        'equipos', jsonb_build_array(jsonb_build_object('cant', '15', 'desc', 'Tarjeta de proximidad', 'marca', 'ZKTeco', 'modelo', 'ID-CARD', 'serie', '')),
        'tuberias', jsonb_build_array(), 'cables', jsonb_build_array(), 'soporteria', jsonb_build_array(),
        'fotos', jsonb_build_array(), 'firmaIngNombre', 'Jorge Ramírez', 'firmaClienteNombre', 'Arq. Fernando Ruiz',
        'revisionEstado', 'pendiente', 'servicioConcluido', true, 'facturaEstado', 'pendiente', 'fechaConcluido', hoy - 3,
        'servicioProgramadoId', s3)),
    (r4, v_tec2, 'Industrias Metálicas del Bajío', c_ind, hoy - 1, 'Mantenimiento', 'Correctivo', (((hoy - 1)) + time '11:40') at time zone 'America/Mexico_City',
      jsonb_build_object(
        'ingACargo', 'Miguel Torres', 'personal', jsonb_build_array('Miguel Torres', 'Daniel Ortiz'),
        'horaLlegada', '08:40', 'horaSalida', '11:30', 'contactoUsuario', 'Ing. Sofía Navarro', 'puestoArea', 'Seguridad e higiene',
        'vehiculo', 'Chevrolet Tornado roja', 'placas', 'JMB-56-78', 'manejadoPor', 'Daniel Ortiz',
        'sistemaSeguridad', jsonb_build_array('Alarma&Det', 'Red contra incendio'),
        'actividades', jsonb_build_array('Diagnóstico de falla a tierra en lazo 2', 'Reemplazo de módulo de monitoreo dañado por humedad',
          'Prueba de sirenas y estrobos en nave 1'),
        'observaciones', 'Se sella caja de registro para evitar filtración. Sistema queda en estado normal.',
        'equipos', jsonb_build_array(jsonb_build_object('cant', '1', 'desc', 'Módulo de monitoreo', 'marca', 'Notifier', 'modelo', 'FMM-1', 'serie', 'NT-88213')),
        'tuberias', jsonb_build_array(), 'cables', jsonb_build_array(), 'soporteria', jsonb_build_array(),
        'fotos', jsonb_build_array(), 'firmaIngNombre', 'Miguel Torres', 'firmaClienteNombre', 'Ing. Sofía Navarro',
        'revisionEstado', 'pendiente', 'servicioConcluido', true, 'facturaEstado', 'pendiente', 'fechaConcluido', hoy - 1,
        'servicioProgramadoId', s4)),
    (r5, v_tec, 'Hotel Real del Valle', c_hotel, hoy - 12, 'Instalación nueva', null, (((hoy - 12)) + time '18:10') at time zone 'America/Mexico_City',
      jsonb_build_object(
        'ingACargo', 'Jorge Ramírez', 'personal', jsonb_build_array('Jorge Ramírez', 'Daniel Ortiz'),
        'horaLlegada', '09:00', 'horaSalida', '18:00', 'contactoUsuario', 'Sr. Andrés Vega', 'puestoArea', 'Operaciones',
        'sistemaSeguridad', jsonb_build_array('CCTV'),
        'actividades', jsonb_build_array('Instalación de 8 cámaras en lobby y estacionamiento', 'Configuración de NVR y acceso remoto en celular del gerente'),
        'observaciones', 'Queda pendiente 1 cámara en rampa por falta de canalización (se cotiza aparte).',
        'equipos', jsonb_build_array(
          jsonb_build_object('cant', '8', 'desc', 'Cámara bala 4 MP', 'marca', 'Hikvision', 'modelo', 'DS-2CD1043G2', 'serie', ''),
          jsonb_build_object('cant', '1', 'desc', 'NVR 16 canales', 'marca', 'Hikvision', 'modelo', 'DS-7616NI', 'serie', 'HK-55120')),
        'tuberias', jsonb_build_array(), 'cables', jsonb_build_array(jsonb_build_object('tipo', 'UTP Cat 6', 'calibre', '', 'cantidad', '240', 'unidad', 'm', 'metros', '240')),
        'soporteria', jsonb_build_array(),
        'fotos', jsonb_build_array(), 'firmaIngNombre', 'Jorge Ramírez', 'firmaClienteNombre', 'Sr. Andrés Vega',
        'revisionEstado', 'aprobado', 'servicioConcluido', false, 'facturaEstado', null, 'fechaConcluido', null));

  update public.servicios_programados set report_id = r1 where id = s1;
  update public.servicios_programados set report_id = r2 where id = s2;
  update public.servicios_programados set report_id = r3 where id = s3;
  update public.servicios_programados set report_id = r4 where id = s4;

  -- Firmas de los reportes anteriores: técnico siempre; cliente en casi
  -- todos (uno queda pendiente de firma, como ejemplo); revisión en los ya
  -- aprobados.
  update public.reports set data = data || jsonb_build_object('firmaIngData', f1) where id in (r1, r2, r3, r4, r5);
  update public.reports set data = data || jsonb_build_object('firmaClienteData', f2) where id in (r1, r2, r3, r5);
  update public.reports set data = data || jsonb_build_object(
    'firmaRevisionData', f3, 'firmaRevisionNombre', 'Ing. Laura Méndez', 'firmaRevisionFecha', hoy - 1)
  where id in (r1, r2, r5);

  -- De los cinco reportes anteriores, dos conservan su observación (r1 y
  -- r4); los demás quedan conformes para que la gráfica de conformidad del
  -- cliente muestre una operación sana con algunos casos por revisar.
  update public.reports set data = data || jsonb_build_object('observaciones', '') where id in (r2, r3, r5);

  -- ---------- Una semana de actividad de toda la plantilla ----------
  -- Servicios ya concluidos con sus tiempos reales y su reporte, para que
  -- los indicadores del Resumen (hoy, semana, técnicos activos, tiempos,
  -- conformidad) se vean como en una operación en marcha.
  for x in
    select * from (values
      (4, c_plaza, 'Plaza Comercial Arboleda', -5, time '09:00', 120, 110, 'Mantenimiento', 'Preventivo', 'CCTV',
         'Limpieza y ajuste de 18 cámaras del estacionamiento', 'Verificación de grabación y respaldo de NVR', 'Sin novedades. Se recomienda cambiar 2 fuentes en el siguiente mantenimiento.'),
      (5, c_torre, 'Corporativo Torre Azul', -5, time '11:00', 90, 100, 'Mantenimiento', 'Correctivo', 'Control de acceso',
         'Reemplazo de electroimán en puerta de site', 'Prueba de apertura con tarjeta y botón de salida', 'Electroimán dañado por golpe; queda operando.'),
      (6, c_ind, 'Industrias Metálicas del Bajío', -4, time '08:00', 240, 260, 'Mantenimiento', 'Preventivo', 'Red contra incendio',
         'Prueba de bomba principal y jockey', 'Revisión de presión en 12 hidrantes', 'Hidrante 7 con fuga leve en válvula: se cotiza reparación.'),
      (7, c_hotel, 'Hotel Real del Valle', -4, time '10:00', 120, 95, 'Instalación nueva', null, 'Alarma intrusión',
         'Instalación de 6 sensores de movimiento en bodega', 'Alta de zonas y prueba de comunicación con el panel', 'Sistema entregado y explicado al gerente.'),
      (8, c_cole, 'Colegio Los Pinos', -3, time '09:00', 180, 200, 'Instalación nueva', null, 'Inst. eléctricas',
         'Tendido de 60 m de tubería conduit', 'Cableado y conexión de 4 contactos regulados', 'Pendiente pintura de canalización por parte del colegio.'),
      (9, c_hosp, 'Hospital Santa Lucía', -3, time '13:00', 60, 55, 'Mantenimiento', 'Correctivo', 'CCTV',
         'Reemplazo de cámara en acceso de ambulancias', 'Ajuste de ángulo y prueba nocturna', 'Cámara anterior con sensor dañado; se retira.'),
      (10, c_torre, 'Corporativo Torre Azul', -2, time '09:30', 120, 130, 'Mantenimiento', 'Preventivo', 'Control de acceso',
         'Lubricación y ajuste de 4 torniquetes', 'Respaldo de base de datos de tarjetas', 'Torniquete 2 con desgaste en brazo: vigilar.'),
      (11, c_plaza, 'Plaza Comercial Arboleda', -2, time '12:00', 120, 115, 'Mantenimiento', 'Preventivo', 'Alarma&Det',
         'Prueba de 16 estaciones manuales', 'Prueba de sirenas y estrobos por zona', 'Todas las estaciones responden correctamente.'),
      (12, c_ind, 'Industrias Metálicas del Bajío', -1, time '08:00', 180, 170, 'Mantenimiento', 'Correctivo', 'Automatización',
         'Diagnóstico de falla en variador de línea 2', 'Reprogramación de rampa de arranque', 'Línea operando; se recomienda refacción de respaldo.'),
      (13, c_hotel, 'Hotel Real del Valle', -1, time '15:00', 90, 120, 'Mantenimiento', 'Correctivo', 'CCTV',
         'Revisión de pérdida de video en 3 cámaras del lobby', 'Cambio de conectores y de un tramo de cable', 'Falla por conectores sulfatados.'),
      (14, c_hosp, 'Hospital Santa Lucía', 0, time '07:00', 90, 80, 'Mantenimiento', 'Preventivo', 'Red contra incendio',
         'Inspección mensual de 24 extintores', 'Revisión de gabinetes y señalización', '2 extintores próximos a vencer: se programa recarga.'),
      (15, c_cole, 'Colegio Los Pinos', 0, time '07:30', 60, 70, 'Mantenimiento', 'Correctivo', 'Inst. eléctricas',
         'Cambio de pastilla térmica en tablero de laboratorio', 'Medición de carga por circuito', 'Circuito de laboratorio al 80% de su capacidad.')
    ) v(n, cli, nombre, dia, hora, est, real_min, tipo, sub, sistema, act1, act2, obs)
  loop
    i := i + 1;
    select u.id, p.full_name into v_id, v_nom from auth.users u join public.profiles p on p.id = u.id
      where u.email = 'tecnico' || x.n || dominio;
    continue when v_id is null;
    select c.nombre, c.puesto into v_contacto, v_puesto from public.cliente_contactos c where c.cliente_id = x.cli limit 1;
    v_s := gen_random_uuid();
    v_r := gen_random_uuid();
    v_ini := ((hoy + x.dia) + x.hora) at time zone 'America/Mexico_City';

    insert into public.servicios_programados
      (id, grupo_id, creado_por, proyecto, descripcion, fecha, duracion_estimada_min, hora_programada, estado, cliente_id)
    values (v_s, v_s, v_sup, x.nombre, x.act1, hoy + x.dia, x.est, x.hora, 'programado', x.cli);
    insert into public.servicio_tecnicos (servicio_id, tecnico_id, visto_en, enterado_en)
    values (v_s, v_id, v_ini - interval '1 day', v_ini - interval '1 day');
    update public.servicios_programados set
      estado = 'concluido',
      hora_llegada = v_ini - make_interval(mins => (i % 4) * 4),
      hora_inicio = v_ini + make_interval(mins => 6 + (i % 3) * 5),
      hora_fin = v_ini + make_interval(mins => 6 + (i % 3) * 5 + x.real_min)
    where id = v_s;

    insert into public.reports (id, created_by, empresa_cliente, cliente_id, fecha, tipo_servicio, sub_tipo_servicio, created_at, data)
    values (v_r, v_id, x.nombre, x.cli, hoy + x.dia, x.tipo, x.sub,
      v_ini + make_interval(mins => 20 + x.real_min),
      jsonb_build_object(
        'ingACargo', v_nom, 'personal', jsonb_build_array(v_nom),
        'horaLlegada', to_char(x.hora, 'HH24:MI'), 'horaSalida', to_char(x.hora + make_interval(mins => 10 + x.real_min), 'HH24:MI'),
        'contactoUsuario', v_contacto, 'puestoArea', v_puesto,
        'sistemaSeguridad', jsonb_build_array(x.sistema),
        'actividades', jsonb_build_array(x.act1, x.act2),
        -- Solo uno de estos lleva observación: en la app «con observaciones»
        -- significa que el cliente firmó pero dejó algo anotado.
        'observaciones', case when i = 3 then x.obs else '' end,
        'equipos', jsonb_build_array(), 'tuberias', jsonb_build_array(), 'cables', jsonb_build_array(), 'soporteria', jsonb_build_array(),
        'fotos', jsonb_build_array(), 'firmaIngNombre', v_nom, 'firmaIngData', f1,
        'firmaClienteNombre', v_contacto,
        -- Dos reportes quedan sin firma del cliente, como ejemplo de pendientes.
        'firmaClienteData', case when i in (5, 12) then null else f2 end,
        'servicioConcluido', true, 'fechaConcluido', hoy + x.dia,
        'facturaEstado', case when x.dia < -2 or (i % 2 = 0 and x.dia < 0) then 'facturado' else 'pendiente' end,
        'servicioProgramadoId', v_s)
      -- Los de los últimos dos días aún no los revisa la supervisora.
      || case when x.dia < -1 then jsonb_build_object(
           'revisionEstado', 'aprobado', 'firmaRevisionData', f3,
           'firmaRevisionNombre', 'Ing. Laura Méndez', 'firmaRevisionFecha', hoy + x.dia + 1)
         else jsonb_build_object('revisionEstado', 'pendiente') end);
    update public.servicios_programados set report_id = v_r where id = v_s;
  end loop;

  -- ---------- Cotizaciones ----------
  insert into public.cotizaciones (id, folio, created_by, fecha, atencion, empresa, cliente_id, telefono, correo, estado, firmante_nombre, notas) values
    (q1, 'COT-0001', v_sup, hoy - 5, 'Sr. Andrés Vega', 'Hotel Real del Valle', c_hotel, '3320000106', 'operaciones@realdelvalle.test', 'enviada', 'Laura Méndez', null),
    (q2, 'COT-0002', v_sup, hoy - 2, 'Ing. Sofía Navarro', 'Industrias Metálicas del Bajío', c_ind, '3320000104', 'seguridad@imb.test', 'aprobada', 'Laura Méndez', null),
    (q3, 'COT-0003', v_sup, hoy, 'Mtra. Elena Castro', 'Colegio Los Pinos', c_cole, '3320000105', 'administracion@lospinos.test', 'borrador', 'Laura Méndez', 'Incluye capacitación al personal de vigilancia.');

  insert into public.cotizacion_lineas (cotizacion_id, sistema, orden, descripcion, unidad, cantidad, costo, margen_pct, precio_unitario, importe) values
    (q1, 'CCTV', 0, 'Cámara bala 4 MP con IR 30 m', 'Pza', 1, 1450, 35, 1957.50, 1957.50),
    (q1, 'CCTV', 1, 'Canalización con tubo conduit 3/4" en rampa', 'm', 25, 95, 40, 133.00, 3325.00),
    (q1, 'CCTV', 2, 'Mano de obra de instalación y configuración', 'Servicio', 1, 1200, 50, 1800.00, 1800.00),
    (q2, 'Alarma&Det', 0, 'Detector de humo fotoeléctrico direccionable', 'Pza', 12, 980, 35, 1323.00, 15876.00),
    (q2, 'Alarma&Det', 1, 'Módulo de monitoreo', 'Pza', 4, 1650, 35, 2227.50, 8910.00),
    (q2, 'Alarma&Det', 2, 'Programación y pruebas del sistema', 'Servicio', 1, 2500, 45, 3625.00, 3625.00),
    (q3, 'CCTV', 0, 'Cámara domo 4 MP antivandálica', 'Pza', 6, 1580, 35, 2133.00, 12798.00),
    (q3, 'CCTV', 1, 'Cable UTP Cat 6 exterior', 'm', 180, 14, 40, 19.60, 3528.00),
    (q3, 'CCTV', 2, 'Instalación, configuración y capacitación', 'Servicio', 1, 3500, 45, 5075.00, 5075.00);

  update public.cotizaciones c set
    subtotal = tot.sub, iva = round(tot.sub * 0.16, 2), total = round(tot.sub * 1.16, 2)
  from (select cotizacion_id, sum(importe) sub from public.cotizacion_lineas group by cotizacion_id) tot
  where tot.cotizacion_id = c.id;

  -- ---------- Almacén ----------
  select id into sis_cctv from public.almacen_sistemas where nombre ilike 'CCTV%' limit 1;
  select id into sis_inc from public.almacen_sistemas where nombre ilike '%incendio%' or nombre ilike 'Alarma%' limit 1;
  select id into sis_acc from public.almacen_sistemas where nombre ilike '%acceso%' limit 1;

  insert into public.almacen_ubicaciones (id, nombre, descripcion, orden) values (ub, 'Bodega principal', 'Anaquel A y B', 0);

  for a in
    select * from (values
      ('equipo', 'Cámara bala 4 MP', 'Hikvision', 'DS-2CD1043G2', 'pza', 12, 4, 1450, sis_cctv),
      ('equipo', 'Cámara domo 4 MP', 'Hikvision', 'DS-2CD1143G2', 'pza', 3, 4, 1580, sis_cctv),
      ('equipo', 'NVR 16 canales', 'Hikvision', 'DS-7616NI', 'pza', 2, 1, 6200, sis_cctv),
      ('equipo', 'Detector de humo fotoeléctrico', 'Notifier', 'FSP-951', 'pza', 18, 10, 980, sis_inc),
      ('equipo', 'Módulo de monitoreo', 'Notifier', 'FMM-1', 'pza', 5, 3, 1650, sis_inc),
      ('equipo', 'Lectora de proximidad', 'ZKTeco', 'KR600', 'pza', 6, 2, 890, sis_acc),
      ('material', 'Cable UTP Cat 6', null, null, 'm', 610, 300, 14, sis_cctv),
      ('material', 'Tubo conduit 3/4"', null, null, 'pza', 40, 20, 95, null),
      ('herramienta', 'Escalera de tijera 8 escalones', 'Truper', null, 'pza', 2, 0, null, null),
      ('herramienta', 'Taladro rotomartillo', 'Bosch', 'GSB 13 RE', 'pza', 3, 0, null, null)
    ) v(categoria, descripcion, marca, modelo, unidad, existencia, minimo, costo, sistema)
  loop
    with nuevo as (
      insert into public.almacen_articulos (categoria, descripcion, marca, modelo, unidad, minimo, costo_unitario, sistema_id, ubicacion_id, retornable, creado_por)
      values (a.categoria, a.descripcion, a.marca, a.modelo, a.unidad, a.minimo, a.costo, a.sistema, ub, a.categoria = 'herramienta', v_sup)
      returning id
    )
    insert into public.almacen_movimientos (articulo_id, tipo, cantidad, inventario, proveedor, nota, creado_por, costo_unitario)
    select id, 'entrada', a.existencia, 'general', 'Inventario inicial', 'Carga inicial del demo', v_sup, a.costo from nuevo;
  end loop;

  -- ---------- Cobertura de reportes ----------
  -- Los días hábiles sin reporte se dan por justificados para que el Control
  -- de reportes y la pantalla del técnico no arranquen llenos de pendientes.
  -- Se dejan dos personas con un día pendiente, como ejemplo de la función.
  insert into public.justificaciones_dia (tecnico_id, fecha, motivo, detalle, registrado_por)
  select c.tecnico_id, c.fecha, 'sin_servicio', null, v_sup
  from public.cobertura_dias(hoy - 30, hoy - 1) c
  where c.estado = 'sin_reporte'
    and not (c.fecha = hoy - 1 and c.tecnico_id in (
      select u.id from auth.users u where u.email in ('tecnico9' || dominio, 'tecnico13' || dominio)))
  on conflict do nothing;

  -- Los servicios de hoy, alrededor de la hora actual.
  perform public.demo_al_dia();

  return format('Demo reiniciado: %s clientes, %s servicios, %s reportes, %s cotizaciones, %s artículos',
    (select count(*) from public.clientes), (select count(*) from public.servicios_programados),
    (select count(*) from public.reports), (select count(*) from public.cotizaciones),
    (select count(*) from public.almacen_articulos));
end;
$$;

revoke all on function public.reiniciar_demo() from public, anon, authenticated;

-- Reinicio cada noche a las 3:00 de Guadalajara (9:00 UTC).
select cron.unschedule('reiniciar-demo') where exists (select 1 from cron.job where jobname = 'reiniciar-demo');
select cron.schedule('reiniciar-demo', '0 9 * * *', 'select public.reiniciar_demo()');

-- Cada 15 minutos, los servicios de hoy se reacomodan alrededor de la hora actual.
select cron.unschedule('demo-al-dia') where exists (select 1 from cron.job where jobname = 'demo-al-dia');
select cron.schedule('demo-al-dia', '*/15 * * * *', 'select public.demo_al_dia()');
