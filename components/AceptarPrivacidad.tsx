'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabaseClient';
import { VERSION_AVISO } from '@/lib/privacidad';
import { DEMO } from '@/lib/marca';

// Pantalla de aceptación del aviso de privacidad. Aparece la primera vez que
// cada persona entra y cada vez que el aviso cambia de versión; no deja
// seguir hasta aceptar, y guarda quién aceptó, qué versión y cuándo
// (supabase/patch_aceptacion_privacidad.sql).
//
// Nunca estorba la captura: si no se puede consultar (sin señal, o la base
// todavía no tiene la tabla), no se muestra y se vuelve a intentar después.

// Pantallas públicas o donde el aviso mismo se lee: ahí no se pide.
const RUTAS_SIN_AVISO = ['/login', '/restablecer', '/aviso-privacidad', '/firmar', '/evidencia', '/verificar'];

const claveLocal = (usuarioId: string) => `aviso-privacidad-${usuarioId}`;

export default function AceptarPrivacidad() {
  const ruta = usePathname();
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);
  const [marcada, setMarcada] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ya se resolvió en esta visita (aceptado o no aplica): no se vuelve a preguntar a la base.
  const resueltoRef = useRef(false);

  const rutaPublica = RUTAS_SIN_AVISO.some((r) => ruta === r || ruta.startsWith(r + '/'));

  useEffect(() => {
    // En el demo las cuentas son compartidas: no hay a quién pedirle la aceptación.
    if (DEMO.activo || rutaPublica || resueltoRef.current) return;
    let vigente = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !vigente) return;
        setUsuarioId(user.id);

        // Copia en el teléfono para no depender de la señal en cada entrada.
        if (localStorage.getItem(claveLocal(user.id)) === VERSION_AVISO) {
          resueltoRef.current = true;
          return;
        }
        const { data, error: errorConsulta } = await supabase
          .from('aceptaciones_privacidad').select('id')
          .eq('usuario_id', user.id).eq('version', VERSION_AVISO).maybeSingle();
        if (!vigente || errorConsulta) return; // sin señal o sin tabla: se reintenta al cambiar de pantalla
        if (data) {
          localStorage.setItem(claveLocal(user.id), VERSION_AVISO);
          resueltoRef.current = true;
          return;
        }
        setPendiente(true);
      } catch {
        // Almacenamiento bloqueado o sin red: no se muestra; la app sigue.
      }
    })();
    return () => { vigente = false; };
  }, [ruta, rutaPublica]);

  async function aceptar() {
    if (!usuarioId || !marcada) return;
    setGuardando(true);
    setError(null);
    const { error: errorAlta } = await createClient()
      .from('aceptaciones_privacidad').insert({ usuario_id: usuarioId, version: VERSION_AVISO });
    setGuardando(false);
    // 23505 = ya estaba registrada (se aceptó en otro dispositivo): cuenta como aceptada.
    if (errorAlta && errorAlta.code !== '23505') {
      setError('No se pudo guardar tu aceptación. Revisa tu conexión e inténtalo de nuevo.');
      return;
    }
    try { localStorage.setItem(claveLocal(usuarioId), VERSION_AVISO); } catch { /* sin almacenamiento: se consultará de nuevo */ }
    resueltoRef.current = true;
    setPendiente(false);
  }

  if (!pendiente || rutaPublica) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-aviso-privacidad">
      <div className="w-full max-w-md rounded-3xl bg-surface border border-line shadow-diffuse p-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center gap-3 mb-3">
          <span className="w-10 h-10 rounded-full bg-teal/15 text-teal flex items-center justify-center shrink-0">
            <ShieldCheck size={20} strokeWidth={2.4} />
          </span>
          <p id="titulo-aviso-privacidad" className="font-display font-bold text-[19px] tracking-wide leading-tight">Antes de continuar</p>
        </div>

        <p className="text-[14px] text-ink/85 leading-relaxed mb-2.5">
          Para usar la app necesitamos tratar algunos datos tuyos: tu nombre y contacto, tu firma, las fotos y videos de tu trabajo, tus horarios y tu ubicación al registrar tu actividad.
        </p>
        <p className="text-[14px] text-ink/85 leading-relaxed mb-3">
          La ubicación solo se toma cuando registras algo o tienes abierta la pantalla de un servicio; <b className="text-ink">nunca con la app cerrada</b>.
        </p>
        <Link href="/aviso-privacidad" target="_blank" className="inline-block text-[14px] font-semibold text-teal underline underline-offset-4 mb-4">
          Leer el Aviso de privacidad completo
        </Link>

        <label className="flex items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-3 cursor-pointer">
          <input type="checkbox" checked={marcada} onChange={(e) => setMarcada(e.target.checked)} className="mt-0.5 w-5 h-5 accent-teal shrink-0" />
          <span className="text-[14px] leading-snug">Leí y acepto el Aviso de privacidad.</span>
        </label>
        {!marcada && <p className="text-[12.5px] text-muted mt-1.5">Marca la casilla para poder continuar.</p>}
        {error && <p role="alert" className="text-[13px] text-red font-medium mt-2">{error}</p>}

        <button
          type="button"
          onClick={aceptar}
          disabled={!marcada || guardando}
          className="w-full mt-4 min-h-[52px] rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15.5px] active:scale-95 transition-transform disabled:opacity-50"
        >
          {guardando ? 'Guardando...' : 'Aceptar y continuar'}
        </button>
      </div>
    </div>
  );
}
