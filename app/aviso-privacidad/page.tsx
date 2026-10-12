import Link from 'next/link';
import Logo from '@/components/Logo';
import { ChevronLeft } from 'lucide-react';
import { MARCA } from '@/lib/marca';
import { FECHA_AVISO } from '@/lib/privacidad';

export const metadata = {
  title: `Aviso de Privacidad · ${MARCA.nombre}`,
  description: `Aviso de privacidad de la app de ${MARCA.nombre}.`,
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
        <p className="text-[13px] text-muted mb-6">Última actualización: {FECHA_AVISO}</p>

        <p className={p}>
          <strong>{MARCA.nombre}</strong>, con domicilio en {MARCA.domicilio}, C.P. 44860 («nosotros»), es responsable del
          tratamiento de los datos personales que se recaban en esta aplicación, conforme a la legislación mexicana
          de protección de datos personales en posesión de los particulares.
        </p>

        <h2 className={h2}>¿A quién aplica este aviso?</h2>
        <ul className="list-disc pl-5 mb-3">
          <li className={li}>Al personal que usa la app para su trabajo: técnicos, supervisión, almacén y administración.</li>
          <li className={li}>A las personas de contacto de nuestros clientes, y a quienes firman un reporte o reciben un servicio.</li>
          <li className={li}>A las personas que el personal registra como contacto de emergencia.</li>
        </ul>

        <h2 className={h2}>Datos personales que recabamos</h2>
        <p className={p}>Del personal que usa la app:</p>
        <ul className="list-disc pl-5 mb-3">
          <li className={li}><strong>Identificación y contacto:</strong> nombre completo, correo electrónico, teléfono, puesto, apodo, especialidades y, si la persona la sube, una foto de perfil.</li>
          <li className={li}><strong>Contacto de emergencia:</strong> nombre y teléfono de la persona que el trabajador indique.</li>
          <li className={li}><strong>Firma:</strong> la firma trazada en pantalla en reportes, vales de almacén, listas de carga y solicitudes.</li>
          <li className={li}><strong>Ubicación geográfica,</strong> en los momentos que se describen más abajo.</li>
          <li className={li}><strong>Registros de trabajo:</strong> horas de llegada, inicio, pausas y cierre de cada servicio, motivos de retraso o de espera, tareas realizadas y actividades de bitácora.</li>
          <li className={li}><strong>Fotografías y videos</strong> tomados como evidencia del trabajo.</li>
          <li className={li}><strong>Solicitudes de personal:</strong> horas extra, vacaciones y permisos, con el motivo que la persona escriba y los archivos que adjunte.</li>
          <li className={li}><strong>Uso del asistente:</strong> las preguntas que la persona le hace, las fotos que le adjunta y las respuestas que recibe.</li>
          <li className={li}><strong>Datos técnicos:</strong> fecha y hora de acceso y el identificador que el navegador genera para poder enviar notificaciones al teléfono.</li>
        </ul>
        <p className={p}>De los clientes y sus contactos:</p>
        <ul className="list-disc pl-5 mb-3">
          <li className={li}>Nombre, puesto, teléfono y correo electrónico de la persona de contacto.</li>
          <li className={li}>Nombre, domicilio y ubicación del sitio donde se presta el servicio.</li>
          <li className={li}>Nombre y firma de quien recibe el servicio o firma el reporte.</li>
        </ul>
        <p className={p}>
          No solicitamos datos sensibles. Si en una solicitud de permiso describes un padecimiento de salud, ese
          dato se usa únicamente para resolver la solicitud; te pedimos no incluir más detalle del necesario.
        </p>
        <p className={p}>
          Las fotografías y videos de evidencia se toman en las instalaciones del cliente y pueden mostrar de forma
          incidental a otras personas. Su único fin es documentar el trabajo realizado.
        </p>

        <h2 className={h2}>¿Para qué usamos tus datos?</h2>
        <p className={p}>Finalidades necesarias, sin las cuales no se puede operar:</p>
        <ul className="list-disc pl-5 mb-3">
          <li className={li}>Programar, asignar y dar seguimiento a servicios, proyectos y cotizaciones.</li>
          <li className={li}>Generar y respaldar reportes de servicio, formatos y evidencias del trabajo, y entregarlos al cliente.</li>
          <li className={li}>Verificar la puntualidad, la presencia en el sitio y el tiempo efectivamente trabajado del personal.</li>
          <li className={li}>Controlar el inventario y el resguardo de herramienta y material.</li>
          <li className={li}>Tramitar solicitudes de horas extra, vacaciones y permisos.</li>
          <li className={li}>Enviar avisos y recordatorios relacionados con el trabajo.</li>
          <li className={li}>Responder las consultas que el personal hace al asistente de la app.</li>
          <li className={li}>Atender una emergencia que ocurra durante el trabajo, por medio del contacto que el trabajador indicó.</li>
          <li className={li}>Comunicarnos con los clientes sobre sus servicios y cotizaciones.</li>
        </ul>
        <p className={p}>
          No usamos tus datos para mercadotecnia, publicidad ni prospección comercial, ni para ningún fin distinto
          a los aquí descritos.
        </p>

        <h2 className={h2}>Cómo y cuándo usamos tu ubicación</h2>
        <p className={p}>La app toma la ubicación del teléfono solo en estos casos:</p>
        <ul className="list-disc pl-5 mb-3">
          <li className={li}>Al registrar la llegada, el inicio, una pausa, la reanudación o el cierre de un servicio.</li>
          <li className={li}>Al registrar el avance de una tarea, una foto o un video de evidencia.</li>
          <li className={li}>Al iniciar o registrar una actividad en la bitácora.</li>
          <li className={li}>Al responder una verificación de presencia que pida supervisión.</li>
          <li className={li}>Mientras la pantalla de un servicio está abierta, para marcar la llegada al entrar al sitio y para avisar si la persona se aleja del sitio con el servicio en curso.</li>
        </ul>
        <p className={p}>
          <strong>La app no rastrea la ubicación en segundo plano:</strong> con la app cerrada o el teléfono guardado
          no se toma ninguna ubicación. La ubicación registrada queda visible para supervisión. El permiso de
          ubicación se puede retirar desde el teléfono; sin él, la llegada no se marca sola y los registros quedan
          sin ubicación.
        </p>

        <h2 className={h2}>¿Con quién compartimos tus datos?</h2>
        <p className={p}>
          No vendemos tus datos ni los compartimos con fines comerciales. Para operar la app usamos estos
          proveedores, que tratan los datos solo para prestarnos su servicio. Varios guardan o procesan la
          información fuera de México.
        </p>
        <ul className="list-disc pl-5 mb-3">
          <li className={li}><strong>Supabase</strong> (base de datos, cuentas y almacenamiento de archivos): todo lo que se registra en la app, incluidas fotos, videos y firmas.</li>
          <li className={li}><strong>Vercel</strong> (alojamiento de la aplicación): los datos que pasan por la app al usarla.</li>
          <li className={li}><strong>Anthropic</strong> (asistente con inteligencia artificial): las preguntas hechas al asistente, las fotos que se le adjuntan y la información de la app necesaria para responder.</li>
          <li className={li}><strong>ElevenLabs</strong> (voz del asistente): el texto de la respuesta que se va a leer en voz alta.</li>
          <li className={li}><strong>Servicio de notificaciones del navegador</strong> (Google, Apple o Mozilla, según el teléfono): el título y el texto de cada aviso.</li>
          <li className={li}><strong>Servicios de mapas de OpenStreetMap</strong> (búsqueda de direcciones): el texto buscado o las coordenadas del punto.</li>
        </ul>
        <p className={p}>
          Además, a nuestros clientes les entregamos el reporte de su servicio, con el nombre y la firma del
          personal que lo atendió y las evidencias que correspondan; el enlace de un video de evidencia incluido en
          un reporte puede abrirse sin cuenta por quien tenga ese reporte. También podemos entregar información a
          una autoridad cuando una ley o una orden nos obligue.
        </p>

        <h2 className={h2}>¿Cuánto tiempo conservamos tus datos?</h2>
        <p className={p}>
          Mientras dure la relación de trabajo o de servicio, y después el tiempo necesario para cumplir las
          obligaciones legales, fiscales y contractuales que apliquen; por ejemplo, el respaldo de un servicio ante
          el cliente. Cuando ya no son necesarios, se eliminan.
        </p>

        <h2 className={h2}>¿Cómo protegemos tus datos?</h2>
        <ul className="list-disc pl-5 mb-3">
          <li className={li}>Cada persona entra con su propia cuenta y contraseña, y solo ve lo que le corresponde según su función.</li>
          <li className={li}>La información viaja cifrada entre el teléfono y los servidores.</li>
          <li className={li}>Las fotos, videos y documentos se abren con enlaces temporales.</li>
          <li className={li}>Queda registro de quién hizo cada cambio relevante.</li>
        </ul>

        <h2 className={h2}>¿Qué se guarda en tu teléfono?</h2>
        <p className={p}>
          La app usa una cookie técnica para mantener la sesión iniciada. También guarda en el teléfono, de forma
          temporal, borradores, reportes y fotos pendientes de subir cuando no hay señal, y algunas preferencias
          de pantalla. No usamos cookies de publicidad ni de analítica de terceros.
        </p>

        <h2 className={h2}>Tus derechos</h2>
        <p className={p}>
          Puedes pedir en cualquier momento el Acceso, la Rectificación, la Cancelación u Oposición al tratamiento
          de tus datos (derechos ARCO), limitar su uso o divulgación, y revocar tu consentimiento, escribiendo a{' '}
          <a href={`mailto:${MARCA.correoSoporte}`} className="text-teal underline">{MARCA.correoSoporte}</a> o llamando al{' '}
          <a href="tel:+523315672378" className="text-teal underline">33 1567 2378</a>. Indica tu nombre completo,
          qué derecho quieres ejercer y sobre qué datos, y un medio para responderte. Responderemos en los plazos
          que establece la ley.
        </p>
        <p className={p}>
          Algunos datos no se pueden cancelar mientras exista una obligación legal o contractual de conservarlos;
          por ejemplo, un reporte ya entregado al cliente. Si consideras que tu solicitud no fue atendida, puedes
          acudir a la autoridad competente en materia de protección de datos personales.
        </p>

        <h2 className={h2}>Tu consentimiento</h2>
        <p className={p}>
          El personal acepta este aviso de forma expresa la primera vez que entra a la app y cada vez que el aviso
          cambia; queda registrada la fecha y la hora de la aceptación.
        </p>

        <h2 className={h2}>Cambios a este aviso</h2>
        <p className={p}>
          Podemos actualizar este aviso. La versión vigente está siempre en esta página, con su fecha de
          actualización. Si el cambio afecta la forma en que tratamos tus datos, la app te pedirá aceptarlo de
          nuevo.
        </p>
      </div>
    </div>
  );
}
