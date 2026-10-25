'use client';

import TecnicosEnCampo from '@/components/resumen/TecnicosEnCampo';

// Servicios → Mapa: la misma tarjeta del Resumen («Técnicos en campo»),
// más alta y sin el botón «Abrir mapa» (ya se está en el mapa completo).
export default function MapaTecnicos() {
  return <TecnicosEnCampo enServicios />;
}
