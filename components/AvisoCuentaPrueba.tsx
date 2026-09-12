'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabaseClient';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import { UserCog, TriangleAlert } from 'lucide-react';

// Aviso para cuentas de prueba.
//
// Los técnicos entraron con correos genéricos. Mientras sigan así, sus
// reportes quedan firmados por una cuenta que no identifica a nadie, y no hay
// teléfono al cual llamarles. Esto se los recuerda al entrar y les deja
// registrar sus datos sin salir de la app.
export default function AvisoCuentaPrueba() {
  const [esPrueba, setEsPrueba] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');
  const [correoActual, setCorreoActual] = useState('');
  const [contrasena, setContrasena] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setCorreoActual(user.email || '');

        const { data } = await supabase
          .from('profiles')
          .select('full_name, telefono, es_cuenta_prueba')
          .eq('id', user.id)
          .single();

        if (data?.es_cuenta_prueba) {
          setEsPrueba(true);
          setNombre(data.full_name || '');
          setTelefono(data.telefono || '');
        }
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  if (cargando || !esPrueba) return null;

  async function guardar() {
    if (!nombre.trim() || nombre.trim().split(/\s+/).length < 2) {
      alert('Escribe tu nombre y apellido.');
      return;
    }
    const soloDigitos = telefono.replace(/\D/g, '');
    if (soloDigitos.length < 10) {
      alert('El teléfono debe tener 10 dígitos.');
      return;
    }

    setGuardando(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No hay sesión activa');

      // Nombre y teléfono se aplican de inmediato; con eso la cuenta deja de
      // ser de prueba.
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: nombre.trim(),
          telefono: soloDigitos,
          es_cuenta_prueba: false,
        })
        .eq('id', user.id);
      if (error) throw error;

      // El correo y la contraseña son opcionales y van por separado: cambiar
      // el correo exige confirmarlo desde la bandeja del nuevo, así que la
      // cuenta sigue funcionando con el actual hasta entonces.
      let avisoExtra = '';
      if (correo.trim() && correo.trim() !== correoActual) {
        const { error: eMail } = await supabase.auth.updateUser({ email: correo.trim() });
        if (eMail) avisoExtra = ' El correo no se pudo cambiar: ' + eMail.message;
        else avisoExtra = ' Revisa tu correo nuevo para confirmarlo.';
      }
      if (contrasena) {
        if (contrasena.length < 6) {
          avisoExtra += ' La contraseña necesita al menos 6 caracteres, no se cambió.';
        } else {
          const { error: ePass } = await supabase.auth.updateUser({ password: contrasena });
          if (ePass) avisoExtra += ' La contraseña no se pudo cambiar: ' + ePass.message;
        }
      }

      setEsPrueba(false);
      setAbierto(false);
      showToast('Datos registrados.' + avisoExtra, 'success');
    } catch (e: any) {
      alert('No se pudo guardar: ' + (e?.message || 'error'));
    } finally {
      setGuardando(false);
    }
  }

  const inputCls =
    'w-full px-3.5 min-h-[48px] rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[15px]';
  const labelCls = 'text-[13px] text-ink/75 block mb-1.5';

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="w-full mb-4 p-4 rounded-2xl bg-amber/12 border-2 border-amber/40 text-left flex items-start gap-3 active:scale-[0.99] transition-transform"
      >
        <TriangleAlert size={18} strokeWidth={2.4} className="text-amber shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-amber mb-0.5">Estás usando una cuenta de prueba</p>
          <p className="text-[12.5px] text-ink/80 leading-relaxed">
            Tus reportes se guardan a nombre de esta cuenta. Toca aquí para registrar tus datos reales.
          </p>
        </div>
      </button>

      {abierto && (
        <ModalOverlay onClose={() => setAbierto(false)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[92vh] overflow-y-auto">
            <p className="font-display font-semibold text-[17px] mb-1 flex items-center gap-2">
              <UserCog size={19} strokeWidth={2.3} className="text-teal" />
              Tus datos
            </p>
            <p className="text-[13px] text-muted mb-4 leading-relaxed">
              Con esto tus reportes quedan a tu nombre y el supervisor puede contactarte.
            </p>

            <label className={labelCls}>Nombre completo</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre y apellidos"
              className={`${inputCls} mb-4`}
            />

            <label className={labelCls}>Teléfono</label>
            <input
              type="tel"
              inputMode="numeric"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="10 dígitos"
              className={`${inputCls} mb-4`}
            />

            <div className="p-3.5 rounded-xl bg-surface-2 border border-line mb-4">
              <p className="text-[13px] font-semibold mb-1">Opcional</p>
              <p className="text-[12.5px] text-muted mb-3 leading-relaxed">
                Puedes seguir entrando con {correoActual || 'el correo actual'} si prefieres.
              </p>

              <label className={labelCls}>Cambiar correo</label>
              <input
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder={correoActual}
                className={`${inputCls} mb-1`}
              />
              <p className="text-[12px] text-muted mb-3 leading-relaxed">
                Tendrás que confirmarlo desde el correo nuevo. Mientras tanto sigues entrando con el actual.
              </p>

              <label className={labelCls}>Cambiar contraseña</label>
              <input
                type="password"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className={inputCls}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setAbierto(false)}
                className="flex-1 min-h-[48px] rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium"
              >
                Ahora no
              </button>
              <button
                onClick={guardar}
                disabled={guardando}
                className="flex-1 min-h-[48px] rounded-xl bg-teal text-inkOnAccent text-[14.5px] font-semibold disabled:opacity-60"
              >
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </>
  );
}
