'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, EyeOff, PenLine, X } from 'lucide-react';
import Logo from '@/components/Logo';
import ResumenFallaTierra from '@/components/lazos/ResumenFallaTierra';
import TablaEquiposInstalados from '@/components/reporte/TablaEquiposInstalados';
import { anexosDeReporte } from '@/lib/anexoFallaTierra';
import { anexosGuiaDeReporte, resumenCortoGuia } from '@/lib/anexoGuia';
import { fechaDMA } from '@/lib/etiquetaMantenimiento';
import type { MetaFoto } from '@/lib/evidencias';
import { MARCA } from '@/lib/marca';
import { tuberiasDe, cablesDe, soporteriaDe, textoTuberia, textoCable, textoSoporteria } from '@/lib/materialesReporte';
import { tieneTipo } from '@/lib/tiposServicio';
import { ResumenFormatos } from './FormatoMantenimiento';

// Vista previa del reporte como HOJA: se ve como el PDF que recibe el cliente
// (mismo orden, mismos cuadros y casillas), en papel blanco aunque la app
// esté en tema oscuro. Tiene dos usos:
//   · El técnico la abre para revisar antes de guardar.
//   · El cliente la ve ANTES de firmar (con `onFirmar`): así sabe qué firma.
// Se dibuja con los datos del formulario, por eso funciona sin señal.

export type PreviewData = {
  empresaCliente: string;
  fecha: string;
  tipoServicio: string | null;
  subTipo: string | null;
  data: any; // misma forma que "sharedData" del formulario
  fotos: ({ previewUrl: string; caption: string } & MetaFoto)[];
  firmaIngListo: boolean;
  firmaClienteListo: boolean;
  // Las firmas ya trazadas, para mostrarlas en la hoja.
  firmaIng?: string | null;
  firmaCliente?: string | null;
};

// Mismas listas que el PDF (lib/generateReportPdf.ts).
const TIPOS = ['Instalación nueva', 'Mantenimiento', 'Otro', 'Correctivo', 'Preventivo'];
const SISTEMAS: [valor: string, etiqueta: string][] = [
  ['CCTV', 'CCTV'], ['Automatización', 'Automatización'], ['Alarma&Det', 'Alarma & Det.'],
  ['Control de acceso', 'Control de acceso'], ['Alarma intrusión', 'Alarma intrusión'],
  ['Red contra incendio', 'Red contra incendio'], ['Supresión', 'Supresión'],
  ['Inst. eléctricas', 'Inst. eléctricas'], ['Paneles solares', 'Paneles solares'], ['Otra', 'Otra'],
];
const CAMPOS_CASO: [campo: string, etiqueta: string][] = [
  ['definicion', 'Definición'], ['descripcion', 'Descripción'], ['analisis', 'Análisis'],
  ['plan', 'Plan'], ['resultados', 'Resultados'], ['pasosFuturos', 'Pasos futuros'],
];

// Cuadro con título, como los del PDF.
function Cuadro({ titulo, children, className = '' }: { titulo: string; children: ReactNode; className?: string }) {
  return (
    <section className={`border border-[#8c8c8c] ${className}`}>
      <h3 className="px-2 py-1 border-b border-[#8c8c8c] text-[10.5px] font-bold uppercase tracking-wide">{titulo}</h3>
      <div className="px-2.5 py-2">{children}</div>
    </section>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor?: string | null }) {
  return (
    <div className="flex gap-2 py-[2px]">
      <span className="w-[112px] shrink-0 text-[9.5px] font-bold uppercase text-[#6b7a80] pt-[2px]">{etiqueta}</span>
      <span className="text-[12.5px] min-w-0 break-words">{valor || '—'}</span>
    </div>
  );
}

function Casilla({ marcada, texto }: { marcada: boolean; texto: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] ${marcada ? 'font-bold' : ''}`}>
      <span className={`w-3 h-3 border border-[#124036] flex items-center justify-center text-[9px] leading-none font-bold text-white ${marcada ? 'bg-[#124036]' : 'bg-white'}`}>
        {marcada ? 'X' : ''}
      </span>
      {texto}
    </span>
  );
}

// `pendiente` va en rojo (el cliente no estaba); `vacio` es el texto neutro del recuadro sin firma.
function CuadroFirma({ etiqueta, nombre, firma, pendiente, vacio = 'Sin firma' }: { etiqueta: string; nombre: string; firma?: string | null; pendiente?: string; vacio?: string }) {
  return (
    <div>
      <p className="text-[9.5px] font-bold uppercase text-[#6b7a80]">{etiqueta}</p>
      <p className="text-[12.5px] mb-1 truncate">{nombre || '—'}</p>
      <div className="h-[76px] border border-[#8c8c8c] flex items-center justify-center">
        {firma ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={firma} alt="Firma" className="max-h-full max-w-full object-contain p-1.5" />
        ) : (
          <span className={`text-[11.5px] px-2 text-center ${pendiente ? 'text-[#c0452c] font-bold' : 'text-[#6b7a80]'}`}>{pendiente || vacio}</span>
        )}
      </div>
    </div>
  );
}

export default function ReportPreviewModal({
  preview,
  onClose,
  onFirmar,
}: {
  preview: PreviewData;
  onClose: () => void;
  // Con esta función la hoja es la revisión del cliente: abajo aparece
  // «Firmar de conformidad» y no se muestran las fotos internas.
  onFirmar?: () => void;
}) {
  const { data } = preview;
  const paraCliente = Boolean(onFirmar);
  const zonaRef = useRef<HTMLDivElement | null>(null);
  const [avance, setAvance] = useState(0);
  const [llegoAlFinal, setLlegoAlFinal] = useState(false);
  const [fotoGrande, setFotoGrande] = useState<string | null>(null);

  // Mientras la hoja está abierta, la pantalla de atrás no se desplaza.
  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previo; };
  }, []);

  function medirAvance() {
    const zona = zonaRef.current;
    if (!zona) return;
    const recorrible = zona.scrollHeight - zona.clientHeight;
    const parte = recorrible <= 4 ? 1 : zona.scrollTop / recorrible;
    setAvance(parte);
    if (parte > 0.97) setLlegoAlFinal(true);
  }
  // Un reporte corto cabe completo: cuenta como leído desde que abre.
  useEffect(medirAvance, []);

  const personal: string[] = (data.personal || []).filter(Boolean);
  const sistemas: string[] = data.sistemaSeguridad || [];
  const tuberias = tuberiasDe(data).map(textoTuberia);
  const cables = cablesDe(data).map(textoCable);
  const soporteria = soporteriaDe(data).map(textoSoporteria);
  const actividades: string[] = data.actividades || [];
  const casoPuntos: any[] = data.casoPuntos || [];
  const fallas = anexosDeReporte(data.fallasTierra);
  const guias = anexosGuiaDeReporte(data.guiasConexion);
  // El cliente no ve las fotos internas: tampoco salen en su PDF.
  const fotos = paraCliente ? preview.fotos.filter((f) => !f.interna) : preview.fotos;
  const ausente = data.clienteAusente;

  let firmaClientePendiente: string | undefined;
  if (ausente) firmaClientePendiente = `Pendiente de firma del cliente${ausente.motivo ? `: ${ausente.motivo}` : ''}`;

  return (
    <div className="modal-fondo fixed inset-0 z-50 flex flex-col bg-[#0b1520]" role="dialog" aria-modal="true" aria-label="Vista previa del reporte">
      {/* Barra de arriba */}
      <div className="shrink-0 flex items-center gap-3 px-4 pb-2.5 text-white" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold text-[17px] leading-tight truncate">
            {paraCliente ? 'Revise el reporte antes de firmar' : 'Vista previa del reporte'}
          </p>
          <p className="text-[12px] text-white/65 leading-tight">
            {paraCliente ? 'Así queda el documento que recibirá.' : 'Así lo verá el cliente. Todavía no está guardado.'}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-transform">
          <X size={19} strokeWidth={2.6} />
        </button>
      </div>
      {/* Cuánto del reporte se ha recorrido */}
      <div className="shrink-0 h-[3px] bg-white/10">
        <div className="h-full bg-teal transition-[width] duration-150" style={{ width: `${Math.round(avance * 100)}%` }} />
      </div>

      <div ref={zonaRef} onScroll={medirAvance} className="flex-1 overflow-y-auto overscroll-contain px-2.5 py-4 sm:px-6 sm:py-7">
        {/* La hoja: siempre en claro, aunque la app esté en tema oscuro. */}
        <article
          className="light mx-auto w-full max-w-[820px] bg-white text-[#0f263b] shadow-2xl px-4 py-5 sm:px-10 sm:py-9 flex flex-col gap-2.5"
          {...(MARCA.tema !== 'clave' ? { 'data-tema': MARCA.tema } : {})}
        >
          {/* Encabezado */}
          <header className="flex items-start justify-between gap-3 flex-wrap">
            <Logo variante="completo" size={40} />
            <div className="text-right ml-auto">
              <p className="font-display font-bold text-[16px] tracking-wide">REPORTE DE SERVICIO</p>
              <p className="text-[10.5px] text-[#6b7a80]">Clave: {data.claveFormato || MARCA.claveFormato} · Folio: al guardar</p>
            </div>
          </header>
          <div className="border-b-2 border-[#0f263b] pb-2">
            <h2 className="font-display font-bold text-[21px] leading-tight break-words">{preview.empresaCliente || 'Cliente sin especificar'}</h2>
            <p className="text-[12px] text-[#6b7a80]">Servicio del {preview.fecha ? fechaDMA(preview.fecha) : '—'}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[0.42fr_0.58fr] gap-2.5">
            <Cuadro titulo="Personal que realiza el servicio">
              {personal.length === 0 && <p className="text-[12.5px]">—</p>}
              {personal.map((nombre) => <p key={nombre} className="text-[12.5px] py-[2px]">• {nombre}</p>)}
            </Cuadro>
            <Cuadro titulo="Datos del servicio">
              <Dato etiqueta="Lista de conceptos" valor={data.listaConceptos} />
              <Dato etiqueta="Fecha" valor={preview.fecha ? fechaDMA(preview.fecha) : null} />
              <Dato etiqueta="Hora llegada" valor={data.horaLlegada} />
              <Dato etiqueta="Hora salida" valor={data.horaSalida} />
              <Dato etiqueta="Empresa / Cliente" valor={preview.empresaCliente} />
              <Dato etiqueta="Ord. de compra" valor={data.ordCompra} />
            </Cuadro>
          </div>

          {(data.vehiculo || data.placas || data.manejadoPor) && (
            <div className="grid grid-cols-3 border border-[#8c8c8c] divide-x divide-[#8c8c8c]">
              {[['Vehículo', data.vehiculo], ['Placas', data.placas], ['Manejado por', data.manejadoPor]].map(([etiqueta, valor]) => (
                <div key={etiqueta} className="px-2.5 py-1.5 min-w-0">
                  <p className="text-[9.5px] font-bold uppercase text-[#6b7a80]">{etiqueta}</p>
                  <p className="text-[12.5px] break-words">{valor || '—'}</p>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 border border-[#8c8c8c] divide-x divide-[#8c8c8c]">
            {[['Contacto / Usuario', data.contactoUsuario], ['Puesto / Área', data.puestoArea]].map(([etiqueta, valor]) => (
              <div key={etiqueta} className="px-2.5 py-1.5 min-w-0">
                <p className="text-[9.5px] font-bold uppercase text-[#6b7a80]">{etiqueta}</p>
                <p className="text-[12.5px] break-words">{valor || '—'}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-1.5 py-1">
            {TIPOS.map((tipo) => (
              <Casilla key={tipo} texto={tipo} marcada={tieneTipo(preview.tipoServicio, tipo) || tieneTipo(preview.subTipo, tipo)} />
            ))}
            {tieneTipo(preview.tipoServicio, 'Otro') && data.tipoServicioOtroTexto && (
              <span className="text-[12px] w-full">Especifica: {data.tipoServicioOtroTexto}</span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[0.4fr_0.6fr] gap-2.5">
            <Cuadro titulo="Tubería">
              {tuberias.length === 0 && <p className="text-[12.5px] text-[#6b7a80]">Sin tubería</p>}
              {tuberias.map((t, i) => <p key={i} className="text-[12.5px] py-[2px]">• {t}</p>)}
            </Cuadro>
            <Cuadro titulo="Sistema de seguridad">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {SISTEMAS.map(([valor, etiqueta]) => <Casilla key={valor} texto={etiqueta} marcada={sistemas.includes(valor)} />)}
              </div>
              {sistemas.includes('Otra') && data.seguridadOtraTexto && <p className="text-[12px] mt-1.5">Otra: {data.seguridadOtraTexto}</p>}
            </Cuadro>
          </div>

          {cables.length > 0 && (
            <Cuadro titulo="Cable instalado">{cables.map((t, i) => <p key={i} className="text-[12.5px] py-[2px]">• {t}</p>)}</Cuadro>
          )}
          {soporteria.length > 0 && (
            <Cuadro titulo="Montaje de soportería y fijación">{soporteria.map((t, i) => <p key={i} className="text-[12.5px] py-[2px]">• {t}</p>)}</Cuadro>
          )}

          {(data.equipos || []).length > 0 && (
            <Cuadro titulo="Montaje de equipo"><TablaEquiposInstalados equipos={data.equipos} /></Cuadro>
          )}

          {actividades.length > 0 && (
            <Cuadro titulo="Descripción de actividades realizadas">
              <ol className="list-decimal pl-5 text-[13px] leading-relaxed">
                {actividades.map((a, i) => <li key={i}>{a}</li>)}
              </ol>
            </Cuadro>
          )}

          {casoPuntos.length > 0 && (
            <Cuadro titulo="Caso de problema en equipo o instalación">
              {casoPuntos.map((punto, i) => (
                <div key={i} className="py-1.5 border-b last:border-b-0 border-[#d5d8da] text-[12.5px] leading-relaxed">
                  <p className="font-bold text-[#124036]">Punto {i + 1}</p>
                  {CAMPOS_CASO.filter(([campo]) => punto[campo]).map(([campo, etiqueta]) => (
                    <p key={campo}><span className="text-[#6b7a80]">{etiqueta}: </span>{punto[campo]}</p>
                  ))}
                </div>
              ))}
            </Cuadro>
          )}

          {data.observaciones && (
            <Cuadro titulo="Observaciones"><p className="text-[13px] leading-relaxed whitespace-pre-line">{data.observaciones}</p></Cuadro>
          )}

          {(data.formatosMtto || []).length > 0 && (
            <Cuadro titulo="Formato de mantenimiento preventivo"><ResumenFormatos formatos={data.formatosMtto} /></Cuadro>
          )}

          {fallas.length > 0 && (
            <Cuadro titulo="Búsqueda de falla a tierra">
              <div className="flex flex-col gap-3">
                {fallas.map((anexo) => <ResumenFallaTierra key={anexo.falla_id} anexo={anexo} />)}
              </div>
            </Cuadro>
          )}

          {guias.length > 0 && (
            <Cuadro titulo="Guías de conexión">
              {guias.map((guia) => (
                <p key={guia.guia_id} className="text-[12.5px] py-[2px]">• <b>{guia.nombre}</b> — {resumenCortoGuia(guia)}</p>
              ))}
            </Cuadro>
          )}

          {fotos.length > 0 && (
            <Cuadro titulo="Evidencia fotográfica">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {fotos.map((foto, i) => (
                  <figure key={i} className="relative">
                    <button type="button" onClick={() => setFotoGrande(foto.previewUrl)} className="block w-full active:scale-[0.98] transition-transform" aria-label={`Ampliar evidencia ${i + 1}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={foto.previewUrl} alt={`Evidencia ${i + 1}`} className={`w-full h-[130px] object-cover border border-[#8c8c8c] ${foto.interna ? 'opacity-50' : ''}`} />
                    </button>
                    {foto.interna && (
                      <span title="No sale en el PDF del cliente" className="absolute top-1.5 left-1.5 w-7 h-7 rounded-full bg-amber text-white flex items-center justify-center">
                        <EyeOff size={14} strokeWidth={2.4} />
                      </span>
                    )}
                    {foto.caption && <figcaption className="text-[11.5px] mt-1 leading-snug">{foto.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            </Cuadro>
          )}

          {/* Firmas */}
          <div className="border-t border-[#8c8c8c] pt-2.5 mt-1">
            <p className="text-[10.5px] font-bold uppercase tracking-wide mb-2">Firmas</p>
            <div className="grid grid-cols-2 gap-3">
              <CuadroFirma etiqueta="Ing. responsable de ejecución" nombre={data.firmaIngNombre} firma={preview.firmaIng} />
              {ausente ? (
                <CuadroFirma
                  etiqueta="Cliente ausente — firma pendiente"
                  nombre={ausente.recibioNombre ? `Recibió: ${ausente.recibioNombre}${ausente.recibioPuesto ? ` (${ausente.recibioPuesto})` : ''}` : 'Sin persona que recibiera'}
                  firma={ausente.recibioFirma}
                  pendiente={firmaClientePendiente}
                />
              ) : (
                <CuadroFirma
                  etiqueta="Nombre, fecha y firma cliente"
                  nombre={data.firmaClienteNombre}
                  firma={preview.firmaCliente}
                  vacio={paraCliente ? 'Aquí quedará su firma' : 'Sin firma'}
                />
              )}
            </div>
          </div>
        </article>
      </div>

      {/* Barra de abajo */}
      <div className="shrink-0 px-4 pt-3 bg-[#0b1520] border-t border-white/10" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
        <div className="mx-auto max-w-[820px] flex flex-col sm:flex-row sm:items-center gap-2.5">
          {paraCliente ? (
            <>
              <p className="flex-1 text-[12.5px] text-white/75 leading-snug flex items-center gap-2">
                {!llegoAlFinal && <ArrowDown size={15} strokeWidth={2.4} className="shrink-0 animate-bounce" />}
                {llegoAlFinal
                  ? 'Al firmar confirma que recibió el servicio descrito en este reporte.'
                  : 'Deslice para revisar todo el reporte. Puede tocar las fotos para ampliarlas.'}
              </p>
              <button
                type="button"
                onClick={onFirmar}
                className={`min-h-[52px] px-6 rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[16px] flex items-center justify-center gap-2 active:scale-95 transition-transform ${llegoAlFinal ? 'shadow-glow-teal' : ''}`}
              >
                <PenLine size={18} strokeWidth={2.4} /> Firmar de conformidad
              </button>
            </>
          ) : (
            <button type="button" onClick={onClose} className="w-full min-h-[50px] rounded-2xl bg-white/10 text-white font-display font-semibold text-[15px] active:scale-95 transition-transform">
              Volver al reporte
            </button>
          )}
        </div>
      </div>

      {/* Foto ampliada */}
      {fotoGrande && (
        <button type="button" onClick={() => setFotoGrande(null)} aria-label="Cerrar la foto" className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fotoGrande} alt="Evidencia ampliada" className="max-w-full max-h-full object-contain" />
        </button>
      )}
    </div>
  );
}
