'use client';
import { Contenido } from '@/components/SavingOverlay';

// Pantalla de espera mientras se abre una página: la misma animación del
// escudo que al guardar (components/SavingOverlay), con el número avanzando
// solo. Se usa en los `loading.tsx` de las páginas a las que se llega por un
// enlace (firma del cliente, verificación de mantenimiento): sale en cuanto
// responde el servidor, en vez de dejar la pantalla en blanco o detenida en
// el ícono de arranque del teléfono.
//
// A diferencia de SavingOverlay no va en un portal: así ya viene dibujada en
// el HTML que manda el servidor y no espera a que cargue el JavaScript.
export default function PantallaCarga({ texto = 'Abriendo…' }: { texto?: string }) {
  return <Contenido label={texto} pie="Un momento, por favor" etiquetaAria="Cargando" />;
}
