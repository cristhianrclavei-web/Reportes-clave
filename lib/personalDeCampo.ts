import { createClient } from './supabaseClient';

// Personal que se puede asignar a un servicio: el personal técnico y quien de
// supervisión tiene el permiso «Sale a servicios» (patch_sale_a_servicios.sql).
// Si ese SQL todavía no se corre, la columna no existe: se usa solo el
// personal técnico, como antes, para no dejar sin lista a quien agenda.
export async function consultarPersonalDeCampo(columnas: string) {
  const supabase = createClient();
  const conSupervision = await supabase
    .from('profiles')
    .select(columnas)
    .or('role.eq.tecnico,sale_a_servicios.eq.true')
    .order('full_name');
  if (!conSupervision.error || !/sale_a_servicios/.test(conSupervision.error.message)) return conSupervision;
  console.error('Falta correr supabase/patch_sale_a_servicios.sql en la base.');
  return supabase.from('profiles').select(columnas).eq('role', 'tecnico').order('full_name');
}
