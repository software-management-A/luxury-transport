V23 FIX
1. Run website-fixes-v23-location-account-link.sql once in Supabase SQL Editor.
2. Upload/replace all website files.
3. Location fields now require a real selected result/current location/map pin, not free-text notes.
4. School routes now support Pickup / Stop / School-Destination / Drop-off plus a separate optional note.
5. New bookings created while logged in are safely attached to that customer account using reference+PIN+date, so My Bookings and account notifications can work.
6. V22 notification queue remains unchanged. Email/WhatsApp still require deployed provider credentials for actual external delivery.
