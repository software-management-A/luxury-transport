-- ============================================================
-- Luxury Transport Dubai - V26
-- Automatic route estimate + automatic end time + approximate price storage.
-- Run AFTER V25. Ziina database/payment functions are NOT replaced here.
-- ============================================================
begin;

alter table public.bookings add column if not exists estimated_distance_km numeric(10,2);
alter table public.bookings add column if not exists estimated_duration_minutes integer;
alter table public.bookings add column if not exists estimated_price numeric(10,2);

create or replace function public.create_guest_booking_v26(
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
  if nullif(trim(coalesce(p_email,'')),'') is null or position('@' in trim(p_email)) <= 1 then raise exception 'INVALID_EMAIL'; end if;
  if p_estimated_end_time is not null and p_estimated_end_time <= p_pickup_time then raise exception 'INVALID_ESTIMATED_END_TIME'; end if;
  v_created := public.create_guest_booking_v25(p_first_name,p_last_name,p_email,p_mobile,p_whatsapp,p_pickup_location,p_pickup_map_link,p_dropoff_location,p_dropoff_map_link,p_pickup_time,p_trip_type,p_passengers,p_comment);
  v_ref := v_created->>'reference_number';
  update public.bookings set
    estimated_distance_km=case when p_estimated_distance_km>=0 then p_estimated_distance_km else null end,
    estimated_duration_minutes=case when p_estimated_duration_minutes>0 then p_estimated_duration_minutes else null end,
    estimated_end_time=p_estimated_end_time,
    estimated_price=case when p_estimated_price>=0 then p_estimated_price else null end,
    updated_at=now()
  where reference_number=v_ref;
  return v_created || jsonb_build_object('estimated_distance_km',p_estimated_distance_km,'estimated_duration_minutes',p_estimated_duration_minutes,'estimated_end_time',p_estimated_end_time,'estimated_price',p_estimated_price);
end; $$;

revoke all on function public.create_guest_booking_v26(text,text,text,text,text,text,text,text,text,timestamptz,text,integer,text,numeric,integer,timestamptz,numeric) from public;
grant execute on function public.create_guest_booking_v26(text,text,text,text,text,text,text,text,text,timestamptz,text,integer,text,numeric,integer,timestamptz,numeric) to anon,authenticated;

commit;
