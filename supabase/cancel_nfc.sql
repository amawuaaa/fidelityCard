-- =============================================================================
-- CupTrack — Cancelar petición NFC desde el cliente
-- Ejecuta en SQL Editor (después de cuptrack.sql / hardening_v2).
-- =============================================================================

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

revoke all on function public.cancel_nfc_request(uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_nfc_request(uuid, text) to anon, authenticated;
