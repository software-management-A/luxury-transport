Luxury Transport Dubai V26

1. Run website-fixes-v26-auto-estimate-ziina.sql after V25.
2. Upload the files from this folder directly to the GitHub repository root (do not upload the outer folder).
3. Customer booking now shows live distance, driving time, automatic end time (+10 min), and approximate price before confirmation.
4. Admin manual end-time input is removed; the stored automatic end time is displayed.
5. Ziina frontend now calls the existing ziina-create-payment Edge Function through Supabase functions.invoke, so project/auth headers are included and returned function errors are shown instead of a silent no-response.
6. Existing Ziina Edge Function/API secrets and webhook are not overwritten by this package.
