'use client';

import { useState, useEffect } from 'react';
import { useProfileMutation } from '@/lib/useProfileMutation';
import { showToast } from '@/components/Toast';
import { Mail, Phone, Check, AlertCircle } from 'lucide-react';

interface ProfileFormProps {
  user: any;
  profile: any;
}

export default function ProfileForm({ user, profile }: ProfileFormProps) {
  const [email, setEmail] = useState(user?.email || '');
  const [telefono, setTelefono] = useState(profile?.telefono || '');

  const [emailError, setEmailError] = useState('');
  const [telefonoError, setTelefonoError] = useState('');

  const [savedEmail, setSavedEmail] = useState(user?.email || '');
  const [savedTelefono, setSavedTelefono] = useState(profile?.telefono || '');

  const { updateProfile, loading } = useProfileMutation();
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setEmailError(email && !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) ? 'Correo no válido' : '');
  }, [email]);

  useEffect(() => {
    setTelefonoError(telefono && telefono.replace(/\D/g, '').length < 10 ? 'Faltan dígitos' : '');
  }, [telefono]);

  const hayCambios =
    (email !== savedEmail && !emailError) || (telefono !== savedTelefono && !telefonoError);

  const handleSave = async () => {
    if (guardando || loading || !hayCambios) return;
    setGuardando(true);

    const cambios: any = {};
    if (email !== savedEmail && !emailError) cambios.email = email;
    if (telefono !== savedTelefono && !telefonoError) cambios.telefono = telefono;

    const result = await updateProfile(cambios);

    if (result.success) {
      setSavedEmail(email);
      setSavedTelefono(telefono);
      showToast(
        cambios.email
          ? 'Guardado. Revisa tu correo nuevo para confirmar el cambio.'
          : 'Datos actualizados',
        'success'
      );
    } else {
      showToast(result.error || 'No se pudo guardar', 'error');
      setEmail(savedEmail);
      setTelefono(savedTelefono);
    }

    setGuardando(false);
  };

  return (
    <div className="rounded-2xl bg-surface border border-line p-5 mb-6">
      <div className="mb-5 pb-5 border-b border-line">
        <p className="text-[11px] uppercase tracking-wider text-faint mb-1.5">Nombre</p>
        <p className="font-display font-semibold text-[17px] tracking-wide">{profile?.full_name}</p>
        <p className="text-[13px] text-muted mt-1.5">
          El nombre aparece en los reportes firmados. Para cambiarlo hay que pedirlo a quien
          administra los usuarios.
        </p>
      </div>

      <div className="space-y-5">
        <div>
          <label htmlFor="email" className="block text-[11px] uppercase tracking-wider text-faint mb-2">
            Correo
          </label>
          <div className="relative">
            <Mail size={17} strokeWidth={2.2} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              id="email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@clave-i.mx"
              disabled={guardando}
              className={`w-full min-h-[52px] pl-11 pr-4 rounded-xl bg-surface-2 border text-[16px] text-ink placeholder:text-faint outline-none transition-colors ${
                emailError ? 'border-red' : 'border-line focus:border-teal'
              }`}
            />
          </div>
          {emailError && (
            <p className="text-[13px] text-red mt-2 flex items-center gap-1.5">
              <AlertCircle size={14} strokeWidth={2.4} />
              {emailError}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="telefono" className="block text-[11px] uppercase tracking-wider text-faint mb-2">
            Teléfono
          </label>
          <div className="relative">
            <Phone size={17} strokeWidth={2.2} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              id="telefono"
              type="tel"
              inputMode="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="33 1234 5678"
              disabled={guardando}
              className={`w-full min-h-[52px] pl-11 pr-4 rounded-xl bg-surface-2 border text-[16px] text-ink placeholder:text-faint outline-none transition-colors ${
                telefonoError ? 'border-red' : 'border-line focus:border-teal'
              }`}
            />
          </div>
          {telefonoError ? (
            <p className="text-[13px] text-red mt-2 flex items-center gap-1.5">
              <AlertCircle size={14} strokeWidth={2.4} />
              {telefonoError}
            </p>
          ) : (
            <p className="text-[13px] text-muted mt-2">
              Sirve para localizarte cuando un servicio cambia de hora.
            </p>
          )}
        </div>

        <button
          onClick={handleSave}
          disabled={!hayCambios || guardando}
          className={`w-full min-h-[56px] rounded-2xl font-display font-semibold text-[16px] tracking-wide flex items-center justify-center gap-2 transition-transform ${
            hayCambios && !guardando
              ? 'bg-teal text-inkOnAccent shadow-glow-teal active:scale-[0.98]'
              : 'bg-surface-2 text-faint'
          }`}
        >
          {guardando ? (
            'Guardando...'
          ) : (
            <>
              <Check size={19} strokeWidth={2.6} />
              Guardar cambios
            </>
          )}
        </button>
      </div>
    </div>
  );
}
