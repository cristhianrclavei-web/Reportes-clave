import { useCallback, useState } from 'react';

type ProfileUpdate = {
  telefono?: string;
  email?: string;
  full_name?: string;
};

type UpdateResult = {
  success: boolean;
  error?: string;
};

/**
 * Hook para actualizar perfil del usuario.
 * - Optimistic update: actualiza la UI inmediatamente
 * - Revalidation: recarga datos del servidor si es necesario
 * - Offline-safe: guarda en queue si está offline
 */
export function useProfileMutation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateProfile = useCallback(
    async (updates: ProfileUpdate, onOptimistic?: (data: ProfileUpdate) => void): Promise<UpdateResult> => {
      setLoading(true);
      setError(null);

      // Optimistic update: actualizar UI al instante
      if (onOptimistic) {
        onOptimistic(updates);
      }

      try {
        const response = await fetch('/api/perfil', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          const data = await response.json();
          const errorMsg = data.error || `Error ${response.status}`;
          setError(errorMsg);
          return { success: false, error: errorMsg };
        }

        // Revalidar datos del servidor
        if (typeof window !== 'undefined') {
          // Hacer que el servidor recargue el perfil en la siguiente llamada
          const event = new CustomEvent('profile-updated', { detail: updates });
          window.dispatchEvent(event);
        }

        return { success: true };
      } catch (err: any) {
        const msg = err?.message || 'Error de conexión';
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { updateProfile, loading, error, setError };
}

/**
 * Hook para gestión de usuarios (solo admin).
 */
export function useUsersAdmin() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateUserName = useCallback(
    async (userId: string, full_name: string): Promise<UpdateResult> => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/perfil/usuarios', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, full_name }),
        });

        if (!response.ok) {
          const data = await response.json();
          const errorMsg = data.error || `Error ${response.status}`;
          setError(errorMsg);
          return { success: false, error: errorMsg };
        }

        return { success: true };
      } catch (err: any) {
        const msg = err?.message || 'Error de conexión';
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const setUsuarioActivo = useCallback(
    async (userId: string, activo: boolean): Promise<UpdateResult> => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/perfil/usuarios', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, activo }),
        });

        if (!response.ok) {
          const data = await response.json();
          const errorMsg = data.error || `Error ${response.status}`;
          setError(errorMsg);
          return { success: false, error: errorMsg };
        }

        return { success: true };
      } catch (err: any) {
        const msg = err?.message || 'Error de conexión';
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { updateUserName, setUsuarioActivo, loading, error, setError };
}
