'use client';

import { useEffect } from 'react';
import { traerAcentoDelPerfil } from '@/lib/acento';

// Al abrir la app trae el color de acento guardado en el perfil, por si se
// cambió desde otro dispositivo. No dibuja nada.
export default function SincronizarAcento() {
  useEffect(() => { traerAcentoDelPerfil(); }, []);
  return null;
}
