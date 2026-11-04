Luxury Transport Dubai — V29

Base: your uploaded complete V28 project.

V29 updates:
- Admin: Send via WhatsApp button with customer number + professional prefilled message. Final Send remains manual.
- Admin: Send via Email button with recipient + subject + professional prefilled body. Final Send remains manual.
- Dubai-time greeting and Dubai-time booking formatting.
- Message includes route/stops, final price, payment status, payment link when unpaid, and direct tracking link.
- Customer account DB notification remains created after Admin update.
- Fixed notification_type compatibility.
- Pickup reschedule automatically moves estimated end time when duration exists.
- Tracking RPC includes V28 estimate/end-time fields.
- Removed an incorrect extra-stop save block from the tracking handler.
- Existing V28 booking/stops/estimate/Ziina flow retained.

INSTALL:
1. Run V29.sql in Supabase SQL Editor after V28.
2. Upload ALL files from this V29 package to GitHub repo root, replacing existing files.
3. Test one new booking, Admin update, WhatsApp, Email, tracking and Ziina Pay Now.

Note: V29 does not require Resend or a custom email domain for the new manual Email button.
