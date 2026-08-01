-- =============================================================================
-- CupTrack — Hardening v2 (para piloto / mañana)
-- Ejecuta DESPUÉS de cuptrack.sql (+ remove_stamp.sql si aplica).
-- Idempotente.
-- =============================================================================
-- 1) IDs cliente: acepta usr_ antiguos (dígitos) y nuevos (hex largo)
-- 2) 1 NFC pendiente por cliente+café + caducidad 2h
-- 3) start_new_card con validación + cooldown
-- 4) RLS lecturas más estrictas
-- =============================================================================

-- Validación compartida de public_id
create or replace function public.is_valid_public_id(p_public_id text)
returns boolean
language sql
immutable
as $$
  select p_public_id is not null
    and p_public_id ~ '^usr_[a-zA-Z0-9]{5,40}$';
$$;

grant execute on function public.is_valid_public_id(text) to anon, authenticated;

-- Índice: como máximo 1 petición "esperando" por cliente en un café
create unique index if not exists nfc_one_pending_per_customer
  on public.nfc_requests (cafe_id, customer_id)
  where status = 'esperando';

-- ——— ensure_customer_session (IDs largos) ———
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
    insert into public.customers (public_id)
    values (p_public_id)
    returning * into v_customer;
  end if;

  select * into v_card
  from public.loyalty_cards
  where cafe_id = v_cafe.id and customer_id = v_customer.id;

  if not found then
    insert into public.loyalty_cards (
      cafe_id, customer_id, stamps_count, cards_completed
    )
    values (v_cafe.id, v_customer.id, 0, 0)
    returning * into v_card;
  end if;

  return json_build_object(
    'public_id', v_customer.public_id,
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

-- ——— create_nfc_request: dedupe + caducar viejas ———
create or replace function public.create_nfc_request(
  p_cafe_slug text,
  p_public_id text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session json;
  v_cafe_id uuid;
  v_customer_id uuid;
  v_req_id uuid;
begin
  v_session := public.ensure_customer_session(p_cafe_slug, p_public_id);
  v_cafe_id := (v_session->>'cafe_id')::uuid;
  v_customer_id := (v_session->>'customer_id')::uuid;

  -- Caduca pendientes > 2h
  update public.nfc_requests
  set status = 'rechazado', resolved_at = now()
  where cafe_id = v_cafe_id
    and customer_id = v_customer_id
    and status = 'esperando'
    and created_at < now() - interval '2 hours';

  -- Reutiliza pendiente activa
  select id into v_req_id
  from public.nfc_requests
  where cafe_id = v_cafe_id
    and customer_id = v_customer_id
    and status = 'esperando'
  order by created_at desc
  limit 1;

  if v_req_id is not null then
    return json_build_object('id', v_req_id, 'reused', true);
  end if;

  insert into public.nfc_requests (
    cafe_id, customer_id, public_id, status
  )
  values (
    v_cafe_id,
    v_customer_id,
    v_session->>'public_id',
    'esperando'
  )
  returning id into v_req_id;

  return json_build_object('id', v_req_id, 'reused', false);
exception
  when unique_violation then
    select id into v_req_id
    from public.nfc_requests
    where cafe_id = v_cafe_id
      and customer_id = v_customer_id
      and status = 'esperando'
    limit 1;
    return json_build_object('id', v_req_id, 'reused', true);
end;
$$;

-- ——— start_new_card: validación + cooldown 10s ———
create or replace function public.start_new_card(
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
  if not found then raise exception 'Cliente no encontrado'; end if;

  select * into v_card
  from public.loyalty_cards
  where cafe_id = v_cafe.id and customer_id = v_customer.id
  for update;

  if not found then raise exception 'Tarjeta no encontrada'; end if;

  if v_card.stamps_count = 0 then
    return json_build_object(
      'public_id', v_customer.public_id,
      'stamps_count', 0,
      'stamps_required', v_cafe.stamps_required,
      'cards_completed', v_card.cards_completed,
      'card_completed', false,
      'already_reset', true
    );
  end if;

  if v_card.stamps_count < v_cafe.stamps_required then
    raise exception 'El cartón aún no está completo.';
  end if;

  if v_card.updated_at > now() - interval '10 seconds' then
    raise exception 'Espera unos segundos antes de reiniciar el cartón.';
  end if;

  update public.loyalty_cards
  set stamps_count = 0, updated_at = now()
  where id = v_card.id;

  return json_build_object(
    'public_id', v_customer.public_id,
    'stamps_count', 0,
    'stamps_required', v_cafe.stamps_required,
    'cards_completed', v_card.cards_completed,
    'card_completed', false,
    'already_reset', false
  );
end;
$$;

-- ——— RLS lecturas ———
drop policy if exists "customers_select_auth" on public.customers;
drop policy if exists "loyalty_select_read" on public.loyalty_cards;
drop policy if exists "nfc_select_read" on public.nfc_requests;
drop policy if exists "loyalty_select_anon" on public.loyalty_cards;
drop policy if exists "loyalty_select_staff" on public.loyalty_cards;
drop policy if exists "nfc_select_anon_recent" on public.nfc_requests;
drop policy if exists "nfc_select_staff" on public.nfc_requests;

revoke select on table public.customers from authenticated;

-- Tarjetas: anon (Realtime cliente) + staff solo su café
create policy "loyalty_select_anon" on public.loyalty_cards
  for select to anon using (true);

create policy "loyalty_select_staff" on public.loyalty_cards
  for select to authenticated
  using (public.is_staff_of_cafe(cafe_id));

-- NFC: anon solo pendientes o resueltas hace < 15 min (Realtime del cliente)
create policy "nfc_select_anon_recent" on public.nfc_requests
  for select to anon using (
    status = 'esperando'
    or (resolved_at is not null and resolved_at > now() - interval '15 minutes')
  );

create policy "nfc_select_staff" on public.nfc_requests
  for select to authenticated
  using (public.is_staff_of_cafe(cafe_id));

-- Caducar NFC huérfanas antiguas (limpieza global ligera)
update public.nfc_requests
set status = 'rechazado', resolved_at = now()
where status = 'esperando'
  and created_at < now() - interval '2 hours';
