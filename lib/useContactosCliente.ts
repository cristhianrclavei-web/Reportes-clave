'use client';

import { useState } from 'react';
import { ContactoCatalogo, ContactoDetalle, datosCliente, normalizar } from './clientesCatalogo';

// Contactos del cliente elegido en un formulario (cotización, levantamiento):
// se sugieren en «Atención» y, al elegir uno, llenan teléfono y correo.
export function useContactosCliente() {
  const [contactos, setContactos] = useState<ContactoDetalle[]>([]);

  // Devuelve la dirección del cliente (si se pudo leer) para llenar el campo.
  async function alElegirCliente(id: string | null, base: ContactoCatalogo[]): Promise<string | null> {
    if (!id) {
      setContactos([]);
      return null;
    }
    setContactos(base.map((c) => ({ ...c, telefono: null, correo: null })));
    const d = await datosCliente(id);
    if (!d) return null;
    if (d.contactos.length > 0) setContactos(d.contactos);
    return d.direccion;
  }

  function buscar(nombre: string): ContactoDetalle | null {
    const q = normalizar(nombre);
    return contactos.find((c) => normalizar(c.nombre) === q) || null;
  }

  const grupos = contactos.length > 0 ? [{ etiqueta: 'Contactos de este cliente', nombres: contactos.map((c) => c.nombre) }] : [];

  return { alElegirCliente, buscar, grupos };
}
