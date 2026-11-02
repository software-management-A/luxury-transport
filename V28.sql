-- Luxury Transport Dubai - V28
-- Same estimated price for customer/admin + admin route stops + notification support.
-- Run AFTER V27. Does NOT replace Ziina payment functions.
begin;

-- Booking creator: save the customer's calculated estimate as the initial editable price.
create or replace function public.create_guest_booking_v28(
  p_first_name text, p_last_name text, p_email text, p_mobile text, p_whatsapp text,
  p_pickup_location text, p_pickup_map_link text, p_dropoff_location text,
  p_dropoff_map_link text, p_pickup_time timestamptz, p_trip_type text,
  p_passengers integer, p_comment text, p_estimated_distance_km numeric default null,
  p_estimated_duration_minutes integer default null, p_estimated_end_time timestamptz default null,
  p_estimated_price numeric default null
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_created jsonb; v_ref text;
begin
  v_created := public.create_guest_booking_v26(
    p_first_name,p_last_name,p_email,p_mobile,p_whatsapp,p_pickup_location,p_pickup_map_link,
    p_dropoff_location,p_dropoff_map_link,p_pickup_time,p_trip_type,p_passengers,p_comment,
    p_estimated_distance_km,p_estimated_duration_minutes,p_estimated_end_time,p_estimated_price
  );
  v_ref := v_created->>'reference_number';
  update public.bookings
     set price = case when p_estimated_price is not null and p_estimated_price >= 0 then p_estimated_price else price end,
         updated_at = now()
   where reference_number=v_ref;
  return v_created || jsonb_build_object('price',p_estimated_price);
end; $$;

revoke all on function public.create_guest_booking_v28(text,text,text,text,text,text,text,text,text,timestamptz,text,integer,text,numeric,integer,timestamptz,numeric) from public;
grant execute on function public.create_guest_booking_v28(text,text,text,text,text,text,text,text,text,timestamptz,text,integer,text,numeric,integer,timestamptz,numeric) to anon,authenticated;

-- Admin-only ordered intermediate stops for one booking.
create or replace function public.admin_get_booking_stops_v28(p_booking_id uuid)
returns table(stop_order integer, name text, map_link text)
language sql security definer set search_path=public as $$
  select bs.stop_order,
         bs.dropoff_location as name,
         bs.dropoff_address as map_link
  from public.booking_stops bs
  where public.is_admin()
    and bs.booking_id=p_booking_id
    and bs.stop_order < (select max(x.stop_order) from public.booking_stops x where x.booking_id=p_booking_id)
  order by bs.stop_order;
$$;
revoke all on function public.admin_get_booking_stops_v28(uuid) from public,anon;
grant execute on function public.admin_get_booking_stops_v28(uuid) to authenticated;

commit;
