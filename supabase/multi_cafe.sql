-- =============================================================================
-- Stamp — Multi-café + roles + métricas
-- Ejecuta UNA VEZ en Supabase SQL Editor (después de secure_admin.sql).
-- =============================================================================
--
-- Tras crear el usuario barista en Auth, vincúlalo a un café:
--
--   select public.link_staff_by_email(
--     'barista@tucafe.com',  -- email del usuario Auth
--     'cafe-demo',           -- slug del café
--     'owner'                -- 'owner' | 'barista'
--   );
--
-- =============================================================================

-- Staff: un usuario Auth pertenece a uno o más cafés
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

alter table public.cafe_staff enable row level security;

drop policy if exists "staff_select_own" on public.cafe_staff;
create policy "staff_select_own" on public.cafe_staff
  for select to authenticated
  using (user_id = auth.uid());

-- Vincular email Auth → café (ejecutar como dueño del proyecto / SQL editor)
create or replace function public.link_staff_by_email(
  p_email text,
  p_cafe_slug text,
  p_role text default 'barista'
)
returns json
language plpgsql
security definer
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

grant execute on function public.link_staff_by_email(text, text, text) to postgres, service_role;

-- Café del barista logueado
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
    'role', v_row.role
  );
end;
$$;

grant execute on function public.get_my_cafe() to authenticated;

-- Métricas del café del staff
create or replace function public.get_cafe_metrics()
returns json
language plpgsql
security definer
stable
as $$
declare
  v_cafe_id uuid;
  v_role text;
  v_stamps_today int;
  v_cards_completed int;
  v_active_customers int;
  v_pending_nfc int;
begin
  if auth.uid() is null then
    raise exception 'No autorizado.';
  end if;

  select s.cafe_id, s.role into v_cafe_id, v_role
  from public.cafe_staff s
  where s.user_id = auth.uid()
  order by s.created_at asc
  limit 1;

  if v_cafe_id is null then
    raise exception 'Sin café asignado.';
  end if;

  select count(*)::int into v_stamps_today
  from public.stamp_events
  where cafe_id = v_cafe_id
    and created_at >= date_trunc('day', now());

  select coalesce(sum(cards_completed), 0)::int into v_cards_completed
  from public.loyalty_cards
  where cafe_id = v_cafe_id;

  select count(*)::int into v_active_customers
  from public.loyalty_cards
  where cafe_id = v_cafe_id
    and (stamps_count > 0 or cards_completed > 0);

  select count(*)::int into v_pending_nfc
  from public.nfc_requests
  where cafe_id = v_cafe_id
    and status = 'esperando';

  return json_build_object(
    'role', v_role,
    'stamps_today', v_stamps_today,
    'cards_completed_total', v_cards_completed,
    'active_customers', v_active_customers,
    'pending_nfc', v_pending_nfc
  );
end;
$$;

grant execute on function public.get_cafe_metrics() to authenticated;

-- Café público por slug (cliente)
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
    'stamps_required', v_cafe.stamps_required
  );
end;
$$;

grant execute on function public.get_cafe_by_slug(text) to anon, authenticated;

-- require_barista + debe pertenecer al café de la operación
create or replace function public.require_barista_for_cafe(p_cafe_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'No autorizado. Inicia sesión como barista.';
  end if;

  select role into v_role
  from public.cafe_staff
  where user_id = auth.uid()
    and cafe_id = p_cafe_id
  limit 1;

  if v_role is null then
    raise exception 'No tienes acceso a este café.';
  end if;

  return v_role;
end;
$$;

grant execute on function public.require_barista_for_cafe(uuid) to authenticated;

-- add_stamp: usa el café del staff (ignora slug malicioso)
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

  -- Si mandan slug, debe coincidir con su café
  if p_cafe_slug is not null and p_cafe_slug <> '' and p_cafe_slug <> v_cafe.slug then
    raise exception 'No puedes operar sobre otro café.';
  end if;

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
    'stamps_count', v_new_count,
    'stamps_required', v_cafe.stamps_required,
    'cards_completed', v_cards,
    'card_completed', v_completed,
    'auto_started_new_card', v_auto_new,
    'cafe_name', v_cafe.name
  );
end;
$$;

-- approve NFC: solo si la petición es del café del staff
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
    insert into public.loyalty_cards (cafe_id, customer_id, stamps_count, cards_completed)
    values (v_req.cafe_id, v_req.customer_id, 0, 0)
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
as $$
declare
  v_cafe_id uuid;
  v_updated int;
begin
  select cafe_id into v_cafe_id
  from public.nfc_requests
  where id = p_request_id;

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

-- Segundo café de ejemplo (opcional, para demo multi-café)
insert into public.cafes (name, slug, brand_color, stamps_required)
values ('Bean & Co', 'bean-co', '#178e3c', 6)
on conflict (slug) do nothing;
