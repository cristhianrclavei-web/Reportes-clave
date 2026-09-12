# Estado del proyecto — Reportes de Servicio (Clave Inteligente)

> **Pega este documento completo como primer mensaje de un chat nuevo, junto con el zip del proyecto.** Con eso se retoma el trabajo sin perder contexto.

---

## Qué es

PWA de reportes de servicio para **Clave Inteligente**, integradora de sistemas en Guadalajara (CCTV, control de acceso, detección de incendios, energía solar, automatización). Cubre el ciclo completo: se programa el trabajo, se ejecuta y documenta en campo, se revisa, se factura — y cada paso queda registrado con quién, cuándo y desde dónde.

Funciona sin conexión y sincroniza al recuperar señal.

- **Stack**: Next.js 14 (App Router, TypeScript), Supabase (Postgres + Auth + Storage), Vercel, Tailwind, pdf-lib, exceljs, web-push, lucide-react
- **Repo**: `github.com/cristhianrclavei-web/Reportes-clave` (rama `main`)
- **Producción**: `reportes-clave.vercel.app`
- **Supabase**: proyecto `sxtedvxqnqrzuxpvgpih`

---

## Cómo trabajamos

1. Pido un cambio → se entrega el **zip completo** actualizado
2. Lo subo con el bloque de Termux (celular) o Ubuntu (computadora)
3. **Si el cambio necesita SQL, se corre primero en Supabase**

**Regla clave:** subir el código NO actualiza la base de datos. Casi todos los problemas que hemos tenido ("no aparece nada", "columna que no existe") fueron patches sin ejecutar.

### Termux (celular)

```bash
cd ~/storage/downloads
ZIPFILE=$(ls -t reportes-app*.zip 2>/dev/null | head -n 1)
if [ -z "$ZIPFILE" ]; then
  echo "❌ No encontré el zip en Descargas."
else
  rm -rf reportes-app
  unzip -q "$ZIPFILE"
  if [ -d reportes-app/reportes-app ]; then
    mv reportes-app reportes-app-tmp
    mv reportes-app-tmp/reportes-app reportes-app
    rm -rf reportes-app-tmp
  fi
  cd reportes-app
  git init
  git config --global --add safe.directory "$(pwd)"
  git remote remove origin 2>/dev/null
  git remote add origin https://github.com/cristhianrclavei-web/Reportes-clave.git
  git add .
  git commit -m "mensaje del cambio"
  git branch -M main
  git push -u origin main --force
  cd ~/storage/downloads
  rm -rf reportes-app
  rm -f reportes-app*.zip
  echo "✅ Subido."
fi
```

### Ubuntu (computadora)

Trabajo en `~/Documents/app-claveInteligente`. Este bloque respalda y restaura el `.env.local` y **conserva la carpeta** para seguir en local.

```bash
cd ~/Documents/app-claveInteligente
cp reportes-app/.env.local ./env-respaldo 2>/dev/null
mv ~/Downloads/reportes-app*.zip . 2>/dev/null
mv ~/Descargas/reportes-app*.zip . 2>/dev/null
ZIPFILE=$(ls -t reportes-app*.zip 2>/dev/null | head -n 1)
if [ -z "$ZIPFILE" ]; then
  echo "❌ No encontré el zip."
else
  rm -rf reportes-app
  unzip -q "$ZIPFILE"
  if [ -d reportes-app/reportes-app ]; then
    mv reportes-app reportes-app-tmp
    mv reportes-app-tmp/reportes-app reportes-app
    rm -rf reportes-app-tmp
  fi
  cp env-respaldo reportes-app/.env.local 2>/dev/null
  cd reportes-app
  git init
  git remote add origin git@github-otra:cristhianrclavei-web/Reportes-clave.git
  git add .
  git commit -m "mensaje del cambio"
  git branch -M main
  git push -u origin main --force
  cd ..
  rm -f reportes-app*.zip
  echo "✅ Subido."
fi
```

### Probar en local

```bash
cd ~/Documents/app-claveInteligente/reportes-app
npm install
npm run dev                    # localhost:3000
npm run dev -- -H 0.0.0.0      # para verlo desde el celular
hostname -I                    # la IP a la que entrar
```

**Ojo:** en local se conecta a la base **real**. Lo que borre ahí, se borra en producción.

### Variables de entorno (`.env.local` y Vercel)

```
NEXT_PUBLIC_SUPABASE_URL=https://sxtedvxqnqrzuxpvgpih.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

Las VAPID se generan con `npx web-push generate-vapid-keys`. Si se agregan en Vercel después de desplegar, hay que volver a desplegar.

---

## Roles y permisos

| Rol | Qué hace |
|---|---|
| `tecnico` | Reportes, servicios asignados, herramienta bajo su resguardo, bitácora |
| `supervisor` | Programa, revisa, aprueba, factura, audita |

Permisos individuales sobre el rol (columnas en `profiles`):

| Permiso | Quién | Para qué |
|---|---|---|
| `can_approve_review` | Ing. Everardo Sánchez Díaz | Firmar la revisión final |
| `can_manage_billing` | Everardo, Julio Gómez, María Clara Zepeda | Facturación |
| `can_manage_almacen` | Julio Gómez | Entradas y movimientos de almacén |

---

## Módulos

**Reportes** — formulario completo con firmas táctiles, fotos, PDF/Excel, modo sin conexión. Se vincula al servicio programado. No guarda sin cliente, hora de llegada, hora de salida y una persona.

**Servicios programados** — multi-día con fecha propia por día (corridos con opción de saltar fines de semana, o salteados). Checklist de tareas compartido entre días con avance parcial por porcentaje. Llegada, inicio y cierre con GPS. Bloqueo por fecha. Reprogramación y eliminación de días con motivo.

**Herramienta y material** — sección propia del técnico. Lista por proyecto, verificación diaria de salida y retorno con cantidades (entrega parcial), motivos obligatorios de lo que no salió o no volvió, resguardo firmado y confirmación de recepción del almacén. Solicitudes que el supervisor autoriza.

**Almacén** (solo Julio) — catálogo clasificado por sistema, con marca/modelo y mínimos. Entradas con factura y orden de compra, a inventario general o reservado a proyecto. Existencias calculadas desde movimientos. Las salidas y retornos se registran solos desde el resguardo.

**Panel del supervisor** — Resumen (KPIs y avisos accionables), Reportes, Servicios, Agenda, Actividad del equipo (auditoría), Almacén. Filtro por semana con tira de días en Reportes y Servicios.

**Correcciones** — el técnico solicita, el supervisor autoriza, y solo entonces puede agregar fotos y cambiar el servicio vinculado. El permiso se consume al aplicarse.

**Notificaciones push** — diez tipos con preferencias individuales. Encendidos: solicitudes de herramienta, correcciones, reportes concluidos, cierre de servicios, existencias bajas. Apagados: llegadas, inicios, apertura y cierre de bitácora.

---

## Decisiones de diseño que hay que respetar

1. **Las reglas críticas viven en la base**, no en la pantalla: quién aprueba, quién marca herramienta, en qué fecha se puede iniciar. Una pantalla en caché no debe poder saltárselas.
2. **Una casilla en blanco nunca es respuesta.** Si algo no se entregó, no volvió o no se hizo, se exige el motivo.
3. **Lo firmado queda congelado.** Los resguardos guardan copia de la lista al firmar.
4. **Lo que exige decisión va al frente**, en la pantalla de aterrizaje con sus botones de resolver.
5. **El inventario se calcula desde movimientos**, nunca se edita como número.
6. **Nunca descartar errores en silencio.** Nada de `if (!error)`: varias fallas largas vinieron de ahí.

---

## Trampas conocidas (nos costaron tiempo)

- **RLS recursivo**: una política con subconsulta a su propia tabla causa "infinite recursion". Se resuelve con función `SECURITY DEFINER` o trigger.
- **Relaciones ambiguas**: si una tabla tiene dos claves foráneas a `profiles`, PostgREST falla al pedir `profiles(full_name)`. Hay que nombrar la relación o resolver los nombres en consulta aparte.
- **`crypto.randomUUID`** no existe fuera de HTTPS. Se usa `lib/uuid.ts`.
- **Storage**: las rutas `servicios/…` y `resguardos/…` necesitan su política; si no, las fotos se rechazan.
- **Click fantasma en móvil**: los modales se cierran solos si el fondo recibe el click que los abrió. Se usa `components/ModalOverlay.tsx`.
- **Caché de la PWA**: tras cada despliegue hay que cerrar la app por completo y reabrirla.
- **Nunca usar emojis** en la interfaz: se ven distintos en cada Android. Se usa `lucide-react`.
- **Áreas táctiles de 44px mínimo** (se usa con guantes) y contraste alto (se usa bajo sol).

---

## Patches de SQL, en orden

Todos están en `supabase/` dentro del zip. Son idempotentes.

1. `patch_tareas_compartidas_por_proyecto.sql`
2. `patch_avance_parcial_tareas.sql`
3. `patch_auditoria_global_y_eliminar.sql`
4. `patch_personal_de_servicio.sql`
5. `patch_correcciones_reporte.sql`
6. `patch_evidencias_servicios_storage.sql`
7. `patch_insumos_checklist.sql`
8. `patch_resguardo_herramienta.sql`
9. `patch_no_entregado.sql`
10. `patch_entrega_parcial.sql`
11. `patch_solicitud_insumos.sql`
12. `patch_almacen.sql`
13. `patch_minimos_almacen.sql`
14. `patch_checklist_catalogo.sql`
15. `patch_movimientos_automaticos.sql`
16. `patch_sistemas_almacen.sql`
17. `patch_avance_en_eventos.sql`
18. `patch_push_notificaciones.sql`
19. `patch_push_preferencias.sql`
20. `patch_cuentas_prueba.sql`

### Verificar que estén todos aplicados

```sql
select
  (select count(*) from information_schema.columns
     where table_name='servicio_tareas' and column_name='avance_pct')              as avance_parcial,
  (select count(*) from information_schema.columns
     where table_name='reports' and column_name='correccion_solicitada')           as correcciones,
  (select count(*) from information_schema.columns
     where table_name='servicio_insumo_estado' and column_name='cantidad_entregada') as entrega_parcial,
  (select count(*) from information_schema.columns
     where table_name='servicio_insumos' and column_name='articulo_id')            as checklist_catalogo,
  (select count(*) from information_schema.tables
     where table_name='almacen_movimientos')                                       as almacen,
  (select count(*) from information_schema.columns
     where table_name='almacen_articulos' and column_name='sistema_id')            as sistemas,
  (select count(*) from information_schema.columns
     where table_name='servicio_eventos' and column_name='avance_pct')             as avance_en_eventos,
  (select count(*) from information_schema.tables
     where table_name='push_preferencias')                                         as push,
  (select count(*) from information_schema.columns
     where table_name='profiles' and column_name='es_cuenta_prueba')               as cuentas_prueba;
```

Todo debe devolver **1**.

---

## Pendientes

**Marcar las cuentas de prueba** (lo último que se hizo). Ajustar el filtro a los correos reales:

```sql
update public.profiles set es_cuenta_prueba = true
where id in (select id from auth.users where email like '%prueba%');
```

**Poblar el catálogo del almacén.** Julio debe capturar los artículos de uso común con su sistema y sus mínimos. Sin eso, el checklist no puede conectarse al inventario y todos acaban dando de alta artículos con nombres distintos.

**Almacén fase 4** (pospuesta a propósito hasta que el inventario lleve días cuadrando): cola de preparación para Julio con lo que debe surtir por día, técnico y proyecto, y estados pendiente → preparado → entregado.

**WhatsApp** (evaluado, no implementado): requiere número dedicado, verificación de empresa con Meta y plantillas aprobadas. Costo estimado con el volumen actual: unos $105–165 MXN al mes. Se decidió validar primero con push, que ya funciona y es gratis.

**Responsable de cuadrilla**: hoy todos los asignados a un servicio tienen los mismos permisos. Si la responsabilidad recae en una persona por cuadrilla, convendría marcarla para que el resguardo y el reporte queden a su nombre.

**Rendimiento**: el filtro por semana de Reportes y Servicios opera en el navegador sobre todos los registros cargados. Con volumen actual va bien; con varios cientos habrá que traerlos por rango desde el servidor.

**Deuda técnica**: el historial de git se pierde en cada subida (`git init` + `push --force`), así que no se puede revertir desde git — solo promoviendo un despliegue anterior en Vercel. Si se quiere historial, hay que cambiar el flujo a `git clone` + `git push` sin `--force`.

---

## Cómo pedir cambios

Trabajamos de uno en uno. El flujo que funciona:

1. Describo el cambio o el problema
2. Se implementa y se entrega el zip
3. Lo pruebo en local
4. Cuando digo "subámoslo", se entregan los comandos de Termux y Ubuntu con el mensaje de commit ya redactado

Si el cambio necesita SQL, se me indica **antes** de los comandos de subida.
