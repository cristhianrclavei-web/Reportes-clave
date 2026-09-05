# Reportes de Servicio · Clave Inteligente

App con login por técnico, dashboard para el supervisor, y formato CRM0851 digital.
Se instala como PWA (ícono en el celular). 100% gratis para 1-5 usuarios.

## Stack
- **Next.js** — frontend + backend en un solo proyecto
- **Supabase** — base de datos Postgres + login de usuarios (gratis)
- **Vercel** — hosting (gratis)

---

## Paso 1 · Crear el proyecto en Supabase

1. Ve a https://supabase.com → crea una cuenta gratis → "New project".
2. Cuando el proyecto esté listo, ve a **SQL Editor** y pega el contenido completo
   de `supabase/schema.sql` (incluido en este proyecto). Ejecútalo.
   Esto crea las tablas `profiles` y `reports`, con las reglas de seguridad
   (cada técnico solo ve sus propios reportes; el supervisor los ve todos).
3. Ve a **Project Settings → API** y copia:
   - `Project URL`
   - `anon public key`

## Paso 2 · Crear los usuarios (técnicos + supervisor)

1. En Supabase, ve a **Authentication → Users → Add user** (crea el usuario con
   correo y contraseña — desmarca "auto confirm" solo si quieres que confirmen
   por correo, si no, déjalo marcado para que puedan entrar de inmediato).
2. Repite para cada técnico (1-5) y para el/los supervisores.
3. Por defecto todos quedan con rol `tecnico`. Para hacer a alguien supervisor:
   ve a **Table Editor → profiles**, busca su fila y cambia `role` a `supervisor`.

## Paso 3 · Configurar el proyecto localmente (opcional, para probar)

```bash
npm install
cp .env.local.example .env.local
# Pega tu Project URL y anon key en .env.local
npm run dev
```
Abre http://localhost:3000

## Paso 4 · Subir a GitHub

```bash
git init
git add .
git commit -m "Reportes Clave Inteligente"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/reportes-clave.git
git push -u origin main
```

## Paso 5 · Desplegar en Vercel (gratis)

1. Ve a https://vercel.com → inicia sesión con GitHub → "Add New Project".
2. Selecciona el repositorio que acabas de subir.
3. En **Environment Variables**, agrega:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (los mismos valores del Paso 1)
4. Deploy. En 1-2 minutos tendrás una URL como `reportes-clave.vercel.app`.

## Paso 6 · Instalar como app en el celular (PWA)

1. Cada técnico abre la URL de Vercel en Chrome (Android) o Safari (iPhone).
2. Android: menú (⋮) → "Instalar app" / "Agregar a pantalla de inicio".
   iPhone: botón compartir → "Agregar a pantalla de inicio".
3. Queda un ícono normal en el celular; al abrirlo no se ve la barra del navegador.

---

## Cómo funciona

- **/login** — pantalla de acceso con correo y contraseña.
- **/nuevo** — formulario del reporte (para técnicos). Al guardar, se inserta en
  la tabla `reports` de Supabase, asociado a su usuario.
- **/dashboard** — solo visible para usuarios con rol `supervisor`. Lista todos
  los reportes de todos los técnicos, con buscador, filtro por tipo de servicio
  y vista de detalle.

## Personalizar / próximos pasos sugeridos

- Agregar captura de firma a mano (canvas táctil) — se puede portar del prototipo
  original si lo necesitas.
- Exportar un reporte a PDF con el formato exacto del CRM0851 impreso.
- Agregar campos de tubería (roscada/ajuste/ranurada) y cable instalado al
  formulario `/nuevo` — ya están en el diseño original, se omitieron aquí para
  mantener el punto de partida más compacto; dímelo y te los agrego.
- Reemplazar los íconos de `public/icons/` por el logo real de Clave Inteligente
  (192x192 y 512x512 px).

## Costo

Con 1-5 técnicos y uso normal de campo, esto se queda cómodamente dentro de:
- Supabase free tier (500MB DB, 50,000 usuarios activos/mes)
- Vercel free tier (100GB de ancho de banda/mes)

No deberías pagar nada a menos que crezca mucho el equipo o el volumen de reportes.
