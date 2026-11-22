// Equipos que se siembran en planos de sistemas que no son detección de
// incendio (CCTV, control de acceso, paneles solares, intrusión y otros).
// Solo datos: el dibujo de cada uno está en lib/simbolosPlano.ts y los de
// detección siguen saliendo de los lazos (lib/lazos.ts).
//
// Los códigos tienen máximo 6 letras (lib/planos.ts, sembradoSchema) y no
// chocan con los de detección.

export type FiguraEquipo =
  | 'bala' | 'domo' | 'ptz' | 'fisheye'
  | 'caja' | 'circulo' | 'modulo_fv' | 'lectora' | 'puerta';

export type EquipoCatalogo = {
  codigo: string;
  nombre: string;
  sistema: 'cctv' | 'acceso' | 'solar' | 'intrusion' | 'otro';
  figura: FiguraEquipo;
  letra: string;
  // Cámaras: campo de visión y alcance de reconocimiento por omisión.
  camara?: { angulo: number; alcance: number };
  // Equipo de red al que se conectan las cámaras (NVR, switch).
  red?: true;
};

export const COLOR_SISTEMA: Record<EquipoCatalogo['sistema'], string> = {
  cctv: '#7c3aed',
  acceso: '#0891b2',
  solar: '#ca8a04',
  intrusion: '#be123c',
  otro: '#475569',
};

export const EQUIPOS_SISTEMAS: EquipoCatalogo[] = [
  // CCTV
  { codigo: 'CAMB', nombre: 'Cámara bala', sistema: 'cctv', figura: 'bala', letra: '', camara: { angulo: 90, alcance: 15 } },
  { codigo: 'CAMD', nombre: 'Cámara domo', sistema: 'cctv', figura: 'domo', letra: '', camara: { angulo: 100, alcance: 12 } },
  { codigo: 'CAMT', nombre: 'Cámara turret', sistema: 'cctv', figura: 'domo', letra: 'T', camara: { angulo: 95, alcance: 15 } },
  { codigo: 'PTZ', nombre: 'Cámara PTZ', sistema: 'cctv', figura: 'ptz', letra: 'PTZ', camara: { angulo: 60, alcance: 60 } },
  { codigo: 'CAM360', nombre: 'Cámara 360° (ojo de pez)', sistema: 'cctv', figura: 'fisheye', letra: '360', camara: { angulo: 360, alcance: 8 } },
  { codigo: 'NVR', nombre: 'Grabador (NVR / DVR)', sistema: 'cctv', figura: 'caja', letra: 'NVR', red: true },
  { codigo: 'SWPOE', nombre: 'Switch PoE', sistema: 'cctv', figura: 'caja', letra: 'SW', red: true },
  { codigo: 'PTP', nombre: 'Enlace inalámbrico', sistema: 'cctv', figura: 'circulo', letra: 'PTP', red: true },
  { codigo: 'MON', nombre: 'Monitor', sistema: 'cctv', figura: 'caja', letra: 'MON' },
  { codigo: 'RACK', nombre: 'Gabinete / rack', sistema: 'cctv', figura: 'caja', letra: 'GAB' },
  { codigo: 'UPS', nombre: 'UPS / no break', sistema: 'cctv', figura: 'caja', letra: 'UPS' },
  // Control de acceso
  { codigo: 'LECT', nombre: 'Lectora / terminal', sistema: 'acceso', figura: 'lectora', letra: 'L' },
  { codigo: 'CERR', nombre: 'Electroimán / chapa eléctrica', sistema: 'acceso', figura: 'caja', letra: 'EM' },
  { codigo: 'BSAL', nombre: 'Botón de salida', sistema: 'acceso', figura: 'circulo', letra: 'BS' },
  { codigo: 'CTRLA', nombre: 'Controlador de acceso', sistema: 'acceso', figura: 'caja', letra: 'CA' },
  { codigo: 'CPUE', nombre: 'Contacto de puerta', sistema: 'acceso', figura: 'puerta', letra: 'CP' },
  { codigo: 'TORN', nombre: 'Torniquete', sistema: 'acceso', figura: 'caja', letra: 'TOR' },
  { codigo: 'PLUMA', nombre: 'Pluma vehicular', sistema: 'acceso', figura: 'caja', letra: 'PV' },
  { codigo: 'VPOR', nombre: 'Videoportero / interfón', sistema: 'acceso', figura: 'lectora', letra: 'VP' },
  { codigo: 'FTEA', nombre: 'Fuente de poder', sistema: 'acceso', figura: 'caja', letra: 'F' },
  // Paneles solares
  { codigo: 'MFV', nombre: 'Módulo fotovoltaico', sistema: 'solar', figura: 'modulo_fv', letra: '' },
  { codigo: 'INVS', nombre: 'Inversor', sistema: 'solar', figura: 'caja', letra: 'INV' },
  { codigo: 'CMBF', nombre: 'Caja combinadora / fusibles', sistema: 'solar', figura: 'caja', letra: 'CF' },
  { codigo: 'TABS', nombre: 'Tablero / interruptor', sistema: 'solar', figura: 'caja', letra: 'TAB' },
  { codigo: 'MEDB', nombre: 'Medidor bidireccional', sistema: 'solar', figura: 'circulo', letra: 'kWh' },
  { codigo: 'BATS', nombre: 'Banco de baterías', sistema: 'solar', figura: 'caja', letra: 'BAT' },
  { codigo: 'TFS', nombre: 'Tierra física', sistema: 'solar', figura: 'circulo', letra: 'TF' },
  // Intrusión
  { codigo: 'PIR', nombre: 'Sensor de movimiento', sistema: 'intrusion', figura: 'circulo', letra: 'PIR' },
  { codigo: 'CMAG', nombre: 'Contacto magnético', sistema: 'intrusion', figura: 'puerta', letra: 'CM' },
  { codigo: 'PANI', nombre: 'Panel de alarma', sistema: 'intrusion', figura: 'caja', letra: 'PA' },
  { codigo: 'TECL', nombre: 'Teclado', sistema: 'intrusion', figura: 'caja', letra: 'TEC' },
  { codigo: 'SIRI', nombre: 'Sirena', sistema: 'intrusion', figura: 'circulo', letra: 'SIR' },
  { codigo: 'RVID', nombre: 'Sensor de rotura de vidrio', sistema: 'intrusion', figura: 'circulo', letra: 'RV' },
  { codigo: 'BPAN', nombre: 'Botón de pánico', sistema: 'intrusion', figura: 'circulo', letra: 'BP' },
  // Otros
  { codigo: 'EQG', nombre: 'Equipo', sistema: 'otro', figura: 'caja', letra: 'EQ' },
  { codigo: 'CREG', nombre: 'Caja de registro', sistema: 'otro', figura: 'circulo', letra: 'CR' },
];

const POR_CODIGO = new Map(EQUIPOS_SISTEMAS.map((e) => [e.codigo, e]));

export function equipoCatalogo(codigo: string): EquipoCatalogo | null {
  return POR_CODIGO.get(codigo) || null;
}

export function equiposDeSistema(sistema: string): EquipoCatalogo[] {
  return EQUIPOS_SISTEMAS.filter((e) => e.sistema === sistema);
}

export function esCamara(codigo: string): boolean {
  return Boolean(POR_CODIGO.get(codigo)?.camara);
}

export function esEquipoDeRed(codigo: string): boolean {
  return Boolean(POR_CODIGO.get(codigo)?.red);
}
