'use client';

function Detail({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">{label}</div>
      <div className="text-[14px] font-semibold">{value}</div>
    </div>
  );
}

export type PreviewData = {
  empresaCliente: string;
  fecha: string;
  tipoServicio: string | null;
  subTipo: string | null;
  data: any; // misma forma que "sharedData" del formulario
  fotos: { previewUrl: string; caption: string }[];
  firmaIngListo: boolean;
  firmaClienteListo: boolean;
};

export default function ReportPreviewModal({ preview, onClose }: { preview: PreviewData; onClose: () => void }) {
  const { data } = preview;

  return (
    <div onClick={onClose} className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex justify-center items-start overflow-y-auto p-4">
      <div onClick={(e) => e.stopPropagation()} className="glass-strong rounded-3xl max-w-xl w-full p-6 mt-4 mb-8 shadow-glow">
        <div className="flex justify-between items-center mb-5">
          <div>
            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-amber/15 text-amber inline-block mb-1.5">Vista previa · sin guardar</span>
            <h2 className="font-display font-semibold text-xl tracking-wide">{preview.empresaCliente || 'Sin nombre de cliente'}</h2>
          </div>
          <button onClick={onClose} className="text-ink/60 text-xl leading-none active:scale-90 transition-transform">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Detail label="Fecha" value={preview.fecha} />
          <Detail
            label="Tipo"
            value={`${preview.tipoServicio || '—'}${preview.subTipo ? ' · ' + preview.subTipo : ''}${preview.tipoServicio === 'Otro' && data.tipoServicioOtroTexto ? ' · ' + data.tipoServicioOtroTexto : ''}`}
          />
          <Detail label="Ing a cargo" value={data.ingACargo} />
          <Detail label="Personal adicional" value={(data.personal || []).slice(1).join(', ')} />
          <Detail label="Orden de compra" value={data.ordCompra} />
          <Detail label="Hora llegada / salida" value={`${data.horaLlegada || '—'} - ${data.horaSalida || '—'}`} />
          <Detail label="Contacto/Usuario" value={data.contactoUsuario} />
          <Detail label="Puesto/Área" value={data.puestoArea} />
          <Detail label="Vehículo" value={data.vehiculo} />
          <Detail label="Placas" value={data.placas} />
          <Detail label="Manejado por" value={data.manejadoPor} />
          <Detail label="Lista de conceptos" value={data.listaConceptos} />
        </div>

        {(data.actividades || []).length > 0 && (
          <div className="mt-4">
            <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Descripción de actividades realizadas</div>
            <ol className="list-decimal pl-5 text-[13.5px] font-medium space-y-1">
              {data.actividades.map((a: string, i: number) => (
                <li key={i}>{a}</li>
              ))}
            </ol>
          </div>
        )}

        {(data.casoPuntos || []).length > 0 && (
          <div className="mt-4 p-4 bg-surface-2 rounded-2xl border border-line">
            <div className="text-[11px] uppercase tracking-wider font-bold text-teal mb-3">Caso de problema en equipo o instalación</div>
            {data.casoPuntos.map((p: any, i: number) => (
              <div key={i} className="mb-3 last:mb-0 pb-3 last:pb-0 border-b last:border-b-0 border-line">
                <div className="text-xs font-bold text-teal mb-1.5">Punto {i + 1}</div>
                <div className="grid grid-cols-1 gap-1.5 text-[13px]">
                  {p.definicion && <div><span className="text-muted">Definición: </span>{p.definicion}</div>}
                  {p.descripcion && <div><span className="text-muted">Descripción: </span>{p.descripcion}</div>}
                  {p.analisis && <div><span className="text-muted">Análisis: </span>{p.analisis}</div>}
                  {p.plan && <div><span className="text-muted">Plan: </span>{p.plan}</div>}
                  {p.resultados && <div><span className="text-muted">Resultados: </span>{p.resultados}</div>}
                  {p.pasosFuturos && <div><span className="text-muted">Pasos futuros: </span>{p.pasosFuturos}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          <Detail
            label="Sistema de seguridad"
            value={[...(data.sistemaSeguridad || [])]
              .map((s: string) => (s === 'Otra' && data.seguridadOtraTexto ? `Otra: ${data.seguridadOtraTexto}` : s))
              .join(', ')}
          />
          <Detail label="Observaciones" value={data.observaciones} />
          {data.tuberia && Object.keys(data.tuberia).length > 0 && (
            <Detail
              label="Tubería"
              value={Object.entries(data.tuberia as Record<string, { medida: string; metros: string; especifica?: string }>)
                .map(([t, v]) => `${t}${t === 'Otra' && v.especifica ? ` (${v.especifica})` : ''}: ${v.medida || '—'} · ${v.metros || '—'} m`)
                .join(' / ')}
            />
          )}
          {(data.cables || []).map((c: any, i: number) => (
            <Detail key={i} label={`Cable ${i + 1}`} value={`${c.tipo || '—'} / cal. ${c.calibre || '—'} / ${c.metros || '—'} m`} />
          ))}
        </div>

        {(data.equipos || []).length > 0 && (
          <div className="mt-4">
            <div className="text-[11px] uppercase tracking-wider text-muted mb-2">Equipo instalado</div>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr className="bg-surface-2 text-muted text-[11px] uppercase tracking-wide">
                    <th className="text-left px-3 py-2">Cant.</th>
                    <th className="text-left px-3 py-2">Descripción</th>
                    <th className="text-left px-3 py-2">Modelo</th>
                    <th className="text-left px-3 py-2">Marca</th>
                    <th className="text-left px-3 py-2">Serie</th>
                  </tr>
                </thead>
                <tbody>
                  {data.equipos.map((e: any, i: number) => (
                    <tr key={i} className="border-t border-line">
                      <td className="px-3 py-2">{e.cant}</td>
                      <td className="px-3 py-2">{e.desc}</td>
                      <td className="px-3 py-2">{e.modelo}</td>
                      <td className="px-3 py-2">{e.marca}</td>
                      <td className="px-3 py-2 font-mono">{e.serie}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {preview.fotos.length > 0 && (
          <div className="mt-5 pt-4 border-t border-dashed border-line-strong">
            <div className="text-[11px] uppercase tracking-wider text-muted mb-2.5">Fotos de evidencia</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
              {preview.fotos.map((f, i) => (
                <div key={i}>
                  <img src={f.previewUrl} alt={`Evidencia ${i + 1}`} className="w-full h-[140px] object-cover rounded-xl border border-line" />
                  {f.caption && <p className="text-[12px] text-ink/80 mt-1.5">{f.caption}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-line">
          <div className="text-[11px] uppercase tracking-wider text-muted mb-2.5">Firmas</div>
          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-xl px-3 py-2.5 text-[13px] font-medium ${preview.firmaIngListo ? 'bg-teal/15 text-teal' : 'bg-surface-2 text-muted'}`}>
              {preview.firmaIngListo ? '✓ Ing. responsable firmado' : 'Ing. responsable — sin firmar'}
            </div>
            <div className={`rounded-xl px-3 py-2.5 text-[13px] font-medium ${preview.firmaClienteListo ? 'bg-teal/15 text-teal' : 'bg-surface-2 text-muted'}`}>
              {preview.firmaClienteListo ? '✓ Cliente firmado' : 'Cliente — sin firmar'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
