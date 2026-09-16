// Hora "de pared" en México para los crons. Un cron de Supabase/Vercel corre
// en el servidor, normalmente en UTC — comparar contra new Date() a secas
// da la hora equivocada. Intl.DateTimeFormat con la zona horaria resuelve
// esto sin cálculos manuales de offset ni depender de si México sigue o no
// horario de verano (hoy no lo usa: America/Mexico_City vive fijo en UTC-6).
export function horaActualMexico(ahora: Date = new Date()): { fecha: string; horaMin: number } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(ahora);

  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value || '00';
  const fecha = `${valor('year')}-${valor('month')}-${valor('day')}`;
  const horaMin = parseInt(valor('hour'), 10) * 60 + parseInt(valor('minute'), 10);
  return { fecha, horaMin };
}

// Minutos transcurridos desde una hora programada ("HH:mm" o "HH:mm:ss",
// como devuelve Postgres para una columna `time`) hasta el minuto actual.
// Negativo si la hora programada todavía no llega.
export function minutosTranscurridos(horaProgramada: string, horaActualMin: number): number {
  const [h, m] = horaProgramada.split(':').map(Number);
  return horaActualMin - (h * 60 + m);
}
