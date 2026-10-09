'use client';

import { useEffect, useState } from 'react';
import { LocateFixed, Check, MapPinOff, Clock, HelpCircle, PhoneCall } from 'lucide-react';
import { Verificacion, listarVerificaciones, pedirVerificacion } from '@/lib/presencia';
import { resultadoVerificacion, TEXTO_VERIFICACION, distanciaTexto, ResultadoVerificacion } from '@/lib/pausas';
import { mapsLink } from '@/lib/geolocation';
import { showToast } from '@/components/Toast';

// Verificación de presencia, del lado de supervisión: pedirla a quien está en
// el servicio y ver qué respondió cada quien. Mientras hay una en espera se
// refresca sola.

const ESTILO: Record<ResultadoVerificacion, { cls: string; Icono: typeof Check }> = {
  pendiente: { cls: 'bg-amber/15 text-amber', Icono: Clock },
  en_sitio: { cls: 'bg-teal/15 text-teal', Icono: Check },
  fuera: { cls: 'bg-red/12 text-red', Icono: MapPinOff },
  sin_ubicacion: { cls: 'bg-amber/15 text-amber', Icono: HelpCircle },
  sin_respuesta: { cls: 'bg-red/12 text-red', Icono: PhoneCall },
};

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function PresenciaPanel({
  servicioId, proyecto, tecnicos, activo,
}: {
  servicioId: string;
  proyecto: string;
  tecnicos: { id: string; nombre: string }[];
  // Solo se puede pedir con el servicio en sitio o en curso.
  activo: boolean;
}) {
  const [lista, setLista] = useState<Verificacion[]>([]);
  const [pidiendo, setPidiendo] = useState(false);
  // El reloj vive en estado (no se lee en el render): ver hidratación.
  const [ahora, setAhora] = useState(0);

  async function cargar() {
    try {
      setLista(await listarVerificaciones(servicioId));
    } catch { /* la tabla puede no existir todavía: el panel queda vacío */ }
    setAhora(Date.now());
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [servicioId]);

  const hayPendiente = lista.some((v) => resultadoVerificacion(v, ahora) === 'pendiente');
  useEffect(() => {
    if (!hayPendiente) return;
    const id = setInterval(cargar, 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hayPendiente, servicioId]);

  async function pedir(ids: string[]) {
    setPidiendo(true);
    try {
      const n = await pedirVerificacion(servicioId, ids, proyecto);
      showToast(n === 0 ? 'Ya hay una verificación en espera' : n === 1 ? 'Verificación pedida' : `Verificación pedida a ${n} personas`, n === 0 ? 'error' : 'success');
      await cargar();
    } catch (e: any) {
      showToast('No se pudo pedir: ' + (e?.message || 'error'), 'error');
    } finally {
      setPidiendo(false);
    }
  }

  if (!activo && lista.length === 0) return null;

  return (
    <div className="glass rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="text-[11px] uppercase tracking-wider text-muted">Presencia en sitio</div>
        {activo && tecnicos.length > 0 && (
          <button
            type="button"
            onClick={() => pedir(tecnicos.map((t) => t.id))}
            disabled={pidiendo}
            className="min-h-[38px] px-3.5 rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold inline-flex items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-60"
          >
            <LocateFixed size={15} strokeWidth={2.4} />
            {pidiendo ? 'Pidiendo…' : tecnicos.length > 1 ? 'Pedir verificación a todos' : 'Pedir verificación'}
          </button>
        )}
      </div>
      {activo && (
        <p className="text-[12.5px] text-muted leading-relaxed mb-2.5">
          Le llega un aviso al teléfono y tiene unos minutos para tocar «Estoy aquí»; la app compara su ubicación con el sitio.
        </p>
      )}

      {activo && tecnicos.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {tecnicos.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => pedir([t.id])}
              disabled={pidiendo}
              className="px-3 min-h-[34px] rounded-full border border-line bg-surface-2 text-[12.5px] font-medium hover:border-teal/50 disabled:opacity-60"
            >
              Solo a {t.nombre.split(' ')[0]}
            </button>
          ))}
        </div>
      )}

      {lista.length > 0 && (
        <ul className="flex flex-col gap-2">
          {lista.map((v) => {
            const r = resultadoVerificacion(v, ahora);
            const { cls, Icono } = ESTILO[r];
            const min = v.respondida_en ? Math.max(0, Math.round((new Date(v.respondida_en).getTime() - new Date(v.pedida_en).getTime()) / 60000)) : null;
            return (
              <li key={v.id} className="flex items-start justify-between gap-3 text-[13px]">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{v.nombre}</p>
                  <p className="text-[12px] text-muted">
                    Pedida {hora(v.pedida_en)}
                    {r === 'pendiente' && ` · vence ${hora(v.vence_en)}`}
                    {min !== null && ` · respondió en ${min < 1 ? 'menos de 1' : min} min`}
                    {v.distancia_m !== null && ` · a ${distanciaTexto(v.distancia_m)}`}
                    {mapsLink(v.ubicacion) && (
                      <> · <a href={mapsLink(v.ubicacion)!} target="_blank" rel="noopener noreferrer" className="text-teal underline">ver ubicación</a></>
                    )}
                  </p>
                  {r === 'sin_respuesta' && <p className="text-[12px] text-muted">Puede no haber visto el aviso (sin señal, teléfono en silencio). Conviene llamarle.</p>}
                  {r === 'sin_ubicacion' && <p className="text-[12px] text-muted">Tocó «Estoy aquí», pero no hubo ubicación con qué comprobarlo.</p>}
                </div>
                <span className={`shrink-0 text-[12px] font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1.5 ${cls}`}>
                  <Icono size={13} strokeWidth={2.6} />
                  {TEXTO_VERIFICACION[r]}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
