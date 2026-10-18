'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CircleAlert, HelpCircle, Info, PenLine } from 'lucide-react';
import { motion } from 'motion/react';
import ModalOverlay from '@/components/ModalOverlay';
import { EVENTO_DIALOGO, PedidoDialogo } from '@/lib/dialogos';

// Dibuja los diálogos que piden confirmar(), avisar() y pedirTexto()
// (lib/dialogos.ts). Se monta una sola vez en app/layout.tsx. Si llegan
// varios a la vez, se muestran uno tras otro.
export default function Dialogos() {
  const [cola, setCola] = useState<PedidoDialogo[]>([]);
  const [texto, setTexto] = useState('');
  const aceptarRef = useRef<HTMLButtonElement>(null);
  const textoRef = useRef<HTMLInputElement>(null);
  const actual = cola[0];

  useEffect(() => {
    function alPedir(e: Event) {
      const pedido = (e as CustomEvent<PedidoDialogo>).detail;
      setCola((prev) => [...prev, pedido]);
    }
    window.addEventListener(EVENTO_DIALOGO, alPedir);
    return () => window.removeEventListener(EVENTO_DIALOGO, alPedir);
  }, []);

  // Al aparecer: el foco va al campo de texto o al botón principal (Enter acepta).
  useEffect(() => {
    if (!actual) return;
    setTexto(actual.valorInicial || '');
    const id = setTimeout(() => {
      if (actual.tipo === 'pedirTexto') textoRef.current?.select();
      else aceptarRef.current?.focus();
    }, 60);
    return () => clearTimeout(id);
  }, [actual]);

  if (!actual) return null;

  function cerrar(valor: boolean | string | null) {
    actual.responder(valor);
    setCola((prev) => prev.slice(1));
  }
  function aceptar() {
    if (actual.tipo === 'pedirTexto') {
      if (!texto.trim()) return;
      cerrar(texto.trim());
      return;
    }
    cerrar(true);
  }
  function cancelar() {
    if (actual.tipo === 'pedirTexto') cerrar(null);
    else if (actual.tipo === 'avisar') cerrar(null);
    else cerrar(false);
  }

  let Icono = HelpCircle;
  let colorIcono = 'bg-teal/15 text-teal';
  let botonPrincipal = 'bg-teal text-inkOnAccent shadow-glow-teal';
  if (actual.tono === 'peligro') {
    Icono = AlertTriangle;
    colorIcono = 'bg-red/15 text-red';
    botonPrincipal = 'bg-red text-white';
  } else if (actual.tono === 'error') {
    Icono = CircleAlert;
    colorIcono = 'bg-red/15 text-red';
  } else if (actual.tipo === 'avisar') {
    Icono = Info;
  } else if (actual.tipo === 'pedirTexto') {
    Icono = PenLine;
  }

  return (
    <ModalOverlay onClose={cancelar} className="!z-[100]">
      <motion.div
        key={actual.id}
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        role="alertdialog"
        aria-labelledby={`dialogo-${actual.id}-titulo`}
        aria-describedby={actual.detalle ? `dialogo-${actual.id}-detalle` : undefined}
        className="glass-strong rounded-3xl w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto"
      >
        <span className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3.5 ${colorIcono}`}>
          <Icono size={23} strokeWidth={2.3} />
        </span>
        <h2 id={`dialogo-${actual.id}-titulo`} className="font-display font-bold text-[19px] tracking-wide leading-snug">
          {actual.titulo}
        </h2>
        {actual.detalle && (
          <div id={`dialogo-${actual.id}-detalle`} className="mt-2 flex flex-col gap-2">
            {actual.detalle.split(/\n\s*\n/).map((p, i) => (
              <p key={i} className="text-[14.5px] text-muted leading-relaxed whitespace-pre-line">{p}</p>
            ))}
          </div>
        )}

        {actual.tipo === 'pedirTexto' && (
          <input
            ref={textoRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') aceptar(); }}
            aria-label={actual.titulo}
            className="mt-4 w-full px-3.5 min-h-[48px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal-glow text-[15px]"
          />
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-2.5 mt-6">
          {actual.tipo !== 'avisar' && (
            <button
              type="button"
              onClick={cancelar}
              className="flex-1 min-h-[52px] rounded-2xl bg-surface-2 border border-line font-display font-semibold text-[15.5px] tracking-wide active:scale-[0.98] transition-transform"
            >
              {actual.textoCancelar}
            </button>
          )}
          <button
            ref={aceptarRef}
            type="button"
            onClick={aceptar}
            disabled={actual.tipo === 'pedirTexto' && !texto.trim()}
            className={`flex-1 min-h-[52px] rounded-2xl font-display font-semibold text-[15.5px] tracking-wide active:scale-[0.98] transition-transform disabled:opacity-50 ${botonPrincipal}`}
          >
            {actual.textoAceptar}
          </button>
        </div>
      </motion.div>
    </ModalOverlay>
  );
}
