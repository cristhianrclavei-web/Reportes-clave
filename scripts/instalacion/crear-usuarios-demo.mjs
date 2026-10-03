// Crea las 4 cuentas del demo en el proyecto Supabase DESTINO.
//
//   supervisor@demo.servitec.test   (acceso rápido «Supervisor» del login)
//   tecnico@demo.servitec.test      (acceso rápido «Técnico»)
//   tecnico2@demo.servitec.test     (no inicia sesión: contraseña aleatoria)
//   tecnico3@demo.servitec.test     (no inicia sesión: contraseña aleatoria)
//
// Lee de .env.instalacion:
//   DESTINO_SUPABASE_URL, DESTINO_SECRET_KEY (service role / secret key),
//   DEMO_SUPERVISOR_CONTRASENA, DEMO_TECNICO_CONTRASENA
//
// Uso (después de correr supabase/demo/reiniciar_demo.sql en el demo):
//   node scripts/instalacion/crear-usuarios-demo.mjs
// Si una cuenta ya existe, solo le actualiza la contraseña.
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.instalacion', import.meta.url), 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*'?(.*?)'?\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
for (const k of ['DESTINO_SUPABASE_URL', 'DESTINO_SECRET_KEY', 'DEMO_SUPERVISOR_CONTRASENA', 'DEMO_TECNICO_CONTRASENA']) {
  if (!env[k]) { console.error(`Falta ${k} en .env.instalacion`); process.exit(1); }
}

const supabase = createClient(env.DESTINO_SUPABASE_URL, env.DESTINO_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DOMINIO = '@demo.servitec.test';
const cuentas = [
  { usuario: 'supervisor', nombre: 'Laura Méndez', rol: 'supervisor', contrasena: env.DEMO_SUPERVISOR_CONTRASENA },
  { usuario: 'tecnico', nombre: 'Jorge Ramírez', rol: 'tecnico', contrasena: env.DEMO_TECNICO_CONTRASENA },
  { usuario: 'tecnico2', nombre: 'Miguel Torres', rol: 'tecnico', contrasena: randomBytes(18).toString('base64url') },
  { usuario: 'tecnico3', nombre: 'Daniel Ortiz', rol: 'tecnico', contrasena: randomBytes(18).toString('base64url') },
];

const { data: lista, error: eLista } = await supabase.auth.admin.listUsers({ perPage: 1000 });
if (eLista) { console.error('No se pudo leer usuarios:', eLista.message); process.exit(1); }

for (const c of cuentas) {
  const email = c.usuario + DOMINIO;
  const existente = lista.users.find((u) => u.email === email);
  if (existente) {
    const { error } = await supabase.auth.admin.updateUserById(existente.id, { password: c.contrasena });
    console.log(error ? `✗ ${email}: ${error.message}` : `↻ ${email} (contraseña actualizada)`);
  } else {
    const { error } = await supabase.auth.admin.createUser({
      email,
      password: c.contrasena,
      email_confirm: true,
      user_metadata: { full_name: c.nombre, role: c.rol },
    });
    console.log(error ? `✗ ${email}: ${error.message}` : `✓ ${email}`);
  }
}
// El reinicio nocturno vuelve a poner estas contraseñas (por si alguien las cambió).
const { error: eAccesos } = await supabase.from('demo_accesos').upsert(
  cuentas.slice(0, 2).map((c) => ({ email: c.usuario + DOMINIO, contrasena: c.contrasena })),
);
if (eAccesos) console.log('✗ demo_accesos:', eAccesos.message, '(¿ya corriste supabase/demo/reiniciar_demo.sql?)');

console.log('\nSiguiente: en el SQL Editor, «select public.reiniciar_demo();»');
