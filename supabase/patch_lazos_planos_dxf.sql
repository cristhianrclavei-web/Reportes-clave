-- Planos en DXF (fase 2): además del PDF, el plano puede subirse como DXF de
-- AutoCAD. Se guarda el archivo original (en pdf_path, que es «el archivo
-- original» del plano) y cómo pasar de la hoja de la app a las coordenadas
-- reales del dibujo, para exportar el sembrado a AutoCAD en su lugar exacto.
--
-- Solo agrega columnas con valor por omisión: los planos PDF siguen igual.

alter table public.lazo_planos
  add column if not exists formato text not null default 'pdf';

alter table public.lazo_planos
  drop constraint if exists lazo_planos_formato_check;
alter table public.lazo_planos
  add constraint lazo_planos_formato_check check (formato in ('pdf', 'dxf'));

-- { x0, y1, k, unidad }: X = x0 + x·k ; Y = y1 − y·k (x, y en la hoja de la
-- app; X, Y en unidades del dibujo). unidad = metros por unidad del dibujo.
alter table public.lazo_planos
  add column if not exists dxf jsonb;

alter table public.lazo_planos
  drop constraint if exists lazo_planos_dxf_check;
alter table public.lazo_planos
  add constraint lazo_planos_dxf_check check (
    dxf is null or (
      jsonb_typeof(dxf->'x0') = 'number' and jsonb_typeof(dxf->'y1') = 'number'
      and jsonb_typeof(dxf->'k') = 'number' and jsonb_typeof(dxf->'unidad') = 'number'
    )
  );
