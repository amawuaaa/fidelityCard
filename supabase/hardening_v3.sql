-- =============================================================================
-- CupTrack — Hardening v3 (seguridad + código corto de caja)
-- Ejecuta DESPUÉS de cuptrack.sql (+ v2 / cancel_nfc / remove_stamp si aplica).
-- Idempotente.
-- =============================================================================
-- 1) Sin SELECT anónimo de tarjetas / NFC (cierra listados por API)
-- 2) claim_token: solo el móvil del cliente puede reiniciar su cartón
-- 3) short_code 4 dígitos por café: fácil de dictar si falla el QR
-- 4) RPCs de lectura para el cliente (polling) en lugar de Realtime anon
-- =============================================================================

-- ——— Columnas nuevas ———
alter table public.customers
  add column if not exists claim_token text;

alter table public.loyalty_cards
  add column if not exists short_code text;

create unique index if not exists loyalty_cards_cafe_short_code_uidx
  on public.loyalty_cards (cafe_id, short_code)
  where short_code is not null;

-- Backfill claim_token
update public.customers
set claim_token = encode(gen_random_bytes(8), 'hex')
where claim_token is null;

-- Backfill short_code (4 dígitos) por tarjeta
do $$
declare
  r record;
  v_code text;
  v_try int;
begin
  for r in
    select id, cafe_id from public.loyalty_cards where short_code is null
  loop
    v_try := 0;
    loop
      v_try := v_try + 1;
      v_code := lpad((floor(random() * 10000))::int::text, 4, '0');
      begin
        update public.loyalty_cards
        set short_code = v_code
        where id = r.id;
        exit;
      exception
        when unique_violation then
          if v_try >= 40 then
            -- fallback 5 dígitos si el café está muy lleno
            v_code := lpad((floor(random() * 100000))::int::text, 5, '0');
            update public.loyalty_cards
            set short_code = v_code
            where id = r.id;
            exit;
          end if;
      end;
    end loop;
  end loop;
end;
$$;

-- ——— Helpers ———
create or replace function public.is_valid_public_id(p_public_id text)
returns boolean
language sql
immutable
as $$
  select p_public_id is not null
    and p_public_id ~ '^usr_[a-zA-Z0-9]{5,40}$';
$$;

create or replace function public.is_valid_short_code(p_code text)
returns boolean
language sql
immutable
as $$
  select p_code is not null and p_code ~ '^[0-9]{4,5}$';
$$;

create or replace function public.allocate_short_code(p_cafe_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_try int := 0;
begin
  loop
    v_try := v_try + 1;
    if v_try <= 30 then
      v_code := lpad((floor(random() * 10000))::int::text, 4, '0');
    else
      v_code := lpad((floor(random() * 100000))::int::text, 5, '0');
    end if;

    exit when not exists (
      select 1
      from public.loyalty_cards
      where cafe_id = p_cafe_id and short_code = v_code
    );

    if v_try > 80 then
      raise exception 'No se pudo asignar código corto';
    end if;
  end loop;

  return v_code;
end;
$$;

-- Resuelve usr_… o código corto dentro de un café
create or replace function public.resolve_customer_in_cafe(
  p_cafe_id uuid,
  p_code text
)
returns public.customers
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_customer public.customers%rowtype;
  v_raw text := trim(coalesce(p_code, ''));
begin
  if public.is_valid_public_id(v_raw) then
    select * into v_customer from public.customers where public_id = v_raw;
    if not found then
      raise exception 'Cliente no encontrado';
    end if;
    return v_customer;
  end if;

  if public.is_valid_short_code(v_raw) then
    select c.* into v_customer
    from public.customers c
    join public.loyalty_cards lc on lc.customer_id = c.id
    where lc.cafe_id = p_cafe_id
      and lc.short_code = v_raw
    limit 1;

    if not found then
      raise exception 'Cliente no encontrado';
    end if;
    return v_customer;
  end if;

  raise exception 'ID de cliente no válido';
end;
$$;

revoke all on function public.allocate_short_code(uuid) from public, anon, authenticated;
revoke all on function public.resolve_customer_in_cafe(uuid, text) from public, anon, authenticated;

-- ——— RLS: cerrar lecturas anónimas ———
drop policy if exists "loyalty_select_anon" on public.loyalty_cards;
drop policy if exists "nfc_select_anon_recent" on public.nfc_requests;
drop policy if exists "loyalty_select_staff" on public.loyalty_cards;
drop policy if exists "nfc_select_staff" on public.nfc_requests;

create policy "loyalty_select_staff" on public.loyalty_cards
  for select to authenticated
  using (public.is_staff_of_cafe(cafe_id));

create policy "nfc_select_staff" on public.nfc_requests
  for select to authenticated
  using (public.is_staff_of_cafe(cafe_id));

revoke select on table public.loyalty_cards from anon;
revoke select on table public.nfc_requests from anon;

grant select on table public.loyalty_cards to authenticated;
grant select on table public.nfc_requests to authenticated;

-- ——— ensure_customer_session (+ claim_token + short_code) ———
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
    values (p_public_id, encode(gen_random_bytes(8), 'hex'))
    returning * into v_customer;
  elsif v_customer.claim_token is null then
    update public.customers
    set claim_token = encode(gen_random_bytes(8), 'hex')
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

-- Snapshot para polling del cliente (sin crear filas nuevas)
create or replace function public.get_card_snapshot(
  p_cafe_slug text,
  p_public_id text
)
returns json
language plpgsql
security definer
stable
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
  where cafe_id = v_cafe.id and customer_id = v_customer.id;
  if not found then raise exception 'Tarjeta no encontrada'; end if;

  return json_build_object(
    'public_id', v_customer.public_id,
    'short_code', v_card.short_code,
    'customer_id', v_customer.id,
    'cafe_id', v_cafe.id,
    'stamps_count', v_card.stamps_count,
    'stamps_required', v_cafe.stamps_required,
    'cards_completed', coalesce(v_card.cards_completed, 0)
  );
end;
$$;

-- Estado NFC solo si el request pertenece a ese public_id
create or replace function public.get_nfc_request_status(
  p_request_id uuid,
  p_public_id text
)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_req public.nfc_requests%rowtype;
begin
  if not public.is_valid_public_id(p_public_id) then
    raise exception 'ID de cliente no válido';
  end if;

  select * into v_req
  from public.nfc_requests
  where id = p_request_id
    and public_id = p_public_id;

  if not found then
    raise exception 'Petición no encontrada';
  end if;

  return json_build_object(
    'id', v_req.id,
    'status', v_req.status,
    'resolved_at', v_req.resolved_at
  );
end;
$$;

-- start_new_card: staff autenticado O dueño con claim_token
drop function if exists public.start_new_card(text, text);

create or replace function public.start_new_card(
  p_cafe_slug text,
  p_public_id text,
  p_claim_token text default null
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
  v_staff_cafe_id uuid;
  v_is_staff boolean := false;
begin
  if not public.is_valid_public_id(p_public_id) then
    raise exception 'ID de cliente no válido';
  end if;

  select s.cafe_id into v_staff_cafe_id
  from public.cafe_staff s
  where s.user_id = auth.uid()
  order by s.created_at asc
  limit 1;

  if v_staff_cafe_id is not null then
    v_is_staff := true;
    select * into v_cafe from public.cafes where id = v_staff_cafe_id;
    if p_cafe_slug is not null and p_cafe_slug <> '' and p_cafe_slug <> v_cafe.slug then
      raise exception 'No puedes operar sobre otro café.';
    end if;
  else
    select * into v_cafe from public.cafes where slug = p_cafe_slug;
    if not found then raise exception 'Café no encontrado'; end if;
  end if;

  select * into v_customer from public.customers where public_id = p_public_id;
  if not found then raise exception 'Cliente no encontrado'; end if;

  if not v_is_staff then
    if p_claim_token is null
      or v_customer.claim_token is null
      or p_claim_token <> v_customer.claim_token then
      raise exception 'No autorizado para reiniciar este cartón.';
    end if;
  end if;

  select * into v_card
  from public.loyalty_cards
  where cafe_id = v_cafe.id and customer_id = v_customer.id
  for update;

  if not found then raise exception 'Tarjeta no encontrada'; end if;

  if v_card.stamps_count = 0 then
    return json_build_object(
      'public_id', v_customer.public_id,
      'short_code', v_card.short_code,
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
    'short_code', v_card.short_code,
    'stamps_count', 0,
    'stamps_required', v_cafe.stamps_required,
    'cards_completed', v_card.cards_completed,
    'card_completed', false,
    'already_reset', false
  );
end;
$$;

-- get_customer_card: acepta usr_… o código corto del café del staff
create or replace function public.get_customer_card(p_public_id text)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_cafe public.cafes%rowtype;
  v_customer public.customers%rowtype;
  v_card public.loyalty_cards%rowtype;
  v_staff_cafe_id uuid;
begin
  select s.cafe_id into v_staff_cafe_id
  from public.cafe_staff s
  where s.user_id = auth.uid()
  order by s.created_at asc
  limit 1;

  if v_staff_cafe_id is null then
    raise exception 'No autorizado o sin café asignado.';
  end if;

  select * into v_cafe from public.cafes where id = v_staff_cafe_id;
  v_customer := public.resolve_customer_in_cafe(v_cafe.id, p_public_id);

  select * into v_card
  from public.loyalty_cards
  where cafe_id = v_cafe.id and customer_id = v_customer.id;

  return json_build_object(
    'public_id', v_customer.public_id,
    'short_code', v_card.short_code,
    'customer_id', v_customer.id,
    'cafe_id', v_cafe.id,
    'cafe_name', v_cafe.name,
    'stamps_count', coalesce(v_card.stamps_count, 0),
    'stamps_required', v_cafe.stamps_required,
    'cards_completed', coalesce(v_card.cards_completed, 0)
  );
end;
$$;

-- add_stamp: resolve short code (misma lógica de cartón que cuptrack.sql)
create or replace function public.add_stamp_by_public_id(
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
  v_new_count int;
  v_completed boolean := false;
  v_cards int;
  v_auto_new boolean := false;
  v_staff_cafe_id uuid;
begin
  select s.cafe_id into v_staff_cafe_id
  from public.cafe_staff s
  where s.user_id = auth.uid()
  order by s.created_at asc
  limit 1;

  if v_staff_cafe_id is null then
    raise exception 'No autorizado o sin café asignado.';
  end if;

  perform public.require_barista_for_cafe(v_staff_cafe_id);
  select * into v_cafe from public.cafes where id = v_staff_cafe_id;

  if p_cafe_slug is not null and p_cafe_slug <> '' and p_cafe_slug <> v_cafe.slug then
    raise exception 'No puedes operar sobre otro café.';
  end if;

  v_customer := public.resolve_customer_in_cafe(v_cafe.id, p_public_id);

  select * into v_card
  from public.loyalty_cards
  where cafe_id = v_cafe.id and customer_id = v_customer.id
  for update;

  if not found then
    insert into public.loyalty_cards (
      cafe_id, customer_id, stamps_count, cards_completed, short_code
    )
    values (
      v_cafe.id, v_customer.id, 0, 0, public.allocate_short_code(v_cafe.id)
    )
    returning * into v_card;
  end if;

  if v_card.stamps_count >= v_cafe.stamps_required then
    v_card.stamps_count := 0;
    v_auto_new := true;
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
    'short_code', v_card.short_code,
    'stamps_count', v_new_count,
    'stamps_required', v_cafe.stamps_required,
    'cards_completed', v_cards,
    'card_completed', v_completed,
    'auto_started_new_card', v_auto_new,
    'cafe_name', v_cafe.name
  );
end;
$$;

-- remove_stamp: resolve short code
create or replace function public.remove_stamp_by_public_id(
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
  v_staff_cafe_id uuid;
  v_was_complete boolean;
  v_event_id uuid;
begin
  select s.cafe_id into v_staff_cafe_id
  from public.cafe_staff s
  where s.user_id = auth.uid()
  order by s.created_at asc
  limit 1;

  if v_staff_cafe_id is null then
    raise exception 'No autorizado o sin café asignado.';
  end if;

  perform public.require_barista_for_cafe(v_staff_cafe_id);
  select * into v_cafe from public.cafes where id = v_staff_cafe_id;

  if p_cafe_slug is not null and p_cafe_slug <> '' and p_cafe_slug <> v_cafe.slug then
    raise exception 'No puedes operar sobre otro café.';
  end if;

  v_customer := public.resolve_customer_in_cafe(v_cafe.id, p_public_id);

  select * into v_card
  from public.loyalty_cards
  where cafe_id = v_cafe.id and customer_id = v_customer.id
  for update;

  if not found then raise exception 'Tarjeta no encontrada'; end if;

  if v_card.stamps_count <= 0 then
    raise exception 'No hay sellos que quitar.';
  end if;

  v_was_complete := v_card.stamps_count >= v_cafe.stamps_required;

  update public.loyalty_cards
  set stamps_count = stamps_count - 1,
      cards_completed = case
        when v_was_complete and cards_completed > 0 then cards_completed - 1
        else cards_completed
      end,
      updated_at = now()
  where id = v_card.id
  returning * into v_card;

  select id into v_event_id
  from public.stamp_events
  where cafe_id = v_cafe.id and customer_id = v_customer.id
  order by created_at desc
  limit 1;

  if v_event_id is not null then
    delete from public.stamp_events where id = v_event_id;
  end if;

  return json_build_object(
    'public_id', v_customer.public_id,
    'short_code', v_card.short_code,
    'stamps_count', v_card.stamps_count,
    'stamps_required', v_cafe.stamps_required,
    'cards_completed', v_card.cards_completed,
    'card_completed', v_card.stamps_count >= v_cafe.stamps_required,
    'cafe_name', v_cafe.name
  );
end;
$$;

-- Grants
grant execute on function public.is_valid_public_id(text) to anon, authenticated;
grant execute on function public.is_valid_short_code(text) to anon, authenticated;
grant execute on function public.ensure_customer_session(text, text) to anon, authenticated;
grant execute on function public.get_card_snapshot(text, text) to anon, authenticated;
grant execute on function public.get_nfc_request_status(uuid, text) to anon, authenticated;
grant execute on function public.start_new_card(text, text, text) to anon, authenticated;
grant execute on function public.get_customer_card(text) to authenticated;
grant execute on function public.add_stamp_by_public_id(text, text) to authenticated;
grant execute on function public.remove_stamp_by_public_id(text, text) to authenticated;
