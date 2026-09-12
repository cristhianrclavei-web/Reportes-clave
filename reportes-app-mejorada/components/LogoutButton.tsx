'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabaseClient';
import { countOfflineReports } from '@/lib/offlineQueue';
import { clearOfflineData } from '@/lib/clearOfflineData'; // NUEVO - OWASP A04
import ModalOverlay from '@/components/ModalOverlay';
import { LogOut, AlertTriangle } from 'lucide-react';

// Cerrar sesión desde cualquier pantalla. Antes solo estaba en las de
// aterrizaje, así que desde el detalle de un servicio había que navegar hacia
// atrás para salir — incómodo cuando se presta el teléfono o se cambia de
// turno.
//
// Pide confirmación a propósito: con la barra fija arriba, es fácil rozarlo
// al desplazarse, y salir sin querer con un reporte a medias sí duele.
//
// La confirmación es un modal propio y no el confirm() del navegador. Aquel
// se anuncia como «reportes-clave.vercel.app dice», que en un teléfono
// prestado parece un aviso de una página cualquiera, y además no permite
// decir lo único que de verdad importa aquí: si hay reportes sin subir.
export default function LogoutButton({ compacto = false }: { compacto?: boolean }) {
  const [preguntando, setPreguntando] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [pendientes, setPendientes] = useState<number | null>(null);
  const [error, setError] = useState('');

  // Los reportes de la cola viven en este dispositivo y en esta sesión. Al
  // cerrarla se van sin haber llegado al servidor, así que hay que decirlo
  // antes y no después.
  useEffect(() => {
    if (!preguntando) return;
    let vivo = true;
    countOfflineReports()
      .then((n) => { if (vivo) setPendientes(n); })
      .catch(() => { if (vivo) setPendientes(null); });
    return () => { vivo = false; };
  }, [preguntando]);

  function abrir() {
    setError('');
    setPendientes(null);
    setPreguntando(true);
  }

  async function handleSalir() {
    setSaliendo(true);
    setError('');
    try {
      // ===== PASO 1: INICIAR LIMPIEZA EN BACKGROUND (no esperar) =====
      // La limpieza es lenta, así que la hacemos en paralelo sin bloquear logout
      clearOfflineData().catch(err => 
        console.warn('[LOGOUT] Limpieza en background falló:', err)
      );

      // ===== PASO 2: CERRAR SESIÓN INMEDIATAMENTE =====
      console.log('[LOGOUT] Cerrando sesión Supabase...');
      const client = createClient();
      await client.auth.signOut();

      // ===== PASO 3: LIMPIAR SESSION STORAGE =====
      try { sessionStorage.removeItem('puedeAlmacen'); } catch { /* modo privado */ }

      // ===== PASO 4: REDIRIGIR =====
      window.location.href = '/login';
    } catch (error) {
      setSaliendo(false);
      setError('No se pudo cerrar la sesión. Revisa tu conexión.');
      console.error('[LOGOUT] Error durante cierre de sesión:', error);
    }
  }

  const hayPendientes = (pendientes ?? 0) > 0;

  return (
    <>
      {compacto ? (
        <button
          onClick={abrir}
          disabled={saliendo}
          aria-label="Cerrar sesión"
          className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-ink/70 active:scale-90 transition-transform disabled:opacity-60"
        >
          <LogOut size={19} strokeWidth={2.3} />
        </button>
      ) : (
        <button
          onClick={abrir}
          disabled={saliendo}
          className="shrink-0 text-[13px] border border-line-strong text-ink/80 rounded-full px-4 min-h-[40px] flex items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-60"
        >
          <LogOut size={15} strokeWidth={2.3} />
          {saliendo ? 'Saliendo...' : 'Salir'}
        </button>
      )}

      {preguntando && (
        <ModalOverlay onClose={() => !saliendo && setPreguntando(false)}>
          <div className="glass-strong rounded-3xl w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center shrink-0">
                <LogOut size={19} strokeWidth={2.3} className="text-ink/70" />
              </span>
              <h2 className="font-display font-bold text-[19px] tracking-wide">Cerrar sesión</h2>
            </div>

            <p className="text-[14.5px] text-muted leading-relaxed mb-1">
              Vas a salir de la cuenta en este teléfono. Para volver a entrar
              necesitas tu correo y tu contraseña.
            </p>

            {hayPendientes && (
              <div className="mt-4 p-3.5 rounded-2xl bg-red/10 border border-red/25">
                <p className="text-[14px] text-red font-semibold flex items-start gap-2">
                  <AlertTriangle size={17} strokeWidth={2.5} className="shrink-0 mt-0.5" />
                  <span>
                    {pendientes === 1
                      ? 'Tienes 1 reporte sin subir'
                      : `Tienes ${pendientes} reportes sin subir`}
                  </span>
                </p>
                <p className="text-[13px] text-ink/80 mt-2 leading-relaxed">
                  {pendientes === 1 ? 'Está guardado' : 'Están guardados'} solo en este
                  teléfono y se {pendientes === 1 ? 'pierde' : 'pierden'} al cerrar la
                  sesión. Conéctate a internet y espera a que {pendientes === 1 ? 'suba' : 'suban'}.
                </p>
              </div>
            )}

            {error && (
              <p className="text-[13.5px] text-red mt-4">{error}</p>
            )}

            <div className="flex flex-col-reverse sm:flex-row gap-2.5 mt-6">
              <button
                onClick={() => setPreguntando(false)}
                disabled={saliendo}
                className="flex-1 min-h-[52px] rounded-2xl bg-surface-2 border border-line font-display font-semibold text-[15.5px] tracking-wide active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {hayPendientes ? 'Mejor no' : 'Cancelar'}
              </button>
              <button
                onClick={handleSalir}
                disabled={saliendo}
                className={`flex-1 min-h-[52px] rounded-2xl font-display font-semibold text-[15.5px] tracking-wide active:scale-[0.98] transition-transform disabled:opacity-60 ${
                  hayPendientes
                    ? 'bg-red/15 text-red border border-red/30'
                    : 'bg-teal text-inkOnAccent shadow-glow-teal'
                }`}
              >
                {saliendo ? 'Saliendo...' : hayPendientes ? 'Salir de todos modos' : 'Cerrar sesión'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </>
  );
}
