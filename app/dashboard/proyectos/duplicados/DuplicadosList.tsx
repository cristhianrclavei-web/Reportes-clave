'use client';

import EmptyIllustration from '@/components/EmptyIllustration';
import EstadoVacio from '@/components/EstadoVacio';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import SupervisorShell from '@/components/SupervisorShell';
import { showToast } from '@/components/Toast';
import { createClient } from '@/lib/supabaseClient';
import {
  Nodo, NodoCliente, NodoSuelto, agruparSueltos, gruposDuplicados, paresDelGrupo, claveDescartado, normDe,
} from '@/lib/duplicadosClientes';
import { ChevronLeft, Merge, UserPlus, X } from 'lucide-react';

// «Posibles duplicados»: nombres de clientes que probablemente son el mismo
// (en Clientes y en reportes sin cliente). El supervisor elige el nombre
// correcto y los une, o dice que no son el mismo. Ver unir_clientes() en
// supabase/patch_unir_clientes.sql.

async function unir(principal: string | null, nombre: string, otros: string[], nombres: string[]) {
  const { data, error } = await createClient().rpc('unir_clientes', {
    p_principal: principal,
    p_nombre: nombre,
    p_otros: otros,
    p_nombres: nombres,
  });
  if (error) throw error;
  return data as { cliente_id: string; reportes: number };
}

export default function DuplicadosList({ userName }: { userName?: string }) {
  const [clientes, setClientes] = useState<NodoCliente[]>([]);
  const [sueltos, setSueltos] = useState<NodoSuelto[]>([]);
  const [descartados, setDescartados] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    try {
      const supabase = createClient();
      const [c, a, r, d] = await Promise.all([
        supabase.from('clientes').select('id, nombre, pendiente_revision').order('nombre'),
        supabase.from('cliente_alias').select('cliente_id, alias'),
        supabase.from('reports').select('empresa_cliente, cliente_id'),
        supabase.from('cliente_duplicado_descartado').select('a_norm, b_norm'),
      ]);
      const err = c.error || a.error || r.error || d.error;
      if (err) throw err;
      const reportes = (r.data || []) as { empresa_cliente: string; cliente_id: string | null }[];
      setClientes(
        (c.data || []).map((x: any) => ({
          tipo: 'cliente' as const,
          id: x.id,
          nombre: x.nombre,
          alias: (a.data || []).filter((y: any) => y.cliente_id === x.id).map((y: any) => y.alias),
          reportes: reportes.filter((y) => y.cliente_id === x.id).length,
          porRevisar: !!x.pendiente_revision,
        }))
      );
      setSueltos(agruparSueltos(reportes));
      setDescartados(new Set((d.data || []).map((x: any) => claveDescartado(x.a_norm, x.b_norm))));
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  const grupos = useMemo(() => gruposDuplicados([...clientes, ...sueltos], descartados), [clientes, sueltos, descartados]);
  const enGrupo = useMemo(() => new Set(grupos.flat().map(normDe)), [grupos]);
  const solos = sueltos.filter((s) => !enGrupo.has(s.norm));

  async function descartar(grupo: Nodo[]) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error: e } = await supabase
      .from('cliente_duplicado_descartado')
      .upsert(paresDelGrupo(grupo).map((p) => ({ ...p, created_by: user?.id })), { onConflict: 'a_norm,b_norm' });
    if (e) {
      showToast('No se pudo guardar: ' + e.message, 'error');
      return;
    }
    setDescartados((prev) => new Set([...prev, ...paresDelGrupo(grupo).map((p) => claveDescartado(p.a_norm, p.b_norm))]));
    showToast('Listo, no se volverá a sugerir', 'success');
  }

  return (
    <SupervisorShell active="proyectos" title="Posibles duplicados" userName={userName}>
      <Link href="/dashboard/proyectos" className="inline-flex items-center gap-1.5 text-[13.5px] text-teal font-medium mb-3 min-h-[40px]">
        <ChevronLeft size={16} strokeWidth={2.4} /> Clientes
      </Link>

      {error && <p className="text-red text-sm mb-4">{error}</p>}
      {cargando && <p className="text-muted text-sm">Cargando…</p>}

      {!cargando && grupos.length === 0 && solos.length === 0 && (
        <EstadoVacio icono={<EmptyIllustration variante="clientes" />} titulo="No hay duplicados pendientes" detalle="Todos los clientes están vinculados." />
      )}

      {grupos.length > 0 && (
        <>
          <p className="text-[13px] text-muted mb-3">
            Elige el nombre correcto de cada grupo (puedes corregirlo) y toca <b>Unir</b>. Los otros nombres quedan como alias y sus reportes se vinculan.
          </p>
          <div className="flex flex-col gap-3 mb-8">
            {grupos.map((g) => (
              <TarjetaGrupo key={g.map(normDe).join('|')} grupo={g} onHecho={cargar} onDescartar={() => descartar(g)} />
            ))}
          </div>
        </>
      )}

      {solos.length > 0 && (
        <>
          <p className="font-display font-semibold text-[15px] mb-1">Nombres sin cliente</p>
          <p className="text-[13px] text-muted mb-3">Reportes cuyo cliente no se parece a ninguno registrado.</p>
          <div className="flex flex-col gap-2">
            {solos.map((s) => (
              <FilaSuelto key={s.norm} suelto={s} clientes={clientes} onHecho={cargar} />
            ))}
          </div>
        </>
      )}
    </SupervisorShell>
  );
}

function etiqueta(n: Nodo): string {
  if (n.tipo === 'cliente') return `Cliente${n.porRevisar ? ' · por revisar' : ''} · ${n.reportes} reporte(s)`;
  return `Sin cliente · ${n.reportes} reporte(s)`;
}

function TarjetaGrupo({ grupo, onHecho, onDescartar }: { grupo: Nodo[]; onHecho: () => void; onDescartar: () => void }) {
  const [elegido, setElegido] = useState(0);
  const [nombre, setNombre] = useState(grupo[0].nombre);
  const [guardando, setGuardando] = useState(false);

  function elegir(i: number) {
    setElegido(i);
    setNombre(grupo[i].nombre);
  }

  async function confirmar() {
    const principal = grupo[elegido];
    const otros = grupo.filter((n, i) => i !== elegido && n.tipo === 'cliente').map((n) => (n as NodoCliente).id);
    const nombres = grupo.filter((n) => n.tipo === 'suelto').flatMap((n) => (n as NodoSuelto).variantes);
    setGuardando(true);
    try {
      const r = await unir(principal.tipo === 'cliente' ? principal.id : null, nombre.trim(), otros, nombres);
      showToast(`Unidos en «${nombre.trim()}» · ${r.reportes} reporte(s) vinculados`, 'success');
      onHecho();
    } catch (e: any) {
      showToast('No se pudo unir: ' + (e?.message || 'error'), 'error');
      setGuardando(false);
    }
  }

  return (
    <div className="rounded-2xl bg-surface border border-line p-4">
      <div className="flex flex-col gap-1.5 mb-3">
        {grupo.map((n, i) => (
          <label
            key={normDe(n)}
            className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer ${i === elegido ? 'border-teal bg-teal/10' : 'border-line bg-surface-2'}`}
          >
            <input type="radio" checked={i === elegido} onChange={() => elegir(i)} className="mt-1 accent-teal" />
            <span className="min-w-0">
              <span className="block text-[14.5px] font-semibold">{n.nombre}</span>
              <span className="block text-[12px] text-muted">{etiqueta(n)}</span>
              {n.tipo === 'suelto' && n.variantes.length > 1 && (
                <span className="block text-[11.5px] text-faint">También escrito: {n.variantes.filter((v) => v !== n.nombre).join(', ')}</span>
              )}
            </span>
          </label>
        ))}
      </div>
      <label className="text-[12px] text-muted block mb-1">Nombre final del cliente</label>
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        className="w-full px-3.5 min-h-[44px] mb-3 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14.5px]"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDescartar}
          disabled={guardando}
          className="min-h-[44px] px-3.5 rounded-xl border border-line-strong text-[13.5px] font-medium text-ink/80 flex items-center gap-1.5"
        >
          <X size={15} strokeWidth={2.4} /> No son el mismo
        </button>
        <button
          type="button"
          onClick={confirmar}
          disabled={guardando || !nombre.trim()}
          className="flex-1 min-h-[44px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[14px] flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Merge size={16} strokeWidth={2.4} /> {guardando ? 'Uniendo…' : `Unir ${grupo.length}`}
        </button>
      </div>
    </div>
  );
}

function FilaSuelto({ suelto, clientes, onHecho }: { suelto: NodoSuelto; clientes: NodoCliente[]; onHecho: () => void }) {
  const [guardando, setGuardando] = useState(false);

  async function crear() {
    setGuardando(true);
    try {
      await unir(null, suelto.nombre, [], suelto.variantes);
      showToast(`Cliente «${suelto.nombre}» creado`, 'success');
      onHecho();
    } catch (e: any) {
      showToast('No se pudo crear: ' + (e?.message || 'error'), 'error');
      setGuardando(false);
    }
  }

  async function unirA(id: string) {
    if (!id) return;
    setGuardando(true);
    try {
      const c = clientes.find((x) => x.id === id);
      await unir(id, '', [], suelto.variantes);
      showToast(`«${suelto.nombre}» unido a «${c?.nombre}»`, 'success');
      onHecho();
    } catch (e: any) {
      showToast('No se pudo unir: ' + (e?.message || 'error'), 'error');
      setGuardando(false);
    }
  }

  return (
    <div className="rounded-xl bg-surface border border-line p-3 flex flex-col sm:flex-row sm:items-center gap-2.5">
      <div className="flex-1 min-w-0">
        <p className="text-[14.5px] font-semibold truncate">{suelto.nombre}</p>
        <p className="text-[12px] text-muted">{suelto.reportes} reporte(s) sin cliente</p>
      </div>
      <div className="flex gap-2 shrink-0">
        <select
          defaultValue=""
          disabled={guardando}
          onChange={(e) => unirA(e.target.value)}
          aria-label="Unir a un cliente existente"
          className="min-h-[40px] px-2.5 rounded-xl bg-surface-2 border border-line text-[13px] max-w-[170px]"
        >
          <option value="">Unir a…</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={crear}
          disabled={guardando}
          className="min-h-[40px] px-3 rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold flex items-center gap-1.5 disabled:opacity-50"
        >
          <UserPlus size={15} strokeWidth={2.4} /> Crear cliente
        </button>
      </div>
    </div>
  );
}
