'use client';

import MapaCampo from '@/components/campo/MapaCampo';

// Servicios → Mapa: la vista operativa (en vivo e historial con el buscador de visitas).
export default function MapaTecnicos() {
  return <MapaCampo modo="servicios" />;
}
