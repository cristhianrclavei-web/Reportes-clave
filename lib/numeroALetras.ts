// Importe con letra, como lo imprime el CFDI:
//   1853.68 MXN → «UN MIL OCHOCIENTOS CINCUENTA Y TRES PESOS MEXICANOS 68/100 MXN»

const UNIDADES = [
  '', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
  'VEINTE', 'VEINTIUN', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISEIS', 'VEINTISIETE',
  'VEINTIOCHO', 'VEINTINUEVE',
];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = [
  '', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS',
  'OCHOCIENTOS', 'NOVECIENTOS',
];

function menorAMil(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (r) {
    if (r < 30) partes.push(UNIDADES[r]);
    else {
      const d = Math.floor(r / 10);
      const u = r % 10;
      partes.push(u ? `${DECENAS[d]} Y ${UNIDADES[u]}` : DECENAS[d]);
    }
  }
  return partes.join(' ');
}

export function enteroALetras(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'CERO';
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (millones) partes.push(millones === 1 ? 'UN MILLON' : `${enteroALetras(millones)} MILLONES`);
  // «UN MIL» como en el CFDI de referencia.
  if (miles) partes.push(`${menorAMil(miles)} MIL`);
  if (resto) partes.push(menorAMil(resto));
  return partes.join(' ');
}

export function importeConLetra(monto: number, moneda: 'MXN' | 'USD' = 'MXN'): string {
  const redondeado = Math.round((monto || 0) * 100) / 100;
  const entero = Math.floor(redondeado);
  const centavos = Math.round((redondeado - entero) * 100);
  const letras = enteroALetras(entero);
  // «DE PESOS» cuando la cifra cierra en millón(es) exactos.
  const de = /MILLON(ES)?$/.test(letras) ? ' DE' : '';
  const divisa = moneda === 'USD' ? 'DOLARES AMERICANOS' : 'PESOS MEXICANOS';
  return `${letras}${de} ${divisa} ${String(centavos).padStart(2, '0')}/100 ${moneda}`;
}
