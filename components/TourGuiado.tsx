'use client';

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

// Recorrido con ventanas por el nuevo diseño (Cliente → Proyecto → Sistema).
// Sale solo la primera vez que un supervisor entra después del cambio y se
// repite con «¿Qué cambió?» (evento TOUR_INICIAR). Cada paso puede llevar a
// una pantalla y resaltar una parte de ella; si esa parte no está a la vista
// (p. ej. el menú lateral en el celular), la ventana sale al centro.

export const TOUR_INICIAR = 'tour:iniciar';
const CLAVE_VISTO = 'tourProyectosV1';
// Cambió el texto de dos pasos: quien ya lo vio no lo vuelve a ver solo (está «¿Qué cambió?»).
const CLAVE_PASO = 'tourProyectosPaso';

type Paso = { ruta?: string; selector?: string; titulo: string; texto: string };

const PASOS: Paso[] = [
  {
    selector: '[data-tour="menu-proyectos"]',
    titulo: 'Todo está en Proyectos',
    texto: 'Clientes y Diagramas y planos se juntaron en una sola sección. Lo del día (Servicios, Agenda y Reportes) sigue donde estaba.',
  },
  {
    ruta: '/dashboard/proyectos?sub=clientes',
    selector: '[data-tour="pestanas-seccion-proyectos"]',
    titulo: 'Tres vistas',
    texto: 'Clientes: la ficha de cada uno con sus proyectos. Tablero: todas las obras por etapa. Diagramas y planos: todo lo técnico, de todos los clientes.',
  },
  {
    selector: '[data-tour="lista-clientes"]',
    titulo: 'Cliente → Proyecto → Sistema',
    texto: 'Entra a un cliente y crea un proyecto por cada obra o contrato («Torre A», «Casa Ávila 10 kWp»). Cada proyecto lleva uno o varios sistemas: detección, CCTV, acceso, solar…',
  },
  {
    ruta: '/dashboard/proyectos?sub=tablero',
    selector: '[data-tour="filtros-tablero"]',
    titulo: 'Tablero de proyectos',
    texto: 'Todas las obras por etapa: Prospecto, Cotizado, Vendido, Instalación, Trámite CFE (solo solar) y Terminado o Interconectado. Arrastra una tarjeta para cambiarla de etapa y filtra por sistema.',
  },
  {
    titulo: 'Dentro de un proyecto',
    texto: 'Arriba va la etapa. Debajo, una pestaña por sistema con sus herramientas (planos, lazos, guías, unifilar) y las pestañas comunes: cotizaciones, servicios, documentos y pagos. «Nueva cotización» y «Agendar» desde ahí quedan ya en el proyecto.',
  },
  {
    titulo: 'Paneles solares',
    texto: 'En la pestaña Solar: los recibos de CFE con el precio del kWh de cada uno, el dimensionamiento con ahorro y retorno, «Cotizar este sistema», el unifilar armado solo y el trámite de CFE con su expediente, fechas y bitácora.',
  },
  {
    titulo: 'Lo de antes no se pierde',
    texto: 'Lo que ya existía queda en el cliente, en «Sin proyecto». Con «Instalación existente» registras lo que el cliente ya tiene funcionando y pasas ahí todo de una vez; o eliges «Mover a…» pieza por pieza.',
  },
  {
    ruta: '/dashboard/diagramas',
    selector: '[data-tour="pestanas-seccion-proyectos"]',
    titulo: 'Diagramas y planos: consultar y corregir',
    texto: 'Aquí ves todo lo técnico de todos los clientes y corriges lo que ya existe. Lo nuevo (planos, paneles, circuitos, guías, unifilares) se agrega dentro del proyecto; lo de una instalación que ya opera va en su proyecto «Instalación existente». Los técnicos agregan desde su servicio.',
  },
  {
    titulo: 'Listo',
    texto: 'Puedes repetir este recorrido cuando quieras con «¿Qué cambió?», arriba de las vistas de Proyectos.',
  },
];

function leer(clave: string): string | null {
  try { return localStorage.getItem(clave); } catch { return null; }
}
function escribir(clave: string, valor: string | null) {
  try {
    if (valor === null) localStorage.removeItem(clave); else localStorage.setItem(clave, valor);
  } catch { /* modo privado: el recorrido sigue, solo no se recuerda */ }
}

function visible(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

export default function TourGuiado() {
  const router = useRouter();
  const ruta = usePathname();
  const [paso, setPaso] = useState<number | null>(null);
  const [caja, setCaja] = useState<DOMRect | null>(null);
  const [montado, setMontado] = useState(false);

  // Arranca solo la primera vez, o donde se quedó si se navegó a media vuelta.
  useEffect(() => {
    setMontado(true);
    const guardado = leer(CLAVE_PASO);
    if (guardado !== null) setPaso(Math.min(PASOS.length - 1, Math.max(0, Number(guardado) || 0)));
    else if (leer(CLAVE_VISTO) !== '1') setPaso(0);
    const iniciar = () => setPaso(0);
    window.addEventListener(TOUR_INICIAR, iniciar);
    return () => window.removeEventListener(TOUR_INICIAR, iniciar);
  }, []);

  useEffect(() => {
    if (paso === null) return;
    escribir(CLAVE_PASO, String(paso));
    const destino = PASOS[paso].ruta;
    if (destino) {
      const [camino, consulta] = destino.split('?');
      const mismaRuta = ruta === camino && (!consulta || window.location.search.includes(consulta));
      if (!mismaRuta) router.push(destino);
    }
  }, [paso, ruta, router]);

  // Busca la parte a resaltar (puede tardar en aparecer al cambiar de pantalla).
  useLayoutEffect(() => {
    if (paso === null) return;
    const selector = PASOS[paso].selector;
    setCaja(null);
    if (!selector) return;
    let intentos = 0;
    let temporizador: ReturnType<typeof setTimeout>;
    const buscar = () => {
      const el = document.querySelector(selector);
      if (visible(el)) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setTimeout(() => setCaja(el.getBoundingClientRect()), 350);
        return;
      }
      if (intentos++ < 25) temporizador = setTimeout(buscar, 200);
    };
    buscar();
    const recalcular = () => {
      const el = document.querySelector(selector);
      if (visible(el)) setCaja(el.getBoundingClientRect());
    };
    window.addEventListener('resize', recalcular);
    window.addEventListener('scroll', recalcular, true);
    return () => {
      clearTimeout(temporizador);
      window.removeEventListener('resize', recalcular);
      window.removeEventListener('scroll', recalcular, true);
    };
  }, [paso, ruta]);

  const terminar = useCallback(() => {
    escribir(CLAVE_VISTO, '1');
    escribir(CLAVE_PASO, null);
    setPaso(null);
  }, []);

  useEffect(() => {
    if (paso === null) return;
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') terminar();
      if (ev.key === 'ArrowRight') setPaso((p) => (p === null ? p : Math.min(PASOS.length - 1, p + 1)));
      if (ev.key === 'ArrowLeft') setPaso((p) => (p === null ? p : Math.max(0, p - 1)));
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [paso, terminar]);

  if (!montado || paso === null) return null;
  const actual = PASOS[paso];
  const ultimo = paso === PASOS.length - 1;
  const margen = 8;

  // La ventana va abajo de lo resaltado si cabe; si no, arriba; sin nada, al centro.
  const anchoVentana = Math.min(380, window.innerWidth - 32);
  let estiloVentana: React.CSSProperties = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: anchoVentana };
  if (caja) {
    const izquierda = Math.min(Math.max(16, caja.left), window.innerWidth - anchoVentana - 16);
    const abajo = caja.bottom + margen + 12;
    estiloVentana = window.innerHeight - abajo > 230
      ? { left: izquierda, top: abajo, width: anchoVentana }
      : { left: izquierda, bottom: window.innerHeight - caja.top + margen + 12, width: anchoVentana };
  }

  return createPortal(
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-labelledby="tour-titulo">
      {caja ? (
        <div className="absolute rounded-xl ring-2 ring-teal pointer-events-none transition-all duration-300"
          style={{ left: caja.left - margen, top: caja.top - margen, width: caja.width + margen * 2, height: caja.height + margen * 2, boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.62)' }} />
      ) : (
        <div className="absolute inset-0 bg-[rgba(2,6,23,0.62)]" />
      )}
      <div className="absolute glass-strong rounded-2xl p-4 shadow-2xl" style={estiloVentana}>
        <div className="flex items-start gap-2">
          <p className="flex-1 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-teal">Nuevo diseño · {paso + 1} de {PASOS.length}</p>
          <button type="button" onClick={terminar} aria-label="Cerrar el recorrido" className="w-8 h-8 -mt-1 -mr-1 rounded-lg flex items-center justify-center text-muted hover:bg-surface-2"><X size={16} /></button>
        </div>
        <h2 id="tour-titulo" className="font-display font-bold text-[18px] leading-tight mt-1">{actual.titulo}</h2>
        <p className="text-[14px] text-ink/85 mt-1.5 leading-relaxed">{actual.texto}</p>
        <div className="flex items-center gap-2 mt-4">
          <button type="button" onClick={terminar} className="text-[13px] text-muted hover:text-ink mr-auto min-h-[40px]">{ultimo ? '' : 'Saltar'}</button>
          {paso > 0 && (
            <button type="button" onClick={() => setPaso(paso - 1)} className="min-h-[40px] px-3 rounded-xl border border-line text-[13.5px] font-semibold flex items-center gap-1">
              <ChevronLeft size={15} /> Anterior
            </button>
          )}
          <button type="button" onClick={() => (ultimo ? terminar() : setPaso(paso + 1))} autoFocus
            className="min-h-[40px] px-4 rounded-xl bg-teal text-inkOnAccent text-[13.5px] font-semibold flex items-center gap-1">
            {ultimo ? 'Terminar' : <>Siguiente <ChevronRight size={15} /></>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
