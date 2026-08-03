-- =============================================================================
-- LEGACY — No usar. Fuente de verdad: supabase/cuptrack.sql
-- =============================================================================
-- LEGACY — CupTrack demos. Prefer cuptrack.sql + rename_demo_targets.sql.
-- =============================================================================
-- Links:
--   /?cafe=cafe-demo  → verde
--   /?cafe=bean-co    → ámbar
--   /?cafe=norte      → teal, 8 sellos
--   /?cafe=prism      → arcoíris (Prism Café, ficticio)
--   /?cafe=hearth     → bakery (Hearth Bakery, ficticio)
-- =============================================================================

alter table public.cafes
  add column if not exists tagline text,
  add column if not exists reward_label text,
  add column if not exists theme_style text not null default 'solid';

-- Café Demo
insert into public.cafes (name, slug, brand_color, stamps_required, tagline, reward_label, theme_style)
values (
  'Café Demo', 'cafe-demo', '#178e3c', 6,
  'Especialidad de barrio', '1 café gratis', 'solid'
)
on conflict (slug) do update set
  name = excluded.name,
  brand_color = excluded.brand_color,
  stamps_required = excluded.stamps_required,
  tagline = excluded.tagline,
  reward_label = excluded.reward_label,
  theme_style = excluded.theme_style;

-- Bean & Co
insert into public.cafes (name, slug, brand_color, stamps_required, tagline, reward_label, theme_style)
values (
  'Bean & Co', 'bean-co', '#B45309', 6,
  'Espresso & community', '1 bebida a elegir', 'solid'
)
on conflict (slug) do update set
  name = excluded.name,
  brand_color = excluded.brand_color,
  stamps_required = excluded.stamps_required,
  tagline = excluded.tagline,
  reward_label = excluded.reward_label,
  theme_style = excluded.theme_style;

-- Norte
insert into public.cafes (name, slug, brand_color, stamps_required, tagline, reward_label, theme_style)
values (
  'Norte', 'norte', '#0E7490', 8,
  'Origen y tueste', '1 filter gratis', 'solid'
)
on conflict (slug) do update set
  name = excluded.name,
  brand_color = excluded.brand_color,
  stamps_required = excluded.stamps_required,
  tagline = excluded.tagline,
  reward_label = excluded.reward_label,
  theme_style = excluded.theme_style;

-- Prism Café — demo arcoíris (ficticio)
insert into public.cafes (name, slug, brand_color, stamps_required, tagline, reward_label, theme_style)
values (
  'Prism Café', 'prism', '#EF4444', 6,
  'Café con color', '1 café gratis', 'rainbow'
)
on conflict (slug) do update set
  name = excluded.name,
  brand_color = excluded.brand_color,
  stamps_required = excluded.stamps_required,
  tagline = excluded.tagline,
  reward_label = excluded.reward_label,
  theme_style = excluded.theme_style;

-- Hearth Bakery — demo bakery (ficticio)
insert into public.cafes (name, slug, brand_color, stamps_required, tagline, reward_label, theme_style)
values (
  'Hearth Bakery', 'hearth', '#44403C', 8,
  'Pan y café de mañana', '1 café o pan', 'bakery'
)
on conflict (slug) do update set
  name = excluded.name,
  brand_color = excluded.brand_color,
  stamps_required = excluded.stamps_required,
  tagline = excluded.tagline,
  reward_label = excluded.reward_label,
  theme_style = excluded.theme_style;

create or replace function public.get_cafe_by_slug(p_slug text)
returns json
language plpgsql
security definer
stable
as $$
declare
  v_cafe public.cafes%rowtype;
begin
  select * into v_cafe from public.cafes where slug = p_slug;
  if not found then
    raise exception 'Café no encontrado';
  end if;

  return json_build_object(
    'id', v_cafe.id,
    'name', v_cafe.name,
    'slug', v_cafe.slug,
    'brand_color', v_cafe.brand_color,
    'stamps_required', v_cafe.stamps_required,
    'tagline', coalesce(v_cafe.tagline, ''),
    'reward_label', coalesce(v_cafe.reward_label, '1 café gratis'),
    'theme_style', coalesce(v_cafe.theme_style, 'solid')
  );
end;
$$;

grant execute on function public.get_cafe_by_slug(text) to anon, authenticated;

create or replace function public.get_my_cafe()
returns json
language plpgsql
security definer
stable
as $$
declare
  v_row record;
begin
  if auth.uid() is null then
    raise exception 'No autorizado. Inicia sesión como barista.';
  end if;

  select
    c.id,
    c.name,
    c.slug,
    c.brand_color,
    c.stamps_required,
    c.tagline,
    c.reward_label,
    c.theme_style,
    s.role
  into v_row
  from public.cafe_staff s
  join public.cafes c on c.id = s.cafe_id
  where s.user_id = auth.uid()
  order by s.created_at asc
  limit 1;

  if not found then
    raise exception 'Tu usuario no está vinculado a ningún café. Pide al admin que ejecute link_staff_by_email.';
  end if;

  return json_build_object(
    'cafe_id', v_row.id,
    'cafe_name', v_row.name,
    'cafe_slug', v_row.slug,
    'brand_color', v_row.brand_color,
    'stamps_required', v_row.stamps_required,
    'tagline', coalesce(v_row.tagline, ''),
    'reward_label', coalesce(v_row.reward_label, '1 café gratis'),
    'theme_style', coalesce(v_row.theme_style, 'solid'),
    'role', v_row.role
  );
end;
$$;

grant execute on function public.get_my_cafe() to authenticated;
