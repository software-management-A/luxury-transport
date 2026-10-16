-- Luxury Transport Dubai v18 website support. NO Ziina changes.

ALTER TABLE public.tours ADD COLUMN IF NOT EXISTS opening_time time;
ALTER TABLE public.tours ADD COLUMN IF NOT EXISTS closing_time time;

CREATE TABLE IF NOT EXISTS public.tour_ticket_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
 label text NOT NULL, age_rule text, min_age numeric, max_age numeric, price numeric(12,2) NOT NULL DEFAULT 0,
 is_active boolean NOT NULL DEFAULT true, display_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(price>=0)
);
ALTER TABLE public.tour_ticket_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tour_ticket_rules_public_read ON public.tour_ticket_rules;
CREATE POLICY tour_ticket_rules_public_read ON public.tour_ticket_rules FOR SELECT TO anon,authenticated USING(is_active=true);
DROP POLICY IF EXISTS tour_ticket_rules_admin ON public.tour_ticket_rules;
CREATE POLICY tour_ticket_rules_admin ON public.tour_ticket_rules FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
GRANT SELECT ON public.tour_ticket_rules TO anon,authenticated; GRANT INSERT,UPDATE,DELETE ON public.tour_ticket_rules TO authenticated;

CREATE TABLE IF NOT EXISTS public.tour_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference_number text UNIQUE NOT NULL,
 user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, first_name text NOT NULL,last_name text,phone text NOT NULL,whatsapp text,
 visit_date date NOT NULL,notes text,status text NOT NULL DEFAULT 'pending',admin_comment text,total_price numeric(12,2),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status IN('pending','quoted','accepted','confirmed','completed','rejected','cancelled'))
);
CREATE TABLE IF NOT EXISTS public.tour_request_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid NOT NULL REFERENCES public.tour_requests(id) ON DELETE CASCADE,
 tour_id uuid NOT NULL REFERENCES public.tours(id),ticket_rule_id uuid REFERENCES public.tour_ticket_rules(id),ticket_label text NOT NULL,quantity integer NOT NULL,unit_price numeric(12,2) NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),CHECK(quantity>0),CHECK(unit_price>=0)
);
ALTER TABLE public.tour_requests ENABLE ROW LEVEL SECURITY; ALTER TABLE public.tour_request_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tour_requests_admin ON public.tour_requests; CREATE POLICY tour_requests_admin ON public.tour_requests FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
DROP POLICY IF EXISTS tour_requests_own ON public.tour_requests; CREATE POLICY tour_requests_own ON public.tour_requests FOR SELECT TO authenticated USING(user_id=auth.uid());
DROP POLICY IF EXISTS tour_items_admin ON public.tour_request_items; CREATE POLICY tour_items_admin ON public.tour_request_items FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
DROP POLICY IF EXISTS tour_items_own ON public.tour_request_items; CREATE POLICY tour_items_own ON public.tour_request_items FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.tour_requests r WHERE r.id=request_id AND r.user_id=auth.uid()));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.tour_requests,public.tour_request_items TO authenticated;

CREATE TABLE IF NOT EXISTS public.weekly_schedule_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),reference_number text UNIQUE NOT NULL,user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 first_name text NOT NULL,last_name text,phone text NOT NULL,whatsapp text,passenger_name text NOT NULL,school_name text,start_date date NOT NULL,end_date date,customer_comment text,status text NOT NULL DEFAULT 'pending',price numeric(12,2),admin_comment text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),CHECK(end_date IS NULL OR end_date>=start_date),CHECK(status IN('pending','quoted','accepted','active','paused','completed','rejected','cancelled'))
);
CREATE TABLE IF NOT EXISTS public.weekly_schedule_days(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),schedule_id uuid NOT NULL REFERENCES public.weekly_schedule_requests(id) ON DELETE CASCADE,day_of_week integer NOT NULL,morning_time time,afternoon_time time,UNIQUE(schedule_id,day_of_week),CHECK(day_of_week BETWEEN 1 AND 7));
CREATE TABLE IF NOT EXISTS public.weekly_schedule_route_points(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),schedule_id uuid NOT NULL REFERENCES public.weekly_schedule_requests(id) ON DELETE CASCADE,direction text NOT NULL,stop_order integer NOT NULL,location_name text NOT NULL,latitude double precision NOT NULL,longitude double precision NOT NULL,google_maps_url text,UNIQUE(schedule_id,direction,stop_order),CHECK(direction IN('morning','afternoon')),CHECK(stop_order>0),CHECK(latitude BETWEEN -90 AND 90),CHECK(longitude BETWEEN -180 AND 180));
ALTER TABLE public.weekly_schedule_requests ENABLE ROW LEVEL SECURITY;ALTER TABLE public.weekly_schedule_days ENABLE ROW LEVEL SECURITY;ALTER TABLE public.weekly_schedule_route_points ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS weekly_admin ON public.weekly_schedule_requests;CREATE POLICY weekly_admin ON public.weekly_schedule_requests FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
DROP POLICY IF EXISTS weekly_own ON public.weekly_schedule_requests;CREATE POLICY weekly_own ON public.weekly_schedule_requests FOR SELECT TO authenticated USING(user_id=auth.uid());
DROP POLICY IF EXISTS weekly_days_admin ON public.weekly_schedule_days;CREATE POLICY weekly_days_admin ON public.weekly_schedule_days FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
DROP POLICY IF EXISTS weekly_points_admin ON public.weekly_schedule_route_points;CREATE POLICY weekly_points_admin ON public.weekly_schedule_route_points FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.weekly_schedule_requests,public.weekly_schedule_days,public.weekly_schedule_route_points TO authenticated;

CREATE OR REPLACE FUNCTION public.create_public_weekly_schedule(p_first_name text,p_last_name text,p_phone text,p_whatsapp text,p_passenger_name text,p_school_name text,p_start_date date,p_end_date date,p_days jsonb,p_morning_route jsonb,p_afternoon_route jsonb,p_comment text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_id uuid;v_ref text;v jsonb;BEGIN IF nullif(trim(p_first_name),'') IS NULL OR nullif(trim(p_phone),'') IS NULL OR p_start_date IS NULL OR jsonb_array_length(p_days)<1 THEN RAISE EXCEPTION 'INVALID_SCHEDULE';END IF;v_ref:='SCH-'||to_char(now(),'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));INSERT INTO public.weekly_schedule_requests(reference_number,user_id,first_name,last_name,phone,whatsapp,passenger_name,school_name,start_date,end_date,customer_comment) VALUES(v_ref,auth.uid(),p_first_name,p_last_name,p_phone,p_whatsapp,p_passenger_name,p_school_name,p_start_date,p_end_date,p_comment) RETURNING id INTO v_id;FOR v IN SELECT value FROM jsonb_array_elements(p_days) LOOP INSERT INTO public.weekly_schedule_days(schedule_id,day_of_week,morning_time,afternoon_time) VALUES(v_id,(v->>'day')::int,nullif(v->>'morning_time','')::time,nullif(v->>'afternoon_time','')::time);END LOOP;FOR v IN SELECT value FROM jsonb_array_elements(p_morning_route) LOOP INSERT INTO public.weekly_schedule_route_points(schedule_id,direction,stop_order,location_name,latitude,longitude,google_maps_url) VALUES(v_id,'morning',(v->>'order')::int,v->>'name',(v->>'latitude')::float8,(v->>'longitude')::float8,v->>'map_link');END LOOP;FOR v IN SELECT value FROM jsonb_array_elements(p_afternoon_route) LOOP INSERT INTO public.weekly_schedule_route_points(schedule_id,direction,stop_order,location_name,latitude,longitude,google_maps_url) VALUES(v_id,'afternoon',(v->>'order')::int,v->>'name',(v->>'latitude')::float8,(v->>'longitude')::float8,v->>'map_link');END LOOP;RETURN v_ref;END$$;
REVOKE ALL ON FUNCTION public.create_public_weekly_schedule(text,text,text,text,text,text,date,date,jsonb,jsonb,jsonb,text) FROM PUBLIC;GRANT EXECUTE ON FUNCTION public.create_public_weekly_schedule(text,text,text,text,text,text,date,date,jsonb,jsonb,jsonb,text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.create_public_tour_request(p_first_name text,p_last_name text,p_phone text,p_whatsapp text,p_visit_date date,p_notes text,p_items jsonb) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_id uuid;v_ref text;v jsonb;v_rule public.tour_ticket_rules%ROWTYPE;BEGIN IF nullif(trim(p_first_name),'') IS NULL OR nullif(trim(p_phone),'') IS NULL OR p_visit_date IS NULL OR jsonb_array_length(p_items)<1 THEN RAISE EXCEPTION 'INVALID_TOUR_REQUEST';END IF;v_ref:='TOUR-'||to_char(now(),'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));INSERT INTO public.tour_requests(reference_number,user_id,first_name,last_name,phone,whatsapp,visit_date,notes) VALUES(v_ref,auth.uid(),p_first_name,p_last_name,p_phone,p_whatsapp,p_visit_date,p_notes) RETURNING id INTO v_id;FOR v IN SELECT value FROM jsonb_array_elements(p_items) LOOP SELECT * INTO v_rule FROM public.tour_ticket_rules WHERE id=(v->>'ticket_rule_id')::uuid AND tour_id=(v->>'tour_id')::uuid AND is_active=true;IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_TICKET_RULE';END IF;INSERT INTO public.tour_request_items(request_id,tour_id,ticket_rule_id,ticket_label,quantity,unit_price) VALUES(v_id,v_rule.tour_id,v_rule.id,v_rule.label,(v->>'quantity')::int,v_rule.price);END LOOP;RETURN v_ref;END$$;
REVOKE ALL ON FUNCTION public.create_public_tour_request(text,text,text,text,date,text,jsonb) FROM PUBLIC;GRANT EXECUTE ON FUNCTION public.create_public_tour_request(text,text,text,text,date,text,jsonb) TO anon,authenticated;
