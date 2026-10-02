'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import SignaturePad, { SignaturePadHandle } from '@/components/SignaturePad';
import { showToast } from '@/components/Toast';
import { Traspaso, Vale, traspasosParaMi, obtenerVale, aceptarTraspaso, rechazarTraspaso, nombreCorto } from '@/lib/vales';

// «Te quieren prestar»: herramienta que un compañero quiere pasarte de su
// vale. Al aceptar con tu firma te queda un vale a tu nombre (mismo plazo).

export default function PrestamosParaMi({ onCambio }: { onCambio: () => void }) {
  const [lista, setLista] = useState<{ t: Traspaso; vale: Vale | null }[]>([]);
  const cargar = useCallback(async () => {
    const ts = await traspasosParaMi();
    setLista(await Promise.all(ts.map(async (t) => ({ t, vale: await obtenerVale(t.vale_origen_id).catch(() => null) }))));
  }, []);
  useEffect(() => {
    cargar();
    const i = setInterval(cargar, 60000);
    return () => clearInterval(i);
  }, [cargar]);

  if (lista.length === 0) return null;
  return (
    <div className="flex flex-col gap-3 mb-4">
      {lista.map(({ t, vale }) => <Tarjeta key={t.id} t={t} vale={vale} onListo={() => { cargar(); onCambio(); }} />)}
    </div>
  );
}

function Tarjeta({ t, vale, onListo }: { t: Traspaso; vale: Vale | null; onListo: () => void }) {
  const ref = useRef<SignaturePadHandle>(null);
  const [firma, setFirma] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);

  async function hacer(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    try { await fn(); showToast(ok, 'success'); onListo(); }
    catch (e: any) { showToast(e?.message || 'No se pudo', 'error'); setBusy(false); }
  }

  const nombre = (itemId: string) => vale?.items.find((i) => i.id === itemId)?.articulo;
  return (
    <div className="rounded-2xl border border-teal/50 bg-teal/5 p-3.5">
      <p className="text-[13.5px] font-semibold flex items-center gap-1.5"><Users size={15} className="text-teal" /> {nombreCorto(t.de?.full_name)} te quiere prestar</p>
      <p className="text-[12px] text-muted mb-2">Préstamo {t.folio}{vale ? ` · de su vale ${vale.folio} (${vale.cliente_nombre})` : ''}</p>
      <ul className="text-[13px] mb-2">
        {t.items.map((x) => (
          <li key={x.item}>• {Number(x.cantidad)} {nombre(x.item)?.unidad || ''} {nombre(x.item)?.descripcion || 'artículo'}</li>
        ))}
      </ul>
      {t.nota && <p className="text-[12.5px] mb-2"><span className="text-muted">Nota: </span>{t.nota}</p>}
      {!rechazando ? (
        <>
          <p className="text-[12.5px] mb-1.5">Revisa que te lo dio y firma de recibido. Quedará a tu nombre con el mismo plazo de devolución.</p>
          <div className="rounded-xl overflow-hidden border border-line">
            <SignaturePad ref={ref} titulo="Firma de recibido" onCambio={setFirma} />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button type="button" disabled={busy} onClick={() => setRechazando(true)} className="min-h-[44px] rounded-xl border border-line text-[13px] font-semibold">No lo acepto</button>
            <button type="button" disabled={busy || !firma} onClick={() => hacer(() => aceptarTraspaso(t, firma!), 'Préstamo recibido: ya está en tu resguardo')}
              className="min-h-[44px] rounded-xl bg-teal text-inkOnAccent text-[13.5px] font-semibold disabled:opacity-50">Firmar y aceptar</button>
          </div>
        </>
      ) : (
        <>
          <input className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line text-[14px]" placeholder="¿Por qué? (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button type="button" disabled={busy} onClick={() => setRechazando(false)} className="min-h-[42px] rounded-xl border border-line text-[13px] font-semibold">Volver</button>
            <button type="button" disabled={busy} onClick={() => hacer(() => rechazarTraspaso(t, motivo), 'Se le avisó que no lo aceptaste')}
              className="min-h-[42px] rounded-xl bg-red text-white text-[13px] font-semibold">No acepto</button>
          </div>
        </>
      )}
    </div>
  );
}
