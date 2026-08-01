-- =============================================================================
-- Fix: gen_random_bytes does not exist (PWA / ensure_customer_session)
-- Ejecuta esto YA en Supabase SQL Editor.
-- =============================================================================
-- Causa: claim_token usaba pgcrypto.gen_random_bytes, que a veces no está
-- disponible. Pasamos a gen_random_uuid() (siempre en Postgres/Supabase).
-- =============================================================================

create or replace function public.new_claim_token()
returns text
language sql
volatile
as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
$$;

revoke all on function public.new_claim_token() from public, anon, authenticated;

create or replace function public.ensure_customer_session(
  p_cafe_slug text,
  p_public_id text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cafe public.cafes%rowtype;
  v_customer public.customers%rowtype;
  v_card public.loyalty_cards%rowtype;
begin
  if not public.is_valid_public_id(p_public_id) then
    raise exception 'ID de cliente no válido';
  end if;

  select * into v_cafe from public.cafes where slug = p_cafe_slug;
  if not found then raise exception 'Café no encontrado'; end if;

  select * into v_customer from public.customers where public_id = p_public_id;
  if not found then
    insert into public.customers (public_id, claim_token)
    values (p_public_id, public.new_claim_token())
    returning * into v_customer;
  elsif v_customer.claim_token is null then
    update public.customers
    set claim_token = public.new_claim_token()
    where id = v_customer.id
    returning * into v_customer;
  end if;

  select * into v_card
  from public.loyalty_cards
  where cafe_id = v_cafe.id and customer_id = v_customer.id;

  if not found then
    insert into public.loyalty_cards (
      cafe_id, customer_id, stamps_count, cards_completed, short_code
    )
    values (
      v_cafe.id,
      v_customer.id,
      0,
      0,
      public.allocate_short_code(v_cafe.id)
    )
    returning * into v_card;
  elsif v_card.short_code is null then
    update public.loyalty_cards
    set short_code = public.allocate_short_code(v_cafe.id)
    where id = v_card.id
    returning * into v_card;
  end if;

  return json_build_object(
    'public_id', v_customer.public_id,
    'claim_token', v_customer.claim_token,
    'short_code', v_card.short_code,
    'customer_id', v_customer.id,
    'cafe_id', v_cafe.id,
    'cafe_slug', v_cafe.slug,
    'cafe_name', v_cafe.name,
    'brand_color', v_cafe.brand_color,
    'stamps_count', v_card.stamps_count,
    'stamps_required', v_cafe.stamps_required,
    'cards_completed', coalesce(v_card.cards_completed, 0),
    'tagline', coalesce(v_cafe.tagline, ''),
    'reward_label', coalesce(v_cafe.reward_label, '1 café gratis'),
    'theme_style', coalesce(v_cafe.theme_style, 'solid')
  );
end;
$$;

grant execute on function public.ensure_customer_session(text, text) to anon, authenticated;

-- Backfill tokens rotos / nulos sin gen_random_bytes
update public.customers
set claim_token = public.new_claim_token()
where claim_token is null;
