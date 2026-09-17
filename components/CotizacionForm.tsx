'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Cotizacion, LineaCotizacion, LineaInput, CotizacionInput, MonedaCotizacion,
  crearCotizacion, actualizarCotizacion, calcularTotales, precioUnitarioDesdeCosto,
} from '@/lib/cotizaciones';
import { generarUUID } from '@/lib/uuid';
import { hoyLocal } from '@/lib/fechaHoy';
import { showToast } from '@/components/Toast';
import { Plus, Trash2 } from 'lucide-react';

const SISTEMAS_SUGERIDOS = [
  'CCTV', 'Control de Acceso', 'Control de Acceso Vehicular', 'Alarma & Detección de Humo',
  'Alarma de Intrusión', 'Red Contra Incendio', 'Automatización', 'Paneles Solares', 'Instalaciones Eléctricas',
];
const UNIDADES_SUGERIDAS = ['Pza', 'Lote', 'Serv', 'Mts', 'Hrs', 'Juego'];

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal-glow text-[15px] transition-colors placeholder:text-faint';
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5';
const cardCls = 'glass rounded-2xl p-4';
const cardTitleCls = 'font-display font-semibold text-[13px] uppercase tracking-wider text-teal mb-3.5 flex items-center gap-2';

type ItemForm = { id: string; descripcion: string; unidad: string; cantidad: string; costo: string; margenPct: string };
type GrupoForm = { id: string; sistema: string; items: ItemForm[] };

function nuevoItem(): ItemForm {
  return { id: generarUUID(), descripcion: '', unidad: 'Pza', cantidad: '1', costo: '', margenPct: '0' };
}
function nuevoGrupo(sistema = ''): GrupoForm {
  return { id: generarUUID(), sistema, items: [nuevoItem()] };
}

function money(n: number): string {
  return '$' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CotizacionForm({
  modo,
  cotizacionId,
  inicial,
  nombreUsuario,
  correoUsuario,
  onGuardado,
}: {
  modo: 'crear' | 'editar';
  cotizacionId?: string;
  inicial?: { cotizacion: Cotizacion; lineas: LineaCotizacion[] };
  nombreUsuario?: string;
  correoUsuario?: string;
  // Solo para modo "editar": se llama en vez de navegar, porque el destino
  // sería la misma ruta en la que ya está el detalle (Next no la remonta,
  // así que un router.push aquí dejaba el formulario abierto en pantalla).
  onGuardado?: () => void;
}) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const c = inicial?.cotizacion;
  const [fecha, setFecha] = useState(c?.fecha || hoyLocal());
  const [empresa, setEmpresa] = useState(c?.empresa || '');
  const [atencion, setAtencion] = useState(c?.atencion || '');
  const [telefono, setTelefono] = useState(c?.telefono || '');
  const [correo, setCorreo] = useState(c?.correo || '');
  const [direccion, setDireccion] = useState(c?.direccion || '');

  const [formaPago, setFormaPago] = useState(c?.forma_pago || 'Contado 100% contra entrega');
  const [tiempoEntrega, setTiempoEntrega] = useState(
    c?.tiempo_entrega || 'De 5 a 7 días hábiles previamente programados para todos los servicios que integran la cotización.'
  );
  const [garantia, setGarantia] = useState(c?.garantia || 'Equipos 12 meses, contra defectos de fabricación.');
  const [vigenciaDias, setVigenciaDias] = useState(String(c?.vigencia_dias ?? 15));
  const [ivaPct, setIvaPct] = useState(String(c?.iva_pct ?? 16));
  const [moneda, setMoneda] = useState<MonedaCotizacion>(c?.moneda || 'MXN');
  const [tipoCambio, setTipoCambio] = useState(c?.tipo_cambio && c.tipo_cambio !== 1 ? String(c.tipo_cambio) : '');
  const [notas, setNotas] = useState(c?.notas || '');
  const [firmanteNombre, setFirmanteNombre] = useState(c?.firmante_nombre || nombreUsuario || '');
  const [firmanteCorreo, setFirmanteCorreo] = useState(c?.firmante_correo || correoUsuario || '');

  const [grupos, setGrupos] = useState<GrupoForm[]>(() => {
    if (!inicial || inicial.lineas.length === 0) return [nuevoGrupo()];
    const porSistema = new Map<string, GrupoForm>();
    const orden: string[] = [];
    for (const l of inicial.lineas) {
      if (!porSistema.has(l.sistema)) {
        porSistema.set(l.sistema, { id: generarUUID(), sistema: l.sistema, items: [] });
        orden.push(l.sistema);
      }
      // Líneas ya guardadas antes de que existiera costo/margen tienen ambos
      // en 0 — en ese caso se parte del precio ya guardado como costo con
      // 0% de margen, para no cambiarle el precio a nadie por el simple
      // hecho de abrir la cotización a editar.
      const tieneMargenGuardado = l.costo > 0 || l.margen_pct > 0;
      porSistema.get(l.sistema)!.items.push({
        id: generarUUID(),
        descripcion: l.descripcion,
        unidad: l.unidad,
        cantidad: String(l.cantidad),
        costo: String(tieneMargenGuardado ? l.costo : l.precio_unitario),
        margenPct: String(tieneMargenGuardado ? l.margen_pct : 0),
      });
    }
    return orden.map((s) => porSistema.get(s)!);
  });

  function actualizarGrupo(id: string, patch: Partial<GrupoForm>) {
    setGrupos((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }
  function actualizarItem(grupoId: string, itemId: string, patch: Partial<ItemForm>) {
    setGrupos((prev) =>
      prev.map((g) => (g.id !== grupoId ? g : { ...g, items: g.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) }))
    );
  }
  function agregarItem(grupoId: string) {
    setGrupos((prev) => prev.map((g) => (g.id === grupoId ? { ...g, items: [...g.items, nuevoItem()] } : g)));
  }
  function quitarItem(grupoId: string, itemId: string) {
    setGrupos((prev) =>
      prev.map((g) => (g.id !== grupoId ? g : { ...g, items: g.items.length > 1 ? g.items.filter((it) => it.id !== itemId) : g.items }))
    );
  }
  function agregarGrupo() {
    setGrupos((prev) => [...prev, nuevoGrupo()]);
  }
  function quitarGrupo(id: string) {
    if (grupos.length <= 1) return;
    if (!confirm('¿Quitar este sistema de la cotización, con todas sus partidas?')) return;
    setGrupos((prev) => prev.filter((g) => g.id !== id));
  }

  // Líneas listas para calcular/guardar: se descartan renglones vacíos (sin
  // descripción) para no guardar partidas en blanco por error. El precio
  // unitario sale solo del costo + % de ganancia, nunca se captura directo.
  const lineasValidas: LineaInput[] = useMemo(
    () =>
      grupos.flatMap((g) =>
        g.items
          .filter((it) => it.descripcion.trim())
          .map((it) => {
            const costo = parseFloat(it.costo) || 0;
            const margen_pct = parseFloat(it.margenPct) || 0;
            return {
              sistema: g.sistema.trim() || 'General',
              descripcion: it.descripcion.trim(),
              unidad: it.unidad.trim() || 'Pza',
              cantidad: parseFloat(it.cantidad) || 0,
              costo,
              margen_pct,
              precio_unitario: precioUnitarioDesdeCosto(costo, margen_pct),
            };
          })
      ),
    [grupos]
  );

  const ivaPctNum = parseFloat(ivaPct) || 0;
  const totales = useMemo(() => calcularTotales(lineasValidas, ivaPctNum), [lineasValidas, ivaPctNum]);
  const tipoCambioNum = parseFloat(tipoCambio) || 0;

  const faltantes: string[] = [];
  if (!empresa.trim()) faltantes.push('empresa / cliente');
  if (lineasValidas.length === 0) faltantes.push('al menos una partida con descripción');
  if (moneda === 'USD' && tipoCambioNum <= 0) faltantes.push('tipo de cambio');

  async function handleGuardar() {
    if (faltantes.length > 0) {
      setMsg('Falta por llenar: ' + faltantes.join(', '));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setGuardando(true);
    setMsg(null);
    const input: CotizacionInput = {
      fecha,
      atencion,
      empresa,
      telefono,
      correo,
      direccion,
      forma_pago: formaPago,
      tiempo_entrega: tiempoEntrega,
      garantia,
      vigencia_dias: parseInt(vigenciaDias, 10) || 0,
      notas,
      firmante_nombre: firmanteNombre,
      firmante_correo: firmanteCorreo,
      iva_pct: ivaPctNum,
      moneda,
      tipo_cambio: tipoCambioNum,
      lineas: lineasValidas,
    };
    try {
      if (modo === 'editar' && cotizacionId) {
        await actualizarCotizacion(cotizacionId, input);
        showToast('Cotización actualizada', 'success');
        if (onGuardado) {
          onGuardado();
        } else {
          router.push(`/dashboard/cotizaciones/${cotizacionId}`);
        }
      } else {
        const id = await crearCotizacion(input);
        showToast('Cotización guardada', 'success');
        router.push(`/dashboard/cotizaciones/${id}`);
      }
    } catch (e: any) {
      setMsg('Error al guardar: ' + (e?.message || 'error desconocido'));
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-10">
      <div className={cardCls}>
        <p className={cardTitleCls}><span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Datos del cliente</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className={labelCls}>Empresa / Cliente *</label>
            <input className={inputCls} value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Ej. Administración Torre Classiqa" />
          </div>
          <div>
            <label className={labelCls}>Fecha</label>
            <input type="date" className={inputCls} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Atención (contacto)</label>
            <input className={inputCls} value={atencion} onChange={(e) => setAtencion(e.target.value)} placeholder="Nombre de quien recibe la cotización" />
          </div>
          <div>
            <label className={labelCls}>Teléfono</label>
            <input className={inputCls} value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Correo</label>
            <input className={inputCls} value={correo} onChange={(e) => setCorreo(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Dirección (opcional)</label>
            <input className={inputCls} value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </div>
        </div>
      </div>

      {grupos.map((g, gi) => {
        const subtotalGrupo = g.items.reduce((acc, it) => {
          const precio = precioUnitarioDesdeCosto(parseFloat(it.costo) || 0, parseFloat(it.margenPct) || 0);
          return acc + (parseFloat(it.cantidad) || 0) * precio;
        }, 0);
        return (
          <div key={g.id} className={cardCls}>
            <div className="flex items-center justify-between gap-2 mb-3.5">
              <p className={`${cardTitleCls} mb-0`}><span className="w-1.5 h-1.5 rounded-full bg-teal inline-block" /> Sistema {gi + 1}</p>
              {grupos.length > 1 && (
                <button onClick={() => quitarGrupo(g.id)} className="text-red text-xs font-medium active:scale-95 transition-transform">
                  Quitar sistema
                </button>
              )}
            </div>

            <label className={labelCls}>¿Para qué sistema es? *</label>
            <input
              list={`sistemas-${g.id}`}
              className={`${inputCls} mb-4`}
              value={g.sistema}
              onChange={(e) => actualizarGrupo(g.id, { sistema: e.target.value })}
              placeholder="Ej. CCTV"
            />
            <datalist id={`sistemas-${g.id}`}>
              {SISTEMAS_SUGERIDOS.map((s) => <option key={s} value={s} />)}
            </datalist>

            <div className="flex flex-col gap-3">
              {g.items.map((it, ii) => (
                <div key={it.id} className="p-3.5 rounded-xl bg-surface-2 border border-line">
                  <div className="flex items-start gap-2 mb-2.5">
                    <textarea
                      value={it.descripcion}
                      onChange={(e) => actualizarItem(g.id, it.id, { descripcion: e.target.value })}
                      placeholder="Descripción del concepto: equipo, mano de obra, tubería, cableado..."
                      className={`${inputCls} min-h-[70px] flex-1`}
                    />
                    {g.items.length > 1 && (
                      <button
                        onClick={() => quitarItem(g.id, it.id)}
                        aria-label="Quitar partida"
                        className="shrink-0 w-10 h-10 rounded-xl border border-line-strong text-red flex items-center justify-center active:scale-90 transition-transform"
                      >
                        <Trash2 size={16} strokeWidth={2.3} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 mb-2.5">
                    <div>
                      <label className={labelCls}>Unidad</label>
                      <input
                        list={`unidades-${g.id}-${it.id}`}
                        className={inputCls}
                        value={it.unidad}
                        onChange={(e) => actualizarItem(g.id, it.id, { unidad: e.target.value })}
                      />
                      <datalist id={`unidades-${g.id}-${it.id}`}>
                        {UNIDADES_SUGERIDAS.map((u) => <option key={u} value={u} />)}
                      </datalist>
                    </div>
                    <div>
                      <label className={labelCls}>Cantidad</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        className={inputCls}
                        value={it.cantidad}
                        onChange={(e) => actualizarItem(g.id, it.id, { cantidad: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className={labelCls}>Costo</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder="0.00"
                        className={inputCls}
                        value={it.costo}
                        onChange={(e) => actualizarItem(g.id, it.id, { costo: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>% Ganancia</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={100}
                        className={inputCls}
                        value={it.margenPct}
                        onChange={(e) => actualizarItem(g.id, it.id, { margenPct: e.target.value })}
                      />
                    </div>
                  </div>
                  <p className="text-right text-[13px] text-muted mt-2">
                    P. Unitario: <span className="font-medium text-ink">{money(precioUnitarioDesdeCosto(parseFloat(it.costo) || 0, parseFloat(it.margenPct) || 0))}</span>
                    {' · '}
                    Importe: <span className="font-semibold text-ink">
                      {money((parseFloat(it.cantidad) || 0) * precioUnitarioDesdeCosto(parseFloat(it.costo) || 0, parseFloat(it.margenPct) || 0))}
                    </span>
                  </p>
                </div>
              ))}
            </div>

            <button
              onClick={() => agregarItem(g.id)}
              className="w-full min-h-[46px] mt-3 rounded-xl border border-dashed border-teal/50 text-teal text-[14px] font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              <Plus size={16} strokeWidth={2.4} />
              Agregar concepto
            </button>

            <p className="text-right text-[13.5px] mt-3 pt-3 border-t border-dashed border-line-strong">
              Importe {gi + 1}: <span className="font-display font-bold text-teal">{money(subtotalGrupo)}</span>
            </p>
          </div>
        );
      })}

      <button
        onClick={agregarGrupo}
        className="w-full min-h-[52px] rounded-2xl border border-dashed border-line-strong text-ink/75 font-medium text-[14.5px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
      >
        <Plus size={18} strokeWidth={2.4} />
        Agregar otro sistema
      </button>

      <div className={cardCls}>
        <p className={cardTitleCls}><span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Condiciones comerciales</p>
        <div className="flex flex-col gap-3.5">
          <div>
            <label className={labelCls}>Forma de pago</label>
            <input className={inputCls} value={formaPago} onChange={(e) => setFormaPago(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Tiempo de entrega</label>
            <textarea className={`${inputCls} min-h-[60px]`} value={tiempoEntrega} onChange={(e) => setTiempoEntrega(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Garantía</label>
            <input className={inputCls} value={garantia} onChange={(e) => setGarantia(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className={labelCls}>Vigencia (días)</label>
              <input type="number" className={inputCls} value={vigenciaDias} onChange={(e) => setVigenciaDias(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>IVA (%)</label>
              <input type="number" className={inputCls} value={ivaPct} onChange={(e) => setIvaPct(e.target.value)} />
            </div>
          </div>
          <div className={moneda === 'USD' ? 'grid grid-cols-2 gap-3.5' : ''}>
            <div>
              <label className={labelCls}>Moneda</label>
              <div className="flex gap-1 p-1 rounded-xl bg-surface-2 border border-line w-fit">
                {(['MXN', 'USD'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMoneda(m)}
                    className={`px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-colors ${
                      moneda === m ? 'bg-teal text-inkOnAccent' : 'text-muted'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            {moneda === 'USD' && (
              <div>
                <label className={labelCls}>Tipo de cambio</label>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="Ej. 18.50"
                  className={inputCls}
                  value={tipoCambio}
                  onChange={(e) => setTipoCambio(e.target.value)}
                />
              </div>
            )}
          </div>
          <div>
            <label className={labelCls}>Notas adicionales (opcional)</label>
            <textarea className={`${inputCls} min-h-[60px]`} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Cualquier condición especial de esta cotización" />
          </div>
        </div>
      </div>

      <div className={cardCls}>
        <p className={cardTitleCls}><span className="w-1.5 h-1.5 rounded-full bg-teal inline-block" /> Firma</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className={labelCls}>Nombre de quien firma</label>
            <input className={inputCls} value={firmanteNombre} onChange={(e) => setFirmanteNombre(e.target.value)} placeholder="Ej. Ing. Everardo Sánchez" />
          </div>
          <div>
            <label className={labelCls}>Correo de quien firma</label>
            <input className={inputCls} value={firmanteCorreo} onChange={(e) => setFirmanteCorreo(e.target.value)} />
          </div>
        </div>
      </div>

      <div className={cardCls}>
        <div className="flex justify-between text-[14px] mb-1">
          <span className="text-muted">Subtotal</span>
          <span className="font-medium">{moneda === 'USD' ? 'USD ' : ''}{money(totales.subtotal)}</span>
        </div>
        <div className="flex justify-between text-[14px] mb-1">
          <span className="text-muted">IVA ({ivaPctNum}%)</span>
          <span className="font-medium">{moneda === 'USD' ? 'USD ' : ''}{money(totales.iva)}</span>
        </div>
        <div className="flex justify-between text-[19px] pt-2 border-t border-line-strong">
          <span className="font-display font-bold">Total</span>
          <span className="font-display font-bold text-teal">{moneda === 'USD' ? 'USD ' : ''}{money(totales.total)}</span>
        </div>
        {moneda === 'USD' && tipoCambioNum > 0 && (
          <p className="text-right text-[12.5px] text-muted mt-1">
            ≈ {money(totales.total * tipoCambioNum)} MXN <span className="text-faint">(TC {tipoCambioNum.toFixed(2)})</span>
          </p>
        )}
        <div className="mb-3" />

        {msg && (
          <div className="text-sm px-4 py-3 mb-3 rounded-xl bg-red/10 text-red border border-red/30">{msg}</div>
        )}

        <button
          onClick={handleGuardar}
          disabled={guardando}
          className="w-full min-h-[54px] rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[16px] active:scale-95 transition-transform disabled:opacity-60 shadow-glow-teal"
        >
          {guardando ? 'Guardando...' : modo === 'editar' ? 'Guardar cambios' : 'Guardar cotización'}
        </button>
      </div>
    </div>
  );
}
