import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Cliente con privilegios de servidor. Salta las políticas RLS, así que solo
// puede usarse en código que corre en el servidor (route handlers), nunca en
// un componente de cliente.
//
// Existe porque hay dos cosas que la sesión del usuario no puede hacer y que
// aun así son legítimas:
//
//   1. Leer las suscripciones push de otras personas para poder enviarles un
//      aviso. La RLS de push_suscripciones limita cada quien a las suyas.
//   2. Borrar la fila de una suscripción que ya no sirve cuando pertenece a
//      otro usuario: un teléfono prestado donde antes entró un supervisor, o
//      un endpoint que el navegador desechó.
//
// Antes esos borrados se intentaban con la sesión del usuario. Postgres no
// falla al borrar cero filas, así que la RLS los bloqueaba en silencio y la
// tabla se iba llenando de suscripciones muertas que seguían recibiendo
// intentos de envío.
//
// La llave es una secret key de Supabase (sb_secret_...), la sustituta de la
// vieja service_role. Devuelve 401 si alguien la usa desde un navegador, así
// que una fuga accidental al cliente no da acceso — pero eso es una red de
// seguridad, no una licencia: la variable no lleva prefijo NEXT_PUBLIC_ y no
// debe aparecer en ningún archivo del repositorio.

export function hayClienteAdmin(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    throw new Error(
      'Falta SUPABASE_SECRET_KEY. Agrégala en Vercel > Settings > Environment Variables.'
    );
  }

  // Sin persistencia de sesión: este cliente no representa a una persona, se
  // crea por petición y muere con ella.
  return createSupabaseClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
