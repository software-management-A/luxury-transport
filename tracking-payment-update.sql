-- TRACKING + PAYMENT LINK UPDATE
-- Run in Supabase SQL Editor.
-- Guest tracking remains secure: exact reference number + trip date are required.

drop function if exists public.lookup_guest_booking(date,text,text);

create function public.lookup_guest_booking(
  p_trip_date date,
  p_reference_number text,
  p_phone text default null
)
returns table(
  reference_number text,
  status text,
  pickup_location text,
  pickup_map_link text,
  dropoff_location text,
  dropoff_map_link text,
  pickup_time timestamptz,
  price numeric,
  currency text,
  admin_comment text,
  payment_status text,
  payment_link text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    b.reference_number,
    b.status,
    b.pickup_location,
    b.pickup_map_link,
    b.dropoff_location,
    b.dropoff_map_link,
    b.pickup_time,
    b.price,
    b.currency,
    b.admin_comment,
    b.payment_status,
    b.payment_link
  from public.bookings b
  where upper(trim(b.reference_number)) = upper(trim(p_reference_number))
    and (b.pickup_time at time zone 'Asia/Dubai')::date = p_trip_date
  limit 1;
$$;

revoke all on function public.lookup_guest_booking(date,text,text) from public;
grant execute on function public.lookup_guest_booking(date,text,text) to anon, authenticated;
