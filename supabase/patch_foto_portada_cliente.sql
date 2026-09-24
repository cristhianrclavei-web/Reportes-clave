-- Agrega la foto de portada (fachada/sitio) del cliente, aparte del logo
-- circular que ya existía. Columna nullable y aditiva: no afecta filas
-- existentes ni ninguna consulta que ya haga select('*') o de columnas
-- específicas. No requiere cambios de política de storage: usa el mismo
-- bucket privado "proyectos-documentos" que ya usa el logo.

alter table public.clientes
  add column if not exists foto_portada_path text;
