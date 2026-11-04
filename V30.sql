-- Luxury Transport Dubai V30
-- Run AFTER V29.
-- Fixes admin pickup/end-time recalculation and keeps notification compatibility.
begin;

create or replace function public.admin_update_booking(
  p_booking_id uuid, p_action text, p_price numeric default null,
  p_admin_comment text default null, p_payment_link text default null,
  p_pickup_time timestamptz default null, p_estimated_end_time timestamptz default null
) returns public.bookings language plpgsql security definer set search_path=public as $$
declare
  old_b public.bookings;
  new_b public.bookings;
  new_status text;
  changes text := '';
  wa text;
  has_email boolean;
  auto_end timestamptz;
  effective_pickup timestamptz;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select * into old_b from public.bookings where id=p_booking_id for update;
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

  effective_pickup := coalesce(p_pickup_time, old_b.pickup_time);
  auto_end := p_estimated_end_time;

  -- Website rule: estimated end = pickup + driving time + 10 minutes.
  -- Recalculate whenever Admin changes pickup time.
  if auto_end is null
     and p_pickup_time is not null
     and old_b.estimated_duration_minutes is not null
     and old_b.estimated_duration_minutes > 0 then
    auto_end := p_pickup_time + make_interval(mins => old_b.estimated_duration_minutes + 10);
  end if;

  if auto_end is not null and effective_pickup >= auto_end then
    raise exception 'End time must be after pickup time';
  end if;

  update public.bookings set
    status = new_status,
    price = coalesce(p_price, price),
    admin_comment = coalesce(p_admin_comment, admin_comment),
    payment_link = coalesce(p_payment_link, payment_link),
    pickup_time = effective_pickup,
    estimated_end_time = coalesce(auto_end, estimated_end_time),
    updated_at = now()
  where id=p_booking_id
  returning * into new_b;

  if old_b.status is distinct from new_b.status then
    changes := changes || 'Status: ' || coalesce(old_b.status,'—') || ' → ' || coalesce(new_b.status,'—') || E'\n';
  end if;
  if old_b.price is distinct from new_b.price then
    changes := changes || 'Price: ' || coalesce(new_b.price::text,'Pending') || ' ' || coalesce(new_b.currency,'AED') || E'\n';
  end if;
  if old_b.pickup_time is distinct from new_b.pickup_time then
    changes := changes || 'Pickup: ' || to_char(new_b.pickup_time at time zone 'Asia/Dubai','DD Mon YYYY, HH12:MI AM') || E'\n';
  end if;
  if old_b.estimated_end_time is distinct from new_b.estimated_end_time then
    changes := changes || 'Estimated End: ' || to_char(new_b.estimated_end_time at time zone 'Asia/Dubai','DD Mon YYYY, HH12:MI AM') || E'\n';
  end if;
  if changes='' then changes := 'Your booking details were updated.' || E'\n'; end if;

  changes := 'Booking ' || new_b.reference_number || E'\n' || changes ||
             'Pickup: ' || coalesce(new_b.pickup_location,'—') || E'\n' ||
             'Drop-off: ' || coalesce(new_b.dropoff_location,'—');

  wa := nullif(trim(coalesce(new_b.whatsapp,new_b.phone,'')),'');
  has_email := nullif(trim(coalesce(new_b.email,'')),'') is not null;

  insert into public.notifications(
    user_id,booking_id,title,message,type,notification_type,is_read,
    email_required,whatsapp_required,email_to,whatsapp_to,email_status,whatsapp_status
  ) values(
    new_b.user_id,new_b.id,'Booking Updated — '||new_b.reference_number,changes,
    'booking_update','booking_update',false,
    has_email,wa is not null,
    case when has_email then trim(new_b.email) end,wa,
    case when has_email then 'pending' else 'not_required' end,
    case when wa is not null then 'pending' else 'not_required' end
  );

  return new_b;
end; $$;

revoke all on function public.admin_update_booking(uuid,text,numeric,text,text,timestamptz,timestamptz) from public,anon;
grant execute on function public.admin_update_booking(uuid,text,numeric,text,text,timestamptz,timestamptz) to authenticated;

commit;
