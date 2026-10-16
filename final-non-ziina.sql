-- Luxury Transport Dubai — final non-Ziina frontend support
-- Safe helper for guest multi-stop bookings. Does not change Ziina/payment webhook.

CREATE OR REPLACE FUNCTION public.add_guest_booking_stops(
  p_reference_number text,
  p_tracking_pin text,
  p_trip_date date,
  p_stops jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_prev_name text;
  v_prev_map text;
  v_item jsonb;
  v_order integer := 1;
  v_name text;
  v_map text;
BEGIN
  IF p_reference_number IS NULL OR p_tracking_pin IS NULL OR p_trip_date IS NULL THEN
    RAISE EXCEPTION 'INVALID_TRACKING_DETAILS';
  END IF;
  IF p_stops IS NULL OR jsonb_typeof(p_stops) <> 'array' OR jsonb_array_length(p_stops) > 10 THEN
    RAISE EXCEPTION 'INVALID_STOPS';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE reference_number = p_reference_number
    AND tracking_pin::text = p_tracking_pin::text
    AND (pickup_time AT TIME ZONE 'Asia/Dubai')::date = p_trip_date
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;

  -- Only allow initial stop creation; never overwrite an existing route from a public call.
  IF EXISTS (SELECT 1 FROM public.booking_stops WHERE booking_id = v_booking.id) THEN
    RETURN true;
  END IF;

  v_prev_name := v_booking.pickup_location;
  v_prev_map := v_booking.pickup_map_link;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_stops)
  LOOP
    v_name := nullif(btrim(v_item->>'name'), '');
    v_map := nullif(btrim(v_item->>'map_link'), '');
    IF v_name IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.booking_stops(
      booking_id, stop_order,
      pickup_location, pickup_address,
      dropoff_location, dropoff_address,
      fare, status, payment_status
    ) VALUES (
      v_booking.id, v_order,
      v_prev_name, v_prev_map,
      v_name, v_map,
      0, 'pending', 'unpaid'
    );
    v_prev_name := v_name;
    v_prev_map := v_map;
    v_order := v_order + 1;
  END LOOP;

  INSERT INTO public.booking_stops(
    booking_id, stop_order,
    pickup_location, pickup_address,
    dropoff_location, dropoff_address,
    fare, status, payment_status
  ) VALUES (
    v_booking.id, v_order,
    v_prev_name, v_prev_map,
    v_booking.dropoff_location, v_booking.dropoff_map_link,
    0, 'pending', 'unpaid'
  );

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.add_guest_booking_stops(text,text,date,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_guest_booking_stops(text,text,date,jsonb) TO anon, authenticated;

-- Missing performance indexes/grants from the split migration.
CREATE INDEX IF NOT EXISTS booking_stops_payment_status_idx ON public.booking_stops(booking_id, payment_status);
CREATE INDEX IF NOT EXISTS payment_allocations_stop_idx ON public.payment_allocations(booking_stop_id);
GRANT SELECT ON public.booking_stop_totals, public.booking_payment_summary TO authenticated;
