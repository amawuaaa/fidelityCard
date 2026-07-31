-- =============================================================================
-- Stamp — 3 cafés de demostración (personalización por tienda)
-- Ejecuta UNA VEZ en Supabase SQL Editor (después de multi_cafe.sql).
-- =============================================================================
-- Links de demo (misma app, cara distinta):
--   /?cafe=cafe-demo   → verde, 6 sellos
--   /?cafe=bean-co     → ámbar, 6 sellos
--   /?cafe=norte       → teal,  8 sellos
-- =============================================================================

alter table public.cafes
  add column if not exists tagline text,
  add column if not exists reward_label text;

-- Café Demo — verde clásico
insert into public.cafes (name, slug, brand_color, stamps_required, tagline, reward_label)
values (
  'Café Demo',
  'cafe-demo',
  '#178e3c',
  6,
  'Especialidad de barrio',
  '1 café gratis'
)
on conflict (slug) do update set
  name = excluded.name,
  brand_color = excluded.brand_color,
  stamps_required = excluded.stamps_required,
  tagline = excluded.tagline,
  reward_label = excluded.reward_label;

-- Bean & Co — ámbar / espresso
insert into public.cafes (name, slug, brand_color, stamps_required, tagline, reward_label)
values (
  'Bean & Co',
  'bean-co',
  '#B45309',
  6,
  'Espresso & community',
  '1 bebida a elegir'
)
on conflict (slug) do update set
  name = excluded.name,
  brand_color = excluded.brand_color,
  stamps_required = excluded.stamps_required,
  tagline = excluded.tagline,
  reward_label = excluded.reward_label;

-- Norte — teal / especialidad (8 sellos para mostrar reglas distintas)
insert into public.cafes (name, slug, brand_color, stamps_required, tagline, reward_label)
values (
  'Norte',
  'norte',
  '#0E7490',
  8,
  'Origen y tueste',
  '1 filter gratis'
)
on conflict (slug) do update set
  name = excluded.name,
  brand_color = excluded.brand_color,
  stamps_required = excluded.stamps_required,
  tagline = excluded.tagline,
  reward_label = excluded.reward_label;

-- Exponer tagline + reward en el RPC público del cliente
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
    'reward_label', coalesce(v_cafe.reward_label, '1 café gratis')
  );
end;
$$;

grant execute on function public.get_cafe_by_slug(text) to anon, authenticated;

-- También en get_my_cafe (panel admin)
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
    'role', v_row.role
  );
end;
$$;

grant execute on function public.get_my_cafe() to authenticated;
