import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabaseServer';
import ProfileForm from '@/components/ProfileForm';
import CambiarContrasena from '@/components/CambiarContrasena';
import AdminUsersSection from '@/components/AdminUsersSection';
import LogoutButton from '@/components/LogoutButton';
import ThemeToggle from '@/components/ThemeToggle';
import Logo from '@/components/Logo';
import { ChevronLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type UsuarioLista = {
  id: string;
  full_name: string;
  role: string;
  telefono?: string;
  activo?: boolean;
  can_manage_usuarios?: boolean;
  created_at: string;
};

export default async function PerfilPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/login');

  // El permiso vive en la base (patch_gestion_usuarios.sql), no en una lista aqui.
  const esGestor = profile.can_manage_usuarios === true;
  const volverA = profile.role === 'supervisor' ? '/dashboard' : '/mis-reportes';

  let usuarios: UsuarioLista[] = [];
  if (esGestor) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, telefono, activo, can_manage_usuarios, created_at')
      .order('full_name', { ascending: true });
    usuarios = data || [];
  }

  return (
    <div className="max-w-2xl lg:max-w-4xl mx-auto pb-28 lg:pb-16">
      <div className="sticky top-0 z-20 glass-strong px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            href={volverA}
            aria-label="Volver"
            className="shrink-0 w-11 h-11 -ml-1.5 rounded-full flex items-center justify-center active:scale-90 transition-transform"
          >
            <ChevronLeft size={24} strokeWidth={2.4} />
          </Link>
          <Logo variante="completo" size={32} className="min-w-0" compactoEnMovil />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ThemeToggle />
          <LogoutButton compacto />
        </div>
      </div>

      <div className="px-4 pt-5">
        <h1 className="font-display font-bold text-2xl lg:text-3xl tracking-wide mb-1.5">Mi perfil</h1>
        <p className="text-[15px] text-muted font-medium mb-5">Tus datos de contacto</p>

        <ProfileForm user={user} profile={profile} />

        <CambiarContrasena email={user.email || ''} />

        {esGestor && <AdminUsersSection initialUsers={usuarios} />}
      </div>
    </div>
  );
}
