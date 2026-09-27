'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, UserPlus } from 'lucide-react';
import {
  ClienteCatalogo, ContactoCatalogo, catalogoEnCache, listarCatalogoClientes, clienteExacto, coincidencias, parecidos, agregarAliasCliente,
} from '@/lib/clientesCatalogo';

// Campo «Empresa / Cliente» ligado a la sección Clientes.
//   · Mientras se escribe, sugiere clientes (por cualquier palabra, sin
//     acentos ni mayúsculas, también por sus nombres alternos).
//   · Si lo escrito es exactamente un cliente o uno de sus alias, se vincula
//     solo (palomita).
//   · Si no, pero se parece a alguno, pregunta «¿Es alguno de estos?» antes
//     de que se cree un duplicado. Al elegirlo, lo escrito se guarda como
//     alias para la próxima vez.
//   · Si es nuevo, se sigue aceptando: al guardar el reporte la base lo da de
//     alta en Clientes como «Por revisar».
export default function AutocompletarCliente({
  value,
  onChange,
  className = '',
  placeholder,
  soloSugerir = false,
}: {
  value: string;
  // contactos: los ya registrados del cliente elegido (para sugerirlos).
  onChange: (nombre: string, clienteId: string | null, contactos: ContactoCatalogo[]) => void;
  className?: string;
  placeholder?: string;
  // Solo sugiere clientes: sin «¿Es alguno de estos?» ni aviso de cliente
  // nuevo (p. ej. al agendar, donde el nombre lleva la etapa del proyecto).
  soloSugerir?: boolean;
}) {
  const [catalogo, setCatalogo] = useState<ClienteCatalogo[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [descartado, setDescartado] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  // Copia local primero (sin conexión) y luego la fresca.
  useEffect(() => {
    setCatalogo(catalogoEnCache());
    listarCatalogoClientes().then(setCatalogo).catch(() => {});
  }, []);

  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent | TouchEvent) {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', fuera);
    document.addEventListener('touchstart', fuera);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('touchstart', fuera);
    };
  }, [abierto]);

  const exacto = useMemo(() => clienteExacto(value, catalogo), [value, catalogo]);
  const sugerencias = useMemo(
    () => (exacto ? [] : coincidencias(value, catalogo)),
    [value, catalogo, exacto]
  );
  const similares = useMemo(
    () => (exacto || value.trim().length < 4 ? [] : parecidos(value, catalogo)),
    [value, catalogo, exacto]
  );

  // Si al cambiar el catálogo (llega fresco) lo escrito ya es un cliente,
  // se vincula aunque no se haya tecleado nada nuevo.
  useEffect(() => {
    if (exacto) onChange(value, exacto.id, exacto.contactos || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exacto?.id]);

  function escribir(texto: string) {
    setDescartado(false);
    setAbierto(true);
    const c = clienteExacto(texto, catalogo);
    onChange(texto, c?.id || null, c?.contactos || []);
  }

  function elegir(c: ClienteCatalogo) {
    setAbierto(false);
    onChange(c.nombre, c.id, c.contactos || []);
  }

  function elegirParecido(c: ClienteCatalogo) {
    // Lo que se escribió pasa a ser otra forma de llamar a este cliente.
    agregarAliasCliente(c.id, value);
    setCatalogo((prev) => prev.map((x) => (x.id === c.id ? { ...x, alias: [...x.alias, value.trim()] } : x)));
    elegir(c);
  }

  return (
    <div ref={contenedor} className="relative">
      <input
        type="text"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => escribir(e.target.value)}
        onFocus={() => setAbierto(true)}
        className={className}
      />
      {exacto && (
        <Check size={17} strokeWidth={2.8} className="absolute right-3 top-[24px] -translate-y-1/2 text-teal pointer-events-none" />
      )}

      {abierto && sugerencias.length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1 rounded-xl bg-surface border border-line shadow-glow overflow-hidden max-h-64 overflow-y-auto">
          <p className="px-3 pt-2.5 pb-1 text-[10.5px] uppercase tracking-wider text-faint">Clientes registrados</p>
          {sugerencias.map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); elegir(c); }}
              className="w-full text-left px-3 min-h-[46px] py-2 flex flex-col justify-center text-[15px] hover:bg-surface-2"
            >
              {c.nombre}
              {c.alias.length > 0 && <span className="text-[11.5px] text-muted">También: {c.alias.slice(0, 2).join(', ')}</span>}
            </button>
          ))}
        </div>
      )}

      {exacto && !soloSugerir && <p className="text-[11.5px] text-teal mt-1.5">Cliente registrado</p>}

      {!soloSugerir && !exacto && similares.length > 0 && !descartado && !abierto && (
        <div className="mt-2 p-3 rounded-xl bg-amber/10 border border-amber/30">
          <p className="text-[13px] font-semibold text-amber mb-2">¿Es alguno de estos clientes?</p>
          <div className="flex flex-col gap-1.5">
            {similares.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => elegirParecido(c)}
                className="text-left px-3 min-h-[40px] rounded-lg bg-surface border border-line text-[14px] font-medium active:scale-[0.98] transition-transform"
              >
                Sí, {c.nombre}
              </button>
            ))}
            <button type="button" onClick={() => setDescartado(true)} className="text-left px-3 min-h-[36px] text-[13px] text-muted">
              No, es otro cliente
            </button>
          </div>
        </div>
      )}

      {!soloSugerir && !exacto && value.trim().length >= 3 && (descartado || similares.length === 0) && !abierto && (
        <p className="text-[11.5px] text-muted mt-1.5 flex items-center gap-1">
          <UserPlus size={13} strokeWidth={2.3} /> Cliente nuevo: se agregará a Clientes al guardar
        </p>
      )}
    </div>
  );
}
