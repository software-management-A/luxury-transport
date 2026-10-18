LUXURY TRANSPORT DUBAI - V22

1) Run website-fixes-v22-location-notifications.sql in Supabase SQL Editor.
2) Replace/upload the website files from this package to GitHub.
3) Global location selector now supports:
   - Current Location
   - Choose on Map
   - typed smart place search (starts-with ranked first; contains matches included)
   - verified/admin places appear naturally without an "Admin Saved" label.
4) Customer Account now has Notifications with unread count and Mark Read.
5) Admin booking update creates notifications for every available destination:
   - Account if booking has user_id
   - Email if booking has email
   - WhatsApp if booking has WhatsApp/phone
6) Actual Email/WhatsApp delivery uses the included Supabase Edge Function notification-dispatch.
   It safely skips a provider if that provider is not configured.
   Email provider variables: RESEND_API_KEY, EMAIL_FROM
   WhatsApp variables: META_WHATSAPP_TOKEN, META_WHATSAPP_PHONE_NUMBER_ID

IMPORTANT: SQL alone cannot send internet Email/WhatsApp. Until those provider secrets and the Edge Function are deployed, in-account notifications work and Email/WhatsApp are queued/skipped safely.

Ziina/payment code is not changed by V22.
