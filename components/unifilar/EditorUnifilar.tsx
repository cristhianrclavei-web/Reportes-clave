'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, Cable, Check, History, ChevronLeft, CloudOff, FileDown, Loader2, Maximize, Minus, Plus, Settings2, Trash2, Undo2,
} from 'lucide-react';
import { showToast } from '@/components/Toast';
import { BarraCopia, useCopiaTecnico } from '@/components/propuestas/CopiaTecnico';
import HistorialVersiones from '@/components/propuestas/HistorialVersiones';
import { confirmar } from '@/lib/dialogos';
import { descargarArchivo, nombreSeguro } from '@/lib/abrirArchivo';
import {
  definicion, leerDatos, nuevoEquipo, nuevoTramo, puertosDe, revisar, tamanoDe,
  type Aviso, type DatosUnifilar, type EquipoUnifilar, type Punta, type TipoEquipo, type TramoUnifilar, type Unifilar,
} from '@/lib/unifilar';
import {
  cajaEtiquetaEquipo, cajaEtiquetaTramo, dibujarDiagrama, limitesDe, rutaDeTramo, segmentoDelCodo, type Figura, type Tinta,
} from '@/lib/unifilarDibujo';
import {
  borrarCopiaLocal, borrarUnifilar, copiaLocal, guardarCopiaLocal, guardarUnifilar, leerUnifilar,
} from '@/lib/unifilaresDatos';
import { PanelCatalogo, PanelEquipo, PanelProyecto, PanelRevision, PanelTramo } from './PanelesUnifilar';

// Editor del diagrama unifilar: una hoja blanca donde se acomodan los
// equipos (arrastrar), se unen con «Conectar» y se toca cada tramo para
// ponerle calibres y metros. Se guarda solo unos segundos después de cada
// cambio y deja una copia en el navegador por si se va la señal.

const COLOR: Record<Tinta | 'blanco', string> = { negro: '#111827', verde: '#16a34a', gris: '#6b7280', rojo: '#dc2626', blanco: '#ffffff' };
const REJILLA = 5;
const ajustar = (v: number) => Math.round(v / REJILLA) * REJILLA;

type Seleccion = { tipo: 'equipo' | 'tramo'; id: string } | null;
type Panel = 'seleccion' | 'proyecto' | 'catalogo' | 'revision' | null;
type Vista = { x: number; y: number; w: number; h: number };
type Arrastre =
  | { tipo: 'equipo'; id: string; inicio: { x: number; y: number }; original: { x: number; y: number }; movio: boolean }
  | { tipo: 'etiquetaEquipo' | 'etiquetaTramo'; id: string; inicio: { x: number; y: number }; original: { dx: number; dy: number }; movio: boolean }
  | { tipo: 'codo'; id: string; vertical: boolean; movio: boolean }
  | { tipo: 'fondo'; inicio: { x: number; y: number }; vista: Vista; movio: boolean };

type EstadoGuardado = 'guardado' | 'pendiente' | 'guardando' | 'error';

export default function EditorUnifilar({ unifilarId, esSupervisor = true }: { unifilarId: string; esSupervisor?: boolean }) {
  // Técnicos: proponen cambios sobre una copia; supervisión los fusiona.
  const copiaTecnico = useCopiaTecnico('unifilar', unifilarId, !esSupervisor);
  const [verVersiones, setVerVersiones] = useState(false);
  const [unifilar, setUnifilar] = useState<Unifilar | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [datos, setDatos] = useState<DatosUnifilar | null>(null);
  const [historial, setHistorial] = useState<DatosUnifilar[]>([]);
  const [seleccion, setSeleccion] = useState<Seleccion>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [conectando, setConectando] = useState(false);
  const [desde, setDesde] = useState<Punta | null>(null);
  const [vista, setVista] = useState<Vista>({ x: -50, y: -50, w: 1200, h: 700 });
  const [estado, setEstado] = useState<EstadoGuardado>('guardado');
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const arrastre = useRef<Arrastre | null>(null);
  const dedos = useRef(new Map<number, { x: number; y: number }>());
  const pellizco = useRef<{ distancia: number; vista: Vista } | null>(null);
  const cargado = useRef(false);

  // ---------- Cargar ----------

  const cargar = useCallback(async () => {
    setErrorCarga(null);
    try {
      const u = await leerUnifilar(unifilarId);
      let d = u.datos;
      let n = u.nombre;
      if (!esSupervisor) {
        d = leerDatos(await copiaTecnico.cargar(u.datos as unknown as Record<string, unknown>));
        setUnifilar(u);
        setNombre(n);
        setDatos(d);
        cargado.current = true;
        return;
      }
      // Lo que quedó en el navegador sin subir (se fue la señal o se cerró la pestaña).
      const copia = copiaLocal(unifilarId);
      if (copia && copia.en > u.actualizado_en && JSON.stringify(copia.datos) !== JSON.stringify(u.datos)) {
        const usar = await confirmar('Hay cambios de este unifilar que no se subieron. ¿Recuperarlos?', { textoAceptar: 'Recuperar', textoCancelar: 'Descartar' });
        if (usar) { d = copia.datos; n = copia.nombre || n; } else borrarCopiaLocal(unifilarId);
      }
      setUnifilar(u);
      setNombre(n);
      setDatos(d);
      cargado.current = true;
      if (d !== u.datos) setEstado('pendiente');
    } catch (e: any) {
      setErrorCarga(e?.message || 'No se pudo abrir el unifilar.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unifilarId, esSupervisor]);

  useEffect(() => { cargar(); }, [cargar]);

  // Encuadra todo el dibujo en la pantalla.
  const encuadrar = useCallback((d: DatosUnifilar | null = datos) => {
    const caja = contenedorRef.current?.getBoundingClientRect();
    if (!caja || !d) return;
    const l = limitesDe(d);
    const margen = 40;
    const proporcion = caja.height / Math.max(1, caja.width);
    let w = l.w + margen * 2;
    let h = w * proporcion;
    if (h < l.h + margen * 2) { h = l.h + margen * 2; w = h / proporcion; }
    setVista({ x: l.x + l.w / 2 - w / 2, y: l.y + l.h / 2 - h / 2, w, h });
  }, [datos]);

  const encuadrado = useRef(false);
  useEffect(() => {
    if (datos && !encuadrado.current) { encuadrado.current = true; encuadrar(datos); }
  }, [datos, encuadrar]);

  // La vista sigue la forma del contenedor al cambiar el tamaño de la ventana.
  useEffect(() => {
    const el = contenedorRef.current;
    if (!el) return;
    const observador = new ResizeObserver(() => {
      const caja = el.getBoundingClientRect();
      if (caja.width < 10) return;
      setVista((v) => ({ ...v, h: v.w * (caja.height / caja.width) }));
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, [unifilar]);

  // ---------- Guardar solo ----------

  useEffect(() => {
    if (!cargado.current || !datos) return;
    if (esSupervisor) guardarCopiaLocal(unifilarId, nombre, datos);
  }, [datos, nombre, unifilarId]);

  const guardarAhora = useCallback(async (n: string, d: DatosUnifilar) => {
    setEstado('guardando');
    try {
      if (!esSupervisor) {
        // El original no se toca: se guarda la copia del técnico.
        const pendiente = await copiaTecnico.guardar(d as unknown as Record<string, unknown>);
        setEstado(pendiente ? 'error' : 'guardado');
        setErrorGuardado(pendiente ? 'Sin señal: tu copia quedó en este teléfono y se sube al volver.' : null);
        return;
      }
      await guardarUnifilar(unifilarId, { nombre: n, datos: d });
      borrarCopiaLocal(unifilarId);
      setEstado('guardado');
      setErrorGuardado(null);
    } catch (e: any) {
      setEstado('error');
      setErrorGuardado(e?.message || 'No se pudo guardar.');
    }
  }, [unifilarId]);

  const primeraVez = useRef(true);
  useEffect(() => {
    if (!cargado.current || !datos) return;
    if (primeraVez.current) { primeraVez.current = false; return; }
    setEstado('pendiente');
    const espera = setTimeout(() => { guardarAhora(nombre, datos); }, 1500);
    return () => clearTimeout(espera);
  }, [datos, nombre, guardarAhora]);

  // Reintenta al volver la señal.
  useEffect(() => {
    const alVolver = () => { if (estado === 'error' && datos) guardarAhora(nombre, datos); };
    window.addEventListener('online', alVolver);
    return () => window.removeEventListener('online', alVolver);
  }, [estado, datos, nombre, guardarAhora]);

  // Avisa antes de cerrar con cambios sin subir (la copia local los guarda igual).
  useEffect(() => {
    const antes = (ev: BeforeUnloadEvent) => { if (estado !== 'guardado') ev.preventDefault(); };
    window.addEventListener('beforeunload', antes);
    return () => window.removeEventListener('beforeunload', antes);
  }, [estado]);

  // ---------- Cambios ----------

  // Todo cambio pasa por aquí para poder deshacerlo.
  const cambiar = useCallback((fn: (d: DatosUnifilar) => DatosUnifilar, registrar = true) => {
    setDatos((previo) => {
      if (!previo) return previo;
      if (registrar) setHistorial((h) => [...h.slice(-49), previo]);
      return fn(previo);
    });
  }, []);

  const deshacer = useCallback(() => {
    setHistorial((h) => {
      if (h.length === 0) return h;
      setDatos(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }, []);

  const cambiarEquipo = (id: string, cambio: Partial<EquipoUnifilar>) =>
    cambiar((d) => ({ ...d, equipos: d.equipos.map((e) => (e.id === id ? { ...e, ...cambio } : e)) }));
  const cambiarTramo = (id: string, cambio: Partial<TramoUnifilar>) =>
    cambiar((d) => ({ ...d, tramos: d.tramos.map((t) => (t.id === id ? { ...t, ...cambio } : t)) }));

  // Al quitar MPPT o vías, los tramos que llegaban a una entrada que ya no
  // existe se quitan también.
  const cambiarEquipoYLimpiar = (id: string, cambio: Partial<EquipoUnifilar>) =>
    cambiar((d) => {
      const equipos = d.equipos.map((e) => (e.id === id ? { ...e, ...cambio } : e));
      const existe = (p: Punta) => {
        const e = equipos.find((x) => x.id === p.equipo);
        return !!e && puertosDe(e).some((q) => q.id === p.puerto);
      };
      return { ...d, equipos, tramos: d.tramos.filter((t) => existe(t.a) && existe(t.b)) };
    });

  async function borrarEquipo(id: string) {
    if (!datos) return;
    const conectados = datos.tramos.filter((t) => t.a.equipo === id || t.b.equipo === id).length;
    if (conectados > 0 && !(await confirmar(`¿Borrar el equipo y sus ${conectados} ${conectados === 1 ? 'tramo' : 'tramos'}?`))) return;
    cambiar((d) => ({ ...d, equipos: d.equipos.filter((e) => e.id !== id), tramos: d.tramos.filter((t) => t.a.equipo !== id && t.b.equipo !== id) }));
    setSeleccion(null);
  }

  function borrarTramo(id: string) {
    cambiar((d) => ({ ...d, tramos: d.tramos.filter((t) => t.id !== id) }));
    setSeleccion(null);
  }

  function duplicarEquipo(e: EquipoUnifilar) {
    const copia: EquipoUnifilar = { ...e, id: crypto.randomUUID(), x: e.x + 30, y: e.y + tamanoDe(e).h + 40, valores: { ...e.valores }, etiqueta: { ...e.etiqueta } };
    cambiar((d) => ({ ...d, equipos: [...d.equipos, copia] }));
    setSeleccion({ tipo: 'equipo', id: copia.id });
  }

  function agregarEquipo(tipo: TipoEquipo) {
    const e = nuevoEquipo(tipo, 0, 0, () => crypto.randomUUID());
    const { w, h } = tamanoDe(e);
    e.x = ajustar(vista.x + vista.w / 2 - w / 2);
    e.y = ajustar(vista.y + vista.h / 2 - h / 2);
    cambiar((d) => ({ ...d, equipos: [...d.equipos, e] }));
    setSeleccion({ tipo: 'equipo', id: e.id });
    setPanel('seleccion');
  }

  // ---------- Conectar ----------

  function tocarPuerto(p: Punta) {
    if (!datos) return;
    if (!desde) { setDesde(p); return; }
    if (desde.equipo === p.equipo && desde.puerto === p.puerto) { setDesde(null); return; }
    if (desde.equipo === p.equipo) { showToast('Une puertos de dos equipos distintos.', 'error'); return; }
    const repetido = datos.tramos.some((t) =>
      (t.a.equipo === desde.equipo && t.a.puerto === desde.puerto && t.b.equipo === p.equipo && t.b.puerto === p.puerto) ||
      (t.b.equipo === desde.equipo && t.b.puerto === desde.puerto && t.a.equipo === p.equipo && t.a.puerto === p.puerto));
    if (repetido) { showToast('Esos dos puertos ya están unidos.', 'error'); setDesde(null); return; }
    const t = nuevoTramo(datos, desde, p, () => crypto.randomUUID());
    cambiar((d) => ({ ...d, tramos: [...d.tramos, t] }));
    setDesde(null);
    setSeleccion({ tipo: 'tramo', id: t.id });
    setPanel('seleccion');
  }

  // ---------- Puntero: arrastrar, mover la vista, pellizcar ----------

  function aDibujo(clientX: number, clientY: number) {
    const caja = svgRef.current!.getBoundingClientRect();
    return { x: vista.x + ((clientX - caja.left) / caja.width) * vista.w, y: vista.y + ((clientY - caja.top) / caja.height) * vista.h };
  }

  function empezar(ev: React.PointerEvent, a: Arrastre) {
    ev.stopPropagation();
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;
    capturar(ev.pointerId);
    dedos.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    arrastre.current = a;
  }

  // Seguir el dedo aunque salga del dibujo. Si el navegador ya soltó ese
  // puntero, se sigue sin captura.
  function capturar(id: number) {
    try {
      svgRef.current?.setPointerCapture(id);
    } catch {
      // Sin captura: el arrastre funciona mientras el puntero siga encima.
    }
  }

  function alBajarFondo(ev: React.PointerEvent) {
    dedos.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    capturar(ev.pointerId);
    if (dedos.current.size === 2) {
      const [p1, p2] = [...dedos.current.values()];
      pellizco.current = { distancia: Math.hypot(p1.x - p2.x, p1.y - p2.y), vista };
      arrastre.current = null;
      return;
    }
    arrastre.current = { tipo: 'fondo', inicio: { x: ev.clientX, y: ev.clientY }, vista, movio: false };
  }

  function alMover(ev: React.PointerEvent) {
    if (dedos.current.has(ev.pointerId)) dedos.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const caja = svgRef.current?.getBoundingClientRect();
    if (!caja) return;
    if (pellizco.current && dedos.current.size === 2) {
      const [p1, p2] = [...dedos.current.values()];
      const factor = pellizco.current.distancia / Math.max(10, Math.hypot(p1.x - p2.x, p1.y - p2.y));
      const v = pellizco.current.vista;
      const w = Math.min(6000, Math.max(150, v.w * factor));
      const h = w * (caja.height / caja.width);
      setVista({ x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h });
      return;
    }
    const a = arrastre.current;
    if (!a) return;
    const escala = vista.w / caja.width;
    if (a.tipo === 'fondo') {
      const dx = (ev.clientX - a.inicio.x) * escala;
      const dy = (ev.clientY - a.inicio.y) * escala;
      if (Math.abs(dx) + Math.abs(dy) > 2) a.movio = true;
      setVista({ ...a.vista, x: a.vista.x - dx, y: a.vista.y - dy });
      return;
    }
    const punto = aDibujo(ev.clientX, ev.clientY);
    if (a.tipo === 'codo') {
      // Primer movimiento: se guarda para poder deshacer.
      if (!a.movio) { a.movio = true; cambiar((d) => d); }
      const valor = ajustar(a.vertical ? punto.x : punto.y);
      cambiar((d) => ({ ...d, tramos: d.tramos.map((t) => (t.id === a.id ? { ...t, codo: valor } : t)) }), false);
      return;
    }
    const dx = punto.x - a.inicio.x;
    const dy = punto.y - a.inicio.y;
    if (!a.movio && Math.abs(dx) + Math.abs(dy) < 3 * escala) return;
    if (!a.movio) { a.movio = true; cambiar((d) => d); }
    if (a.tipo === 'equipo') {
      const x = ajustar(a.original.x + dx);
      const y = ajustar(a.original.y + dy);
      cambiar((d) => ({ ...d, equipos: d.equipos.map((e) => (e.id === a.id ? { ...e, x, y } : e)) }), false);
    } else {
      const etiqueta = { dx: Math.round(a.original.dx + dx), dy: Math.round(a.original.dy + dy) };
      if (a.tipo === 'etiquetaEquipo') cambiar((d) => ({ ...d, equipos: d.equipos.map((e) => (e.id === a.id ? { ...e, etiqueta } : e)) }), false);
      else cambiar((d) => ({ ...d, tramos: d.tramos.map((t) => (t.id === a.id ? { ...t, etiqueta } : t)) }), false);
    }
  }

  function alSoltar(ev: React.PointerEvent) {
    dedos.current.delete(ev.pointerId);
    if (dedos.current.size < 2) pellizco.current = null;
    const a = arrastre.current;
    arrastre.current = null;
    if (!a || a.movio) return;
    // Un toque sin mover = elegir.
    if (a.tipo === 'fondo') { setSeleccion(null); setDesde(null); if (panel === 'seleccion') setPanel(null); return; }
    if (a.tipo === 'equipo' || a.tipo === 'etiquetaEquipo') { setSeleccion({ tipo: 'equipo', id: a.id }); setPanel('seleccion'); }
    if (a.tipo === 'etiquetaTramo') { setSeleccion({ tipo: 'tramo', id: a.id }); setPanel('seleccion'); }
  }

  function alRueda(ev: React.WheelEvent) {
    const caja = svgRef.current?.getBoundingClientRect();
    if (!caja) return;
    const punto = aDibujo(ev.clientX, ev.clientY);
    const factor = ev.deltaY > 0 ? 1.12 : 1 / 1.12;
    acercar(factor, punto);
  }

  function acercar(factor: number, centro?: { x: number; y: number }) {
    setVista((v) => {
      const w = Math.min(6000, Math.max(150, v.w * factor));
      const f = w / v.w;
      const c = centro || { x: v.x + v.w / 2, y: v.y + v.h / 2 };
      return { x: c.x - (c.x - v.x) * f, y: c.y - (c.y - v.y) * f, w, h: v.h * f };
    });
  }

  // Ctrl+Z, Supr y Esc (si no se está escribiendo en un campo).
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      const escribiendo = (ev.target as HTMLElement)?.closest('input, textarea, select, [contenteditable]');
      if (escribiendo) return;
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); deshacer(); return; }
      if (ev.key === 'Escape') { setDesde(null); setConectando(false); setSeleccion(null); return; }
      if ((ev.key === 'Delete' || ev.key === 'Backspace') && seleccion) {
        ev.preventDefault();
        if (seleccion.tipo === 'equipo') borrarEquipo(seleccion.id);
        else borrarTramo(seleccion.id);
      }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  });

  // ---------- PDF ----------

  async function descargarPdf() {
    if (!datos || !unifilar) return;
    setGenerandoPdf(true);
    try {
      const { generarUnifilarPdf } = await import('@/lib/unifilarPdf');
      const bytes = await generarUnifilarPdf(datos, unifilar.tipo);
      await descargarArchivo(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `unifilar-${nombreSeguro(nombre || 'sistema')}.pdf`);
    } catch (e: any) {
      showToast(e?.message || 'No se pudo armar el PDF. Intenta de nuevo.', 'error');
    } finally {
      setGenerandoPdf(false);
    }
  }

  async function descargarDxf() {
    if (!datos) return;
    try {
      const { exportarUnifilarDxf } = await import('@/lib/unifilarDxf');
      await descargarArchivo(new Blob([exportarUnifilarDxf(datos) as BlobPart], { type: 'application/dxf' }), `unifilar-${nombreSeguro(nombre || 'sistema')}.dxf`);
    } catch (e: any) {
      showToast(e?.message || 'No se pudo armar el DXF.', 'error');
    }
  }

  async function borrarTodo() {
    if (!(await confirmar(`¿Borrar el unifilar «${nombre}»? No se puede deshacer.`))) return;
    try {
      await borrarUnifilar(unifilarId);
      borrarCopiaLocal(unifilarId);
      window.location.href = '/dashboard/diagramas?ver=unifilares';
    } catch (e: any) {
      showToast(e?.message || 'No se pudo borrar.', 'error');
    }
  }

  const figuras = useMemo(() => (datos ? dibujarDiagrama(datos) : []), [datos]);
  const avisos = useMemo(() => (datos ? revisar(datos) : []), [datos]);
  const errores = avisos.filter((a) => a.nivel === 'error').length;

  if (errorCarga) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <p className="text-red font-semibold text-[15px]">{errorCarga}</p>
        <div className="flex justify-center gap-2 mt-4">
          <Link href="/dashboard/diagramas?ver=unifilares" className="min-h-[44px] px-4 rounded-xl bg-surface-2 border border-line font-semibold flex items-center">Volver</Link>
          <button type="button" onClick={cargar} className="min-h-[44px] px-4 rounded-xl bg-teal text-inkOnAccent font-semibold">Reintentar</button>
        </div>
      </div>
    );
  }
  if (!datos || !unifilar) return <p className="p-6 text-muted text-[14px]">Cargando…</p>;

  const equipoElegido = seleccion?.tipo === 'equipo' ? datos.equipos.find((e) => e.id === seleccion.id) || null : null;
  const tramoElegido = seleccion?.tipo === 'tramo' ? datos.tramos.find((t) => t.id === seleccion.id) || null : null;
  const grosorToque = vista.w / 90;

  const irAAviso = (a: Aviso) => {
    if (a.equipo) setSeleccion({ tipo: 'equipo', id: a.equipo });
    else if (a.tramo) setSeleccion({ tipo: 'tramo', id: a.tramo });
    setPanel('seleccion');
  };

  const contenidoPanel = (() => {
    if (panel === 'catalogo') return <PanelCatalogo onElegir={agregarEquipo} onCerrar={() => setPanel(null)} />;
    if (panel === 'revision') return <PanelRevision avisos={avisos} onElegir={irAAviso} onCerrar={() => setPanel(null)} />;
    if (panel === 'proyecto') {
      return (
        <PanelProyecto nombre={nombre} tipo={unifilar.tipo} datos={datos} onNombre={esSupervisor ? setNombre : () => {}}
          onProyecto={(c) => cambiar((d) => ({ ...d, proyecto: { ...d.proyecto, ...c } }))}
          onNotas={(notas) => cambiar((d) => ({ ...d, notas }))} onCerrar={() => setPanel(null)} />
      );
    }
    if (panel === 'seleccion' && equipoElegido) {
      return (
        <PanelEquipo key={equipoElegido.id} datos={datos} equipo={equipoElegido}
          onCambiar={(c) => (c.valores && (c.valores.mppts !== equipoElegido.valores.mppts || c.valores.vias !== equipoElegido.valores.vias)
            ? cambiarEquipoYLimpiar(equipoElegido.id, c) : cambiarEquipo(equipoElegido.id, c))}
          onBorrar={() => borrarEquipo(equipoElegido.id)} onDuplicar={() => duplicarEquipo(equipoElegido)} onCerrar={() => { setPanel(null); setSeleccion(null); }} />
      );
    }
    if (panel === 'seleccion' && tramoElegido) {
      return (
        <PanelTramo key={tramoElegido.id} datos={datos} tramo={tramoElegido} onCambiar={(c) => cambiarTramo(tramoElegido.id, c)}
          onBorrar={() => borrarTramo(tramoElegido.id)} onCerrar={() => { setPanel(null); setSeleccion(null); }} />
      );
    }
    return null;
  })();

  const BOTON = 'min-h-[42px] px-3 rounded-xl border border-line bg-surface-2 text-[13.5px] font-semibold flex items-center gap-1.5 hover:border-teal/60 shrink-0';

  return (
    <div className="h-[100dvh] flex flex-col bg-bg">
      {/* Barra de arriba */}
      {/* En el celular: nombre arriba y los botones en una fila que se desliza. */}
      <div className="flex flex-wrap lg:flex-nowrap items-center gap-2 px-3 py-2 border-b border-line bg-surface">
        <Link href="/dashboard/diagramas?ver=unifilares" aria-label="Volver" className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-surface-2 shrink-0">
          <ChevronLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1 mr-1">
          <p className="font-display font-bold text-[15px] leading-tight truncate lg:max-w-xs">{nombre || 'Sin nombre'}</p>
          <EstadoDeGuardado estado={estado} error={errorGuardado} onReintentar={() => guardarAhora(nombre, datos)} />
        </div>
        <div className="w-full lg:w-auto flex gap-2 overflow-x-auto">
        <button type="button" className={BOTON} onClick={() => { setPanel('catalogo'); setConectando(false); }}><Plus size={16} /> Equipo</button>
        <button type="button" onClick={() => { setConectando((c) => !c); setDesde(null); }}
          className={`${BOTON} ${conectando ? '!bg-teal !text-inkOnAccent !border-teal' : ''}`}>
          <Cable size={16} /> {conectando ? 'Conectando' : 'Conectar'}
        </button>
        <button type="button" className={BOTON} onClick={deshacer} disabled={historial.length === 0} aria-label="Deshacer"><Undo2 size={16} /></button>
        <button type="button" className={BOTON} onClick={() => setPanel('proyecto')}><Settings2 size={16} /> Datos del plano</button>
        <button type="button" className={`${BOTON} ${errores > 0 ? 'text-red' : avisos.length > 0 ? 'text-amber' : ''}`} onClick={() => setPanel('revision')}>
          {avisos.length > 0 ? <AlertTriangle size={16} /> : <Check size={16} />} Revisión{avisos.length > 0 ? ` (${avisos.length})` : ''}
        </button>
        <button type="button" className={`${BOTON} !bg-teal !text-inkOnAccent !border-teal`} onClick={descargarPdf} disabled={generandoPdf}>
          {generandoPdf ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />} PDF
        </button>
        <button type="button" className={BOTON} onClick={descargarDxf} title="Para abrirlo y editarlo en AutoCAD"><FileDown size={16} /> DXF</button>
        {esSupervisor && <button type="button" className={BOTON} onClick={() => setVerVersiones(true)} aria-label="Versiones" title="Versiones"><History size={16} /></button>}
        {esSupervisor && <button type="button" className={`${BOTON} text-red`} onClick={borrarTodo} aria-label="Borrar unifilar"><Trash2 size={16} /></button>}
        </div>
      </div>

      <BarraCopia copia={copiaTecnico} nombre={nombre} onDescartada={cargar} />
      {verVersiones && <HistorialVersiones tipo="unifilar" objetoId={unifilarId} onCerrar={() => setVerVersiones(false)} onRestaurada={() => { setVerVersiones(false); window.location.reload(); }} />}
      {conectando && (
        <p className="px-4 py-2 text-[13px] bg-teal/10 border-b border-line">
          {desde ? 'Ahora toca el puerto donde llega el cable.' : 'Toca el puerto (punto azul) de donde sale el cable. Los verdes son de tierra.'}
        </p>
      )}

      <div className="flex-1 min-h-0 flex relative">
        <div ref={contenedorRef} className="flex-1 min-w-0 relative bg-[#e5e7eb] dark:bg-[#1f2937]">
          <svg ref={svgRef} className="absolute inset-0 w-full h-full touch-none select-none"
            viewBox={`${vista.x} ${vista.y} ${vista.w} ${vista.h}`} preserveAspectRatio="none"
            onPointerDown={alBajarFondo} onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={alSoltar} onWheel={alRueda}>
            <defs>
              <pattern id="rejilla-unifilar" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="0" cy="0" r="0.8" fill="#cbd5e1" />
              </pattern>
            </defs>
            <rect x={vista.x} y={vista.y} width={vista.w} height={vista.h} fill="#ffffff" />
            <rect x={vista.x} y={vista.y} width={vista.w} height={vista.h} fill="url(#rejilla-unifilar)" />

            {figuras.map((f, i) => <FiguraSvg key={i} f={f} />)}

            {/* Zonas para tocar: tramos */}
            {datos.tramos.map((t) => {
              const ruta = rutaDeTramo(datos, t);
              if (!ruta) return null;
              const elegido = seleccion?.tipo === 'tramo' && seleccion.id === t.id;
              const codo = elegido ? segmentoDelCodo(ruta) : null;
              return (
                <g key={t.id}>
                  {elegido && <polyline points={ruta.join(' ')} fill="none" stroke="#14b8a6" strokeOpacity={0.45} strokeWidth={6} />}
                  <polyline points={ruta.join(' ')} fill="none" stroke="transparent" strokeWidth={grosorToque} style={{ cursor: 'pointer' }}
                    onPointerDown={(ev) => { if (conectando) return; ev.stopPropagation(); setSeleccion({ tipo: 'tramo', id: t.id }); setPanel('seleccion'); }} />
                  {codo && (
                    <circle cx={(codo.x1 + codo.x2) / 2} cy={(codo.y1 + codo.y2) / 2} r={grosorToque / 2.2} fill="#0ea5e9" stroke="#fff" strokeWidth={1.5}
                      style={{ cursor: codo.vertical ? 'ew-resize' : 'ns-resize' }}
                      onPointerDown={(ev) => empezar(ev, { tipo: 'codo', id: t.id, vertical: codo.vertical, movio: false })} />
                  )}
                </g>
              );
            })}

            {/* Zonas para tocar: equipos y sus textos */}
            {datos.equipos.map((e) => {
              const { w, h } = tamanoDe(e);
              const elegido = seleccion?.tipo === 'equipo' && seleccion.id === e.id;
              const caja = cajaEtiquetaEquipo(datos, e);
              return (
                <g key={e.id}>
                  <rect x={e.x - 4} y={e.y - 4} width={w + 8} height={h + 8} rx={4}
                    fill={elegido ? 'rgba(20,184,166,0.08)' : 'transparent'} stroke={elegido ? '#14b8a6' : 'transparent'} strokeWidth={1.5} strokeDasharray="4 3"
                    style={{ cursor: conectando ? 'default' : 'move' }}
                    onPointerDown={(ev) => { if (conectando) { ev.stopPropagation(); return; } empezar(ev, { tipo: 'equipo', id: e.id, inicio: aDibujo(ev.clientX, ev.clientY), original: { x: e.x, y: e.y }, movio: false }); }} />
                  {caja.lineas.length > 0 && !conectando && (
                    <rect x={caja.x - 2} y={caja.y - 1} width={caja.w + 4} height={caja.h + 2} fill="transparent" style={{ cursor: 'move' }}
                      onPointerDown={(ev) => empezar(ev, { tipo: 'etiquetaEquipo', id: e.id, inicio: aDibujo(ev.clientX, ev.clientY), original: { ...e.etiqueta }, movio: false })} />
                  )}
                </g>
              );
            })}
            {!conectando && datos.tramos.map((t) => {
              const caja = cajaEtiquetaTramo(datos, t);
              if (!caja) return null;
              return (
                <rect key={`et-${t.id}`} x={caja.x - 2} y={caja.y - 1} width={caja.w + 4} height={caja.h + 2} fill="transparent" style={{ cursor: 'move' }}
                  onPointerDown={(ev) => empezar(ev, { tipo: 'etiquetaTramo', id: t.id, inicio: aDibujo(ev.clientX, ev.clientY), original: { ...t.etiqueta }, movio: false })} />
              );
            })}

            {/* Puertos al conectar */}
            {conectando && datos.equipos.map((e) => puertosDe(e).map((p) => {
              const activo = desde?.equipo === e.id && desde.puerto === p.id;
              const r = Math.max(4, grosorToque / 2.4);
              return (
                <g key={`${e.id}-${p.id}`} style={{ cursor: 'pointer' }}
                  onPointerDown={(ev) => { ev.stopPropagation(); tocarPuerto({ equipo: e.id, puerto: p.id }); }}>
                  <circle cx={e.x + p.x} cy={e.y + p.y} r={r * 1.8} fill="transparent" />
                  <circle cx={e.x + p.x} cy={e.y + p.y} r={r} fill={activo ? '#f59e0b' : p.tierra ? '#16a34a' : '#0ea5e9'} stroke="#fff" strokeWidth={1.5} />
                  <title>{`${e.nombre || definicion(e.tipo).nombre}: ${p.nombre}`}</title>
                </g>
              );
            }))}
          </svg>

          {/* Zoom */}
          <div className="absolute right-3 bottom-3 flex flex-col gap-1.5">
            <button type="button" aria-label="Acercar" onClick={() => acercar(1 / 1.25)} className="w-11 h-11 rounded-xl bg-surface border border-line shadow flex items-center justify-center"><Plus size={18} /></button>
            <button type="button" aria-label="Alejar" onClick={() => acercar(1.25)} className="w-11 h-11 rounded-xl bg-surface border border-line shadow flex items-center justify-center"><Minus size={18} /></button>
            <button type="button" aria-label="Ver todo" onClick={() => encuadrar()} className="w-11 h-11 rounded-xl bg-surface border border-line shadow flex items-center justify-center"><Maximize size={17} /></button>
          </div>
          {datos.equipos.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="bg-surface/90 rounded-2xl px-4 py-3 text-[14px] text-muted max-w-xs text-center">Agrega equipos con «+ Equipo» y únelos con «Conectar».</p>
            </div>
          )}
        </div>

        {/* Panel: a la derecha en computadora, abajo en el celular */}
        {contenidoPanel && (
          <div className="absolute lg:static inset-x-0 bottom-0 max-h-[60vh] lg:max-h-none lg:w-[380px] lg:shrink-0 overflow-y-auto bg-surface border-t lg:border-t-0 lg:border-l border-line p-4 rounded-t-2xl lg:rounded-none shadow-2xl lg:shadow-none z-10">
            {contenidoPanel}
          </div>
        )}
      </div>
    </div>
  );
}

function EstadoDeGuardado({ estado, error, onReintentar }: { estado: EstadoGuardado; error: string | null; onReintentar: () => void }) {
  if (estado === 'error') {
    return (
      <button type="button" onClick={onReintentar} className="flex items-center gap-1 text-[11.5px] text-red font-semibold text-left" title={error || ''}>
        <CloudOff size={12} /> Sin guardar · reintentar
      </button>
    );
  }
  const texto = estado === 'guardado' ? 'Guardado' : estado === 'guardando' ? 'Guardando…' : 'Cambios por guardar';
  return <p className="text-[11.5px] text-muted">{texto}</p>;
}

function FiguraSvg({ f }: { f: Figura }) {
  const trazo = (t?: Tinta) => COLOR[t || 'negro'];
  switch (f.k) {
    case 'linea':
      return <polyline points={f.puntos.join(' ')} fill="none" stroke={trazo(f.tinta)} strokeWidth={f.grosor ?? 1} strokeDasharray={f.guiones ? '5 3' : undefined} />;
    case 'rect':
      return <rect x={f.x} y={f.y} width={f.w} height={f.h} fill={f.relleno ? COLOR[f.relleno] : 'none'} stroke={trazo(f.tinta)} strokeWidth={f.grosor ?? 1} strokeDasharray={f.guiones ? '5 3' : undefined} />;
    case 'circulo':
      return <circle cx={f.cx} cy={f.cy} r={f.r} fill={f.relleno ? COLOR[f.relleno] : 'none'} stroke={trazo(f.tinta)} strokeWidth={f.grosor ?? 1} />;
    case 'trazo':
      return <path transform={`translate(${f.x} ${f.y})`} d={f.d} fill={f.relleno ? COLOR[f.relleno] : 'none'} stroke={trazo(f.tinta)} strokeWidth={f.grosor ?? 1} />;
    case 'texto': {
      const ancla = f.ancla === 'medio' ? 'middle' : f.ancla === 'fin' ? 'end' : 'start';
      return (
        <text x={f.x} y={f.y} fontSize={f.tam} fontFamily="Helvetica, Arial, sans-serif" fontWeight={f.negrita ? 700 : 400} fill={trazo(f.tinta)} textAnchor={ancla}
          transform={f.giro ? `rotate(${f.giro} ${f.x} ${f.y})` : undefined} dominantBaseline={f.giro ? 'central' : undefined} style={{ pointerEvents: 'none' }}>
          {f.texto}
        </text>
      );
    }
  }
}

