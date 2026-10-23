-- ============================================================
-- Luxury Transport Dubai - V24
-- FIX: School/Weekly routes use EXISTING recurring_schedules + schedule_stops.
-- No weekly_schedule_* tables are required.
-- Keeps V23 customer booking/account attachment fix.
-- Does NOT change Ziina/payment functions.
-- ============================================================

begin;
create extension if not exists pgcrypto;

-- Add only the school-request fields needed by the current website.
alter table public.recurring_schedules add column if not exists reference_number text;
alter table public.recurring_schedules add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.recurring_schedules add column if not exists first_name text;
alter table public.recurring_schedules add column if not exists last_name text;
alter table public.recurring_schedules add column if not exists phone text;
alter table public.recurring_schedules add column if not exists whatsapp text;
alter table public.recurring_schedules add column if not exists passenger_name text;
alter table public.recurring_schedules add column if not exists school_name text;
alter table public.recurring_schedules add column if not exists start_date date;
alter table public.recurring_schedules add column if not exists end_date date;
alter table public.recurring_schedules add column if not exists schedule_days jsonb not null default '[]'::jsonb;
alter table public.recurring_schedules add column if not exists customer_comment text;
alter table public.recurring_schedules add column if not exists status text default 'pending';
alter table public.recurring_schedules add column if not exists created_at timestamptz not null default now();
alter table public.recurring_schedules add column if not exists updated_at timestamptz not null default now();

create unique index if not exists recurring_schedules_reference_number_v24_idx
on public.recurring_schedules(reference_number)
where reference_number is not null;

-- Reuse schedule_stops for Morning + Afternoon/Return routes.
alter table public.schedule_stops add column if not exists direction text;
alter table public.schedule_stops add column if not exists stop_role text not null default 'stop';
alter table public.schedule_stops add column if not exists location_name text;
alter table public.schedule_stops add column if not exists location_address text;
alter table public.schedule_stops add column if not exists latitude double precision;
alter table public.schedule_stops add column if not exists longitude double precision;
alter table public.schedule_stops add column if not exists map_link text;
alter table public.schedule_stops add column if not exists note text;
alter table public.schedule_stops add column if not exists created_at timestamptz not null default now();

-- Avoid duplicate check constraints if V24 is run again.
do $$
begin
  if not exists (select 1 from pg_constraint where conname='schedule_stops_direction_v24_check') then
    alter table public.schedule_stops
      add constraint schedule_stops_direction_v24_check
      check (direction is null or direction in ('morning','afternoon'));
  end if;
  if not exists (select 1 from pg_constraint where conname='schedule_stops_role_v24_check') then
    alter table public.schedule_stops
      add constraint schedule_stops_role_v24_check
      check (stop_role in ('pickup','stop','school','dropoff'));
  end if;
end $$;

create index if not exists schedule_stops_schedule_direction_order_v24_idx
on public.schedule_stops(recurring_schedule_id, direction, stop_order);

-- Public/customer school schedule creation.
create or replace function public.create_public_weekly_schedule_v24(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_whatsapp text,
  p_passenger_name text,
  p_school_name text,
  p_start_date date,
  p_end_date date,
  p_days jsonb,
  p_morning_route jsonb,
  p_afternoon_route jsonb,
  p_comment text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_ref text;
  v jsonb;
  v_role text;
  v_order integer;
  v_lat double precision;
  v_lng double precision;
begin
  if nullif(trim(coalesce(p_first_name,'')),'') is null
     or nullif(trim(coalesce(p_phone,'')),'') is null
     or p_start_date is null then
    raise exception 'INVALID_SCHEDULE';
  end if;

  if p_days is null or jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) < 1 then
    raise exception 'SELECT_AT_LEAST_ONE_DAY';
  end if;
  if p_morning_route is null or jsonb_typeof(p_morning_route) <> 'array' or jsonb_array_length(p_morning_route) < 1 then
    raise exception 'MORNING_ROUTE_REQUIRED';
  end if;
  if p_afternoon_route is null or jsonb_typeof(p_afternoon_route) <> 'array' or jsonb_array_length(p_afternoon_route) < 1 then
    raise exception 'AFTERNOON_ROUTE_REQUIRED';
  end if;
  if p_end_date is not null and p_end_date < p_start_date then
    raise exception 'END_DATE_BEFORE_START_DATE';
  end if;

  v_ref := 'SCH-' || to_char(now() at time zone 'Asia/Dubai','YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

  insert into public.recurring_schedules(
    reference_number,user_id,first_name,last_name,phone,whatsapp,
    passenger_name,school_name,start_date,end_date,schedule_days,
    customer_comment,status,created_at,updated_at
  ) values (
    v_ref,auth.uid(),trim(p_first_name),nullif(trim(coalesce(p_last_name,'')),''),trim(p_phone),
    nullif(trim(coalesce(p_whatsapp,'')),''),nullif(trim(coalesce(p_passenger_name,'')),''),
    nullif(trim(coalesce(p_school_name,'')),''),p_start_date,p_end_date,p_days,
    nullif(trim(coalesce(p_comment,'')),''),'pending',now(),now()
  ) returning id into v_id;

  for v in select value from jsonb_array_elements(p_morning_route) loop
    v_role := coalesce(nullif(v->>'role',''),'stop');
    if v_role not in ('pickup','stop','school','dropoff') then v_role := 'stop'; end if;
    v_order := coalesce(nullif(v->>'order','')::integer,1);
    v_lat := nullif(v->>'latitude','')::double precision;
    v_lng := nullif(v->>'longitude','')::double precision;
    if nullif(trim(coalesce(v->>'name','')),'') is null or v_lat is null or v_lng is null then
      raise exception 'INVALID_MORNING_LOCATION';
    end if;
    insert into public.schedule_stops(
      recurring_schedule_id,stop_order,direction,stop_role,location_name,
      location_address,latitude,longitude,map_link,note
    ) values (
      v_id,v_order,'morning',v_role,trim(v->>'name'),nullif(trim(coalesce(v->>'address','')),''),
      v_lat,v_lng,nullif(trim(coalesce(v->>'map_link','')),''),nullif(trim(coalesce(v->>'note','')),'')
    );
  end loop;

  for v in select value from jsonb_array_elements(p_afternoon_route) loop
    v_role := coalesce(nullif(v->>'role',''),'stop');
    if v_role not in ('pickup','stop','school','dropoff') then v_role := 'stop'; end if;
    v_order := coalesce(nullif(v->>'order','')::integer,1);
    v_lat := nullif(v->>'latitude','')::double precision;
    v_lng := nullif(v->>'longitude','')::double precision;
    if nullif(trim(coalesce(v->>'name','')),'') is null or v_lat is null or v_lng is null then
      raise exception 'INVALID_AFTERNOON_LOCATION';
    end if;
    insert into public.schedule_stops(
      recurring_schedule_id,stop_order,direction,stop_role,location_name,
      location_address,latitude,longitude,map_link,note
    ) values (
      v_id,v_order,'afternoon',v_role,trim(v->>'name'),nullif(trim(coalesce(v->>'address','')),''),
      v_lat,v_lng,nullif(trim(coalesce(v->>'map_link','')),''),nullif(trim(coalesce(v->>'note','')),'')
    );
  end loop;

  return v_ref;
end;
$$;

revoke all on function public.create_public_weekly_schedule_v24(text,text,text,text,text,text,date,date,jsonb,jsonb,jsonb,text) from public;
grant execute on function public.create_public_weekly_schedule_v24(text,text,text,text,text,text,date,date,jsonb,jsonb,jsonb,text) to anon, authenticated;

-- Attach a guest booking to the currently logged-in confirmed customer.
create or replace function public.attach_booking_to_current_user_v24(
  p_reference_number text,
  p_tracking_pin text,
  p_trip_date date
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_id uuid;
begin
  if v_uid is null then return false; end if;

  select email into v_email
  from auth.users
  where id = v_uid and email_confirmed_at is not null;

  if v_email is null then return false; end if;

  select id into v_id
  from public.bookings
  where upper(reference_number) = upper(trim(p_reference_number))
    and tracking_pin::text = trim(p_tracking_pin)
    and (pickup_time at time zone 'Asia/Dubai')::date = p_trip_date
    and (user_id is null or user_id = v_uid)
  for update;

  if v_id is null then return false; end if;

  update public.bookings
  set user_id = v_uid,
      email = coalesce(nullif(trim(email),''),v_email),
      updated_at = now()
  where id = v_id;

  update public.notifications
  set user_id = v_uid
  where booking_id = v_id and user_id is null;

  return true;
end;
$$;

revoke all on function public.attach_booking_to_current_user_v24(text,text,date) from public, anon;
grant execute on function public.attach_booking_to_current_user_v24(text,text,date) to authenticated;

commit;
