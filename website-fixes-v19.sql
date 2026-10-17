-- Luxury Transport Dubai v19 website-only database addition.
-- Ziina/payment functions are intentionally NOT changed here.

create table if not exists public.customer_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  review_text text not null check (length(trim(review_text)) between 2 and 1000),
  display_name text,
  is_approved boolean not null default false,
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_reviews enable row level security;

drop policy if exists customer_reviews_public_read on public.customer_reviews;
create policy customer_reviews_public_read on public.customer_reviews
for select to anon, authenticated
using (is_approved = true or user_id = auth.uid() or public.is_admin());

drop policy if exists customer_reviews_customer_insert on public.customer_reviews;
create policy customer_reviews_customer_insert on public.customer_reviews
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.bookings b
    where b.id = booking_id
      and b.user_id = auth.uid()
      and lower(b.status) = 'completed'
  )
);

drop policy if exists customer_reviews_customer_update on public.customer_reviews;
create policy customer_reviews_customer_update on public.customer_reviews
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid() and is_approved = false);

drop policy if exists customer_reviews_admin_all on public.customer_reviews;
create policy customer_reviews_admin_all on public.customer_reviews
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select on public.customer_reviews to anon, authenticated;
grant insert, update on public.customer_reviews to authenticated;

create index if not exists customer_reviews_public_idx
on public.customer_reviews (is_approved, created_at desc);

-- Optional transport pickup for tour/ticket requests.
alter table public.tour_requests add column if not exists needs_transport boolean not null default false;
alter table public.tour_requests add column if not exists pickup_location text;
alter table public.tour_requests add column if not exists pickup_latitude double precision;
alter table public.tour_requests add column if not exists pickup_longitude double precision;
alter table public.tour_requests add column if not exists pickup_map_link text;

create or replace function public.create_public_tour_request(
 p_first_name text,p_last_name text,p_phone text,p_whatsapp text,p_visit_date date,p_notes text,p_items jsonb,
 p_needs_transport boolean,p_pickup_location text,p_pickup_lat double precision,p_pickup_lng double precision,p_pickup_map_link text
) returns text language plpgsql security definer set search_path='public' as $$
declare v_id uuid;v_ref text;v jsonb;v_rule public.tour_ticket_rules%rowtype;
begin
 if nullif(trim(p_first_name),'') is null or nullif(trim(p_phone),'') is null or p_visit_date is null or jsonb_array_length(p_items)<1 then raise exception 'INVALID_TOUR_REQUEST'; end if;
 if coalesce(p_needs_transport,false) and (nullif(trim(p_pickup_location),'') is null or p_pickup_lat is null or p_pickup_lng is null) then raise exception 'PICKUP_LOCATION_REQUIRED'; end if;
 v_ref:='TOUR-'||to_char(now(),'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
 insert into public.tour_requests(reference_number,user_id,first_name,last_name,phone,whatsapp,visit_date,notes,needs_transport,pickup_location,pickup_latitude,pickup_longitude,pickup_map_link)
 values(v_ref,auth.uid(),p_first_name,p_last_name,p_phone,p_whatsapp,p_visit_date,p_notes,coalesce(p_needs_transport,false),p_pickup_location,p_pickup_lat,p_pickup_lng,p_pickup_map_link) returning id into v_id;
 for v in select value from jsonb_array_elements(p_items) loop
  select * into v_rule from public.tour_ticket_rules where id=(v->>'ticket_rule_id')::uuid and tour_id=(v->>'tour_id')::uuid and is_active=true;
  if not found then raise exception 'INVALID_TICKET_RULE'; end if;
  insert into public.tour_request_items(request_id,tour_id,ticket_rule_id,ticket_label,quantity,unit_price) values(v_id,v_rule.tour_id,v_rule.id,v_rule.label,(v->>'quantity')::int,v_rule.price);
 end loop;
 return v_ref;
end$$;
revoke all on function public.create_public_tour_request(text,text,text,text,date,text,jsonb,boolean,text,double precision,double precision,text) from public;
grant execute on function public.create_public_tour_request(text,text,text,text,date,text,jsonb,boolean,text,double precision,double precision,text) to anon,authenticated;
