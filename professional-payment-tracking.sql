BEGIN;

CREATE OR REPLACE FUNCTION public.track_booking_easy(
  p_method text,
  p_value text,
  p_trip_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF p_trip_date IS NULL
     OR length(trim(coalesce(p_value, ''))) < 4
     OR p_method NOT IN ('pin', 'reference', 'mobile') THEN
    RAISE EXCEPTION 'Invalid tracking details';
  END IF;

  IF p_method = 'pin' AND p_value !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'PIN must contain 6 digits';
  END IF;

  SELECT coalesce(jsonb_agg(x.item), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      CASE
        WHEN p_method = 'mobile' THEN
          jsonb_build_object(
            'reference_number', left(b.reference_number, 4) || '****' || right(b.reference_number, 3),
            'trip_date', p_trip_date,
            'status', b.status
          )
        ELSE
          jsonb_build_object(
            'reference_number', b.reference_number,
            'trip_date', p_trip_date,
            'first_name', b.first_name,
            'status', b.status,
            'price', b.price,
            'currency', b.currency,
            'payment_status', b.payment_status,
            'pickup_location', b.pickup_location,
            'dropoff_location', b.dropoff_location,
            'pickup_map_link', b.pickup_map_link,
            'dropoff_map_link', b.dropoff_map_link,
            'admin_comment', b.admin_comment,
            'payment_link', b.payment_link
          )
      END AS item
    FROM public.bookings b
    WHERE (b.pickup_time AT TIME ZONE 'Asia/Dubai')::date = p_trip_date
      AND (
        (p_method = 'pin' AND b.tracking_pin = p_value)
        OR (p_method = 'reference' AND upper(b.reference_number) = upper(trim(p_value)))
        OR (p_method = 'mobile' AND regexp_replace(coalesce(b.phone, ''), '\D', '', 'g') = regexp_replace(p_value, '\D', '', 'g'))
      )
    ORDER BY b.created_at DESC
    LIMIT 10
  ) x;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.track_booking_easy(text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_booking_easy(text, text, date) TO anon, authenticated;

COMMIT;
