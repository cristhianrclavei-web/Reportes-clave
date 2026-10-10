-- Límites de archivos por bucket: qué tipos acepta cada uno y cuánto puede
-- pesar un archivo. Hasta ahora el «solo imágenes» lo ponía el navegador, y
-- alguien con una cuenta podía saltárselo y subir cualquier cosa. Con esto el
-- almacenamiento rechaza lo demás aunque no se use la app.
--
-- No toca los archivos que ya existen: solo aplica a lo que se suba después.
-- Se puede correr varias veces (solo actualiza la configuración).
--
-- Tamaños: file_size_limit va en bytes (1 MB = 1048576).

-- Fotos de perfil: la app siempre las convierte a JPEG antes de subirlas.
update storage.buckets
   set file_size_limit = 5 * 1048576,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'avatares';

-- Evidencias: fotos, firmas (PNG) y videos de hasta 30 s de reportes,
-- servicios, bitácora y levantamientos.
update storage.buckets
   set file_size_limit = 50 * 1048576,
       allowed_mime_types = array['image/*', 'video/*']
 where id = 'evidencias';

-- Almacén: fotos de artículos y de vales, y la factura o remisión de una
-- entrada (foto o PDF).
update storage.buckets
   set file_size_limit = 20 * 1048576,
       allowed_mime_types = array['image/*', 'application/pdf']
 where id = 'almacen';

-- Facturas: el PDF y el XML timbrados por el PAC.
update storage.buckets
   set file_size_limit = 10 * 1048576,
       allowed_mime_types = array['application/pdf', 'application/xml', 'text/xml']
 where id = 'facturas';

-- Clientes: logo y foto de portada.
update storage.buckets
   set file_size_limit = 20 * 1048576,
       allowed_mime_types = array['image/*', 'application/pdf']
 where id = 'proyectos-documentos';

-- Solicitudes de personal: foto o PDF del comprobante.
update storage.buckets
   set file_size_limit = 10 * 1048576,
       allowed_mime_types = array['image/*', 'application/pdf']
 where id = 'solicitudes';

-- Para revisar cómo quedó:
-- select id, public, file_size_limit / 1048576 as mb, allowed_mime_types from storage.buckets order by id;
