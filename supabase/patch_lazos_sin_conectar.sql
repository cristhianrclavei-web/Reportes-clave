-- Lazos: tramos sin conectar.
--
-- Al sembrar en el plano un nivel antes de saber dónde se une al lazo (por
-- ejemplo, Consultorios nivel 2 que se conecta a la vertical del nivel 1),
-- el primer dispositivo de ese tramo queda marcado «sin conectar»: no está
-- en la línea principal ni cuelga de nadie, y lo demás del tramo cuelga de
-- él. Al unirlo desde el plano se quita la marca.
--
-- Solo agrega una columna con valor por omisión: no toca datos existentes.

alter table public.lazo_elementos
  add column if not exists sin_conectar boolean not null default false;

comment on column public.lazo_elementos.sin_conectar is
  'Primero de un tramo que todavía no se une al lazo (solo cuenta sin padre_id).';
