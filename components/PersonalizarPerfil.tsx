'use client';

import { ReactNode, useRef, useState } from 'react';
import { Camera, Images, Trash2, Check, HeartPulse, Shirt, Sparkles, BriefcaseBusiness, Eye } from 'lucide-react';
import { showToast } from '@/components/Toast';
import { AvatarTecnico, UNIFORMES, ESTILOS_AVATAR } from '@/components/AvatarTecnico';
import { ESPECIALIDADES, TIPOS_SANGRE, TALLAS_CAMISA, guardarMiPerfil, subirMiFoto, quitarMiFoto, urlFoto } from '@/lib/perfiles';

// Mi perfil. En computadora van dos columnas: a la izquierda, fija, la
// tarjeta de «así te ven los demás» (se actualiza mientras se edita); a la
// derecha, las secciones. En celular todo va en una columna, con la tarjeta
// arriba. `children` son las secciones que no dependen de este formulario
// (contacto, contraseña, usuarios…): van al final de la columna derecha.

const inputCls = 'w-full min-h-[48px] px-3.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px] placeholder:text-faint';
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-faint mb-2';
const chipCls = (sel: boolean) =>
  `px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors ${sel ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line text-ink/80 hover:border-line-strong'}`;

function Seccion({ Icono, titulo, nota, children }: { Icono: any; titulo: string; nota?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface border border-line p-5">
      <div className="flex items-start gap-3 mb-4">
        <span className="w-9 h-9 rounded-xl bg-teal/12 text-teal flex items-center justify-center shrink-0"><Icono size={18} strokeWidth={2.2} /></span>
        <div className="min-w-0">
          <h2 className="font-display font-bold text-[18px] tracking-wide leading-tight">{titulo}</h2>
          {nota && <p className="text-[13px] text-muted mt-0.5">{nota}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export default function PersonalizarPerfil({ profile, children }: { profile: any; children?: ReactNode }) {
  const [foto, setFoto] = useState<string | null>(profile?.foto_path || null);
  const [color, setColor] = useState<number | null>(profile?.avatar_color ?? null);
  const [estilo, setEstilo] = useState<number>(profile?.avatar_estilo ?? 0);
  const [apodo, setApodo] = useState(profile?.apodo || '');
  const [puesto, setPuesto] = useState(profile?.puesto || '');
  const [esp, setEsp] = useState<string[]>(profile?.especialidades || []);
  const [emNombre, setEmNombre] = useState(profile?.emergencia_nombre || '');
  const [emTel, setEmTel] = useState(profile?.emergencia_telefono || '');
  const [sangre, setSangre] = useState<string>(profile?.tipo_sangre || '');
  const [alergias, setAlergias] = useState(profile?.alergias || '');
  const [camisa, setCamisa] = useState<string>(profile?.talla_camisa || '');
  const [calzado, setCalzado] = useState(profile?.talla_calzado || '');
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
      showToast('Ahora usas el avatar', 'success');
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
        avatar_color: color, avatar_estilo: estilo,
        apodo: apodo.trim() || null, puesto: puesto.trim() || null, especialidades: esp,
        emergencia_nombre: emNombre.trim() || null, emergencia_telefono: emTel.trim() || null,
        tipo_sangre: sangre || null, alergias: alergias.trim() || null,
        talla_camisa: camisa || null, talla_calzado: calzado.trim() || null,
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
  const esSupervision = profile?.role === 'supervisor';

  const botonGuardar = (
    <button type="button" onClick={guardar} disabled={guardando}
      className="w-full min-h-[50px] rounded-2xl bg-teal text-inkOnAccent font-semibold text-[15px] shadow-glow-teal disabled:opacity-50 active:scale-[0.98] transition-transform">
      {guardando ? 'Guardando…' : 'Guardar perfil'}
    </button>
  );

  return (
    <div className="lg:grid lg:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)] lg:gap-6 2xl:gap-8 lg:items-start">
      {/* ---------- Así te ven los demás ---------- */}
      <aside className="mb-5 lg:mb-0 lg:sticky lg:top-24">
        <div className="relative rounded-3xl bg-surface border border-line overflow-hidden">
          <div className="h-24 bg-gradient-to-br from-teal/35 via-teal/15 to-transparent" />
          <div className="px-5 pb-5 -mt-14 flex flex-col items-center text-center">
            <div className="relative">
              <span className="block rounded-full ring-4 ring-surface shadow-diffuse">
                {fotoUrl ? (
                  <img src={fotoUrl} alt="Tu foto" className="w-28 h-28 rounded-full object-cover block" />
                ) : (
                  <AvatarTecnico nombre={nombre} size={112} indice={color ?? undefined} estilo={estilo} />
                )}
              </span>
              {subiendo && <span className="absolute inset-0 rounded-full bg-bg/70 flex items-center justify-center text-[12px] font-semibold">Subiendo…</span>}
            </div>
            <p className="font-display font-bold text-[22px] tracking-wide leading-tight mt-3">{nombre || 'Tu nombre'}</p>
            {apodo.trim() && <p className="text-[13.5px] text-teal font-semibold">«{apodo.trim()}»</p>}
            <p className="text-[13.5px] text-muted mt-0.5">{puesto.trim() || (esSupervision ? 'Supervisión' : 'Personal técnico')}</p>
            {esp.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5 mt-3">
                {esp.map((e) => (
                  <span key={e} className="px-2.5 py-1 rounded-full bg-teal/12 text-teal text-[11.5px] font-semibold">{e}</span>
                ))}
              </div>
            )}
            <p className="mt-4 pt-3 border-t border-line w-full text-[12px] text-faint flex items-center justify-center gap-1.5">
              <Eye size={13} /> Así te ven en Servicios y en tus reportes
            </p>
          </div>
        </div>
        <div className="hidden lg:block mt-4">{botonGuardar}</div>
      </aside>

      {/* ---------- Secciones ---------- */}
      <div className="flex flex-col gap-4 min-w-0">
        <Seccion Icono={Sparkles} titulo="Foto o avatar" nota="Sube una foto, o elige la figura y el color de uniforme que más se te parezcan.">
          <input ref={camara} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => { elegirFoto(e.target.files?.[0]); e.target.value = ''; }} />
          <input ref={galeria} type="file" accept="image/*" className="hidden" onChange={(e) => { elegirFoto(e.target.files?.[0]); e.target.value = ''; }} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={subiendo} onClick={() => camara.current?.click()}
              className="min-h-[46px] rounded-xl border border-dashed border-teal/50 text-teal text-[13.5px] font-semibold flex items-center justify-center gap-2 hover:bg-teal/8 active:scale-95 transition disabled:opacity-50">
              <Camera size={16} /> Tomar foto
            </button>
            <button type="button" disabled={subiendo} onClick={() => galeria.current?.click()}
              className="min-h-[46px] rounded-xl border border-dashed border-teal/50 text-teal text-[13.5px] font-semibold flex items-center justify-center gap-2 hover:bg-teal/8 active:scale-95 transition disabled:opacity-50">
              <Images size={16} /> Elegir de galería
            </button>
          </div>
          {foto ? (
            <button type="button" disabled={subiendo} onClick={usarGenerico}
              className="mt-3 text-[13px] font-semibold text-red flex items-center gap-1.5 min-h-[36px]">
              <Trash2 size={14} /> Quitar la foto y usar un avatar
            </button>
          ) : (
            <div className="mt-5 grid grid-cols-1 xl:grid-cols-2 gap-5">
              <div>
                <p className={labelCls}>Figura</p>
                <div className="grid grid-cols-4 gap-2">
                  {ESTILOS_AVATAR.map((n, i) => (
                    <button key={n} type="button" onClick={() => setEstilo(i)} aria-pressed={estilo === i}
                      className={`rounded-2xl border p-2 flex flex-col items-center gap-1.5 transition-colors ${estilo === i ? 'border-teal bg-teal/10' : 'border-line bg-surface-2/50 hover:border-line-strong'}`}>
                      <AvatarTecnico nombre={nombre} size={52} indice={color ?? undefined} estilo={i} />
                      <span className={`text-[11px] leading-tight text-center ${estilo === i ? 'text-teal font-semibold' : 'text-muted'}`}>{n}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className={labelCls}>Color de tu uniforme</p>
                <div className="flex flex-wrap gap-2.5">
                  {UNIFORMES.map((c, i) => (
                    <button key={c} type="button" onClick={() => setColor(i)} aria-label={`Color ${i + 1}`} aria-pressed={color === i}
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-transform ${color === i ? 'ring-2 ring-offset-2 ring-offset-surface ring-teal scale-110' : 'hover:scale-105'}`}
                      style={{ background: c }}>
                      {color === i && <Check size={15} className="text-white" strokeWidth={3} />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Seccion>

        <Seccion Icono={BriefcaseBusiness} titulo="Tu trabajo" nota="Ayuda a quien programa los servicios a saber a quién mandar.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <div>
              <label className={labelCls}>Apodo (cómo te dicen)</label>
              <input className={inputCls} maxLength={24} value={apodo} onChange={(e) => setApodo(e.target.value)} placeholder="Ej. Beto, Lupita" />
            </div>
            <div>
              <label className={labelCls}>Puesto</label>
              <input className={inputCls} maxLength={60} value={puesto} onChange={(e) => setPuesto(e.target.value)} placeholder="Ej. Instalación de CCTV, Coordinación de servicio" />
            </div>
          </div>
          <label className={labelCls}>Especialidades</label>
          <div className="flex flex-wrap gap-1.5">
            {ESPECIALIDADES.map((e) => {
              const sel = esp.includes(e);
              return (
                <button key={e} type="button" aria-pressed={sel} onClick={() => setEsp((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]))} className={chipCls(sel)}>
                  {sel && '✓ '}{e}
                </button>
              );
            })}
          </div>
        </Seccion>

        <Seccion Icono={HeartPulse} titulo="En caso de emergencia" nota="Opcional. Solo lo ven tú y los supervisores, por si te pasa algo en campo.">
          <label className={labelCls}>A quién avisar</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
            <input className={inputCls} maxLength={80} value={emNombre} onChange={(e) => setEmNombre(e.target.value)} placeholder="Nombre y parentesco" />
            <input className={inputCls} type="tel" inputMode="tel" maxLength={20} value={emTel} onChange={(e) => setEmTel(e.target.value)} placeholder="Teléfono" />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div>
              <label className={labelCls}>Tipo de sangre</label>
              <div className="flex flex-wrap gap-1.5">
                {TIPOS_SANGRE.map((t) => (
                  <button key={t} type="button" aria-pressed={sangre === t} onClick={() => setSangre(sangre === t ? '' : t)} className={`${chipCls(sangre === t)} min-w-[52px] tabular-nums`}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Alergias o condición médica</label>
              <input className={inputCls} maxLength={200} value={alergias} onChange={(e) => setAlergias(e.target.value)} placeholder="Ej. Alergia a la penicilina, diabetes" />
            </div>
          </div>
        </Seccion>

        <Seccion Icono={Shirt} titulo="Uniforme y equipo de protección" nota="Para pedir tu uniforme, chaleco y calzado de seguridad en tu talla.">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div>
              <label className={labelCls}>Talla de camisa</label>
              <div className="flex flex-wrap gap-1.5">
                {TALLAS_CAMISA.map((t) => (
                  <button key={t} type="button" aria-pressed={camisa === t} onClick={() => setCamisa(camisa === t ? '' : t)} className={`${chipCls(camisa === t)} min-w-[52px]`}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Talla de calzado (MX)</label>
              <input className={`${inputCls} max-w-[160px]`} inputMode="decimal" maxLength={10} value={calzado} onChange={(e) => setCalzado(e.target.value)} placeholder="Ej. 26.5" />
            </div>
          </div>
        </Seccion>

        <div className="lg:hidden">{botonGuardar}</div>

        {children}
      </div>
    </div>
  );
}
