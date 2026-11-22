'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, GitPullRequestArrow } from 'lucide-react';
import EstadoVacio from '@/components/EstadoVacio';
import PestanasProyectos from '@/components/proyectos/PestanasProyectos';
import { NOMBRE_DOCUMENTO } from '@/lib/propuestas';
import { propuestasPorRevisar, type PropuestaEnLista } from '@/lib/propuestasDatos';

// Proyectos → «Cambios por revisar»: lo que los técnicos propusieron en
// planos, unifilares y guías, del más viejo al más nuevo.
export default function RevisionesLista() {
  const [lista, setLista] = useState<PropuestaEnLista[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    propuestasPorRevisar().then(setLista).catch((e) => setError(e?.message || 'No se pudieron cargar los cambios.'));
  }, []);

  return (
    <div className="px-4 lg:px-8 py-5 max-w-3xl">
      <PestanasProyectos actual="revisiones" />
      <h1 className="font-display font-bold text-[26px] leading-tight mb-1">Cambios por revisar</h1>
      <p className="text-[14px] text-muted mb-4">
        Los técnicos editan una copia de los planos, unifilares y guías. Aquí ves qué cambiaron y eliges qué entra al original.
      </p>
      {error && <p className="rounded-xl bg-red/10 text-red text-[14px] px-3 py-2 mb-3">{error}</p>}
      {lista === null && !error && <p className="text-[14px] text-muted">Cargando…</p>}
      {lista?.length === 0 && (
        <EstadoVacio icono={<GitPullRequestArrow size={26} />} titulo="No hay cambios por revisar" detalle="Cuando un técnico envíe cambios te llega un aviso y aparecen aquí." />
      )}
      <div className="grid gap-2">
        {lista?.map((p) => (
          <Link key={p.id} href={`/dashboard/revisiones/${p.id}`} className="rounded-2xl border border-line bg-surface p-3.5 flex items-center gap-3 hover:border-teal/60">
            <span className="w-10 h-10 rounded-xl bg-amber/15 text-amber flex items-center justify-center shrink-0"><GitPullRequestArrow size={19} /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-semibold truncate">{p.documento}</span>
              <span className="block text-[12.5px] text-muted truncate">
                {NOMBRE_DOCUMENTO[p.tipo]} · {p.autor}
                {p.enviada_en ? ` · ${new Date(p.enviada_en).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
              </span>
              {p.comentario && <span className="block text-[12.5px] text-faint truncate">«{p.comentario}»</span>}
            </span>
            <ChevronRight size={17} className="text-faint shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
