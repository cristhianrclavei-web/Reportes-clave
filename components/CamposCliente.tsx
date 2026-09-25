'use client';

import ClienteAvatar, { fondoAvatar } from '@/components/ClienteAvatar';
import { DatosCliente, ESTADOS_MX, TipoPersona, soloDigitosCP } from '@/lib/clienteDatos';

const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5';
const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal-glow text-[15px] transition-colors placeholder:text-faint';

const TIPOS: { valor: TipoPersona; titulo: string; ejemplo: string }[] = [
  { valor: 'fisica', titulo: 'Persona física', ejemplo: 'Ej. Juan González' },
  { valor: 'moral', titulo: 'Empresa', ejemplo: 'Ej. Print Pack' },
];

// Tipo de cliente + nombre + dirección en campos separados. Lo comparten el
// alta (Proyectos) y la edición del perfil, para que no se desincronicen.
export default function CamposCliente({
  valor,
  onChange,
}: {
  valor: DatosCliente;
  onChange: (v: DatosCliente) => void;
}) {
  const set = (patch: Partial<DatosCliente>) => onChange({ ...valor, ...patch });
  const fisica = valor.tipo_persona === 'fisica';

  return (
    <div>
      <label className={labelCls}>Tipo de cliente</label>
      <div className="grid grid-cols-2 gap-2.5 mb-3.5">
        {TIPOS.map((t) => {
          const activo = valor.tipo_persona === t.valor;
          return (
            <button
              key={t.valor}
              type="button"
              onClick={() => set({ tipo_persona: t.valor })}
              aria-pressed={activo}
              className={`rounded-2xl border p-3 flex flex-col items-center gap-1.5 text-center transition-all duration-150 active:scale-[0.97] ${
                activo ? 'border-teal bg-teal/5 ring-2 ring-teal-glow' : 'border-line bg-surface-2 hover:border-line-strong'
              }`}
            >
              <span className={`w-12 h-12 rounded-xl flex items-center justify-center ${fondoAvatar(t.valor)}`}>
                <ClienteAvatar tipo={t.valor} size={34} />
              </span>
              <span className="text-[13.5px] font-semibold leading-tight">{t.titulo}</span>
              <span className="text-[11px] text-muted leading-tight">{t.ejemplo}</span>
            </button>
          );
        })}
      </div>

      <label className={labelCls}>{fisica ? 'Nombre completo *' : 'Nombre de la empresa *'}</label>
      <input
        value={valor.nombre}
        onChange={(e) => set({ nombre: e.target.value })}
        placeholder={fisica ? 'Ej. Juan González Pérez' : 'Ej. Aislantes y Empaques'}
        className={`${inputCls} mb-4`}
      />

      <p className={labelCls}>Dirección (opcional)</p>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="col-span-2">
          <input value={valor.calle} onChange={(e) => set({ calle: e.target.value })} placeholder="Calle" aria-label="Calle" className={inputCls} />
        </div>
        <input value={valor.num_exterior} onChange={(e) => set({ num_exterior: e.target.value })} placeholder="Núm. exterior" aria-label="Número exterior" className={inputCls} />
        <input value={valor.num_interior} onChange={(e) => set({ num_interior: e.target.value })} placeholder="Núm. interior" aria-label="Número interior" className={inputCls} />
        <div className="col-span-2">
          <input value={valor.colonia} onChange={(e) => set({ colonia: e.target.value })} placeholder="Colonia" aria-label="Colonia" className={inputCls} />
        </div>
        <input
          value={valor.codigo_postal}
          onChange={(e) => set({ codigo_postal: soloDigitosCP(e.target.value) })}
          placeholder="C.P."
          aria-label="Código postal"
          inputMode="numeric"
          maxLength={5}
          className={inputCls}
        />
        <input value={valor.ciudad} onChange={(e) => set({ ciudad: e.target.value })} placeholder="Ciudad / Municipio" aria-label="Ciudad o municipio" className={inputCls} />
        <div className="col-span-2">
          <select value={valor.estado} onChange={(e) => set({ estado: e.target.value })} aria-label="Estado" className={inputCls}>
            <option value="">Estado</option>
            {ESTADOS_MX.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
