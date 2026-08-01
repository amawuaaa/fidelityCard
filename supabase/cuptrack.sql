-- =============================================================================
-- CupTrack — Source of truth (schema + RLS + RPCs + demos)
-- =============================================================================
-- Ejecuta TODO este archivo UNA VEZ (o re-ejecuta: es idempotente).
-- Sustituye la cadena de scripts viejos (schema → secure → multi → demo).
--
-- Después, en query SEPARADA:
--   select public.link_staff_by_email('tu@email.com', 'cafe-demo', 'owner');
-- =============================================================================

create extension if not exists "pgcrypto";

-- ——— Tablas ———
create table if not exists public.cafes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  brand_color text not null default '#178e3c',
  stamps_required int not null default 6 check (stamps_required > 0),
  created_at timestamptz not null default now()
);

alter table public.cafes
  add column if not exists tagline text,
  add column if not exists reward_label text,
  add column if not exists theme_style text;

update public.cafes set theme_style = 'solid' where theme_style is null;
alter table public.cafes alter column theme_style set default 'solid';

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  created_at timestamptz not null default now()
);

alter table public.customers
  add column if not exists claim_token text;

create table if not exists public.loyalty_cards (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  stamps_count int not null default 0 check (stamps_count >= 0),
  updated_at timestamptz not null default now(),
  unique (cafe_id, customer_id)
);

alter table public.loyalty_cards
  add column if not exists cards_completed int not null default 0,
  add column if not exists short_code text;

create unique index if not exists loyalty_cards_cafe_short_code_uidx
  on public.loyalty_cards (cafe_id, short_code)
  where short_code is not null;

create table if not exists public.nfc_requests (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  public_id text not null,
  status text not null default 'esperando'
    check (status in ('esperando', 'aprobado', 'rechazado')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists nfc_requests_pending_idx
  on public.nfc_requests (cafe_id, status, created_at);

create table if not exists public.stamp_events (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  public_id text not null,
  nfc_request_id uuid references public.nfc_requests (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.cafe_staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cafe_id uuid not null references public.cafes (id) on delete cascade,
  role text not null default 'barista'
    check (role in ('barista', 'owner')),
  created_at timestamptz not null default now(),
  unique (user_id, cafe_id)
);

create index if not exists cafe_staff_user_idx on public.cafe_staff (user_id);

-- ——— Helpers ———
create or replace function public.is_staff_of_cafe(p_cafe_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.cafe_staff
    where user_id = auth.uid() and cafe_id = p_cafe_id
  );
$$;

create or replace function public.require_barista()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autorizado. Inicia sesión como barista.';
  end if;
end;
$$;

create or replace function public.require_barista_for_cafe(p_cafe_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'No autorizado. Inicia sesión como barista.';
  end if;

  select role into v_role
  from public.cafe_staff
  where user_id = auth.uid() and cafe_id = p_cafe_id
  limit 1;

  if v_role is null then
    raise exception 'No tienes acceso a este café.';
  end if;

  return v_role;
end;
$$;

-- ——— RLS ———
alter table public.cafes enable row level security;
alter table public.customers enable row level security;
alter table public.loyalty_cards enable row level security;
alter table public.nfc_requests enable row level security;
alter table public.stamp_events enable row level security;
alter table public.cafe_staff enable row level security;

-- Quitar políticas demo abiertas
drop policy if exists "demo_cafes_select" on public.cafes;
drop policy if exists "demo_customers_all" on public.customers;
drop policy if exists "demo_loyalty_all" on public.loyalty_cards;
drop policy if exists "demo_nfc_all" on public.nfc_requests;
drop policy if exists "demo_stamp_events_all" on public.stamp_events;
drop policy if exists "nfc_select_all" on public.nfc_requests;
drop policy if exists "nfc_insert_all" on public.nfc_requests;
drop policy if exists "nfc_update_auth" on public.nfc_requests;
drop policy if exists "staff_select_own" on public.cafe_staff;
drop policy if exists "cafes_select" on public.cafes;
drop policy if exists "customers_select_auth" on public.customers;
drop policy if exists "loyalty_select_read" on public.loyalty_cards;
drop policy if exists "nfc_select_read" on public.nfc_requests;
drop policy if exists "stamp_select_staff" on public.stamp_events;

create policy "cafes_select" on public.cafes
  for select to anon, authenticated using (true);

-- Lecturas: cliente solo vía RPC (polling). Staff: Realtime + SELECT de su café.
drop policy if exists "loyalty_select_anon" on public.loyalty_cards;
drop policy if exists "loyalty_select_staff" on public.loyalty_cards;
drop policy if exists "nfc_select_anon_recent" on public.nfc_requests;
drop policy if exists "nfc_select_staff" on public.nfc_requests;

create policy "loyalty_select_staff" on public.loyalty_cards
  for select to authenticated
  using (public.is_staff_of_cafe(cafe_id));

create policy "nfc_select_staff" on public.nfc_requests
  for select to authenticated
  using (public.is_staff_of_cafe(cafe_id));

create policy "stamp_select_staff" on public.stamp_events
  for select to authenticated using (public.is_staff_of_cafe(cafe_id));

create policy "staff_select_own" on public.cafe_staff
  for select to authenticated using (user_id = auth.uid());

-- Sin INSERT/UPDATE/DELETE directos: mutaciones solo vía RPC security definer
revoke all on table public.cafes from anon, authenticated;
revoke all on table public.customers from anon, authenticated;
revoke all on table public.loyalty_cards from anon, authenticated;
revoke all on table public.nfc_requests from anon, authenticated;
revoke all on table public.stamp_events from anon, authenticated;
revoke all on table public.cafe_staff from anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select on table public.cafes to anon, authenticated;
grant select on table public.loyalty_cards to authenticated;
grant select on table public.nfc_requests to authenticated;
grant select on table public.stamp_events to authenticated;
grant select on table public.cafe_staff to authenticated;

create unique index if not exists nfc_one_pending_per_customer
  on public.nfc_requests (cafe_id, customer_id)
  where status = 'esperando';

create or replace function public.is_valid_public_id(p_public_id text)
returns boolean
language sql
immutable
as $$
  select p_public_id is not null
    and p_public_id ~ '^usr_[a-zA-Z0-9]{5,40}$';
$$;

-- Token de canje sin depender de pgcrypto.gen_random_bytes
create or replace function public.new_claim_token()
returns text
language sql
volatile
as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
$$;

revoke all on function public.new_claim_token() from public, anon, authenticated;

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
      select 1 from public.loyalty_cards
      where cafe_id = p_cafe_id and short_code = v_code
    );

    if v_try > 80 then
      raise exception 'No se pudo asignar código corto';
    end if;
  end loop;

  return v_code;
end;
$$;

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
    if not found then raise exception 'Cliente no encontrado'; end if;
    return v_customer;
  end if;

  if public.is_valid_short_code(v_raw) then
    select c.* into v_customer
    from public.customers c
    join public.loyalty_cards lc on lc.customer_id = c.id
    where lc.cafe_id = p_cafe_id and lc.short_code = v_raw
    limit 1;
    if not found then raise exception 'Cliente no encontrado'; end if;
    return v_customer;
  end if;

  raise exception 'ID de cliente no válido';
end;
$$;

revoke all on function public.allocate_short_code(uuid) from public, anon, authenticated;
revoke all on function public.resolve_customer_in_cafe(uuid, text) from public, anon, authenticated;

-- ——— RPCs públicos (cliente) ———
create or replace function public.get_cafe_by_slug(p_slug text)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_cafe public.cafes%rowtype;
begin
  select * into v_cafe from public.cafes where slug = p_slug;
  if not found then raise exception 'Café no encontrado'; end if;

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
      v_cafe.id, v_customer.id, 0, 0, public.allocate_short_code(v_cafe.id)
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

  update public.nfc_requests
  set status = 'rechazado', resolved_at = now()
  where cafe_id = v_cafe_id
    and customer_id = v_customer_id
    and status = 'esperando'
    and created_at < now() - interval '2 hours';

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
  where id = p_request_id and public_id = p_public_id;

  if not found then raise exception 'Petición no encontrada'; end if;

  return json_build_object(
    'id', v_req.id,
    'status', v_req.status,
    'resolved_at', v_req.resolved_at
  );
end;
$$;

-- ——— RPCs staff ———
create or replace function public.link_staff_by_email(
  p_email text,
  p_cafe_slug text,
  p_role text default 'barista'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_cafe_id uuid;
begin
  if p_role not in ('barista', 'owner') then
    raise exception 'Rol inválido';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower(p_email)
  limit 1;

  if v_user_id is null then
    raise exception 'Usuario Auth no encontrado para %', p_email;
  end if;

  select id into v_cafe_id from public.cafes where slug = p_cafe_slug;
  if v_cafe_id is null then
    raise exception 'Café no encontrado: %', p_cafe_slug;
  end if;

  insert into public.cafe_staff (user_id, cafe_id, role)
  values (v_user_id, v_cafe_id, p_role)
  on conflict (user_id, cafe_id) do update set role = excluded.role;

  return json_build_object(
    'user_id', v_user_id,
    'cafe_id', v_cafe_id,
    'role', p_role,
    'cafe_slug', p_cafe_slug
  );
end;
$$;

create or replace function public.get_my_cafe()
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_row record;
begin
  if auth.uid() is null then
    raise exception 'No autorizado. Inicia sesión como barista.';
  end if;

  select
    c.id, c.name, c.slug, c.brand_color, c.stamps_required,
    c.tagline, c.reward_label, c.theme_style, s.role
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

create or replace function public.get_cafe_metrics()
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_cafe_id uuid;
  v_role text;
  v_stamps_today int;
  v_cards_completed int;
  v_active_customers int;
  v_pending_nfc int;
begin
  if auth.uid() is null then raise exception 'No autorizado.'; end if;

  select s.cafe_id, s.role into v_cafe_id, v_role
  from public.cafe_staff s
  where s.user_id = auth.uid()
  order by s.created_at asc
  limit 1;

  if v_cafe_id is null then raise exception 'Sin café asignado.'; end if;

  select count(*)::int into v_stamps_today
  from public.stamp_events
  where cafe_id = v_cafe_id and created_at >= date_trunc('day', now());

  select coalesce(sum(cards_completed), 0)::int into v_cards_completed
  from public.loyalty_cards where cafe_id = v_cafe_id;

  select count(*)::int into v_active_customers
  from public.loyalty_cards
  where cafe_id = v_cafe_id and (stamps_count > 0 or cards_completed > 0);

  select count(*)::int into v_pending_nfc
  from public.nfc_requests
  where cafe_id = v_cafe_id and status = 'esperando';

  return json_build_object(
    'role', v_role,
    'stamps_today', v_stamps_today,
    'cards_completed_total', v_cards_completed,
    'active_customers', v_active_customers,
    'pending_nfc', v_pending_nfc
  );
end;
$$;

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

create or replace function public.approve_nfc_stamp(p_request_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.nfc_requests%rowtype;
  v_card public.loyalty_cards%rowtype;
  v_required int;
  v_new_count int;
  v_completed boolean := false;
  v_cards int;
  v_auto_new boolean := false;
begin
  select * into v_req from public.nfc_requests where id = p_request_id for update;
  if not found then raise exception 'Petición no encontrada'; end if;
  if v_req.status <> 'esperando' then raise exception 'La petición ya fue resuelta'; end if;

  perform public.require_barista_for_cafe(v_req.cafe_id);
  select stamps_required into v_required from public.cafes where id = v_req.cafe_id;

  select * into v_card
  from public.loyalty_cards
  where cafe_id = v_req.cafe_id and customer_id = v_req.customer_id
  for update;

  if not found then
    insert into public.loyalty_cards (
      cafe_id, customer_id, stamps_count, cards_completed, short_code
    )
    values (
      v_req.cafe_id, v_req.customer_id, 0, 0,
      public.allocate_short_code(v_req.cafe_id)
    )
    returning * into v_card;
  end if;

  if v_card.stamps_count >= v_required then
    v_card.stamps_count := 0;
    v_auto_new := true;
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
    'short_code', v_card.short_code,
    'stamps_count', v_new_count,
    'stamps_required', v_required,
    'cards_completed', v_cards,
    'card_completed', v_completed,
    'auto_started_new_card', v_auto_new
  );
end;
$$;

create or replace function public.reject_nfc_stamp(p_request_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cafe_id uuid;
  v_updated int;
begin
  select cafe_id into v_cafe_id from public.nfc_requests where id = p_request_id;
  if v_cafe_id is null then
    raise exception 'Petición no encontrada o ya resuelta';
  end if;

  perform public.require_barista_for_cafe(v_cafe_id);

  update public.nfc_requests
  set status = 'rechazado', resolved_at = now()
  where id = p_request_id and status = 'esperando';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Petición no encontrada o ya resuelta';
  end if;

  return json_build_object('ok', true);
end;
$$;

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

create or replace function public.cancel_nfc_request(
  p_request_id uuid,
  p_public_id text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  if p_public_id is null or p_public_id !~ '^usr_[0-9a-zA-Z]{5,40}$' then
    raise exception 'ID de cliente no válido';
  end if;

  update public.nfc_requests
  set status = 'rechazado',
      resolved_at = now()
  where id = p_request_id
    and public_id = p_public_id
    and status = 'esperando';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Petición no encontrada o ya resuelta';
  end if;

  return json_build_object('ok', true, 'cancelled', true);
end;
$$;

-- ——— Grants RPC ———
revoke all on function public.link_staff_by_email(text, text, text) from public, anon, authenticated;
revoke all on function public.require_barista() from public, anon, authenticated;
revoke all on function public.require_barista_for_cafe(uuid) from public, anon, authenticated;
revoke all on function public.add_stamp_by_public_id(text, text) from public, anon, authenticated;
revoke all on function public.remove_stamp_by_public_id(text, text) from public, anon, authenticated;
revoke all on function public.approve_nfc_stamp(uuid) from public, anon, authenticated;
revoke all on function public.reject_nfc_stamp(uuid) from public, anon, authenticated;
revoke all on function public.cancel_nfc_request(uuid, text) from public, anon, authenticated;
revoke all on function public.get_my_cafe() from public, anon, authenticated;
revoke all on function public.get_cafe_metrics() from public, anon, authenticated;
revoke all on function public.get_customer_card(text) from public, anon, authenticated;

grant execute on function public.is_valid_public_id(text) to anon, authenticated;
grant execute on function public.is_valid_short_code(text) to anon, authenticated;
grant execute on function public.get_cafe_by_slug(text) to anon, authenticated;
grant execute on function public.ensure_customer_session(text, text) to anon, authenticated;
grant execute on function public.get_card_snapshot(text, text) to anon, authenticated;
grant execute on function public.get_nfc_request_status(uuid, text) to anon, authenticated;
grant execute on function public.create_nfc_request(text, text) to anon, authenticated;
grant execute on function public.cancel_nfc_request(uuid, text) to anon, authenticated;
grant execute on function public.start_new_card(text, text, text) to anon, authenticated;

grant execute on function public.link_staff_by_email(text, text, text) to postgres, service_role;
grant execute on function public.require_barista() to authenticated;
grant execute on function public.require_barista_for_cafe(uuid) to authenticated;
grant execute on function public.add_stamp_by_public_id(text, text) to authenticated;
grant execute on function public.remove_stamp_by_public_id(text, text) to authenticated;
grant execute on function public.approve_nfc_stamp(uuid) to authenticated;
grant execute on function public.reject_nfc_stamp(uuid) to authenticated;
grant execute on function public.get_my_cafe() to authenticated;
grant execute on function public.get_cafe_metrics() to authenticated;
grant execute on function public.get_customer_card(text) to authenticated;
grant execute on function public.is_staff_of_cafe(uuid) to anon, authenticated;

-- ——— Seeds demo ———
insert into public.cafes (name, slug, brand_color, stamps_required, tagline, reward_label, theme_style)
values
  ('Café Demo', 'cafe-demo', '#178e3c', 6, 'Especialidad de barrio', '1 café gratis', 'solid'),
  ('Bean & Co', 'bean-co', '#B45309', 6, 'Espresso & community', '1 bebida a elegir', 'solid'),
  ('Norte', 'norte', '#0E7490', 8, 'Origen y tueste', '1 filter gratis', 'solid'),
  ('the Layers', 'layers', '#EF4444', 6, 'Café con capas de color', '1 café gratis', 'rainbow'),
  ('ETMA Bakery', 'etma', '#44403C', 8, 'Bagels & breakfast', '1 café o bagel', 'bakery')
on conflict (slug) do update set
  name = excluded.name,
  brand_color = excluded.brand_color,
  stamps_required = excluded.stamps_required,
  tagline = excluded.tagline,
  reward_label = excluded.reward_label,
  theme_style = excluded.theme_style;

-- Realtime
do $$
begin
  begin
    alter publication supabase_realtime add table public.nfc_requests;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.loyalty_cards;
  exception when duplicate_object then null;
  end;
end $$;

-- =============================================================================
-- PASO FINAL (query NUEVA):
-- select public.link_staff_by_email('tu@email.com', 'cafe-demo', 'owner');
-- =============================================================================
