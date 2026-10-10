@AGENTS.md

# Clave Inteligente — app de reportes

App web (PWA) para una empresa de sistemas de seguridad e incendio: los técnicos capturan reportes de servicio en campo (con fotos, video, firma del cliente y materiales) y supervisión administra servicios, cuadrillas, almacén, cotizaciones, facturación y personal. Se usa en celular, muchas veces con mala señal. Toda la interfaz y los textos van en español.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript — ver aviso de arriba: leer `node_modules/next/dist/docs/` antes de escribir código.
- Supabase (`@supabase/ssr`, `@supabase/supabase-js`): base de datos, auth y storage. Los cambios de esquema van como `supabase/patch_*.sql`.
- Tailwind CSS 3, `lucide-react` (íconos), `motion` (animaciones).
- `zod` para validar; `pdf-lib` y `exceljs` para PDF y Excel; `sharp` para fotos; `web-push` para notificaciones.
- `@anthropic-ai/sdk` para el asistente dentro de la app.
- Pruebas con Vitest (`npm test`), junto al código en `lib/*.test.ts`. Se despliega en Vercel.

## Requisitos obligatorios

1. **Validar todo formulario** antes de guardar: en el cliente (mensaje claro junto al campo, en español) y otra vez en el servidor con `zod`. Nunca confiar solo en la validación del navegador.
2. **Manejar los errores de red**: toda llamada a Supabase o a `/api` revisa el error y le dice al usuario qué pasó y qué puede hacer. Nada de fallos silenciosos ni `catch` vacíos.
3. **Guardar los reportes offline y sincronizarlos después**: usar lo que ya existe — `lib/offlineQueue.ts`, `lib/fotosPendientes.ts`, `lib/borradorReporte.ts`, `lib/useBorradorFormulario.ts` y `components/OfflineSyncManager.tsx` — en vez de crear otro mecanismo.
4. **Nunca perder un reporte capturado**: no se borra el borrador ni la copia local hasta que el servidor confirme que guardó. Si la sincronización falla, el reporte se queda en la cola y se reintenta. Cualquier cambio que toque la captura o la cola se prueba sin conexión antes de subir.

## Estilo de código

Cristhian está aprendiendo JavaScript: preferir código legible sobre código corto o ingenioso.

- Nombres descriptivos en español, como el resto del código; funciones pequeñas que hacen una sola cosa.
- Evitar encadenamientos largos, ternarios anidados y trucos de una línea; mejor pasos con variables con nombre.
- Comentar el porqué cuando no sea evidente.
- Al explicar un cambio, decir qué hace y por qué en lenguaje llano.
