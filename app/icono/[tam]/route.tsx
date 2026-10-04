import { ImageResponse } from 'next/og';
import { MARCA, COLORES } from '@/lib/marca';
import { BARLOW_CONDENSED_BOLD_BASE64 } from '@/lib/brandFonts';
import { ESCUDO_CONTORNO, ESCUDO_RAMAL, ESCUDO_TRAZO, ESCUDO_NODOS } from '@/lib/logoMarca';

// Ícono de la app (pestaña y app instalada) dibujado con las iniciales de la
// marca: el mismo escudo de components/Logo.tsx sobre el fondo oscuro de la
// app. Lo usan las instalaciones con marca propia; Clave Inteligente sigue
// con sus imágenes de public/icons (ver lib/marca.ts → iconoApp()).
const VERDE = COLORES.logo;
const FONDO = COLORES.fondo;
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
  const fuentes = [{ name: 'Barlow', data: Buffer.from(BARLOW_CONDENSED_BOLD_BASE64, 'base64'), weight: 700 as const, style: 'normal' as const }];

  // Marca «bloque»: el ícono completo es el cuadro con degradado (el
  // sistema ya le redondea las esquinas al instalarla).
  if (MARCA.logo === 'bloque') {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundImage: `linear-gradient(135deg, ${COLORES.logo2}, ${COLORES.logo})`, position: 'relative',
            color: '#FFFFFF', fontFamily: 'Barlow', fontWeight: 700,
            fontSize: lado * (MARCA.iniciales.length > 2 ? 0.36 : 0.46), letterSpacing: lado * 0.01,
          }}
        >
          <svg width={lado} height={lado} viewBox="0 0 100 100" fill="none" style={{ position: 'absolute', top: 0, left: 0 }}>
            <path d="M70 16 L84 30" stroke="#FFFFFF" strokeOpacity="0.75" strokeWidth="3" strokeLinecap="round" />
            <circle cx="70" cy="16" r="4.5" fill="#FFFFFF" />
            <circle cx="84" cy="30" r="4.5" fill="#FFFFFF" />
          </svg>
          {MARCA.iniciales}
        </div>
      ),
      { width: lado, height: lado, fonts: fuentes },
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: FONDO, position: 'relative',
        }}
      >
        <svg width={escudo} height={escudo} viewBox="0 0 100 100" fill="none">
          <path d={ESCUDO_CONTORNO} stroke={VERDE} strokeWidth={ESCUDO_TRAZO} strokeLinecap="round" strokeLinejoin="round" />
          <path d={ESCUDO_RAMAL} stroke={VERDE} strokeWidth={ESCUDO_TRAZO} strokeLinecap="round" />
          {ESCUDO_NODOS.map(([cx, cy, r]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={VERDE} />)}
        </svg>
        <div
          style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#FFFFFF', fontFamily: 'Barlow', fontWeight: 700,
            fontSize: escudo * (MARCA.iniciales.length > 2 ? 0.35 : 0.46),
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
