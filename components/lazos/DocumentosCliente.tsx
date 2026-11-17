'use client';

import { useEffect, useState } from 'react';
import { ClipboardCheck, Download, FileText, Loader2, Network } from 'lucide-react';
import { showToast } from '@/components/Toast';
import { COLOR_TIPO, fondo } from '@/components/lazos/FrentePanel';
import { COLOR_BLOQUEADO, ESTADOS_AVANCE, contar, cuentaVacia, leerAvance, porcentajes, sumar, type Cuenta } from '@/lib/avancePlano';
import { etiquetaSalida, ordenarCircuitos } from '@/lib/lazos';
import type { LazoResumen } from '@/lib/lazosDatos';
import { planosDelCliente } from '@/lib/planosDatos';
import { generarReporteAvanceCliente } from '@/lib/reporteAvanceCliente';

// Los PDF del cliente a la mano, sin entrar a cada plano o diagrama:
// el reporte de avance de la obra (todos los planos) y el diagrama
// unifilar de cada circuito.

const COLOR_PROBADO = ESTADOS_AVANCE[4].color;

export default function DocumentosCliente({ clienteId, cliente, paneles, circuitos, hayPlanos }: {
  clienteId: string;
  cliente: string;
  paneles: string[];
  circuitos: LazoResumen[];
  hayPlanos: boolean;
}) {
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [generandoAvance, setGenerandoAvance] = useState(false);
  const [descargando, setDescargando] = useState<string | null>(null);

  // El avance de toda la obra, para enseñarlo en la tarjeta antes de descargar.
  useEffect(() => {
    if (!hayPlanos) return;
    let cancelado = false;
    planosDelCliente(clienteId)
      .then(({ planos }) => {
        let total = cuentaVacia();
        for (const p of planos) total = sumar(total, contar(p.sembrado.equipos, leerAvance(p.avance)));
        if (!cancelado) setCuenta(total);
      })
      // Sin el número la tarjeta sigue sirviendo: solo no se ve el porcentaje.
      .catch((e) => console.error('No se pudo calcular el avance del cliente:', e));
    return () => { cancelado = true; };
  }, [clienteId, hayPlanos]);

  async function descargarAvance() {
    if (!navigator.onLine) {
      showToast('El reporte necesita señal. Intenta cuando tengas conexión.', 'error');
      return;
    }
    setGenerandoAvance(true);
    try {
      const url = await generarReporteAvanceCliente({ clienteId, cliente, paneles });
      window.location.assign(url);
      showToast('Descargando el reporte de avance');
    } catch (e: any) {
      showToast(e?.message || 'No se pudo generar el reporte. Intenta de nuevo.', 'error');
    }
    setGenerandoAvance(false);
  }

  // El PDF del diagrama se arma en el servidor (igual que en la vista del lazo).
  async function descargarDiagrama(circuito: LazoResumen) {
    if (!navigator.onLine) {
      showToast('El PDF necesita señal. Intenta cuando tengas conexión.', 'error');
      return;
    }
    setDescargando(circuito.id);
    try {
      const respuesta = await fetch(`/api/lazos/${circuito.id}/pdf?enlace=1`, { cache: 'no-store' });
      const cuerpo = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok || !cuerpo.url) throw new Error(cuerpo.error || `No se pudo generar el PDF (código ${respuesta.status}).`);
      window.location.assign(cuerpo.url);
      showToast(`Descargando el diagrama ${circuito.codigo}`);
    } catch (e: any) {
      showToast(e?.message || 'No se pudo generar el PDF. Revisa tu señal e intenta de nuevo.', 'error');
    }
    setDescargando(null);
  }

  if (!hayPlanos && circuitos.length === 0) return null;
  const ordenados = ordenarCircuitos(circuitos);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-2 gap-2.5 items-start">
      {hayPlanos && <TarjetaAvance cuenta={cuenta} generando={generandoAvance} onDescargar={descargarAvance} />}

      {ordenados.length > 0 && (
        <div className="rounded-3xl border border-line bg-surface p-3.5">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 shrink-0 rounded-xl bg-violet-500/15 text-violet-400 flex items-center justify-center">
              <Network size={21} strokeWidth={2.2} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[15.5px] font-semibold">Diagramas unifilares</span>
              <span className="block text-[12.5px] text-muted">Un PDF por circuito, con la lista de dispositivos</span>
            </span>
          </div>
          <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-1.5">
            {ordenados.map((c) => {
              const color = COLOR_TIPO[c.tipo];
              const ocupado = descargando === c.id;
              return (
                <li key={c.id} className="min-w-0">
                  <button type="button" onClick={() => descargarDiagrama(c)} disabled={descargando !== null}
                    aria-label={`Descargar el diagrama ${c.codigo} ${c.nombre}`} title={`${c.codigo} · ${c.nombre}`}
                    className="w-full flex items-center gap-2 rounded-xl border border-line pl-2 pr-1.5 min-h-[48px] text-left transition-colors hover:bg-surface-2 disabled:opacity-60">
                    <span className="flex-1 min-w-0">
                      <span className="block font-mono text-[12.5px] font-bold truncate" style={{ color }}>{etiquetaSalida(c)}</span>
                      <span className="block text-[11.5px] text-muted truncate">{c.codigo} · {c.dispositivos} disp.</span>
                    </span>
                    <span className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ color, backgroundColor: fondo(color, 14) }}>
                      {ocupado ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} strokeWidth={2.4} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// El reporte de avance: cuánto va terminado, la barra por paso y el botón.
function TarjetaAvance({ cuenta, generando, onDescargar }: { cuenta: Cuenta | null; generando: boolean; onDescargar: () => void }) {
  const pct = cuenta ? porcentajes(cuenta) : null;
  const tramos = cuenta
    ? [...ESTADOS_AVANCE.map((e) => ({ id: e.id, nombre: e.corto, color: e.color, n: cuenta.porEstado[e.id] })), { id: 'bloq', nombre: 'No se puede', color: COLOR_BLOQUEADO, n: cuenta.bloqueados }]
    : [];

  return (
    <div className="rounded-3xl border border-line bg-surface p-3.5">
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 shrink-0 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
          <ClipboardCheck size={21} strokeWidth={2.2} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15.5px] font-semibold">Reporte de avance de obra</span>
          <span className="block text-[12.5px] text-muted">Todos los planos: resumen, lo que falta y planos pintados</span>
        </span>
      </div>

      {cuenta && pct && cuenta.total > 0 && (
        <div className="mt-3 rounded-2xl bg-surface-2/60 border border-line p-3">
          <div className="flex items-end justify-between gap-2">
            <p className="font-display font-bold text-[30px] leading-none" style={{ color: COLOR_PROBADO }}>{pct.probado}%</p>
            <p className="text-[12.5px] text-muted text-right">terminado · {pct.probados} de {pct.aplicables} probados</p>
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-surface mt-2.5" role="img"
            aria-label={tramos.map((t) => `${t.nombre} ${t.n}`).join(', ')}>
            {tramos.filter((t) => t.n > 0).map((t) => (
              <span key={t.id} className="h-full" style={{ width: `${(t.n / cuenta.total) * 100}%`, background: t.color }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
            {tramos.filter((t) => t.n > 0).map((t) => (
              <span key={t.id} className="flex items-center gap-1.5 text-[11.5px] text-muted">
                <span className="w-2 h-2 rounded-full" style={{ background: t.color }} /> {t.nombre} <b className="text-ink font-semibold tabular-nums">{t.n}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      <button type="button" onClick={onDescargar} disabled={generando}
        className="mt-3 w-full min-h-[46px] rounded-xl bg-teal text-inkOnAccent text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-70">
        {generando ? <><Loader2 size={17} className="animate-spin" /> Armando el reporte…</> : <><FileText size={17} strokeWidth={2.4} /> Descargar reporte de avance</>}
      </button>
    </div>
  );
}
