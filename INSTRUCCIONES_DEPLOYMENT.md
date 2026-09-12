# 🚀 INSTRUCCIONES DE DEPLOYMENT — REPORTES DE SERVICIO

## REMEDIACIONES DE SEGURIDAD IMPLEMENTADAS

Esta actualización incluye 3 remediaciones críticas de seguridad:

1. **OWASP A04:2021 – Insecure Design**
   - ✅ Limpieza de IndexedDB, localStorage y Service Worker caches al logout
   - **Impacto**: Evita que datos sensibles (firmas, fotos) queden en dispositivos compartidos

2. **OWASP A09:2021 – Logging & Monitoring Failures**
   - ✅ Tabla `auditoria_descargas` para registrar cada PDF/Excel descargado
   - ✅ Captura IP, user-agent, usuario y timestamp
   - **Impacto**: Trazabilidad total de quién descargó qué reporte

3. **OWASP A07:2021 – Identification & Authentication Failures**
   - ✅ Bloqueo automático de cuentas de prueba (`es_cuenta_prueba=true`)
   - ✅ Rechazo de cuentas inactivas (`activo=false`) en login
   - **Impacto**: Previene acceso no autorizado con credenciales de prueba

---

## PASO 1: EJECUTAR PATCHES SQL EN SUPABASE

**Tiempo estimado**: 2-3 minutos

1. Abre [Supabase Dashboard](https://supabase.com/dashboard)
2. Navega a tu proyecto (`sxtedvxqnqrzuxpvgpih`)
3. Abre **SQL Editor** (icono `<>` en el sidebar izquierdo)
4. **COPIA TODO** el contenido de `supabase/SUPABASE_PATCHES_SECURITY.sql`
5. **PEGA** en el editor
6. Haz clic en **Run** (▶️)
7. **Espera** a que termine (debe estar en verde ✅)

### ¿Qué hace el SQL?

```sql
-- Crea tabla auditoria_descargas (registra descargas)
CREATE TABLE IF NOT EXISTS public.auditoria_descargas (...)

-- Agrega columnas es_cuenta_prueba y activo a profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS es_cuenta_prueba BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE;

-- Disparador para validar cambios de estado
CREATE TRIGGER trigger_validar_prueba (...)

-- Actualiza políticas RLS
DROP POLICY ... CREATE POLICY ... 
```

### ¿Y si algo falla?

Si ves error tipo `column already exists`:
- **Es normal y seguro** — significa que el parche ya se ejecutó una vez
- Simplemente los `IF NOT EXISTS` evitan duplicados
- Puedes ejecutarlo de nuevo sin problemas

Si ves otro tipo de error:
- Copia el error exacto y pégalo en el chat
- Eso me ayuda a identificar problemas en tu schema

---

## PASO 2: VERIFICAR QUE EL SQL FUNCIONÓ

En el mismo **SQL Editor**, copia y ejecuta esto:

```sql
-- Verifica que todo fue creado
SELECT
  (SELECT COUNT(*) FROM information_schema.tables 
    WHERE table_schema='public' AND table_name='auditoria_descargas') as tabla_auditoría,
  (SELECT COUNT(*) FROM pg_indexes 
    WHERE schemaname='public' AND indexname LIKE 'idx_auditoria%') as índices,
  (SELECT COUNT(*) FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='profiles' AND column_name='es_cuenta_prueba') as columna_prueba,
  (SELECT COUNT(*) FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='profiles' AND column_name='activo') as columna_activo;
```

**Esperado**: `1, 3, 1, 1` (todas las cosas creadas)

---

## PASO 3: SUBIR EL CÓDIGO MEJORADO A VERCEL

### Opción A: Usando tu flujo habitual de Ubuntu

```bash
# En Ubuntu / WSL

# 1. Ir a tu carpeta
cd ~/Documents/app-claveInteligente

# 2. Descargar el zip mejorado: reportes-app-mejorada.zip
#    (lo compartiremos en el chat)

# 3. Ejecutar el script habitual
cp reportes-app/.env.local ./env-respaldo 2>/dev/null
mv ~/Downloads/reportes-app*.zip . 2>/dev/null
mv ~/Descargas/reportes-app*.zip . 2>/dev/null

ZIPFILE=$(ls -t reportes-app*.zip 2>/dev/null | head -n 1)
if [ -z "$ZIPFILE" ]; then
  echo "❌ No encontré el zip."
else
  rm -rf reportes-app
  unzip -q -o "$ZIPFILE"
  if [ -d reportes-app/reportes-app ]; then
    mv reportes-app reportes-app-tmp
    mv reportes-app-tmp/reportes-app reportes-app
    rm -rf reportes-app-tmp
  fi
  cp env-respaldo reportes-app/.env.local 2>/dev/null
  cd reportes-app
  
  # ===== VERIFICACIÓN (NUEVO) =====
  echo "🔍 Verificando que el proyecto compila..."
  npx tsc --noEmit
  if [ $? -ne 0 ]; then
    echo "❌ TypeScript tiene errores. Revisa arriba."
    exit 1
  fi
  
  npm run build
  if [ $? -ne 0 ]; then
    echo "❌ Build falló. Revisa arriba."
    exit 1
  fi
  # ===== FIN VERIFICACIÓN =====
  
  git init
  git remote add origin git@github-otra:cristhianrclavei-web/Reportes-clave.git
  git add .
  git commit -m "[SEGURIDAD] Logout cleanup + audit trail + test account lockdown"
  git branch -M main
  git push -u origin main --force
  cd ..
  rm -f reportes-app*.zip
  echo "✅ Subido. Vercel redesplegará en ~2 minutos."
fi
```

### Opción B: Usando Termux (celular)

Similar, pero:
```bash
cd ~/storage/downloads
# ... (mismo script pero desde el celular)
```

**Nota**: La verificación con `npx tsc` y `npm run build` es **importante**. 
Ya hubo un despliegue roto por no hacerlo. Toma ~30 segundos más pero evita problemas.

---

## PASO 4: VERIFICAR QUE EL DEPLOYMENT FUNCIONÓ

1. **Abre Vercel**: [https://vercel.com](https://vercel.com)
2. **Ve a Reportes de Servicio** en tus proyectos
3. **Espera a que el deployment termine** (status debe cambiar de "Building" a ✅)
4. **Haz clic en el link del proyecto** para abrirlo en vivo

### Test rápido en vivo

1. Abre [https://reportes-clave.vercel.app](https://reportes-clave.vercel.app)
2. **Login** con una cuenta válida
3. **Descarga un PDF/Excel** desde el dashboard
4. **Logout**
5. Abre DevTools (F12) → Application → IndexedDB
6. **Verifica que esté vacío** (nada de reportes pendientes)

---

## PASO 5: VERIFICAR LAS REMEDIACIONES EN PRODUCCIÓN

### Test 1: Logout Cleanup ✅

```
1. Login como técnico
2. Abre un reporte
3. Completa datos offline (sin internet)
4. DevTools → Application → IndexedDB → reportes-offline-db
5. Verifica que hay datos
6. Logout
7. Refresca DevTools
8. ✅ IndexedDB debe estar 100% limpio
```

### Test 2: Audit Trail ✅

```
1. Login como técnico
2. Descarga un PDF
3. Abre Supabase → SQL Editor
4. Ejecuta: SELECT * FROM auditoria_descargas ORDER BY timestamp DESC LIMIT 1;
5. ✅ Debe mostrar tu descarga con IP y timestamp
```

### Test 3: Test Account Lockdown ✅

Si existe `tecnico1@prueba.com` (o similar):

```
1. Intenta login con esa cuenta
2. ✅ Debe rechazar con: "Esta cuenta de prueba no está disponible"
```

Si no tienes cuenta de prueba, puedes probar marcando un usuario como prueba:

```sql
-- En Supabase SQL Editor:
UPDATE public.profiles 
  SET es_cuenta_prueba = TRUE 
  WHERE id = 'algún-uuid-de-test';
  
-- Ahora ese usuario no puede loguear
```

---

## 🎯 RESUMEN DE CAMBIOS

### Archivos Creados
- ✅ `lib/clearOfflineData.ts` — Limpia IndexedDB/localStorage/caches
- ✅ `lib/auditarDescarga.ts` — Registra descargas en Supabase
- ✅ `lib/validateLoginUser.ts` — Valida cuentas en login
- ✅ `supabase/SUPABASE_PATCHES_SECURITY.sql` — Parches SQL

### Archivos Modificados
- ✅ `components/LogoutButton.tsx` — Llama a clearOfflineData()
- ✅ `app/api/reports/[id]/pdf/route.ts` — Audita + verifica permisos
- ✅ `app/api/reports/[id]/xlsx/route.ts` — Audita + verifica permisos
- ✅ `app/login/page.tsx` — Valida con validateLoginUser()
- ✅ `public/sw.js` — Maneja limpieza de Service Worker

### Tamaño Total
- ~500 líneas de código nuevo (TypeScript + SQL)
- Documentación completa en cada archivo

---

## 📋 CHECKLIST PRE-DEPLOYMENT

- [ ] Leí este documento completo
- [ ] Ejecuté los patches SQL en Supabase y verificaron OK
- [ ] El código se compila sin errores (`npx tsc --noEmit` ✅)
- [ ] El build funciona (`npm run build` ✅)
- [ ] Subí a Vercel (git push)
- [ ] Esperar a que Vercel despliegue (~2 minutos)
- [ ] Probé logout → IndexedDB limpio ✅
- [ ] Probé descarga → Registrada en auditoria_descargas ✅
- [ ] Probé login con cuenta prueba → Rechazada ✅

---

## ⚠️ NOTAS IMPORTANTES

1. **Los parches SQL son idempotentes**: Correrlos dos veces no causa problema
2. **El logout ahora pregunta si hay reportes pendientes**: Esto es intencional
3. **El 404 de reporte no autorizado no cambia**: Sigue siendo 404 (no filtra IDs)
4. **Los supervisores siguen viendo todos los reportes**: Sin cambios
5. **Las descargas se registran incluso si falla la auditoría**: No bloquea

---

## 🆘 TROUBLESHOOTING

### "Error: column es_cuenta_prueba does not exist"

- SQL no se ejecutó correctamente
- **Solución**: Vuelve a ejecutar `SUPABASE_PATCHES_SECURITY.sql`

### "TypeError: clearOfflineData is not defined"

- Falta importar la función en LogoutButton
- **Solución**: Verifica que `import { clearOfflineData } from '@/lib/clearOfflineData'` esté en `components/LogoutButton.tsx`

### Logout no funciona (error en consola)

- Revisa DevTools → Console
- Busca `[LOGOUT]` en los logs
- **Solución**: Probablemente es un problema de IndexedDB (modo privado del navegador)

### Las descargas no se registran

- **Solución**: Verifica que la tabla `auditoria_descargas` exista en Supabase
- Ejecuta: `SELECT COUNT(*) FROM information_schema.tables WHERE table_name='auditoria_descargas';`
- Debe devolver `1`

### "NextResponse.json: Cannot send undefined body as response"

- Error en uno de los endpoints
- **Solución**: Revisa que `auditarDescarga()` esté siendo llamada correctamente
- Mira los logs de Vercel (Function Logs)

---

## 📞 SOPORTE

Si algo no funciona:

1. **Toma screenshot** del error exacto
2. **Copia los logs** de:
   - DevTools Console (`F12`)
   - Vercel Function Logs (https://vercel.com → Logs)
   - Supabase SQL Editor (si hay error en SQL)
3. **Comparte aquí** con el mensaje "Deployment fallido"

---

**Deployment creado en septiembre 2026 como parte de auditoría AppSec PWA Reportes de Servicio.**
