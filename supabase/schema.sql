-- =============================================================================
-- LEGACY — No usar en proyectos nuevos.
-- Fuente de verdad: supabase/cuptrack.sql
-- =============================================================================
-- Stamp — Schema multi-cafetería (Supabase / PostgreSQL)
-- =============================================================================

-- Extensión UUID
create extension if not exists "pgcrypto";

-- ——— Cafeterías (multi-tenant) ———
create table if not exists public.cafes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  brand_color text not null default '#178e3c',
  stamps_required int not null default 6 check (stamps_required > 0),
  created_at timestamptz not null default now()
);

-- ——— Clientes anónimos (ID del dispositivo / public_id) ———
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  created_at timestamptz not null default now()
);

-- ——— Tarjeta de fidelidad (sellos por café + cliente) ———
create table if not exists public.loyalty_cards (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  stamps_count int not null default 0 check (stamps_count >= 0),
  updated_at timestamptz not null default now(),
  unique (cafe_id, customer_id)
);

-- ——— Peticiones NFC pendientes de aprobación del barista ———
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

-- ——— Historial de puntos aprobados ———
create table if not exists public.stamp_events (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  public_id text not null,
  nfc_request_id uuid references public.nfc_requests (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Café demo inicial (puedes duplicar filas para más cafeterías)
insert into public.cafes (name, slug, brand_color, stamps_required)
values ('Café Demo', 'cafe-demo', '#178e3c', 6)
on conflict (slug) do nothing;

-- ——— RPC: aprobar sello de forma atómica ———
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
begin
  select * into v_req
  from public.nfc_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Petición no encontrada';
  end if;

  if v_req.status <> 'esperando' then
    raise exception 'La petición ya fue resuelta';
  end if;

  select stamps_required into v_required
  from public.cafes
  where id = v_req.cafe_id;

  select * into v_card
  from public.loyalty_cards
  where cafe_id = v_req.cafe_id
    and customer_id = v_req.customer_id
  for update;

  if not found then
    insert into public.loyalty_cards (cafe_id, customer_id, stamps_count)
    values (v_req.cafe_id, v_req.customer_id, 0)
    returning * into v_card;
  end if;

  -- Ciclo: al llegar al máximo, vuelve a 0 (café gratis canjeado)
  v_new_count := v_card.stamps_count + 1;
  if v_new_count >= v_required then
    v_new_count := 0;
  end if;

  update public.loyalty_cards
  set stamps_count = v_new_count,
      updated_at = now()
  where id = v_card.id;

  update public.nfc_requests
  set status = 'aprobado',
      resolved_at = now()
  where id = v_req.id;

  insert into public.stamp_events (cafe_id, customer_id, public_id, nfc_request_id)
  values (v_req.cafe_id, v_req.customer_id, v_req.public_id, v_req.id);

  return json_build_object(
    'public_id', v_req.public_id,
    'stamps_count', v_new_count,
    'stamps_required', v_required
  );
end;
$$;

-- ——— RLS (demo abierta con anon key; endurecer en producción) ———
alter table public.cafes enable row level security;
alter table public.customers enable row level security;
alter table public.loyalty_cards enable row level security;
alter table public.nfc_requests enable row level security;
alter table public.stamp_events enable row level security;

-- Políticas permisivas para la demo (idempotente: se pueden re-ejecutar)
drop policy if exists "demo_cafes_select" on public.cafes;
drop policy if exists "demo_customers_all" on public.customers;
drop policy if exists "demo_loyalty_all" on public.loyalty_cards;
drop policy if exists "demo_nfc_all" on public.nfc_requests;
drop policy if exists "demo_stamp_events_all" on public.stamp_events;

create policy "demo_cafes_select" on public.cafes for select using (true);
create policy "demo_customers_all" on public.customers for all using (true) with check (true);
create policy "demo_loyalty_all" on public.loyalty_cards for all using (true) with check (true);
create policy "demo_nfc_all" on public.nfc_requests for all using (true) with check (true);
create policy "demo_stamp_events_all" on public.stamp_events for all using (true) with check (true);

grant usage on schema public to anon, authenticated;
grant select on public.cafes to anon, authenticated;
grant all on public.customers to anon, authenticated;
grant all on public.loyalty_cards to anon, authenticated;
grant all on public.nfc_requests to anon, authenticated;
grant all on public.stamp_events to anon, authenticated;
grant execute on function public.approve_nfc_stamp(uuid) to anon, authenticated;

-- ——— RPC: añadir sello por QR / búsqueda manual ———
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

-- Realtime (idempotente: ignora si la tabla ya está en la publication)
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
