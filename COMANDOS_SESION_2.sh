#!/bin/bash

# ==========================================
# SESIÓN 2: SECURITY DEFINER DEPLOYMENT
# ==========================================
# Copia y pega este bloque completo en Ubuntu/Termux

echo "🚀 Iniciando Sesión 2 Deployment..."

# PASO 1: Preparar carpeta
echo "📁 Preparando carpeta..."
cd ~/Documents/app-claveInteligente && \
rm -rf reportes-app-mejorada && \
echo "✅ Carpeta limpia"

# PASO 2: Descargar y extraer
echo "📥 Descargando zip..."
if [ -f "reportes-app-sesion-2.zip" ]; then
  unzip -q reportes-app-sesion-2.zip
  echo "✅ Zip extraído"
else
  echo "❌ ERROR: No encontré reportes-app-sesion-2.zip"
  echo "   Descárgalo primero desde https://reportes-clave.vercel.app"
  exit 1
fi

# PASO 3: Entrar en carpeta
cd reportes-app-mejorada || exit 1
echo "📂 En carpeta: $(pwd)"

# PASO 4: Git add, commit, push
echo "📤 Subiendo a GitHub..."
git add . && \
git commit -m "[SEGURIDAD-S2] Validaciones en funciones SECURITY DEFINER" && \
git push origin main

if [ $? -eq 0 ]; then
  echo "✅ SUBIDO A GITHUB"
  echo ""
  echo "🕐 Vercel redesplegará en ~2 minutos"
  echo "📱 Abre: https://reportes-clave.vercel.app"
  echo ""
  echo "⚠️  FALTA UN PASO IMPORTANTE:"
  echo "   1. Ve a Supabase Dashboard"
  echo "   2. Abre: supabase/SESION_2_SECURITY_DEFINER.sql"
  echo "   3. Copia TODO el contenido"
  echo "   4. En Supabase SQL Editor → New query"
  echo "   5. Pégalo y click Run (▶️)"
  echo ""
  echo "✅ Una vez ejecutes el SQL, todo estará listo"
else
  echo "❌ Error subiendo a GitHub"
  exit 1
fi
