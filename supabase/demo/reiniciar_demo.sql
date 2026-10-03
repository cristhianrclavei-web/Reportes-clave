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
      (6, 'Fernando Aguilar', 'Técnico especialista', array['Red contra incendio', 'Supresión']),
      (7, 'Ricardo Peña', 'Técnico de campo', array['Alarma intrusión', 'CCTV']),
      (8, 'Óscar Villanueva', 'Técnico electricista', array['Inst. eléctricas', 'Paneles solares']),
      (9, 'Héctor Salazar', 'Técnico de campo', array['CCTV']),
      (10, 'Iván Castillo', 'Auxiliar técnico', array['Control de acceso']),
      (11, 'Raúl Domínguez', 'Técnico de campo', array['Alarma&Det']),
      (12, 'Sergio Paredes', 'Técnico especialista', array['Automatización']),
      (13, 'Adrián Fuentes', 'Auxiliar técnico', array['CCTV']),
      (14, 'Marco Rosales', 'Técnico de campo', array['Red contra incendio']),
      (15, 'Emilio Carrillo', 'Auxiliar técnico', array['Inst. eléctricas'])
    ) v(n, nombre, puesto, esp)
  loop
    update public.profiles p set full_name = x.nombre, role = 'tecnico', puesto = x.puesto,
      telefono = '33100000' || lpad(x.n::text, 2, '0'), activo = true, es_cuenta_prueba = false,
      credenciales_actualizadas = true, especialidades = x.esp
    from auth.users u
    where u.id = p.id and u.email = 'tecnico' || x.n || dominio;
  end loop;

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
    (s5, v_sup, 'Colegio Los Pinos', 'Instalación de 6 cámaras en accesos y patio', hoy, 300, '09:00', 'programado', c_cole,
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
      (4, c_plaza, 'Plaza Comercial Arboleda', 'Cambio de 2 detectores de humo en locales 8 y 11', 0, time '08:30', 'en_curso', 120),
      (5, c_torre, 'Corporativo Torre Azul', 'Instalación de lectora en acceso a sótano 2', 0, time '09:30', 'en_curso', 180),
      (6, c_ind, 'Industrias Metálicas del Bajío', 'Prueba anual de sistema de supresión en cuarto eléctrico', 0, time '10:00', 'en_sitio', 240),
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
      (id, creado_por, proyecto, descripcion, fecha, duracion_estimada_min, hora_programada, estado, cliente_id)
    values (v_s, v_sup, x.nombre, x.descr, hoy + x.dia, x.dur, x.hora, 'programado', x.cli);
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
