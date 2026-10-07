const SUPABASE_URL='https://qzaoagriaxrcboztpcce.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_GftTlcgBPw5P0JKSlLJaVw_UCvIdCAS';
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
window.TransportApp=window.TransportApp||{}; window.TransportApp.supabase=supabaseClient; window.TransportApp.config={supabaseUrl:SUPABASE_URL,currency:'AED',timezone:'Asia/Dubai'};
