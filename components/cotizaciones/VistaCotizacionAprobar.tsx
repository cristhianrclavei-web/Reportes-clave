import { agruparPorSistema, modoIvaDe, type Cotizacion, type LineaCotizacion } from '@/lib/cotizaciones';

// Toda la cotización en la página del enlace de aprobación (/aprobar/<token>),
// para revisarla sin abrir el PDF. Muestra lo mismo que ve el cliente en el
// PDF: nunca costos, márgenes ni enlaces de proveedor, porque el enlace no
// pide sesión.

function dinero(n: number, moneda: string): string {
  const cifra = (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `$${cifra}${moneda === 'USD' ? ' USD' : ''}`;
}

function fechaCorta(fecha: string): string {
  const [y, m, d] = (fecha || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : fecha || '—';
}

// Mismas filas de totales que el PDF (lib/generateCotizacionPdf.ts).
function filasDeTotales(c: Cotizacion): [string, number][] {
  const modo = modoIvaDe(c);
  if (modo === 'sin') return [['Total', c.total]];
  if (modo === 'incluido' && c.total_neto) return [['Importe total neto', c.total]];
  if (modo === 'incluido') return [[`IVA incluido (${c.iva_pct}%)`, c.iva], ['Total', c.total]];
  return [['Subtotal', c.subtotal], [`IVA (${c.iva_pct}%)`, c.iva], ['Total', c.total]];
}

function Dato({ titulo, valor }: { titulo: string; valor: string | number | null | undefined }) {
  if (valor === null || valor === undefined || String(valor).trim() === '') return null;
  return (
    <div className="min-w-0">
      <span className="block text-[11px] uppercase tracking-wider text-muted">{titulo}</span>
      <span className="text-[13.5px] break-words whitespace-pre-line">{valor}</span>
    </div>
  );
}

const tarjeta = 'rounded-3xl bg-surface border border-line p-5 mb-4';
const tituloSeccion = 'text-[12px] uppercase tracking-wider text-teal font-semibold mb-3';

export default function VistaCotizacionAprobar({ cotizacion: c, lineas }: { cotizacion: Cotizacion; lineas: LineaCotizacion[] }) {
  const grupos = agruparPorSistema(lineas);
  const esKit = c.presentacion_precios === 'kit';
  const modoIva = modoIvaDe(c);
  let etiquetaIva = '';
  if (modoIva === 'sumar') etiquetaIva = ' (sin IVA)';
  if (modoIva === 'incluido') etiquetaIva = ' (IVA incluido)';

  return (
    <>
      <section className={tarjeta}>
        <h2 className={tituloSeccion}>Datos del cliente</h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          <Dato titulo="Fecha" valor={fechaCorta(c.fecha)} />
          <Dato titulo="Vigencia" valor={`${c.vigencia_dias} días`} />
          <Dato titulo="Atención" valor={c.atencion} />
          <Dato titulo="Teléfono" valor={c.telefono} />
          <div className="col-span-2"><Dato titulo="Correo" valor={c.correo} /></div>
          <div className="col-span-2"><Dato titulo="Dirección" valor={c.direccion} /></div>
        </div>
      </section>

      <section className={tarjeta}>
        <h2 className={tituloSeccion}>Conceptos ({lineas.length})</h2>
        {grupos.map((grupo) => {
          const totalGrupo = grupo.lineas.reduce((suma, l) => suma + Number(l.importe || 0), 0);
          return (
            <div key={grupo.sistema} className="mb-4 last:mb-0">
              <p className="font-semibold text-[14px] border-b border-line pb-1.5 mb-2">{grupo.sistema}</p>
              <ol className="space-y-2.5">
                {grupo.lineas.map((l, i) => (
                  <li key={l.id} className="flex gap-2.5 text-[13px]">
                    <span className="text-muted w-5 shrink-0 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                    <div className="flex-1 min-w-0">
                      <p className="break-words whitespace-pre-line">{l.descripcion}</p>
                      <p className="text-muted text-[12px] mt-0.5">
                        {l.cantidad} {l.unidad}
                        {!esKit && <> · {dinero(l.precio_unitario, c.moneda)} c/u</>}
                      </p>
                    </div>
                    {!esKit && <span className="font-semibold shrink-0 tabular-nums">{dinero(l.importe, c.moneda)}</span>}
                  </li>
                ))}
              </ol>
              {esKit && <p className="text-[12px] text-muted mt-2">Se cotiza como kit: el cliente ve solo el total del sistema.</p>}
              {/* Con un solo sistema su suma es el subtotal de abajo: repetirla confunde. */}
              {grupos.length > 1 && (
                <div className="flex justify-between gap-3 text-[13px] text-ink/80 mt-2 pt-1.5 border-t border-dashed border-line">
                  <span>Suma del sistema{etiquetaIva}</span>
                  <span className="font-semibold tabular-nums">{dinero(totalGrupo, c.moneda)}</span>
                </div>
              )}
            </div>
          );
        })}

        <div className="border-t border-line mt-4 pt-3 space-y-1">
          {filasDeTotales(c).map(([nombre, valor]) => (
            <div key={nombre} className={`flex justify-between gap-3 ${nombre.startsWith('Total') || nombre.startsWith('Importe') ? 'text-[16px] font-bold' : 'text-[13.5px]'}`}>
              <span>{nombre}</span>
              <span className="tabular-nums">{dinero(valor, c.moneda)}</span>
            </div>
          ))}
          {c.moneda === 'USD' && Number(c.tipo_cambio) > 0 && (
            <p className="text-[12px] text-muted text-right">Tipo de cambio: ${Number(c.tipo_cambio).toFixed(2)} MXN por dólar</p>
          )}
        </div>
      </section>

      <section className={tarjeta}>
        <h2 className={tituloSeccion}>Condiciones</h2>
        <div className="grid gap-2.5">
          <Dato titulo="Forma de pago" valor={c.forma_pago} />
          <Dato titulo="Tiempo de entrega" valor={c.tiempo_entrega} />
          <Dato titulo="Garantía" valor={c.garantia} />
          <Dato titulo="Notas" valor={c.notas} />
        </div>
      </section>
    </>
  );
}
