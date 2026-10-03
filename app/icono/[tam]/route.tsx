import { ImageResponse } from 'next/og';
import { MARCA } from '@/lib/marca';
import { BARLOW_CONDENSED_BOLD_BASE64 } from '@/lib/brandFonts';

// Ícono de la app (pestaña y app instalada) dibujado con las iniciales de la
// marca: el mismo escudo de components/Logo.tsx sobre el fondo oscuro de la
// app. Lo usan las instalaciones con marca propia; Clave Inteligente sigue
// con sus imágenes de public/icons (ver lib/marca.ts → iconoApp()).
const VERDE = '#2F7D5C';
const FONDO = '#0A121C';
const TAMANOS = [192, 512];

export const dynamic = 'force-static';

export function generateStaticParams() {
  return TAMANOS.map((t) => ({ tam: String(t) }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ tam: string }> }) {
  const { tam } = await params;
  const lado = Number(tam);
  if (!TAMANOS.includes(lado)) return new Response('No encontrado', { status: 404 });

  const escudo = lado * 0.74;
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: FONDO, position: 'relative',
        }}
      >
        <svg width={escudo} height={escudo} viewBox="0 0 100 100" fill="none">
          <path d="M50 8 L84 26 V64 L50 92 L16 64 V26 Z" stroke={VERDE} strokeWidth="6" strokeLinejoin="round" />
          <circle cx="50" cy="8" r="7" fill={VERDE} />
          <circle cx="16" cy="45" r="7" fill={VERDE} />
          <circle cx="50" cy="92" r="7" fill={VERDE} />
          <path d="M16 45 L50 92" stroke={VERDE} strokeWidth="5" strokeLinecap="round" />
        </svg>
        <div
          style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#FFFFFF', fontFamily: 'Barlow', fontWeight: 700,
            fontSize: escudo * (MARCA.iniciales.length > 2 ? 0.3 : 0.38),
            letterSpacing: escudo * 0.01,
          }}
        >
          {MARCA.iniciales}
        </div>
      </div>
    ),
    {
      width: lado,
      height: lado,
      fonts: [{ name: 'Barlow', data: Buffer.from(BARLOW_CONDENSED_BOLD_BASE64, 'base64'), weight: 700, style: 'normal' }],
    },
  );
}
