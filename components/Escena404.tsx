'use client';

import { useEffect, useState } from 'react';
import EscenaCamara from './escenas404/Camara';
import EscenaGrua from './escenas404/Grua';
import EscenaDetector from './escenas404/Detector';
import EscenaCable from './escenas404/Cable';

// La página 404 muestra una de varias escenas animadas, al azar, cada una
// con su texto. Se elige ya en el navegador (en el servidor la página es la
// misma para todos) y se evita repetir la que salió la vez anterior. Para
// agregar una escena: su componente en components/escenas404, sus clases en
// globals.css y una fila aquí.
const ESCENAS = [
  { clave: 'camara', Escena: EscenaCamara, titulo: 'Buscamos por todos lados', texto: 'La cámara no encontró esta página: el enlace puede estar mal escrito o la página ya no existe.' },
  { clave: 'grua', Escena: EscenaGrua, titulo: 'Esta página sigue en obra', texto: 'No encontramos lo que buscabas: el enlace puede estar mal escrito o la página ya no existe.' },
  { clave: 'detector', Escena: EscenaDetector, titulo: 'Saltó la alarma', texto: 'Revisamos y no hay nada aquí: el enlace puede estar mal escrito o la página ya no existe.' },
  { clave: 'cable', Escena: EscenaCable, titulo: 'Se perdió la conexión', texto: 'Esta página no conecta con nada: el enlace puede estar mal escrito o ya no existe.' },
];

const KEY = 'escena404';

export default function Escena404() {
  const [i, setI] = useState<number | null>(null);

  useEffect(() => {
    // ?escena=grua (camara, detector, cable) fija una, para revisarlas.
    const pedida = ESCENAS.findIndex((e) => e.clave === new URLSearchParams(window.location.search).get('escena'));
    if (pedida >= 0) { setI(pedida); return; }
    let anterior = -1;
    try { anterior = Number(sessionStorage.getItem(KEY) ?? -1); } catch { /* sin almacenamiento */ }
    const opciones = ESCENAS.map((_, k) => k).filter((k) => k !== anterior);
    const elegida = opciones[Math.floor(Math.random() * opciones.length)];
    try { sessionStorage.setItem(KEY, String(elegida)); } catch { /* modo privado */ }
    setI(elegida);
  }, []);

  // Mientras se elige se guarda el hueco, para que el botón no brinque.
  if (i === null) return <div className="w-full aspect-[400/372]" aria-hidden="true" />;

  const { Escena, titulo, texto } = ESCENAS[i];
  return (
    <div className="e404-entra w-full flex flex-col items-center">
      <Escena />
      <h1 className="font-display font-bold text-[24px] tracking-wide mt-3 mb-2">{titulo}</h1>
      <p className="text-[14px] text-muted leading-relaxed max-w-[330px] min-h-[68px]">{texto}</p>
    </div>
  );
}
