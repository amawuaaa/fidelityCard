-- =============================================================================
-- Stamp — RPC para añadir sello por QR / búsqueda manual
-- Ejecuta esto en Supabase SQL Editor (una vez).
-- =============================================================================

create or replace function public.add_stamp_by_public_id(
  p_cafe_slug text,
  p_public_id text
)
returns json
language plpgsql
security definer
as $$
declare
  v_cafe public.cafes%rowtype;
  v_customer public.customers%rowtype;
  v_card public.loyalty_cards%rowtype;
  v_new_count int;
begin
  select * into v_cafe
  from public.cafes
  where slug = p_cafe_slug;

  if not found then
    raise exception 'Café no encontrado';
  end if;

  select * into v_customer
  from public.customers
  where public_id = p_public_id;

  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  select * into v_card
  from public.loyalty_cards
  where cafe_id = v_cafe.id
    and customer_id = v_customer.id
  for update;

  if not found then
    insert into public.loyalty_cards (cafe_id, customer_id, stamps_count)
    values (v_cafe.id, v_customer.id, 0)
    returning * into v_card;
  end if;

  v_new_count := v_card.stamps_count + 1;
  if v_new_count >= v_cafe.stamps_required then
    v_new_count := 0;
  end if;

  update public.loyalty_cards
  set stamps_count = v_new_count,
      updated_at = now()
  where id = v_card.id;

  insert into public.stamp_events (cafe_id, customer_id, public_id, nfc_request_id)
  values (v_cafe.id, v_customer.id, v_customer.public_id, null);

  return json_build_object(
    'public_id', v_customer.public_id,
    'stamps_count', v_new_count,
    'stamps_required', v_cafe.stamps_required,
    'cafe_name', v_cafe.name
  );
end;
$$;

grant execute on function public.add_stamp_by_public_id(text, text) to anon, authenticated;
