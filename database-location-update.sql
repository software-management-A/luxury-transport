-- Luxury Transport: location links + admin-only end time
-- Run this once in Supabase SQL Editor.

alter table public.bookings
  add column if not exists pickup_map_link text,
  add column if not exists dropoff_map_link text;

-- Customer/guest RPC: end time is NOT accepted from customer.
create or replace function public.create_guest_booking(
  p_first_name text,
  p_last_name text,
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
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
begin
  if coalesce(trim(p_first_name),'') = '' then raise exception 'First name is required'; end if;
  if coalesce(trim(p_mobile),'') = '' then raise exception 'Mobile is required'; end if;
  if coalesce(trim(p_pickup_location),'') = '' then raise exception 'Pickup location is required'; end if;
  if coalesce(trim(p_dropoff_location),'') = '' then raise exception 'Drop-off location is required'; end if;
  if coalesce(trim(p_pickup_map_link),'') = '' then raise exception 'Pickup Google Maps link is required'; end if;
  if coalesce(trim(p_dropoff_map_link),'') = '' then raise exception 'Drop-off Google Maps link is required'; end if;
  if p_pickup_time is null then raise exception 'Pickup time is required'; end if;
  if coalesce(p_passengers,0) < 1 then raise exception 'Passengers must be at least 1'; end if;

  insert into public.bookings(
    customer_first_name, customer_last_name, customer_mobile, customer_whatsapp,
    pickup_location, pickup_map_link, dropoff_location, dropoff_map_link,
    pickup_time, estimated_end_time, trip_type, passengers, comment, status
  ) values (
    trim(p_first_name), nullif(trim(p_last_name),''),
    trim(p_mobile), nullif(trim(p_whatsapp),''),
    trim(p_pickup_location), trim(p_pickup_map_link),
    trim(p_dropoff_location), trim(p_dropoff_map_link),
    p_pickup_time, null, p_trip_type, p_passengers, nullif(trim(p_comment),''), 'pending'
  )
  returning * into v_booking;

  return v_booking;
end;
$$;

grant execute on function public.create_guest_booking(
  text,text,text,text,text,text,text,text,timestamptz,text,integer,text
) to anon, authenticated;

-- Optional validation for map links.
alter table public.bookings drop constraint if exists bookings_pickup_map_link_check;
alter table public.bookings add constraint bookings_pickup_map_link_check
check (pickup_map_link is null or pickup_map_link ~* '^https?://');

alter table public.bookings drop constraint if exists bookings_dropoff_map_link_check;
alter table public.bookings add constraint bookings_dropoff_map_link_check
check (dropoff_map_link is null or dropoff_map_link ~* '^https?://');

-- Admin keeps control of estimated_end_time through the existing admin workflow.
