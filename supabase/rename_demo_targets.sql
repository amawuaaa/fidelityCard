/* Renombra demos públicos: Layers/ETMA → Prism/Hearth (marcas ficticias).
   Ejecuta en Supabase SQL Editor si ya tenías layers / etma. */

update public.cafes
set
  name = 'Prism Café',
  slug = 'prism',
  brand_color = '#EF4444',
  stamps_required = 6,
  tagline = 'Café con color',
  reward_label = '1 café gratis',
  theme_style = 'rainbow'
where slug = 'layers';

update public.cafes
set
  name = 'Hearth Bakery',
  slug = 'hearth',
  brand_color = '#44403C',
  stamps_required = 8,
  tagline = 'Pan y café de mañana',
  reward_label = '1 café o pan',
  theme_style = 'bakery'
where slug = 'etma';

/* Por si layers/etma ya no existen, asegura que los demos ficticios estén */
insert into public.cafes (name, slug, brand_color, stamps_required, tagline, reward_label, theme_style)
values
  ('Prism Café', 'prism', '#EF4444', 6, 'Café con color', '1 café gratis', 'rainbow'),
  ('Hearth Bakery', 'hearth', '#44403C', 8, 'Pan y café de mañana', '1 café o pan', 'bakery')
on conflict (slug) do update set
  name = excluded.name,
  brand_color = excluded.brand_color,
  stamps_required = excluded.stamps_required,
  tagline = excluded.tagline,
  reward_label = excluded.reward_label,
  theme_style = excluded.theme_style;
