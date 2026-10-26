-- ============================================================
-- Luxury Transport Dubai - V25
-- Email + international phone storage + admin booking update fix
-- Run AFTER V24. Does NOT change Ziina/payment functions.
-- ============================================================

begin;

-- New public booking wrapper: keeps the proven V24 booking creator,
-- then stores the customer's validated email address.
create or replace function public.create_guest_booking_v25(
  p_first_name text,
  p_last_name text,
  p_email text,
  p_mobile text,
  p_whatsapp text,
  p_pickup_location text,
  p_pickup_map_link text,
  p_dropoff_location text,
  p_dropoff_map_link text,
  p_pickup_time timestamptz,
  p_trip_type text,
  p_passengers integer,
  p_comment text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created jsonb;
  v_ref text;
begin
  if nullif(trim(coalesce(p_email,'')),'') is null
     or position('@' in trim(p_email)) <= 1 then
    raise exception 'INVALID_EMAIL';
  end if;

  v_created := public.create_guest_booking_with_pin(
    p_first_name,
    p_last_name,
    p_mobile,
    p_whatsapp,
    p_pickup_location,
    p_pickup_map_link,
    p_dropoff_location,
    p_dropoff_map_link,
    p_pickup_time,
    p_trip_type,
    p_passengers,
    p_comment
  );

  v_ref := v_created->>'reference_number';

  update public.bookings
  set email = lower(trim(p_email)),
      user_id = case
        when auth.uid() is not null and not public.is_admin() then auth.uid()
        else user_id
      end,
      updated_at = now()
  where reference_number = v_ref;

  return v_created;
end;
$$;

revoke all on function public.create_guest_booking_v25(text,text,text,text,text,text,text,text,text,timestamptz,text,integer,text) from public;
grant execute on function public.create_guest_booking_v25(text,text,text,text,text,text,text,text,text,timestamptz,text,integer,text) to anon, authenticated;

-- V25 admin update: preserves V22 notification queue and removes any obsolete
-- booking-time-availability rejection from the admin update path.
create or replace function public.admin_update_booking(
  p_booking_id uuid,
  p_action text,
  p_price numeric default null,
  p_admin_comment text default null,
  p_payment_link text default null,
  p_pickup_time timestamptz default null,
  p_estimated_end_time timestamptz default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  old_b public.bookings;
  new_b public.bookings;
  new_status text;
  changes text := '';
  wa text;
  has_email boolean;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;

  select * into old_b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;

  new_status := case lower(p_action)
    when 'quote' then 'quoted'
    when 'accept' then 'accepted'
    when 'confirm' then 'confirmed'
    when 'reschedule' then 'rescheduled'
    when 'start' then 'in_progress'
    when 'complete' then 'completed'
    when 'reject' then 'rejected'
    when 'cancel' then 'cancelled'
    else null end;

  if new_status is null then raise exception 'Invalid action'; end if;
  if p_estimated_end_time is not null
     and coalesce(p_pickup_time, old_b.pickup_time) >= p_estimated_end_time then
    raise exception 'End time must be after pickup time';
  end if;

  update public.bookings set
    status = new_status,
    price = coalesce(p_price, price),
    admin_comment = coalesce(p_admin_comment, admin_comment),
    payment_link = coalesce(p_payment_link, payment_link),
    pickup_time = coalesce(p_pickup_time, pickup_time),
    estimated_end_time = coalesce(p_estimated_end_time, estimated_end_time),
    updated_at = now()
  where id = p_booking_id
  returning * into new_b;

  if old_b.status is distinct from new_b.status then
    changes := changes || E'Status: ' || coalesce(old_b.status,'—') || ' → ' || coalesce(new_b.status,'—') || E'\n';
  end if;
  if old_b.price is distinct from new_b.price then
    changes := changes || E'Price: ' || coalesce(old_b.price::text,'Pending') || ' → ' || coalesce(new_b.price::text,'Pending') || ' ' || coalesce(new_b.currency,'AED') || E'\n';
  end if;
  if old_b.pickup_time is distinct from new_b.pickup_time then
    changes := changes || E'Pickup time: ' || to_char(new_b.pickup_time at time zone 'Asia/Dubai','DD Mon YYYY, HH12:MI AM') || E'\n';
  end if;
  if old_b.estimated_end_time is distinct from new_b.estimated_end_time and new_b.estimated_end_time is not null then
    changes := changes || E'End time: ' || to_char(new_b.estimated_end_time at time zone 'Asia/Dubai','DD Mon YYYY, HH12:MI AM') || E'\n';
  end if;
  if old_b.admin_comment is distinct from new_b.admin_comment and nullif(trim(coalesce(new_b.admin_comment,'')),'') is not null then
    changes := changes || E'Admin message: ' || new_b.admin_comment || E'\n';
  end if;

  if changes = '' then changes := 'Your booking details were updated.' || E'\n'; end if;
  changes := 'Booking ' || new_b.reference_number || E'\n' || changes ||
             E'Pickup: ' || coalesce(new_b.pickup_location,'—') ||
             E'\nDrop-off: ' || coalesce(new_b.dropoff_location,'—');

  wa := nullif(trim(coalesce(new_b.whatsapp, new_b.phone, '')), '');
  has_email := nullif(trim(coalesce(new_b.email,'')), '') is not null;

  insert into public.notifications(
    user_id, booking_id, title, message, type, is_read,
    email_required, whatsapp_required, email_to, whatsapp_to,
    email_status, whatsapp_status
  ) values (
    new_b.user_id, new_b.id,
    'Booking Updated — ' || new_b.reference_number,
    changes, 'booking_update', false,
    has_email, wa is not null,
    case when has_email then trim(new_b.email) else null end,
    wa,
    case when has_email then 'pending' else 'not_required' end,
    case when wa is not null then 'pending' else 'not_required' end
  );

  return new_b;
end;
$$;

revoke all on function public.admin_update_booking(uuid,text,numeric,text,text,timestamptz,timestamptz) from public, anon;
grant execute on function public.admin_update_booking(uuid,text,numeric,text,text,timestamptz,timestamptz) to authenticated;

commit;
