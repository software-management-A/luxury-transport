-- ============================================================
-- Luxury Transport Dubai - V22
-- Global booking update notifications + delivery queue
-- Safe to run once after V19/V21 database updates.
-- Does NOT change Ziina/payment functions.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete cascade,
  booking_id uuid null references public.bookings(id) on delete cascade,
  title text not null default 'Booking update',
  message text not null default '',
  type text not null default 'booking_update',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications add column if not exists user_id uuid null;
alter table public.notifications add column if not exists booking_id uuid null;
alter table public.notifications add column if not exists title text;
alter table public.notifications add column if not exists message text;
alter table public.notifications add column if not exists type text default 'booking_update';
alter table public.notifications add column if not exists is_read boolean not null default false;
alter table public.notifications add column if not exists created_at timestamptz not null default now();
alter table public.notifications add column if not exists email_required boolean not null default false;
alter table public.notifications add column if not exists whatsapp_required boolean not null default false;
alter table public.notifications add column if not exists email_to text;
alter table public.notifications add column if not exists whatsapp_to text;
alter table public.notifications add column if not exists email_status text not null default 'not_required';
alter table public.notifications add column if not exists whatsapp_status text not null default 'not_required';
alter table public.notifications add column if not exists email_sent_at timestamptz;
alter table public.notifications add column if not exists whatsapp_sent_at timestamptz;
alter table public.notifications add column if not exists email_error text;
alter table public.notifications add column if not exists whatsapp_error text;

create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_booking_idx on public.notifications(booking_id, created_at desc);
create index if not exists notifications_delivery_idx on public.notifications(email_status, whatsapp_status, created_at);

alter table public.notifications enable row level security;

drop policy if exists "customer_read_own_notifications" on public.notifications;
create policy "customer_read_own_notifications" on public.notifications
for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "customer_mark_own_notifications_read" on public.notifications;
create policy "customer_mark_own_notifications_read" on public.notifications
for update to authenticated using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "admin_manage_notifications_v22" on public.notifications;
create policy "admin_manage_notifications_v22" on public.notifications
for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Admin booking update now records exactly what changed and queues every
-- available channel: account (when user_id exists), email (when email exists),
-- WhatsApp (when whatsapp/phone exists). Missing channels are skipped.
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
  if p_estimated_end_time is not null and coalesce(p_pickup_time, old_b.pickup_time) >= p_estimated_end_time then
    raise exception 'End time must be after pickup time';
  end if;

  update public.bookings set
    status = new_status,
    price = coalesce(p_price, price),
    admin_comment = p_admin_comment,
    payment_link = p_payment_link,
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
    changes := changes || E'Pickup time updated to: ' || to_char(new_b.pickup_time at time zone 'Asia/Dubai','DD Mon YYYY, HH12:MI AM') || E'\n';
  end if;
  if old_b.estimated_end_time is distinct from new_b.estimated_end_time and new_b.estimated_end_time is not null then
    changes := changes || E'Estimated end time: ' || to_char(new_b.estimated_end_time at time zone 'Asia/Dubai','DD Mon YYYY, HH12:MI AM') || E'\n';
  end if;
  if old_b.admin_comment is distinct from new_b.admin_comment and nullif(trim(coalesce(new_b.admin_comment,'')),'') is not null then
    changes := changes || E'Admin message: ' || new_b.admin_comment || E'\n';
  end if;

  if changes = '' then changes := 'Your booking details were updated.' || E'\n'; end if;
  changes := 'Booking ' || new_b.reference_number || E'\n' || changes || E'Pickup: ' || coalesce(new_b.pickup_location,'—') || E'\nDrop-off: ' || coalesce(new_b.dropoff_location,'—');

  wa := nullif(trim(coalesce(new_b.whatsapp, new_b.phone, '')), '');
  has_email := nullif(trim(coalesce(new_b.email,'')), '') is not null;

  insert into public.notifications(
    user_id, booking_id, title, message, type, is_read,
    email_required, whatsapp_required, email_to, whatsapp_to,
    email_status, whatsapp_status
  ) values (
    new_b.user_id,
    new_b.id,
    'Booking Updated — ' || new_b.reference_number,
    changes,
    'booking_update',
    false,
    has_email,
    wa is not null,
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

grant select, update on public.notifications to authenticated;
