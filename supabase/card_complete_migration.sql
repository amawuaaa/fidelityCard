-- =============================================================================
-- LEGACY — No usar. Fuente de verdad: supabase/cuptrack.sql
-- =============================================================================

-- Contador de cartones completados por cliente/café
alter table public.loyalty_cards
  add column if not exists cards_completed int not null default 0
  check (cards_completed >= 0);

-- ——— Añadir sello (QR / búsqueda): llega a 6 y NO reinicia solo ———
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
  v_completed boolean := false;
  v_cards int;
begin
  select * into v_cafe from public.cafes where slug = p_cafe_slug;
  if not found then raise exception 'Café no encontrado'; end if;

  select * into v_customer from public.customers where public_id = p_public_id;
  if not found then raise exception 'Cliente no encontrado'; end if;

  select * into v_card
  from public.loyalty_cards
  where cafe_id = v_cafe.id and customer_id = v_customer.id
  for update;

  if not found then
    insert into public.loyalty_cards (cafe_id, customer_id, stamps_count, cards_completed)
    values (v_cafe.id, v_customer.id, 0, 0)
    returning * into v_card;
  end if;

  if v_card.stamps_count >= v_cafe.stamps_required then
    raise exception 'Cartón completo. Empieza un nuevo cartón para seguir sumando.';
  end if;

  v_new_count := v_card.stamps_count + 1;
  v_cards := v_card.cards_completed;

  if v_new_count >= v_cafe.stamps_required then
    v_new_count := v_cafe.stamps_required;
    v_completed := true;
    v_cards := v_card.cards_completed + 1;
  end if;

  update public.loyalty_cards
  set stamps_count = v_new_count,
      cards_completed = v_cards,
      updated_at = now()
  where id = v_card.id;

  insert into public.stamp_events (cafe_id, customer_id, public_id, nfc_request_id)
  values (v_cafe.id, v_customer.id, v_customer.public_id, null);

  return json_build_object(
    'public_id', v_customer.public_id,
    'stamps_count', v_new_count,
    'stamps_required', v_cafe.stamps_required,
    'cards_completed', v_cards,
    'card_completed', v_completed,
    'cafe_name', v_cafe.name
  );
end;
$$;

-- ——— Aprobar NFC: misma lógica de cartón completo ———
create or replace function public.approve_nfc_stamp(p_request_id uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_req public.nfc_requests%rowtype;
  v_card public.loyalty_cards%rowtype;
  v_required int;
  v_new_count int;
  v_completed boolean := false;
  v_cards int;
begin
  select * into v_req from public.nfc_requests where id = p_request_id for update;
  if not found then raise exception 'Petición no encontrada'; end if;
  if v_req.status <> 'esperando' then raise exception 'La petición ya fue resuelta'; end if;

  select stamps_required into v_required from public.cafes where id = v_req.cafe_id;

  select * into v_card
  from public.loyalty_cards
  where cafe_id = v_req.cafe_id and customer_id = v_req.customer_id
  for update;

  if not found then
    insert into public.loyalty_cards (cafe_id, customer_id, stamps_count, cards_completed)
    values (v_req.cafe_id, v_req.customer_id, 0, 0)
    returning * into v_card;
  end if;

  if v_card.stamps_count >= v_required then
    raise exception 'Cartón completo. Empieza un nuevo cartón para seguir sumando.';
  end if;

  v_new_count := v_card.stamps_count + 1;
  v_cards := v_card.cards_completed;

  if v_new_count >= v_required then
    v_new_count := v_required;
    v_completed := true;
    v_cards := v_card.cards_completed + 1;
  end if;

  update public.loyalty_cards
  set stamps_count = v_new_count,
      cards_completed = v_cards,
      updated_at = now()
  where id = v_card.id;

  update public.nfc_requests
  set status = 'aprobado', resolved_at = now()
  where id = v_req.id;

  insert into public.stamp_events (cafe_id, customer_id, public_id, nfc_request_id)
  values (v_req.cafe_id, v_req.customer_id, v_req.public_id, v_req.id);

  return json_build_object(
    'public_id', v_req.public_id,
    'stamps_count', v_new_count,
    'stamps_required', v_required,
    'cards_completed', v_cards,
    'card_completed', v_completed
  );
end;
$$;

-- ——— Empezar un nuevo cartón (tras completar el anterior) ———
create or replace function public.start_new_card(
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
begin
  select * into v_cafe from public.cafes where slug = p_cafe_slug;
  if not found then raise exception 'Café no encontrado'; end if;

  select * into v_customer from public.customers where public_id = p_public_id;
  if not found then raise exception 'Cliente no encontrado'; end if;

  select * into v_card
  from public.loyalty_cards
  where cafe_id = v_cafe.id and customer_id = v_customer.id
  for update;

  if not found then raise exception 'Tarjeta no encontrada'; end if;

  if v_card.stamps_count < v_cafe.stamps_required then
    raise exception 'El cartón aún no está completo.';
  end if;

  update public.loyalty_cards
  set stamps_count = 0,
      updated_at = now()
  where id = v_card.id;

  return json_build_object(
    'public_id', v_customer.public_id,
    'stamps_count', 0,
    'stamps_required', v_cafe.stamps_required,
    'cards_completed', v_card.cards_completed,
    'card_completed', false
  );
end;
$$;

grant execute on function public.add_stamp_by_public_id(text, text) to anon, authenticated;
grant execute on function public.approve_nfc_stamp(uuid) to anon, authenticated;
grant execute on function public.start_new_card(text, text) to anon, authenticated;
