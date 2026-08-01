-- =============================================================================
-- CupTrack — Quitar 1 sello (corregir error del barista)
-- Ejecuta en SQL Editor DESPUÉS de cuptrack.sql
-- =============================================================================

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

  select * into v_customer from public.customers where public_id = p_public_id;
  if not found then raise exception 'Cliente no encontrado'; end if;

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

  -- Borra el último evento de sello de ese cliente (métricas / historial)
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
    'stamps_count', v_card.stamps_count,
    'stamps_required', v_cafe.stamps_required,
    'cards_completed', v_card.cards_completed,
    'card_completed', v_card.stamps_count >= v_cafe.stamps_required,
    'cafe_name', v_cafe.name
  );
end;
$$;

revoke all on function public.remove_stamp_by_public_id(text, text) from public, anon, authenticated;
grant execute on function public.remove_stamp_by_public_id(text, text) to authenticated;
