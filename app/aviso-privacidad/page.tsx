import Link from 'next/link';
import Logo from '@/components/Logo';
import { ChevronLeft } from 'lucide-react';
import { MARCA } from '@/lib/marca';

export const metadata = {
  title: `Aviso de Privacidad · ${MARCA.nombre}`,
  description: `Aviso de privacidad de la app de reportes de servicio de ${MARCA.nombre}.`,
};

const h2 = 'font-display font-bold text-[18px] mt-7 mb-2.5';
const p = 'text-[14.5px] text-ink/85 leading-relaxed mb-3';
const li = 'text-[14.5px] text-ink/85 leading-relaxed mb-1.5';

export default function AvisoPrivacidadPage() {
  return (
    <div className="max-w-2xl mx-auto pb-20">
      <div className="sticky top-0 z-20 glass-strong px-5 py-3.5 flex items-center gap-2.5">
        <Link href="/login" aria-label="Volver" className="shrink-0 w-11 h-11 -ml-1.5 rounded-full flex items-center justify-center active:scale-90 transition-transform">
          <ChevronLeft size={24} strokeWidth={2.4} />
        </Link>
        <Logo variante="completo" size={30} />
      </div>

      <div className="px-5 pt-6">
        <h1 className="font-display font-bold text-[26px] tracking-wide mb-1">Aviso de Privacidad</h1>
        <p className="text-[13px] text-muted mb-6">Última actualización: 23 de septiembre de 2026</p>

        <p className={p}>
          <strong>{MARCA.nombre}</strong>, con domicilio en {MARCA.domicilio},
          C.P. 44860 ("nosotros"), es responsable del tratamiento de los datos personales que recaba a través de
          esta aplicación de reportes de servicio, de conformidad con la Ley Federal de Protección de Datos
          Personales en Posesión de los Particulares (LFPDPPP).
        </p>

        <h2 className={h2}>¿A quién aplica este aviso?</h2>
        <p className={p}>
          A dos grupos de personas: (1) el personal técnico y de supervisión que usa esta app para su trabajo, y
          (2) las personas de contacto de nuestros clientes cuyos datos capturamos para dar seguimiento a
          proyectos y cotizaciones.
        </p>

        <h2 className={h2}>Datos personales que recabamos</h2>
        <p className={p}>Del personal que usa la app (técnicos y supervisores):</p>
        <ul className="list-disc pl-5 mb-3">
          <li className={li}>Nombre completo, correo electrónico y teléfono.</li>
          <li className={li}>Firma (autógrafa digitalizada o electrónica) en reportes y formatos.</li>
          <li className={li}>Fotografías tomadas como evidencia del trabajo realizado.</li>
          <li className={li}>
            Ubicación geográfica (GPS), únicamente al registrar llegada, inicio o cierre de un servicio, o al
            usar la detección automática de llegada mientras la app está abierta — nunca se rastrea en segundo
            plano ni fuera de esos momentos.
          </li>
        </ul>
        <p className={p}>De las personas de contacto de nuestros clientes:</p>
        <ul className="list-disc pl-5 mb-3">
          <li className={li}>Nombre, puesto, teléfono y correo electrónico del contacto.</li>
          <li className={li}>Nombre y dirección de la empresa o sitio del proyecto.</li>
        </ul>
        <p className={p}>
          No recabamos datos sensibles en el sentido que les da la ley (origen étnico, salud, creencias religiosas,
          afiliación sindical o política, preferencias sexuales, etc.).
        </p>

        <h2 className={h2}>¿Para qué usamos tus datos?</h2>
        <p className={p}>Finalidades necesarias para el servicio (sin las cuales no podemos operar):</p>
        <ul className="list-disc pl-5 mb-3">
          <li className={li}>Generar y respaldar reportes de servicio, formatos y evidencias de trabajo.</li>
          <li className={li}>Programar y dar seguimiento a servicios, proyectos y cotizaciones.</li>
          <li className={li}>Verificar puntualidad y presencia en sitio del personal técnico.</li>
          <li className={li}>Controlar inventario y resguardo de herramienta/material.</li>
          <li className={li}>Comunicarnos con nuestros clientes sobre sus proyectos y cotizaciones.</li>
        </ul>
        <p className={p}>
          No usamos tus datos para fines de mercadotecnia, publicidad o prospección comercial, ni los usamos para
          ningún fin distinto a los aquí descritos.
        </p>

        <h2 className={h2}>¿Con quién compartimos tus datos?</h2>
        <p className={p}>
          No vendemos ni compartimos tus datos con terceros para fines comerciales. Sí usamos proveedores de
          infraestructura tecnológica para operar la app — Supabase (base de datos y almacenamiento de archivos)
          y Vercel (hosting) — quienes procesan los datos únicamente para prestarnos ese servicio técnico, bajo
          sus propios compromisos de seguridad y confidencialidad. Esto puede implicar que los datos se almacenen
          en servidores fuera de México.
        </p>

        <h2 className={h2}>Cookies</h2>
        <p className={p}>
          Esta app usa únicamente una cookie técnica indispensable para mantener tu sesión iniciada. No usamos
          cookies de rastreo, publicidad ni analítica de terceros.
        </p>

        <h2 className={h2}>Derechos ARCO</h2>
        <p className={p}>
          Puedes solicitar en cualquier momento el Acceso, Rectificación, Cancelación u Oposición (derechos ARCO)
          al tratamiento de tus datos personales, así como revocar tu consentimiento, escribiendo a{' '}
          <a href={`mailto:${MARCA.correoSoporte}`} className="text-teal underline">{MARCA.correoSoporte}</a> o llamando al
          33 1567 2378. Responderemos tu solicitud en un plazo razonable conforme a la ley.
        </p>

        <h2 className={h2}>Cambios a este aviso</h2>
        <p className={p}>
          Podemos actualizar este aviso de privacidad. Cualquier cambio se publicará en esta misma página con su
          fecha de actualización.
        </p>
      </div>
    </div>
  );
}
