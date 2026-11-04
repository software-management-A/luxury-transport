-- Luxury Transport Dubai V29
-- Run AFTER V28. Keeps V28 features and adds safer notifications/tracking support.
begin;

-- Keep compatibility with the older NOT NULL notification_type column.
alter table public.notifications alter column notification_type set default 'booking_update';
update public.notifications set notification_type='booking_update' where notification_type is null;
alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
check (notification_type in ('booking_update','booking_created','payment_update','general'));

-- Admin update: preserve customer account notifications, prepare email/WhatsApp destinations,
-- and automatically move estimated end time when pickup changes and duration is available.
create or replace function public.admin_update_booking(
  p_booking_id uuid, p_action text, p_price numeric default null,
  p_admin_comment text default null, p_payment_link text default null,
  p_pickup_time timestamptz default null, p_estimated_end_time timestamptz default null
) returns public.bookings language plpgsql security definer set search_path=public as $$
declare old_b public.bookings; new_b public.bookings; new_status text; changes text:=''; wa text; has_email boolean; auto_end timestamptz;
begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 select * into old_b from public.bookings where id=p_booking_id for update;
 if not found then raise exception 'Booking not found'; end if;
 new_status:=case lower(p_action) when 'quote' then 'quoted' when 'accept' then 'accepted' when 'confirm' then 'confirmed' when 'reschedule' then 'rescheduled' when 'start' then 'in_progress' when 'complete' then 'completed' when 'reject' then 'rejected' when 'cancel' then 'cancelled' else null end;
 if new_status is null then raise exception 'Invalid action'; end if;
 auto_end:=p_estimated_end_time;
 if auto_end is null and p_pickup_time is not null and old_b.estimated_duration_minutes is not null and old_b.estimated_duration_minutes>0 then auto_end:=p_pickup_time + make_interval(mins=>old_b.estimated_duration_minutes); end if;
 if auto_end is not null and coalesce(p_pickup_time,old_b.pickup_time)>=auto_end then raise exception 'End time must be after pickup time'; end if;
 update public.bookings set status=new_status, price=coalesce(p_price,price), admin_comment=coalesce(p_admin_comment,admin_comment), payment_link=coalesce(p_payment_link,payment_link), pickup_time=coalesce(p_pickup_time,pickup_time), estimated_end_time=coalesce(auto_end,estimated_end_time), updated_at=now() where id=p_booking_id returning * into new_b;
 if old_b.status is distinct from new_b.status then changes:=changes||'Status: '||coalesce(old_b.status,'—')||' → '||coalesce(new_b.status,'—')||E'\n'; end if;
 if old_b.price is distinct from new_b.price then changes:=changes||'Price: '||coalesce(new_b.price::text,'Pending')||' '||coalesce(new_b.currency,'AED')||E'\n'; end if;
 if old_b.pickup_time is distinct from new_b.pickup_time then changes:=changes||'Pickup: '||to_char(new_b.pickup_time at time zone 'Asia/Dubai','DD Mon YYYY, HH12:MI AM')||E'\n'; end if;
 if changes='' then changes:='Your booking details were updated.'||E'\n'; end if;
 changes:='Booking '||new_b.reference_number||E'\n'||changes||'Pickup: '||coalesce(new_b.pickup_location,'—')||E'\nDrop-off: '||coalesce(new_b.dropoff_location,'—');
 wa:=nullif(trim(coalesce(new_b.whatsapp,new_b.phone,'')),''); has_email:=nullif(trim(coalesce(new_b.email,'')),'') is not null;
 insert into public.notifications(user_id,booking_id,title,message,type,notification_type,is_read,email_required,whatsapp_required,email_to,whatsapp_to,email_status,whatsapp_status)
 values(new_b.user_id,new_b.id,'Booking Updated — '||new_b.reference_number,changes,'booking_update','booking_update',false,has_email,wa is not null,case when has_email then trim(new_b.email) end,wa,case when has_email then 'pending' else 'not_required' end,case when wa is not null then 'pending' else 'not_required' end);
 return new_b;
end; $$;
revoke all on function public.admin_update_booking(uuid,text,numeric,text,text,timestamptz,timestamptz) from public,anon;
grant execute on function public.admin_update_booking(uuid,text,numeric,text,text,timestamptz,timestamptz) to authenticated;

-- Tracking now returns the V26/V28 estimate fields and end time used by the website.
create or replace function public.track_booking_easy(p_method text,p_value text,p_trip_date date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 if p_trip_date is null or length(trim(coalesce(p_value,'')))<4 or p_method not in ('pin','reference','mobile') then raise exception 'Invalid tracking details'; end if;
 if p_method='pin' and p_value !~ '^[0-9]{6}$' then raise exception 'PIN must contain 6 digits'; end if;
 select coalesce(jsonb_agg(x.item),'[]'::jsonb) into result from (
  select case when p_method='mobile' then jsonb_build_object('reference_number',left(b.reference_number,4)||'****'||right(b.reference_number,3),'trip_date',p_trip_date,'status',b.status)
  else jsonb_build_object('reference_number',b.reference_number,'trip_date',p_trip_date,'first_name',b.first_name,'status',b.status,'price',b.price,'estimated_price',b.estimated_price,'currency',b.currency,'payment_status',b.payment_status,'pickup_location',b.pickup_location,'dropoff_location',b.dropoff_location,'pickup_map_link',b.pickup_map_link,'dropoff_map_link',b.dropoff_map_link,'pickup_time',b.pickup_time,'estimated_end_time',b.estimated_end_time,'estimated_distance_km',b.estimated_distance_km,'estimated_duration_minutes',b.estimated_duration_minutes,'admin_comment',b.admin_comment,'payment_link',b.payment_link) end item
  from public.bookings b where (b.pickup_time at time zone 'Asia/Dubai')::date=p_trip_date and ((p_method='pin' and b.tracking_pin=p_value) or (p_method='reference' and upper(b.reference_number)=upper(trim(p_value))) or (p_method='mobile' and regexp_replace(coalesce(b.phone,''),'\D','','g')=regexp_replace(p_value,'\D','','g'))) order by b.created_at desc limit 10
 )x; return result;
end; $$;
revoke all on function public.track_booking_easy(text,text,date) from public;
grant execute on function public.track_booking_easy(text,text,date) to anon,authenticated;
commit;
