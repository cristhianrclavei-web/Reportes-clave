import { ReactNode } from 'react';
import { createClient } from '@/lib/supabaseServer';
import PanelSupervisor from '@/components/PanelSupervisor';

// Layout compartido del panel del supervisor. Cada página sigue validando
// sesión y rol por su cuenta; aquí solo se arma lo que debe sobrevivir al
// cambiar de sección (barra de la computadora y preferencia de vista).
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let userName = '';
  if (user) {
    const { data } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
    userName = data?.full_name || user.email || '';
  }
  return <PanelSupervisor userName={userName}>{children}</PanelSupervisor>;
}
