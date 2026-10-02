'use client';

import { useRef, useState } from 'react';
import { Camera, Images, Trash2, Check, HeartPulse } from 'lucide-react';
import { showToast } from '@/components/Toast';
import { AvatarTecnico, UNIFORMES } from '@/components/AvatarTecnico';
import { ESPECIALIDADES, guardarMiPerfil, subirMiFoto, quitarMiFoto, urlFoto } from '@/lib/perfiles';

// «Cómo te ven los demás»: foto o avatar genérico (con color de uniforme),
// apodo, puesto, especialidades y contacto de emergencia. La foto aparece
// en Servicios, en la lista de reportes y en cada reporte que haces.

const inputCls = 'w-full min-h-[48px] px-3.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px] placeholder:text-faint';
const labelCls = 'block text-[11px] uppercase tracking-wider text-faint mb-2';

export default function PersonalizarPerfil({ profile }: { profile: any }) {
  const [foto, setFoto] = useState<string | null>(profile?.foto_path || null);
  const [color, setColor] = useState<number | null>(profile?.avatar_color ?? null);
  const [apodo, setApodo] = useState(profile?.apodo || '');
  const [puesto, setPuesto] = useState(profile?.puesto || '');
  const [esp, setEsp] = useState<string[]>(profile?.especialidades || []);
  const [emNombre, setEmNombre] = useState(profile?.emergencia_nombre || '');
  const [emTel, setEmTel] = useState(profile?.emergencia_telefono || '');
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);

  async function elegirFoto(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith('image/')) { showToast('Elige una imagen', 'error'); return; }
    setSubiendo(true);
    try {
      setFoto(await subirMiFoto(f, foto));
      showToast('Foto de perfil actualizada', 'success');
    } catch (e: any) {
      showToast(e?.message || 'No se pudo subir la foto', 'error');
    } finally {
      setSubiendo(false);
    }
  }

  async function usarGenerico() {
    setSubiendo(true);
    try {
      await quitarMiFoto(foto);
      setFoto(null);
      showToast('Ahora usas el avatar genérico', 'success');
    } catch (e: any) {
      showToast(e?.message || 'No se pudo', 'error');
    } finally {
      setSubiendo(false);
    }
  }

  async function guardar() {
    if (emTel && emTel.replace(/\D/g, '').length < 10) { showToast('Al teléfono de emergencia le faltan dígitos', 'error'); return; }
    setGuardando(true);
    try {
      await guardarMiPerfil({
        avatar_color: color, apodo: apodo.trim() || null, puesto: puesto.trim() || null, especialidades: esp,
        emergencia_nombre: emNombre.trim() || null, emergencia_telefono: emTel.trim() || null,
      });
      showToast('Perfil guardado', 'success');
    } catch (e: any) {
      showToast(e?.message?.includes('actualizar_mi_perfil') ? 'Falta correr el SQL del perfil' : e?.message || 'No se pudo guardar', 'error');
    } finally {
      setGuardando(false);
    }
  }

  const fotoUrl = urlFoto(foto);
  const nombre = profile?.full_name || '';

  return (
    <div className="rounded-2xl bg-surface border border-line p-5 mb-6">
      <p className="font-display font-semibold text-[17px] mb-1">Cómo te ven los demás</p>
      <p className="text-[13px] text-muted mb-5">Tu foto aparece en Servicios, en la lista de reportes y en cada reporte que haces.</p>

      {/* Foto o avatar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-5 mb-6">
        <div className="relative self-center sm:self-auto">
          <span className="block rounded-full ring-4 ring-teal/20">
            {fotoUrl ? (
              <img src={fotoUrl} alt="Tu foto" className="w-28 h-28 rounded-full object-cover block" />
            ) : (
              <AvatarTecnico nombre={nombre} size={112} indice={color ?? undefined} />
            )}
          </span>
          {subiendo && <span className="absolute inset-0 rounded-full bg-bg/70 flex items-center justify-center text-[12px] font-semibold">Subiendo…</span>}
        </div>
        <div className="flex-1 min-w-0">
          <input ref={camara} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => { elegirFoto(e.target.files?.[0]); e.target.value = ''; }} />
          <input ref={galeria} type="file" accept="image/*" className="hidden" onChange={(e) => { elegirFoto(e.target.files?.[0]); e.target.value = ''; }} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={subiendo} onClick={() => camara.current?.click()}
              className="min-h-[44px] rounded-xl bg-teal text-inkOnAccent text-[13.5px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
              <Camera size={16} /> Tomar foto
            </button>
            <button type="button" disabled={subiendo} onClick={() => galeria.current?.click()}
              className="min-h-[44px] rounded-xl bg-surface-2 border border-line text-[13.5px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
              <Images size={16} /> Elegir de galería
            </button>
          </div>
          {foto && (
            <button type="button" disabled={subiendo} onClick={usarGenerico}
              className="mt-2 text-[13px] font-semibold text-red flex items-center gap-1.5 min-h-[36px]">
              <Trash2 size={14} /> Quitar foto y usar el avatar genérico
            </button>
          )}
          {!foto && (
            <div className="mt-3">
              <p className={labelCls}>Color de tu uniforme</p>
              <div className="flex flex-wrap gap-2">
                {UNIFORMES.map((c, i) => (
                  <button key={c} type="button" onClick={() => setColor(i)} aria-label={`Color ${i + 1}`}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform ${color === i ? 'ring-2 ring-offset-2 ring-offset-surface ring-teal scale-110' : 'hover:scale-105'}`}
                    style={{ background: c }}>
                    {color === i && <Check size={15} className="text-white" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <div>
          <label className={labelCls}>Apodo (cómo te dicen)</label>
          <input className={inputCls} maxLength={24} value={apodo} onChange={(e) => setApodo(e.target.value)} placeholder="Ej. El Inge, Chris" />
        </div>
        <div>
          <label className={labelCls}>Puesto</label>
          <input className={inputCls} maxLength={60} value={puesto} onChange={(e) => setPuesto(e.target.value)} placeholder="Ej. Técnico instalador" />
        </div>
      </div>

      <div className="mb-5">
        <label className={labelCls}>Especialidades</label>
        <div className="flex flex-wrap gap-1.5">
          {ESPECIALIDADES.map((e) => {
            const sel = esp.includes(e);
            return (
              <button key={e} type="button" onClick={() => setEsp((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]))}
                className={`px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors ${sel ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line text-ink/80'}`}>
                {sel && '✓ '}{e}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-line p-4 mb-5">
        <p className="text-[13.5px] font-semibold flex items-center gap-1.5 mb-1"><HeartPulse size={15} className="text-red" /> Contacto de emergencia</p>
        <p className="text-[12.5px] text-muted mb-3">Solo lo ven los supervisores, por si te pasa algo en campo.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input className={inputCls} maxLength={80} value={emNombre} onChange={(e) => setEmNombre(e.target.value)} placeholder="Nombre y parentesco" />
          <input className={inputCls} type="tel" inputMode="tel" maxLength={20} value={emTel} onChange={(e) => setEmTel(e.target.value)} placeholder="Teléfono" />
        </div>
      </div>

      <button type="button" onClick={guardar} disabled={guardando}
        className="w-full min-h-[50px] rounded-2xl bg-teal text-inkOnAccent font-semibold text-[15px] disabled:opacity-50">
        {guardando ? 'Guardando…' : 'Guardar perfil'}
      </button>
    </div>
  );
}
