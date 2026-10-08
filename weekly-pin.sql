-- Weekly unique PIN (Dubai Monday-Sunday), existing booking backfill, easy tracking.
-- Run as database owner in Supabase SQL Editor.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tracking_pin text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tracking_week date;

CREATE OR REPLACE FUNCTION public.set_booking_weekly_pin()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE
  w date;
  candidate text;
  tries integer := 0;
  entropy bytea;
BEGIN
  IF NEW.pickup_time IS NULL THEN RAISE EXCEPTION 'Pickup time required'; END IF;
  w := date_trunc('week', NEW.pickup_time AT TIME ZONE 'Asia/Dubai')::date;
  -- Serialize PIN allocation for the same week; database unique index is final guard.
  PERFORM pg_advisory_xact_lock(27642, (w - DATE '2000-01-01')::integer);
  IF TG_OP='UPDATE' AND OLD.tracking_week IS NOT DISTINCT FROM w
     AND OLD.tracking_pin ~ '^[0-9]{6}$' THEN
    NEW.tracking_pin := OLD.tracking_pin;
  ELSE
    LOOP
      tries := tries+1;
      IF tries > 100 THEN RAISE EXCEPTION 'Could not allocate unique PIN'; END IF;
      entropy := gen_random_bytes(4);
      candidate := lpad(((get_byte(entropy,0)::bigint*16777216
          +get_byte(entropy,1)::bigint*65536
          +get_byte(entropy,2)::bigint*256
          +get_byte(entropy,3)::bigint) % 1000000)::text,6,'0');
      EXIT WHEN NOT EXISTS(
        SELECT 1 FROM public.bookings b
        WHERE b.tracking_week=w AND b.tracking_pin=candidate AND b.id IS DISTINCT FROM NEW.id
      );
    END LOOP;
    NEW.tracking_pin := candidate;
  END IF;
  NEW.tracking_week := w;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bookings_weekly_pin_trigger ON public.bookings;
CREATE TRIGGER bookings_weekly_pin_trigger
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.set_booking_weekly_pin();

-- Backfill old bookings. Trigger also handles later rescheduling.
UPDATE public.bookings SET tracking_pin=NULL,tracking_week=NULL
WHERE tracking_pin IS NULL OR tracking_week IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_weekly_pin_unique
ON public.bookings(tracking_week,tracking_pin);
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_tracking_pin_format;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_tracking_pin_format
  CHECK (tracking_pin ~ '^[0-9]{6}$' AND tracking_week IS NOT NULL);

CREATE OR REPLACE FUNCTION public.track_booking_easy(
  p_method text, p_value text, p_trip_date date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  IF p_trip_date IS NULL OR length(trim(coalesce(p_value,''))) < 4
     OR p_method NOT IN ('pin','reference','mobile') THEN
    RAISE EXCEPTION 'Invalid tracking details';
  END IF;
  IF p_method='pin' AND p_value !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'PIN must contain 6 digits';
  END IF;
  -- Mobile-only results intentionally expose only minimal information.
  SELECT coalesce(jsonb_agg(x.item),'[]'::jsonb) INTO result
  FROM (
    SELECT CASE WHEN p_method='mobile' THEN
      jsonb_build_object(
        'reference_number', left(b.reference_number,4)||'****'||right(b.reference_number,3),
        'trip_date',p_trip_date,'status',b.status
      )
    ELSE
      jsonb_build_object(
        'reference_number',b.reference_number,'trip_date',p_trip_date,
        'status',b.status,'price',b.price,'payment_status',b.payment_status,
        'pickup_location',b.pickup_location,'dropoff_location',b.dropoff_location,
        'pickup_map_link',b.pickup_map_link,'dropoff_map_link',b.dropoff_map_link,
        'admin_comment',b.admin_comment,'payment_link',b.payment_link
      )
    END AS item
    FROM public.bookings b
    WHERE (b.pickup_time AT TIME ZONE 'Asia/Dubai')::date=p_trip_date
      AND (
        (p_method='pin' AND b.tracking_pin=p_value)
        OR (p_method='reference' AND upper(b.reference_number)=upper(trim(p_value)))
        OR (p_method='mobile' AND regexp_replace(coalesce(b.phone,''),'\D','','g')=
          regexp_replace(p_value,'\D','','g'))
      )
    ORDER BY b.created_at DESC LIMIT 10
  ) x;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.track_booking_easy(text,text,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_booking_easy(text,text,date) TO anon,authenticated;
COMMIT;
