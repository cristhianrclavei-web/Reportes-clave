'use client';

import { useMemo, useRef, useState } from 'react';
import { ChevronDown, FileUp, Loader2 } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import { decodificarDxf, leerDxf, type DxfLeido } from '@/lib/leerDxf';
import { bloquesDelDxf, importarDispositivos, pasarAHoja, type BloqueEncontrado } from '@/lib/importarDxf';
import { tamanoSimbolo, tiposSembrables, type EquipoPlano, type Plano } from '@/lib/planos';
import { guardarPlantillaDxf, plantillaDxf, tiposPropuestos } from '@/lib/planosDatos';
import { aplicarImportacion, compararImportacion } from '@/lib/reimportarDxf';

const TIPOS_EQUIPO = tiposSembrables();
const PESO_MAXIMO = 40 * 1024 * 1024;

// Volver a subir el DXF de un plano que ya existe: se comparan los equipos
// del dibujo nuevo con los que ya están colocados y se aplican solo los
// grupos elegidos. Así no se duplican los dispositivos. El dibujo de fondo no
// cambia (los equipos se ubican con la misma escala del plano).
export default function ReimportarDxf({ plano, equipos, onAplicar, onCerrar }: {
  plano: Plano;
  equipos: EquipoPlano[];
  onAplicar: (equipos: EquipoPlano[], resumen: string) => void;
  onCerrar: () => void;
}) {
  const entrada = useRef<HTMLInputElement | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archivo, setArchivo] = useState<{ nombre: string; leido: DxfLeido; bloques: BloqueEncontrado[] } | null>(null);
  const [tipoPorBloque, setTipoPorBloque] = useState<Record<string, string>>({});
  const [aplicar, setAplicar] = useState({ nuevos: true, actualizados: true, eliminados: false });
  const [abierto, setAbierto] = useState<'nuevos' | 'actualizados' | 'eliminados' | null>(null);
  const [guardando, setGuardando] = useState(false);

  const transformacion = plano.dxf;

  function abrirSelector() {
    const input = entrada.current;
    if (!input) return;
    // Android deja el DXF en gris si se filtra por tipo.
    if (/Android/i.test(navigator.userAgent)) input.removeAttribute('accept');
    input.click();
  }

  async function elegir(nuevo: File | undefined) {
    if (!nuevo) return;
    setError(null);
    if (!/\.dxf$/i.test(nuevo.name)) {
      setError('Elige el archivo DXF del plano (AutoCAD: Guardar como → DXF).');
      return;
    }
    if (nuevo.size > PESO_MAXIMO) {
      setError('El DXF pesa más de 40 MB. En AutoCAD purga el dibujo (PURGE) y quita referencias externas.');
      return;
    }
    setLeyendo(true);
    await new Promise((r) => setTimeout(r, 30));
    try {
      const leido = leerDxf(decodificarDxf(await nuevo.arrayBuffer()));
      const bloques = bloquesDelDxf(leido);
      setTipoPorBloque(tiposPropuestos(bloques, await plantillaDxf(plano.cliente_id)));
      setArchivo({ nombre: nuevo.name, leido, bloques });
    } catch (e: any) {
      setError(e?.message || 'No se pudo leer el DXF. Guárdalo de nuevo desde AutoCAD como DXF.');
    }
    setLeyendo(false);
  }

  // Lo que trae el DXF, ya en la hoja, comparado con lo colocado.
  const comparacion = useMemo(() => {
    if (!archivo || !transformacion) return null;
    const elegidos = new Map(Object.entries(tipoPorBloque).filter(([, codigo]) => codigo));
    const importado = importarDispositivos(archivo.leido, elegidos, () => crypto.randomUUID());
    const enHoja = pasarAHoja(importado.equipos, transformacion, plano);
    // Más cerca que un símbolo y medio: es el mismo equipo.
    return compararImportacion(equipos, enHoja, tamanoSimbolo(plano.ancho, plano.alto) * 1.5);
  }, [archivo, tipoPorBloque, transformacion, plano, equipos]);

  async function confirmar() {
    if (!comparacion || !archivo) return;
    const elegidos = {
      nuevos: aplicar.nuevos ? comparacion.nuevos : [],
      actualizados: aplicar.actualizados ? comparacion.actualizados : [],
      eliminados: aplicar.eliminados ? comparacion.eliminados : [],
    };
    const total = elegidos.nuevos.length + elegidos.actualizados.length + elegidos.eliminados.length;
    if (total === 0) {
      showToast('No hay nada que aplicar.');
      return;
    }
    setGuardando(true);
    // La plantilla es una ayuda: si no se guarda, la importación sigue.
    await guardarPlantillaDxf(plano.cliente_id, tipoPorBloque).catch((e) => console.error(e.message));
    const partes = [
      elegidos.nuevos.length ? `${elegidos.nuevos.length} nuevos` : '',
      elegidos.actualizados.length ? `${elegidos.actualizados.length} actualizados` : '',
      elegidos.eliminados.length ? `${elegidos.eliminados.length} quitados` : '',
    ].filter(Boolean);
    onAplicar(aplicarImportacion(equipos, elegidos), partes.join(', '));
  }

  if (!transformacion) {
    return (
      <ModalOverlay onClose={onCerrar}>
        <div className="glass-strong rounded-3xl max-w-md w-full p-5">
          <h2 className="font-display font-bold text-[21px]">Volver a subir el DXF</h2>
          <p className="text-[14px] text-muted mt-2">Este plano se subió en PDF: no tiene las coordenadas de AutoCAD para comparar. Sube el DXF como plano nuevo.</p>
          <button type="button" onClick={onCerrar} className="mt-4 w-full min-h-[46px] rounded-xl bg-surface-2 border border-line font-semibold">Cerrar</button>
        </div>
      </ModalOverlay>
    );
  }

  const ligadosQueSeQuitan = comparacion ? comparacion.eliminados.filter((e) => e.elementoId).length : 0;
  const grupos = comparacion ? [
    { clave: 'nuevos' as const, titulo: 'Nuevos', detalle: 'No estaban en el plano', cuantos: comparacion.nuevos.length, color: 'text-teal',
      renglones: comparacion.nuevos.map((e) => ({ id: e.id, texto: `${e.tipo}${e.etiqueta ? ` · ${e.etiqueta}` : ''}`, nota: '' })) },
    { clave: 'actualizados' as const, titulo: 'Actualizados', detalle: 'Cambiaron de lugar, tipo o dirección', cuantos: comparacion.actualizados.length, color: 'text-sky-500',
      renglones: comparacion.actualizados.map((c) => ({ id: c.anterior.id, texto: `${c.anterior.tipo}${c.anterior.etiqueta ? ` · ${c.anterior.etiqueta}` : ''}`, nota: c.motivo })) },
    { clave: 'eliminados' as const, titulo: 'Ya no vienen', detalle: 'Están en el plano pero no en el DXF', cuantos: comparacion.eliminados.length, color: 'text-red',
      renglones: comparacion.eliminados.map((e) => ({ id: e.id, texto: `${e.tipo}${e.etiqueta ? ` · ${e.etiqueta}` : ''}`, nota: e.elementoId ? 'ligado a un dispositivo del lazo' : '' })) },
  ] : [];

  return (
    <ModalOverlay onClose={() => !guardando && onCerrar()}>
      <div className="glass-strong rounded-3xl max-w-lg w-full p-5 max-h-[88vh] overflow-y-auto">
        <h2 className="font-display font-bold text-[21px]">Volver a subir el DXF</h2>
        <p className="text-[13px] text-muted mt-1 mb-4">
          Se compara con lo que ya está en «{plano.nombre}» por dirección o por posición, y solo se aplica lo que elijas. El dibujo de fondo no cambia.
        </p>

        <input ref={entrada} type="file" accept=".dxf,application/dxf,image/vnd.dxf" className="hidden" onChange={(ev) => { elegir(ev.target.files?.[0]); ev.target.value = ''; }} />
        <button type="button" onClick={abrirSelector} disabled={leyendo || guardando}
          className="w-full min-h-[60px] rounded-2xl border-2 border-dashed border-line hover:border-teal/60 bg-surface-2 flex items-center justify-center gap-2.5 text-[14.5px] font-semibold">
          {leyendo ? <Loader2 size={20} className="animate-spin" /> : <FileUp size={20} strokeWidth={2.2} />}
          {leyendo ? 'Leyendo el DXF…' : archivo ? archivo.nombre : 'Elegir el DXF actualizado'}
        </button>
        {error && <p className="text-red font-semibold text-[13px] mt-1.5">{error}</p>}

        {archivo && (
          <>
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint mt-4 mb-1.5">Bloques del DXF</p>
            <div className="rounded-2xl border border-line divide-y divide-line max-h-[200px] overflow-y-auto">
              {archivo.bloques.filter((b) => b.sugerido || tipoPorBloque[b.nombre]).map((b) => (
                <label key={b.nombre} className="flex items-center gap-2.5 px-3 min-h-[44px] text-[13.5px]">
                  <span className="flex-1 min-w-0 truncate" title={b.nombre}>{b.nombre}</span>
                  <span className="text-[12px] text-faint font-mono shrink-0">{b.cuantos}</span>
                  <select value={tipoPorBloque[b.nombre] || ''} onChange={(ev) => setTipoPorBloque({ ...tipoPorBloque, [b.nombre]: ev.target.value })}
                    aria-label={`Qué es el bloque ${b.nombre}`} className="w-[46%] shrink-0 min-h-[36px] px-2 rounded-lg bg-surface border border-line text-[13px]">
                    <option value="">No es dispositivo</option>
                    {TIPOS_EQUIPO.map((t) => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}
                  </select>
                </label>
              ))}
              {archivo.bloques.every((b) => !b.sugerido && !tipoPorBloque[b.nombre]) && (
                <p className="px-3 py-2.5 text-[13px] text-muted">Ningún bloque parece dispositivo. Asígnalos en «Nuevo plano» o revisa el DXF.</p>
              )}
            </div>
            <p className="text-[12px] text-faint mt-1">Lo que elijas se guarda como plantilla de este cliente.</p>
          </>
        )}

        {comparacion && (
          <>
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint mt-4 mb-1.5">
              Qué cambia · {comparacion.sinCambio} sin cambio
            </p>
            <div className="flex flex-col gap-2">
              {grupos.map((g) => (
                <div key={g.clave} className="rounded-2xl border border-line bg-surface overflow-hidden">
                  <div className="flex items-center gap-3 px-3 min-h-[56px]">
                    <input type="checkbox" checked={aplicar[g.clave]} disabled={g.cuantos === 0}
                      onChange={(ev) => setAplicar({ ...aplicar, [g.clave]: ev.target.checked })}
                      aria-label={`Aplicar ${g.titulo.toLowerCase()}`} className="w-5 h-5 accent-teal shrink-0" />
                    <span className={`font-display font-bold text-[22px] w-10 text-center tabular-nums ${g.cuantos ? g.color : 'text-faint'}`}>{g.cuantos}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14px] font-semibold">{g.titulo}</span>
                      <span className="block text-[12px] text-muted">{g.detalle}</span>
                    </span>
                    {g.cuantos > 0 && (
                      <button type="button" onClick={() => setAbierto(abierto === g.clave ? null : g.clave)} aria-expanded={abierto === g.clave}
                        aria-label={`Ver ${g.titulo.toLowerCase()}`} className="w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:bg-surface-2">
                        <ChevronDown size={18} className={`transition-transform ${abierto === g.clave ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                  </div>
                  {abierto === g.clave && (
                    <ul className="border-t border-line max-h-[180px] overflow-y-auto text-[13px]">
                      {g.renglones.slice(0, 100).map((r) => (
                        <li key={r.id} className="px-3 py-1.5 flex gap-2 border-b border-line last:border-b-0">
                          <span className="font-mono shrink-0">{r.texto}</span>
                          {r.nota && <span className="text-muted truncate">{r.nota}</span>}
                        </li>
                      ))}
                      {g.renglones.length > 100 && <li className="px-3 py-1.5 text-muted">y {g.renglones.length - 100} más…</li>}
                    </ul>
                  )}
                </div>
              ))}
            </div>
            {aplicar.eliminados && ligadosQueSeQuitan > 0 && (
              <p className="text-[12.5px] text-amber font-semibold mt-2">
                {ligadosQueSeQuitan} de los que ya no vienen están ligados a dispositivos del lazo: se quitan solo del plano; el dispositivo sigue en su lazo.
              </p>
            )}
          </>
        )}

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onCerrar} disabled={guardando} className="flex-1 min-h-[48px] rounded-xl bg-surface-2 border border-line font-semibold text-[14.5px]">Cancelar</button>
          <button type="button" onClick={confirmar} disabled={!comparacion || guardando}
            className="flex-[1.4] min-h-[48px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[14.5px] disabled:opacity-50">
            {guardando ? 'Aplicando…' : 'Aplicar lo elegido'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
