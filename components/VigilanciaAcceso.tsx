'use client';

import { motion, useReducedMotion } from 'motion/react';

// Adornos del formulario de acceso: dos cámaras de vigilancia en las esquinas
// de arriba y una sirena al centro. Reaccionan a lo que hace la persona:
//
//   vigila  → nadie escribe: las cámaras barren despacio.
//   correo  → se escribe el correo: las dos apuntan al campo y siguen el texto.
//   clave   → se escribe la contraseña: voltean hacia otro lado, cierran el
//             lente y apagan la luz de grabación (no «ven» la contraseña).
//   alarma  → contraseña equivocada: giran de golpe al formulario y la sirena
//             se enciende unos segundos.
//   bloqueo → demasiados intentos: la sirena queda encendida fija.
//
// Es solo decoración (aria-hidden): el aviso de error real sigue siendo el
// texto del formulario.
export type ModoVigilancia = 'vigila' | 'correo' | 'clave' | 'alarma' | 'bloqueo';

const ROJO = '#FF4A36';
const ACENTO = 'rgb(var(--c-acento))';

// Punto donde la cámara se une al soporte: sobre él gira el cuerpo.
const EJE = { x: 22, y: 30 };

// Hacia dónde apunta la cámara, en grados. 0 = horizontal hacia el centro del
// formulario; positivo = hacia abajo; negativo = hacia arriba y afuera.
function anguloDe(modo: ModoVigilancia, avance: number, lado: 'izq' | 'der'): number {
  if (modo === 'clave') return -135;
  if (modo === 'alarma' || modo === 'bloqueo') return 47;
  if (modo === 'correo') {
    // Sigue el texto: al avanzar, la de la izquierda levanta la mira (el
    // cursor se le aleja) y la de la derecha la baja (se le acerca).
    return lado === 'izq' ? 60 - avance * 15 : 45 + avance * 15;
  }
  return 30;
}

export function CamaraVigilancia({
  lado, modo, avance = 0,
}: {
  lado: 'izq' | 'der';
  modo: ModoVigilancia;
  // Qué tanto del correo va escrito, de 0 a 1, para que la cámara lo siga.
  avance?: number;
}) {
  const quieto = !!useReducedMotion();
  const angulo = anguloDe(modo, avance, lado);
  const alerta = modo === 'alarma';
  const graba = modo !== 'clave';
  const colorLuz = alerta || modo === 'bloqueo' ? ROJO : ACENTO;

  // Movimiento del cuerpo: barrido lento al vigilar, sacudida en alarma y, en
  // lo demás, un giro parejo y sin rebote hasta el ángulo que toca. Voltear
  // para no ver la contraseña (y regresar) es el recorrido más largo, así que
  // lleva más tiempo: la cámara pasa por arriba y queda mirando hacia afuera.
  let giro: { rotate: number | number[] } = { rotate: angulo };
  let ritmo: object = { type: 'tween', duration: modo === 'clave' ? 1.5 : 1.1, ease: [0.45, 0, 0.55, 1] };
  if (quieto) {
    ritmo = { duration: 0 };
  } else if (modo === 'vigila') {
    giro = { rotate: [angulo - 9, angulo + 9, angulo - 9] };
    // El primer tramo (llegar al barrido) va parejo; luego se repite sin fin.
    ritmo = { duration: lado === 'izq' ? 7 : 8.5, repeat: Infinity, ease: 'easeInOut' };
  } else if (alerta) {
    giro = { rotate: [angulo, angulo - 5, angulo + 4, angulo - 3, angulo] };
    ritmo = { duration: 0.5, repeat: Infinity, ease: 'easeInOut' };
  }

  // Qué tanto se ve el haz de luz que sale del lente.
  let fuerzaHaz = 0.14;
  if (modo === 'correo') fuerzaHaz = 0.34;
  if (modo === 'clave') fuerzaHaz = 0;
  if (modo === 'bloqueo') fuerzaHaz = 0.22;
  if (alerta) fuerzaHaz = 0.5;

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute -top-[38px] w-[92px] h-[72px] z-10 ${lado === 'izq' ? '-left-[10px]' : '-right-[10px] -scale-x-100'}`}
    >
      {/* Soporte fijo: placa atornillada al borde del formulario y poste. */}
      <svg width="92" height="72" viewBox="0 0 92 72" className="absolute inset-0 overflow-visible">
        <rect x="8" y="58" width="28" height="7" rx="2.5" fill="#2B3440" stroke="#0E141B" strokeWidth="0.8" />
        <circle cx="13" cy="61.5" r="1.1" fill="#8D99A6" />
        <circle cx="31" cy="61.5" r="1.1" fill="#8D99A6" />
        <rect x={EJE.x - 3.5} y={EJE.y} width="7" height="29" rx="2" fill="#3A4552" stroke="#0E141B" strokeWidth="0.8" />
        <rect x={EJE.x - 3.5} y={EJE.y + 4} width="2" height="22" rx="1" fill="#FFFFFF" opacity="0.14" />
      </svg>

      {/* Cuerpo: gira sobre el eje. */}
      <motion.div
        className="absolute inset-0"
        style={{ transformOrigin: `${EJE.x}px ${EJE.y}px` }}
        initial={false}
        animate={giro}
        transition={ritmo}
      >
        {/* Haz de luz del lente. */}
        <motion.div
          className="absolute"
          style={{
            left: 68, top: EJE.y - 32, width: 104, height: 64,
            clipPath: 'polygon(0 43%, 100% 0, 100% 100%, 0 57%)',
            background: `linear-gradient(to right, ${colorLuz}, transparent)`,
          }}
          initial={false}
          animate={{ opacity: alerta && !quieto ? [fuerzaHaz, fuerzaHaz * 0.35, fuerzaHaz] : fuerzaHaz }}
          transition={alerta && !quieto ? { duration: 0.5, repeat: Infinity } : { duration: quieto ? 0 : 0.35 }}
        />

        <svg width="92" height="72" viewBox="0 0 92 72" className="absolute inset-0 overflow-visible">
          <defs>
            <linearGradient id={`cuerpo-${lado}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F4F6F8" />
              <stop offset="55%" stopColor="#CBD3DB" />
              <stop offset="100%" stopColor="#8E9AA7" />
            </linearGradient>
            <radialGradient id={`lente-${lado}`} cx="38%" cy="34%" r="75%">
              <stop offset="0%" stopColor="#5C7FA8" />
              <stop offset="45%" stopColor="#16222F" />
              <stop offset="100%" stopColor="#05080C" />
            </radialGradient>
          </defs>

          {/* Cable que entra por atrás. */}
          <path d={`M${EJE.x - 6} ${EJE.y + 3} q-9 3 -7 14`} fill="none" stroke="#1B222B" strokeWidth="2.2" strokeLinecap="round" />
          {/* Carcasa. */}
          <rect x={EJE.x - 8} y={EJE.y - 12} width="56" height="24" rx="7" fill={`url(#cuerpo-${lado})`} stroke="#5A6672" strokeWidth="0.9" />
          {/* Visera: sobresale al frente, como parasol. */}
          <path d={`M${EJE.x - 10} ${EJE.y - 12.5} h60 a4 4 0 0 1 4 4 v1.5 h-64 a0 0 0 0 1 0 0 v-1.5 a4 4 0 0 1 0 -4z`} fill="#E9EDF1" stroke="#5A6672" strokeWidth="0.9" />
          {/* Frente oscuro con el lente. */}
          <rect x={EJE.x + 34} y={EJE.y - 9.5} width="16" height="20" rx="5" fill="#10161D" />
          <circle cx={EJE.x + 42} cy={EJE.y + 0.5} r="7.2" fill="#2A333D" />
          <circle cx={EJE.x + 42} cy={EJE.y + 0.5} r="5.6" fill={`url(#lente-${lado})`} />
          <circle cx={EJE.x + 40} cy={EJE.y - 1.6} r="1.5" fill="#FFFFFF" opacity="0.75" />
          {/* En alarma el lente se tiñe de rojo. */}
          {(alerta || modo === 'bloqueo') && <circle cx={EJE.x + 42} cy={EJE.y + 0.5} r="5.6" fill={ROJO} opacity="0.4" />}
          {/* Rejilla de ventilación. */}
          <path d={`M${EJE.x + 6} ${EJE.y + 5} h14 M${EJE.x + 6} ${EJE.y + 8} h14`} stroke="#6F7B88" strokeWidth="1" strokeLinecap="round" />
          {/* Articulación. */}
          <circle cx={EJE.x} cy={EJE.y} r="5.2" fill="#3A4552" stroke="#0E141B" strokeWidth="0.9" />
          <circle cx={EJE.x} cy={EJE.y} r="1.7" fill="#9AA6B2" />
          {/* Luz de grabación: parpadea al grabar, se apaga al voltear. */}
          <motion.circle
            cx={EJE.x + 12} cy={EJE.y - 3.5} r="2.3"
            fill={graba ? ROJO : '#59636E'}
            initial={false}
            animate={{ opacity: !graba ? 0.5 : quieto ? 1 : [1, 0.25, 1] }}
            transition={!graba || quieto ? { duration: 0 } : { duration: alerta ? 0.5 : 1.6, repeat: Infinity }}
          />
          {graba && <circle cx={EJE.x + 12} cy={EJE.y - 3.5} r="4.6" fill={ROJO} opacity="0.22" />}
        </svg>

        {/* Párpado: tapa el lente mientras se escribe la contraseña. */}
        <div className="absolute rounded-full overflow-hidden" style={{ left: EJE.x + 42 - 7.2, top: EJE.y + 0.5 - 7.2, width: 14.4, height: 14.4 }}>
          <motion.div
            className="w-full h-full"
            style={{ background: 'linear-gradient(#AEB8C2, #7C8894)', borderBottom: '1.5px solid #4B5661' }}
            initial={false}
            animate={{ y: modo === 'clave' ? '0%' : '-105%' }}
            transition={{ duration: quieto ? 0 : 0.5, delay: modo === 'clave' && !quieto ? 0.55 : 0 }}
          />
        </div>
      </motion.div>
    </div>
  );
}

// Cuánto duran el destello y el sonido de la alarma.
export const SEGUNDOS_ALARMA = 3;

// Sonido de sirena hecho con el sintetizador del navegador (sin archivo de
// audio): un tono que sube y baja. `audio` debe haberse creado al tocar
// «Entrar», porque los navegadores solo dejan sonar tras un gesto de la persona.
export function sonarSirena(audio: AudioContext, segundos = SEGUNDOS_ALARMA) {
  const ahora = audio.currentTime;
  const tono = audio.createOscillator();
  const volumen = audio.createGain();
  const filtro = audio.createBiquadFilter();

  // Onda de sierra suavizada: suena a sirena y no a pitido.
  tono.type = 'sawtooth';
  filtro.type = 'lowpass';
  filtro.frequency.value = 2200;

  // Sube y baja entre grave y agudo, un ciclo cada 0.6 s.
  const CICLO = 0.6;
  tono.frequency.setValueAtTime(620, ahora);
  for (let t = 0; t < segundos; t += CICLO) {
    tono.frequency.linearRampToValueAtTime(1180, ahora + t + CICLO / 2);
    tono.frequency.linearRampToValueAtTime(620, ahora + t + CICLO);
  }

  // Entra y sale sin tronido, a volumen moderado.
  volumen.gain.setValueAtTime(0, ahora);
  volumen.gain.linearRampToValueAtTime(0.16, ahora + 0.06);
  volumen.gain.setValueAtTime(0.16, ahora + segundos - 0.25);
  volumen.gain.linearRampToValueAtTime(0, ahora + segundos);

  tono.connect(filtro);
  filtro.connect(volumen);
  volumen.connect(audio.destination);
  tono.start(ahora);
  tono.stop(ahora + segundos);
}

// Sirena de baliza, montada al centro del borde de arriba del formulario.
export function SirenaAlarma({ modo }: { modo: ModoVigilancia }) {
  const quieto = !!useReducedMotion();
  const sonando = modo === 'alarma';
  const encendida = sonando || modo === 'bloqueo';
  // Con «reducir movimiento» no hay destellos: la luz queda fija.
  const destella = sonando && !quieto;

  return (
    <>
      {/* Destello sobre el formulario entero: filo y velo rojos. El parpadeo va
          a 2 por segundo, debajo del límite que puede molestar a la vista. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{ zIndex: -1, boxShadow: `inset 0 0 0 1.5px ${ROJO}, inset 0 0 46px rgb(255 74 54 / 0.28), 0 0 60px rgb(255 74 54 / 0.35)`, background: 'rgb(255 74 54 / 0.07)' }}
        initial={false}
        animate={{ opacity: destella ? [0.25, 1, 0.25] : encendida ? 0.55 : 0 }}
        transition={destella ? { duration: 0.5, repeat: Infinity, ease: 'easeInOut' } : { duration: quieto ? 0 : 0.4 }}
      />

      <div aria-hidden="true" className="pointer-events-none absolute -top-[31px] left-1/2 -translate-x-1/2 w-[64px] h-[36px] z-10">
        {/* Haces que giran alrededor de la baliza. */}
        {destella && (
          <motion.div
            className="absolute left-1/2 top-[14px] w-[560px] h-[560px] -ml-[280px] -mt-[280px] rounded-full"
            style={{
              zIndex: -1,
              background: 'conic-gradient(from 0deg, transparent 0deg, rgb(255 74 54 / 0.5) 16deg, transparent 34deg, transparent 180deg, rgb(255 74 54 / 0.5) 196deg, transparent 214deg)',
              maskImage: 'radial-gradient(circle, black 0%, rgb(0 0 0 / 0.55) 30%, transparent 68%)',
              WebkitMaskImage: 'radial-gradient(circle, black 0%, rgb(0 0 0 / 0.55) 30%, transparent 68%)',
            }}
            initial={{ rotate: 0, opacity: 0 }}
            animate={{ rotate: 360, opacity: 1 }}
            transition={{ rotate: { duration: 1.5, repeat: Infinity, ease: 'linear' }, opacity: { duration: 0.2 } }}
          />
        )}
        {/* Resplandor de la baliza. */}
        <motion.div
          className="absolute left-1/2 top-[12px] w-[130px] h-[130px] -ml-[65px] -mt-[65px] rounded-full blur-2xl"
          style={{ zIndex: -1, background: ROJO }}
          initial={false}
          animate={{ opacity: destella ? [0.25, 0.95, 0.25] : encendida ? 0.45 : 0 }}
          transition={destella ? { duration: 0.5, repeat: Infinity, ease: 'easeInOut' } : { duration: quieto ? 0 : 0.4 }}
        />

        <svg width="64" height="36" viewBox="0 0 64 36" className="absolute inset-0 overflow-visible">
          <defs>
            <clipPath id="domo-sirena"><path d="M19 23 a13 16 0 0 1 26 0 z" /></clipPath>
            <linearGradient id="domo-apagado" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8A3A30" />
              <stop offset="100%" stopColor="#4A1B15" />
            </linearGradient>
            <radialGradient id="domo-encendido" cx="50%" cy="85%" r="95%">
              <stop offset="0%" stopColor="#FFE3C2" />
              <stop offset="38%" stopColor="#FF6A4D" />
              <stop offset="100%" stopColor="#C2200F" />
            </radialGradient>
          </defs>
          {/* Base metálica con tornillos. */}
          <rect x="11" y="27" width="42" height="8" rx="2.5" fill="#2B3440" stroke="#0E141B" strokeWidth="0.8" />
          <rect x="11.6" y="27.6" width="40.8" height="1.6" rx="0.8" fill="#FFFFFF" opacity="0.16" />
          <circle cx="15.5" cy="31" r="1.1" fill="#8D99A6" />
          <circle cx="48.5" cy="31" r="1.1" fill="#8D99A6" />
          <rect x="16" y="22.5" width="32" height="5" rx="1.8" fill="#4A5562" stroke="#0E141B" strokeWidth="0.8" />
          {/* Domo. */}
          <path d="M19 23 a13 16 0 0 1 26 0 z" fill={encendida ? 'url(#domo-encendido)' : 'url(#domo-apagado)'} stroke={encendida ? '#FF9C86' : '#2A0F0B'} strokeWidth="0.9" />
          <g clipPath="url(#domo-sirena)">
            {/* Reflector que da vueltas dentro del domo. */}
            {destella && (
              <motion.rect
                y="6" width="9" height="18" fill="#FFF6E6" opacity="0.85"
                initial={{ x: 12 }}
                animate={{ x: [12, 44, 12] }}
                transition={{ duration: 0.75, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
            {/* Estrías del cristal y brillo. */}
            <path d="M25.5 8 v15 M32 7 v16 M38.5 8 v15" stroke="#000000" strokeWidth="0.7" opacity="0.18" />
            <path d="M23 20 a10 13 0 0 1 5 -10" fill="none" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" opacity={encendida ? 0.75 : 0.3} />
          </g>
        </svg>
      </div>
    </>
  );
}
