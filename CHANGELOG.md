# Registro de cambios

## Septiembre 2026 — Gestión de perfiles y admin de usuarios

### Requiere ejecutar en Supabase

Solo el patch de edición de perfiles (es opcional, para protección de BD):
- `patch_edicion_perfiles_admin.sql` — Valida permisos en la BD (segunda línea de defensa)

El patch de cuentas de prueba sigue siendo necesario, pero no urgente:
- `patch_cuentas_prueba.sql` — Marca cuentas de prueba y almacena teléfono

### Nuevas funciones

**Página `/perfil`** — Formulario de perfil del usuario
- Cada usuario puede editar su correo y teléfono
- Validación en tiempo real (sin enviar al servidor hasta confirmar)
- Optimistic updates (cambios en UI al instante)
- Toast de confirmación/error

**Panel de admin (solo Clara Zepeda y Everardo Sánchez Díaz)**
- Listar todos los usuarios con rol y teléfono
- Editar nombres de cualquier usuario
- Eliminar usuarios (protección: no permite borrar admins)
- Interfaz colapsable y responsive

**API endpoints**
- `PUT /api/perfil` — Actualizar correo y teléfono del usuario autenticado
- `GET /api/perfil/usuarios` — Listar usuarios (solo admin)
- `PUT /api/perfil/usuarios` — Editar nombre de usuario (solo admin)
- `DELETE /api/perfil/usuarios` — Eliminar usuario (solo admin, protegido)

### Diseño (World-Class)

Inspirado en Stripe/Vercel + Apple:
- Validación en tiempo real con indicadores visuales
- Skeleton loaders mientras carga
- Interfaz colapsable en admin
- Botones deshabilitados hasta que hay cambios
- Estados de carga y error claros
- Accesibilidad WCAG AAA
- PWA-first (manejo de offline)

---

## Septiembre 2026 — Servicios multi-día, correcciones y agenda

### Requiere ejecutar en Supabase (SQL Editor), en este orden

Los archivos están en `supabase/`. Son idempotentes: correrlos dos veces no
hace daño.

1. `patch_tareas_compartidas_por_proyecto.sql`
2. `patch_avance_parcial_tareas.sql`
3. `patch_auditoria_global_y_eliminar.sql`
4. `patch_personal_de_servicio.sql`
5. `patch_correcciones_reporte.sql`
6. `patch_insumos_checklist.sql`

Si la app muestra "column ... does not exist" o una lista vacía sin
explicación, casi siempre es un patch pendiente.

---

### Servicios programados

- **Checklist compartido por proyecto.** Antes cada día de un proyecto
  multi-día tenía su propia copia de las tareas. Ahora la lista pertenece al
  proyecto (`grupo_id`): lo que queda pendiente el día 1 sigue pendiente el
  día 2 y el avance se acumula.
- **Avance parcial por tarea (0-100%).** Una tarea puede quedar a medias
  ("instalé las cámaras pero falta conectarlas" = 50%). Cada avance parcial
  queda auditado como evento con autor, hora, porcentaje, foto y ubicación.
- **Porcentaje global del proyecto.** Promedio de los avances de todas las
  tareas, visible para técnico y supervisor en listas y detalles.
- **Fecha propia por día.** Antes todos los días de un proyecto compartían la
  fecha de arranque. Ahora al programar se elige entre días seguidos (con
  opción de saltar sábados y domingos) o fechas salteadas capturadas una por
  una.
- **Reprogramación de días.** El supervisor puede cambiar la fecha de un día;
  el proyecto se renumera para que "Día N" siga siendo cronológico. Queda
  registrado en Eventos.
- **Bloqueo por fecha.** Marcar llegada, iniciar servicio y vincular un
  reporte solo se permiten en la fecha programada. Se valida en la capa de
  datos, no solo en la interfaz. No bloquea concluir ni completar tareas: si
  ya inició, siempre puede terminar.
- **Reasignación efectiva.** Si se quita a un técnico de un proyecto, el
  servicio desaparece de su lista al instante y no puede operarlo aunque
  tenga el enlace directo. El filtro por asignación es explícito y no se
  delega solo a RLS.

### Herramienta, material y equipo

- **Checklist de carga por proyecto**, distinto al de actividades: aquel se
  completa en sitio con foto y ubicación; éste se revisa en el almacén, antes
  de salir, así que no espera a que se marque llegada.
- Tres categorías (herramienta, material, equipo) con cantidad, unidad y
  descripción. La unidad se elige de una lista (pza, mts, rollo, caja, bulto,
  costal, kg, lt, juego, par, tramo, cubeta, m²…) o se escribe.
- **Verificación diaria en dos momentos:** salida y retorno. La lista es del
  proyecto pero el estado se guarda por día, así que cada jornada se vuelve a
  verificar. Al marcar el retorno se avisa cuántas piezas salieron y no han
  regresado.
- El técnico puede **agregar lo que falte**; queda marcado con su nombre y
  aparece en Eventos para el supervisor. Solo puede quitar lo que él agregó —
  la lista del supervisor no se altera desde campo, y la restricción está en
  las políticas de la base, no solo en la interfaz.
- **Plantillas reutilizables:** el supervisor guarda una lista por tipo de
  trabajo y la vuelca en proyectos futuros, sumándola a lo que ya haya.

### Reportes

- **Vinculación con servicio asignado**, ahora al inicio del formulario. Al
  elegir el servicio se autocompleta el cliente y se sugiere el personal
  asignado (lista desplegable, con captura manual disponible).
- **Correcciones autorizadas.** El técnico solicita corregir un reporte
  explicando el motivo; un supervisor lo autoriza y solo entonces puede
  agregar fotos y cambiar el servicio vinculado. El permiso se consume al
  aplicarse. Todo el flujo queda en Eventos con nombres.
- **Eliminación de reportes y servicios** (solo supervisores), con borrado de
  las evidencias asociadas en Storage.

### Panel del supervisor

- **Cuatro secciones:** Reportes, Servicios, Agenda y Eventos.
- **Agenda.** Días pendientes agrupados por cercanía (Vencidos, Hoy, Mañana,
  Esta semana, Más adelante), con técnicos asignados, avance y filtro por
  técnico. Los días vencidos se reprograman desde ahí mismo.
- **Eventos.** Bitácora de la actividad del equipo: quién programó, editó,
  reasignó, reprogramó, eliminó, autorizó correcciones, aprobó revisiones o
  gestionó facturación. Sobrevive a las eliminaciones.
- **Avisos al entrar:** días vencidos (rojo) y solicitudes de corrección
  pendientes (ámbar), ambos con acceso directo a resolverlos.

### Diseño

- Íconos SVG (`lucide-react`) en toda la app; se eliminaron los emojis, que
  se veían distintos en cada Android.
- Mayor contraste en textos secundarios, pensando en uso bajo sol directo.
- Áreas táctiles de 44px como mínimo, para operar con guantes.
- Estados del checklist distinguibles de reojo: hecha, a medias, pendiente,
  bloqueada.
- Iconografía de cierre de servicio: en tiempo y forma, con tareas sin
  terminar, fuera de tiempo. Las dos últimas son acumulables.
- Jerarquía revisada en la pantalla del técnico: la acción siguiente manda y
  el botón de terminar servicio quedó en una barra fija al alcance del pulgar.

### Correcciones técnicas

- **`crypto.randomUUID` no existe fuera de HTTPS.** Rompía guardar reportes y
  programar servicios al abrir la app por IP local o en Android antiguo. Se
  reemplazó por un generador propio con respaldo (`lib/uuid.ts`).
- **Relación ambigua con `profiles`.** Al dar a `reports.correccion_por` una
  foreign key hacia `profiles`, la tabla quedó con dos relaciones hacia ella y
  PostgREST dejó de resolver `profiles(full_name)`, devolviendo cero reportes.
  Se eliminó esa FK y las consultas ahora nombran la relación de forma
  explícita.
- **Errores visibles.** Las pantallas de reportes muestran el error real en
  lugar de una lista vacía, y las consultas toleran columnas que aún no
  existan.
- **`/diagnostico`** — página temporal que muestra qué ve el servidor
  (sesión, rol, conteo de reportes, errores). Se puede borrar cuando ya no
  haga falta.
