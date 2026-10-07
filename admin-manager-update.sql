-- ADMIN BOOKING MANAGER COMPATIBILITY
-- Run in Supabase SQL Editor before using the new Admin Manage form.
-- This replaces the admin RPC using the exact current bookings columns.

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
  b public.bookings;
  new_status text;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;

  select * into b from public.bookings where id=p_booking_id for update;
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
  if p_estimated_end_time is not null and coalesce(p_pickup_time,b.pickup_time) >= p_estimated_end_time then
    raise exception 'End time must be after pickup time';
  end if;

  update public.bookings set
    status=new_status,
    price=coalesce(p_price,price),
    admin_comment=p_admin_comment,
    payment_link=p_payment_link,
    pickup_time=coalesce(p_pickup_time,pickup_time),
    estimated_end_time=coalesce(p_estimated_end_time,estimated_end_time),
    updated_at=now()
  where id=p_booking_id
  returning * into b;

  return b;
end;
$$;

revoke all on function public.admin_update_booking(uuid,text,numeric,text,text,timestamptz,timestamptz) from public, anon;
grant execute on function public.admin_update_booking(uuid,text,numeric,text,text,timestamptz,timestamptz) to authenticated;
