# Montar una instalación nueva (demo o cliente)

Cada cliente tiene su propio proyecto de Supabase y su propio proyecto de
Vercel. Estos scripts copian la **estructura** de la base original (nunca sus
datos) a un proyecto nuevo.

## 0. Una sola vez

- `scripts/instalacion/.pg17/` trae `pg_dump` y `psql` 17 (no se suben a git).
  Si faltan, bajar `postgresql-client-17` y `libpq5` de apt.postgresql.org y
  extraer con `dpkg -x`.
- Copiar `scripts/instalacion/env.ejemplo` a `.env.instalacion` (raíz).

## 1. Exportar la estructura del origen

Con `ORIGEN_DB_URL` en `.env.instalacion`:

```bash
bash scripts/instalacion/exportar-esquema.sh
```

Deja los archivos en `scripts/instalacion/salida/` (ignorada por git: el
`05_cron.sql` trae el secreto del origen). Repetir cada vez que cambie la
base (nuevos patches) antes de montar otra instalación.

## 2. Crear el proyecto Supabase nuevo

1. Proyecto nuevo (región us-east-1 de preferencia).
2. Authentication → Sign In / Providers: **desactivar «Allow new users to sign up»**
   (las cuentas las da de alta el supervisor o el script).
3. Authentication → URL Configuration: Site URL = dirección de Vercel.
4. Copiar a `.env.instalacion`: `DESTINO_DB_URL`, `DESTINO_SUPABASE_URL`,
   `DESTINO_SECRET_KEY`. Generar `DESTINO_CRON_SECRET` con `openssl rand -hex 32`.

## 3. Instalar la estructura

```bash
bash scripts/instalacion/instalar.sh
```

Se niega a instalar encima de una base que ya tenga la app, o en la misma
base del origen. Al final muestra cuántas tablas, funciones, buckets y
crons quedaron.

## 4. Proyecto de Vercel

Importar el mismo repo de GitHub. Variables de entorno:

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto nuevo |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key del proyecto nuevo |
| `SUPABASE_SECRET_KEY` | secret key del proyecto nuevo |
| `CRON_SECRET` | el mismo `DESTINO_CRON_SECRET` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | par nuevo: `npx web-push generate-vapid-keys` |
| `NEXT_PUBLIC_MARCA_*` | nombre, app, iniciales, nombre corto, teléfonos, web, correo, domicilio, clave de formato, revisor, `APP_URL` |
| `NEXT_PUBLIC_MARCA_ICONOS` | `0` (la tira de íconos es de Clave Inteligente) |
| `NEXT_PUBLIC_EMISOR_*` | datos fiscales del cliente (prefactura) |
| `NEXT_PUBLIC_VENTAS_WHATSAPP` | tu número para «Contratar» |

Reemplazar las imágenes de `public/brand/` si el cliente tiene logo propio
(pendiente: hacerlas configurables sin tocar el repo).

## 5a. Si es el DEMO

Variables extra en Vercel: `NEXT_PUBLIC_DEMO=1`,
`NEXT_PUBLIC_DEMO_SUPERVISOR_CORREO=supervisor@demo.servitec.test`,
`NEXT_PUBLIC_DEMO_SUPERVISOR_CONTRASENA`, `NEXT_PUBLIC_DEMO_TECNICO_CORREO=tecnico@demo.servitec.test`,
`NEXT_PUBLIC_DEMO_TECNICO_CONTRASENA` (las mismas de `.env.instalacion`).

1. SQL Editor del demo: correr `supabase/demo/reiniciar_demo.sql` completo.
2. `node scripts/instalacion/crear-usuarios-demo.mjs`
3. SQL Editor: `select public.reiniciar_demo();`

Cada noche a las 3:00 se borra todo y se vuelven a cargar los datos de
«ServiTec Integral» con fechas de hoy. La función se niega a correr si hay
un usuario que no sea `@demo.servitec.test`.

## 5b. Si es un CLIENTE

1. Crear su primer supervisor en Authentication → Add user, con
   `{"role": "supervisor", "full_name": "..."}` en User Metadata, y en el SQL
   Editor darle permisos:
   `update profiles set can_manage_usuarios = true, can_approve_review = true where id = '<id>';`
2. Prueba de 14 días: `select iniciar_prueba();`
3. Al pagar: `select registrar_pago_suscripcion('profesional', 'mensual', 2990, 0, 'referencia');`

## Después de cada patch nuevo

Los patches de `supabase/` se corren en **cada** instalación (Clave
Inteligente, demo y clientes). Llevar la lista de qué patch se corrió dónde.
