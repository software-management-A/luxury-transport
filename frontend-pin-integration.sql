-- Add-on: run AFTER successful weekly PIN SQL. Does not replace existing booking RPC.
-- Wrapper calls your existing create_guest_booking, then returns its booking number + PIN.
CREATE OR REPLACE FUNCTION public.create_guest_booking_with_pin(
 p_first_name text,p_last_name text,p_mobile text,p_whatsapp text,
 p_pickup_location text,p_pickup_map_link text,p_dropoff_location text,
 p_dropoff_map_link text,p_pickup_time timestamptz,p_trip_type text,
 p_passengers integer,p_comment text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_created jsonb; v_ref text; v_pin text;
BEGIN
 SELECT to_jsonb(x) INTO v_created FROM public.create_guest_booking(
  p_first_name=>p_first_name,p_last_name=>p_last_name,p_mobile=>p_mobile,
  p_whatsapp=>p_whatsapp,p_pickup_location=>p_pickup_location,
  p_pickup_map_link=>p_pickup_map_link,p_dropoff_location=>p_dropoff_location,
  p_dropoff_map_link=>p_dropoff_map_link,p_pickup_time=>p_pickup_time,
  p_trip_type=>p_trip_type,p_passengers=>p_passengers,p_comment=>p_comment
 ) AS x;
 v_ref := coalesce(v_created->>'reference_number',trim(both '"' from v_created::text));
 SELECT b.tracking_pin INTO v_pin FROM public.bookings b
 WHERE b.reference_number=v_ref LIMIT 1;
 IF v_pin IS NULL THEN RAISE EXCEPTION 'Booking created but PIN could not be retrieved'; END IF;
 RETURN jsonb_build_object('reference_number',v_ref,'tracking_pin',v_pin);
END $$;
REVOKE ALL ON FUNCTION public.create_guest_booking_with_pin(text,text,text,text,text,text,text,text,timestamptz,text,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_guest_booking_with_pin(text,text,text,text,text,text,text,text,timestamptz,text,integer,text) TO anon,authenticated;
