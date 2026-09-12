// La fecha de HOY según el reloj del técnico, no según UTC.
//
// `new Date().toISOString().slice(0,10)` devuelve el día en UTC. Guadalajara
// está en UTC−6, así que a partir de las 18:00 locales el reloj UTC ya pasó a
// la medianoche y todo lo capturado en la tarde-noche quedaba fechado al día
// siguiente. Un reporte firmado por el cliente el jueves salía con fecha de
// viernes, y un servicio agendado «para hoy» se guardaba para mañana.
//
// Con horario de verano el desfase pasa a −5 y el problema empieza a las
// 19:00, pero el fondo es el mismo: hay que leer el día del reloj local.
export function hoyLocal(ahora: Date = new Date()): string {
  const y = ahora.getFullYear();
  const m = String(ahora.getMonth() + 1).padStart(2, '0');
  const d = String(ahora.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Convierte «2026-09-11» a un Date situado a medianoche local. Sin esto,
// new Date('2026-09-11') se interpreta como medianoche UTC, que en México es
// la tarde del día anterior.
export function fechaLocal(fecha: string): Date {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

// Suma días respetando el calendario local (cambios de mes y de año).
export function sumarDias(fecha: string, dias: number): string {
  const d = fechaLocal(fecha);
  d.setDate(d.getDate() + dias);
  return hoyLocal(d);
}
