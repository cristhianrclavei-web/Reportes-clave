import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabaseServer';
import ProfileForm from '@/components/ProfileForm';
import PersonalizarPerfil from '@/components/PersonalizarPerfil';
import CambiarContrasena from '@/components/CambiarContrasena';
import AdminUsersSection from '@/components/AdminUsersSection';
import LogoutButton from '@/components/LogoutButton';
import ThemeToggle from '@/components/ThemeToggle';
import Logo from '@/components/Logo';
import PanelSupervisor from '@/components/PanelSupervisor';
import { ChevronLeft, ChevronRight, BadgeCheck, UserCog, CircleHelp } from 'lucide-react';
import { DEMO } from '@/lib/marca';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type UsuarioLista = {
  id: string;
  full_name: string;
  role: string;
  telefono?: string;
  activo?: boolean;
  can_manage_usuarios?: boolean;
  can_manage_almacen?: boolean;
  can_manage_billing?: boolean;
  can_approve_review?: boolean;
  can_approve_cotizacion?: boolean;
  can_approve_personal?: boolean;
  created_at: string;
};

export default async function PerfilPage() {
  const supabase = await createClient();
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
  const esSupervisor = profile.role === 'supervisor';
  const volverA = esSupervisor ? '/dashboard' : '/mis-reportes';

  let usuarios: UsuarioLista[] = [];
  if (esGestor) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, telefono, activo, can_manage_usuarios, can_manage_almacen, can_manage_billing, can_approve_review, can_approve_cotizacion, can_approve_personal, created_at')
      .order('full_name', { ascending: true });
    usuarios = data || [];
  }

  // Quien supervisa ve su perfil dentro del panel (barra de secciones y
  // buscador), como cualquier otra sección; en computadora sobra entonces el
  // encabezado propio de esta página.
  const contenido = (
    <div className={`max-w-2xl lg:max-w-none mx-auto pb-28 lg:pb-16 ${esSupervisor ? 'lg:px-8 2xl:px-10' : 'lg:px-6'}`}>
      <div className={`sticky top-0 z-20 glass-strong px-5 py-3.5 flex items-center justify-between gap-3 ${esSupervisor ? 'lg:hidden' : ''}`}>
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

      <div className={`px-4 pt-5 ${esSupervisor ? 'lg:px-0 lg:pt-8' : ''}`}>
        <h1 className={`font-display font-bold text-2xl tracking-wide mb-1.5 ${esSupervisor ? 'lg:text-[34px] lg:leading-tight' : 'lg:text-3xl'}`}>Mi perfil</h1>
        <p className="text-[15px] text-muted font-medium mb-5">Cómo te ven los demás, tus datos de contacto y tu cuenta</p>

        {/* Las secciones que no son del formulario de perfil van dentro, al
            final de la columna derecha, para compartir el mismo acomodo. */}
        <PersonalizarPerfil profile={profile}>
          <ProfileForm user={user} profile={profile} />

          {/* En el demo las cuentas son compartidas: nadie cambia su contraseña. */}
          {!DEMO.activo && <CambiarContrasena email={user.email || ''} />}

          {profile.role === 'supervisor' && (
            <Link
              href="/suscripcion"
              className="rounded-2xl bg-surface border border-line p-5 flex items-center gap-3 hover:border-teal/50 active:scale-[0.99] transition-all"
            >
              <BadgeCheck size={20} strokeWidth={2.4} className="text-teal shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-display font-bold text-[19px] tracking-wide">Suscripción</p>
                <p className="text-[13px] text-muted">Plan, días restantes y paquetes</p>
              </div>
              <ChevronRight size={20} className="text-muted shrink-0" />
            </Link>
          )}

          {/* Usuarios: quien supervisa los administra en Personal → Usuarios
              (alta, rol, permisos, baja). El gestor que no es supervisor
              conserva aquí la lista sencilla. */}
          {esGestor && profile.role === 'supervisor' && (
            <Link
              href="/dashboard/personal?sub=usuarios"
              className="rounded-2xl bg-surface border border-line p-5 flex items-center gap-3 hover:border-teal/50 active:scale-[0.99] transition-all"
            >
              <UserCog size={20} strokeWidth={2.4} className="text-teal shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-display font-bold text-[19px] tracking-wide">Usuarios</p>
                <p className="text-[13px] text-muted">Altas, roles, permisos y bajas</p>
              </div>
              <ChevronRight size={20} className="text-muted shrink-0" />
            </Link>
          )}
          {esGestor && profile.role !== 'supervisor' && <AdminUsersSection initialUsers={usuarios} />}
        </PersonalizarPerfil>

        <Link
          href="/ayuda"
          className="mt-4 rounded-2xl bg-surface border border-line p-4 flex items-center gap-3 hover:border-teal/50 active:scale-[0.99] transition-all"
        >
          <CircleHelp size={20} strokeWidth={2.2} className="text-teal shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[15px]">Manual de uso</p>
            <p className="text-[13px] text-muted">Cómo se usa la app, paso a paso</p>
          </div>
          <ChevronRight size={20} className="text-muted shrink-0" />
        </Link>

        <Link
          href="/aviso-privacidad"
          className="block text-center text-[12.5px] text-faint mt-8 mb-2 min-h-[40px] flex items-center justify-center"
        >
          Aviso de privacidad
        </Link>
      </div>
    </div>
  );

  return esSupervisor ? <PanelSupervisor userName={profile.full_name || user.email || ''}>{contenido}</PanelSupervisor> : contenido;
}
