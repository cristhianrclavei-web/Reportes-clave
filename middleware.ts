import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // getUser() puede refrescar el token de sesion. Cuando eso pasa, las
  // cookies nuevas quedan escritas en 'response'. Si devolvemos un
  // redirect nuevo sin copiarlas, el refresco se pierde y la sesion se
  // cae sola. Esta funcion las traslada al redirect.
  const redirigirConservandoSesion = (destino: URL) => {
    const redirect = NextResponse.redirect(destino);
    response.cookies.getAll().forEach((cookie) => {
      redirect.cookies.set(cookie);
    });
    return redirect;
  };

  const protectedPaths = ['/nuevo', '/dashboard', '/mis-reportes', '/bitacora', '/servicios', '/checklists'];
  const isProtected = protectedPaths.some((p) => request.nextUrl.pathname.startsWith(p));

  if (isProtected && !user) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('next', request.nextUrl.pathname);
    return redirigirConservandoSesion(redirectUrl);
  }

  if (request.nextUrl.pathname === '/login' && user) {
    return redirigirConservandoSesion(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/nuevo/:path*',
    '/dashboard/:path*',
    '/mis-reportes/:path*',
    '/bitacora/:path*',
    '/servicios/:path*',
    // Estaba en protectedPaths pero faltaba aqui: el middleware no corria
    // en esta ruta. La pagina ya valida sesion por su cuenta, asi que no
    // habia exposicion, pero la redireccion a /login no ocurria en el
    // borde como en las demas rutas.
    '/checklists/:path*',
    '/login',
  ],
};
