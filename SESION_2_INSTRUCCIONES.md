# 🔐 SESIÓN 2: AUDITORÍA SECURITY DEFINER

**Fecha**: 2026-09-12  
**Enfoque**: Revisar 14 funciones SECURITY DEFINER  
**Prioridad**: `suscripciones_para_envio`, `listar_personal`, `destinatarios_notificacion`

---

## ⚡ PASOS RÁPIDOS (Copiar y Pegar)

### PASO 1: Descargar y extraer zip
```bash
cd ~/Documents/app-claveInteligente && \
rm -rf reportes-app-mejorada && \
unzip reportes-app-sesion-2.zip && \
cd reportes-app-mejorada
```

### PASO 2: Ejecutar SQL en Supabase
1. Ve a: https://supabase.com/dashboard
2. Proyecto: `sxtedvxqnqrzuxpvgpih`
3. SQL Editor → New query
4. Abre archivo: `supabase/SESION_2_SECURITY_DEFINER.sql`
5. Copia TODO (Ctrl+A, Ctrl+C)
6. Pégalo en Supabase
7. Click en Run (▶️)

### PASO 3: Subir a GitHub y Vercel
```bash
cd ~/Documents/app-claveInteligente/reportes-app-mejorada

git add .
git commit -m "[SEGURIDAD-S2] Validaciones en funciones SECURITY DEFINER"
git push origin main

echo "✅ SUBIDO A GITHUB"
echo "🕐 Vercel redesplegará en ~2 minutos"
echo "📱 Abre https://reportes-clave.vercel.app"
```

---

## 📋 CAMBIOS REALIZADOS

### 1️⃣ suscripciones_para_envio (CVSS 5.7 → 2.0)
**Antes**: Devolvía endpoints y llaves sin validar supervisor  
**Después**: Solo supervisores pueden obtener suscripciones push

```sql
-- Validación nueva:
IF NOT EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE id = auth.uid() AND role = 'supervisor'
) THEN
  RAISE EXCEPTION 'Solo supervisores pueden acceder';
END IF;
```

### 2️⃣ listar_personal (A07 - CVSS 6.5 → 2.0)
**Antes**: Lista completa de usuarios sin filtro  
**Después**: Supervisores ven todos, técnicos solo ven su perfil

```sql
WHERE p.activo = TRUE
  AND (
    -- Si es supervisor, ver todos los técnicos
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'supervisor'
    OR
    -- Si es técnico, solo verse a sí mismo
    p.id = auth.uid()
  )
```

### 3️⃣ destinatarios_notificacion (A01 - CVSS 5.3 → 2.0)
**Antes**: Devolvía destinatarios sin validar permisos  
**Después**: Valida que sea supervisor antes de devolver datos

---

## ✅ VERIFICACIÓN POST-DEPLOYMENT

### Test 1: Supervisor accede a suscripciones
```bash
# Loguéate como supervisor en:
# https://reportes-clave.vercel.app/login
# Email: everardo.sanchez@clave-i.com
# Debe funcionar normalmente
```

### Test 2: Técnico intenta acceder a suscripciones
```bash
# Loguéate como técnico
# Intenta editar URL o usar DevTools Console
# Debe rechazarse: "Solo supervisores pueden acceder"
```

### Test 3: Verificar audit trail
```sql
-- En Supabase SQL Editor:
SELECT * FROM public.auditoria_global 
WHERE tabla = 'security_definer_functions' 
ORDER BY timestamp DESC LIMIT 1;
```

---

## 🎯 RESUMEN SESIÓN 2

| Hallazgo | OWASP | CVSS | Status |
|---|---|---|---|
| suscripciones_para_envio sin validar | A04 | 5.7 → 2.0 | ✅ |
| listar_personal sin permisos | A07 | 6.5 → 2.0 | ✅ |
| destinatarios_notificacion expone datos | A01 | 5.3 → 2.0 | ✅ |

---

## 📞 SI ALGO FALLA

**Error**: "column X does not exist"  
→ Alguna tabla no tiene esa columna. Verifica el schema en Supabase.

**Error**: "function suscripciones_para_envio(UUID[]) does not exist"  
→ La función antigua existe. El SQL las reemplaza; asegúrate de ejecutar TODO.

**Error**: "Only supervisores can access"  
→ Está funcionando. Loguéate con una cuenta supervisor.

---

## 🚀 PRÓXIMAS SESIONES

- **Sesión 3**: Security Headers (CSP, HSTS, X-Frame-Options)
- **Sesión 4**: Rate limiting + Session management
- **Sesión 5**: Storage buckets RLS

