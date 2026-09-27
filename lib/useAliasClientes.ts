'use client';

import { useEffect, useState } from 'react';
import { catalogoEnCache, listarCatalogoClientes } from './clientesCatalogo';

// Nombres alternos de cada cliente (id → «Plaza del Ángel, …»), para que la
// búsqueda de las listas encuentre un documento aunque se busque por como
// se llamaba antes de unirlo o renombrarlo.
export function useAliasClientes(): Record<string, string> {
  const [mapa, setMapa] = useState<Record<string, string>>({});
  useEffect(() => {
    const armar = (lista: ReturnType<typeof catalogoEnCache>) =>
      setMapa(Object.fromEntries(lista.map((c) => [c.id, c.alias.join(' ')])));
    armar(catalogoEnCache());
    listarCatalogoClientes().then(armar).catch(() => {});
  }, []);
  return mapa;
}
