'use client';

import { createContext, useContext, ReactNode } from 'react';

export type VistaSupervisor = 'clasica' | 'nueva';

export const KEY_VISTA_SUPERVISOR = 'vistaSupervisorPreferida';

export type VistaSupervisorCtx = { vista: VistaSupervisor; setVista: (v: VistaSupervisor) => void };

// SupervisorShell es el único dueño del estado real (useState + localStorage,
// ver ese archivo): este contexto solo lo reparte hacia abajo. Así el cuerpo
// de cada pantalla (las listas) puede leer la misma preferencia que decide
// el sidebar y reaccionar en vivo cuando alguien toca el botón de cambiar
// vista — antes cada quien tenía su propio useState con localStorage, y el
// toggle cambiaba el sidebar pero no el cuerpo, porque eran dos estados
// independientes que nunca se enteraban entre sí.
export const VistaSupervisorContext = createContext<VistaSupervisorCtx>({
  vista: 'clasica',
  setVista: () => {},
});

export function useVistaSupervisor(): [VistaSupervisor, (v: VistaSupervisor) => void] {
  const { vista, setVista } = useContext(VistaSupervisorContext);
  return [vista, setVista];
}

// Ojo al usar esto: un componente NO puede leer con useVistaSupervisor() el
// contexto que su propio hijo <SupervisorShell> todavía no ha creado — para
// cuando ese hook corre, SupervisorShell (y su Provider) ni existen en el
// árbol. Por eso las pantallas de lista no deciden tabla-vs-tarjetas en su
// propio nivel superior: envuelven ambas versiones (ya construidas, sin
// depender de `vista`) en este componente, que sí queda anidado DENTRO del
// Provider una vez que React lo monta como hijo de SupervisorShell.
export function VistaCondicional({ tabla, tarjetas }: { tabla: ReactNode; tarjetas: ReactNode }) {
  const [vista] = useVistaSupervisor();
  return <>{vista === 'nueva' ? tabla : tarjetas}</>;
}
