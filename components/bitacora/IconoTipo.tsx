import { Truck, ShoppingCart, Wrench, GraduationCap, Handshake, MoreHorizontal, ClipboardCheck } from 'lucide-react';
import { TipoActividad } from '@/lib/tiposActividad';

const ICONOS: Record<TipoActividad | 'servicio', any> = {
  traslado: Truck,
  compra: ShoppingCart,
  oficina: Wrench,
  capacitacion: GraduationCap,
  apoyo_cliente: Handshake,
  otro: MoreHorizontal,
  servicio: ClipboardCheck,
};

// Ícono de un tipo de actividad de bitácora (o de un servicio programado, en
// la línea del día).
export default function IconoTipo({ tipo, size = 18, className = '' }: { tipo: TipoActividad | 'servicio'; size?: number; className?: string }) {
  const Icono = ICONOS[tipo] || MoreHorizontal;
  return <Icono size={size} strokeWidth={2.2} className={className} />;
}
