STEP 1: Weekly PIN SQL must already be successful.
STEP 2: Run frontend-pin-integration.sql in Supabase SQL Editor. If SQL reports missing function or argument names, STOP and share error; your existing create_guest_booking signature needs adjustment.
STEP 3: Upload all website files from this ZIP to GitHub repo ROOT, replacing old files. Do not upload SQL to GitHub.
STEP 4: Admin list RPC admin_get_bookings must include tracking_pin. If PIN is blank in Admin, adjust that RPC.
STEP 5: Refresh site, test booking and all 3 tracking methods.
SECURITY: Public PIN/date tracking needs rate limiting in production. Mobile/date returns only minimal masked reference and status.
