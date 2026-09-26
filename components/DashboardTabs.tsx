'use client';

import { FileText, FolderKanban, History, CalendarDays, LayoutDashboard, Warehouse, Receipt, Building2 } from 'lucide-react';

// Secciones del panel del supervisor: una sola fuente de verdad para la
// barra lateral, la barra inferior del celular y el buscador (Ctrl+K).
// `corto` es la etiqueta de la barra inferior, donde el espacio es poco.
export const TABS = [
  { key: 'resumen', label: 'Resumen', corto: 'Inicio', href: '/dashboard', Icono: LayoutDashboard },
  { key: 'servicios', label: 'Servicios', corto: 'Servicios', href: '/dashboard/servicios', Icono: FolderKanban },
  { key: 'agenda', label: 'Agenda', corto: 'Agenda', href: '/dashboard/agenda', Icono: CalendarDays },
  { key: 'reportes', label: 'Reportes', corto: 'Reportes', href: '/dashboard/reportes', Icono: FileText },
  { key: 'cotizaciones', label: 'Cotizaciones', corto: 'Cotizar', href: '/dashboard/cotizaciones', Icono: Receipt },
  { key: 'proyectos', label: 'Clientes', corto: 'Clientes', href: '/dashboard/proyectos', Icono: Building2 },
  { key: 'eventos', label: 'Actividad', corto: 'Actividad', href: '/dashboard/eventos', Icono: History },
] as const;

// El almacén solo aparece para quien lo lleva, no para todo supervisor.
export const TAB_ALMACEN = { key: 'almacen', label: 'Almacén', corto: 'Almacén', href: '/dashboard/almacen', Icono: Warehouse } as const;

export type DashboardTabKey = (typeof TABS)[number]['key'] | 'almacen';

// Agrupación de la barra lateral: qué se opera a diario, qué se vende y qué
// se controla.
export const GRUPOS_NAV: { titulo: string; keys: DashboardTabKey[] }[] = [
  { titulo: 'Operación', keys: ['resumen', 'servicios', 'agenda', 'reportes'] },
  { titulo: 'Ventas', keys: ['cotizaciones', 'proyectos'] },
  { titulo: 'Control', keys: ['almacen', 'eventos'] },
];

// Las 4 que van fijas en la barra inferior del celular; el resto va en «Más».
export const TABS_INFERIORES: DashboardTabKey[] = ['resumen', 'servicios', 'reportes', 'cotizaciones'];
