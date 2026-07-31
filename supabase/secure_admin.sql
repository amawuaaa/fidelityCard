-- =============================================================================
-- Stamp — Proteger acciones de admin (solo barista autenticado)
-- Ejecuta UNA VEZ en Supabase SQL Editor.
-- =============================================================================
--
-- 1) Authentication → Users → Add user
--    Crea: email del barista + password
-- 2) Authentication → Providers → Email habilitado
--    (opcional) desactiva "Allow new users to sign up" para que
--    nadie se registre solo desde la web
-- 3) Ejecuta este SQL
-- =============================================================================

-- Helper: exige sesión de Auth
create or replace function public.require_barista()
returns void
language plpgsql
security definer
as $$
begin
  if auth.uid() is null then
    raise exception 'No autorizado. Inicia sesión como barista.';
  end if;
end;
$$;

-- Rechazar petición NFC (solo barista)
create or replace function public.reject_nfc_stamp(p_request_id uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_updated int;
begin
  perform public.require_barista();

  update public.nfc_requests
  set status = 'rechazado',
      resolved_at = now()
  where id = p_request_id
    and status = 'esperando';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Petición no encontrada o ya resuelta';
  end if;

  return json_build_object('ok', true);
end;
$$;

-- Envolver funciones sensibles con require_barista (recreamos firmas existentes)
-- Nota: se mantienen create or replace con el check al inicio.

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
begin
  perform public.require_barista();

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
  perform public.require_barista();

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

-- start_new_card sigue disponible para el CLIENTE (anon) — sin require_barista

-- Quitar ejecución anónima a acciones de admin
revoke execute on function public.add_stamp_by_public_id(text, text) from anon, public;
revoke execute on function public.approve_nfc_stamp(uuid) from anon, public;
revoke execute on function public.reject_nfc_stamp(uuid) from anon, public;
revoke execute on function public.require_barista() from anon, public;

grant execute on function public.add_stamp_by_public_id(text, text) to authenticated;
grant execute on function public.approve_nfc_stamp(uuid) to authenticated;
grant execute on function public.reject_nfc_stamp(uuid) to authenticated;
grant execute on function public.require_barista() to authenticated;

-- El cliente sigue pudiendo empezar cartón nuevo
grant execute on function public.start_new_card(text, text) to anon, authenticated;

-- Evitar que anon actualice nfc_requests a mano (solo vía RPC autenticada)
drop policy if exists "demo_nfc_all" on public.nfc_requests;
create policy "nfc_select_all" on public.nfc_requests
  for select to anon, authenticated using (true);
create policy "nfc_insert_all" on public.nfc_requests
  for insert to anon, authenticated with check (true);
create policy "nfc_update_auth" on public.nfc_requests
  for update to authenticated using (true) with check (true);
