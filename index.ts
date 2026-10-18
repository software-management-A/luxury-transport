import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", {headers:cors});
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization") || "";
    const userDb = createClient(url, anon, {global:{headers:{Authorization:auth}}});
    const {data:{user}} = await userDb.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const {data:profile} = await userDb.from("profiles").select("role,is_active").eq("id",user.id).maybeSingle();
    if (profile?.role !== "admin" || profile?.is_active === false) throw new Error("Admin access required");

    const {booking_id} = await req.json();
    const db = createClient(url, service);
    const {data:rows,error} = await db.from("notifications").select("*").eq("booking_id",booking_id).order("created_at",{ascending:false}).limit(5);
    if (error) throw error;

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const emailFrom = Deno.env.get("EMAIL_FROM");
    const waToken = Deno.env.get("META_WHATSAPP_TOKEN");
    const waPhoneId = Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID");

    for (const n of rows || []) {
      if (n.email_required && n.email_status === "pending") {
        if (!resendKey || !emailFrom) {
          await db.from("notifications").update({email_status:"skipped",email_error:"Email provider not configured"}).eq("id",n.id);
        } else {
          try {
            const r = await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${resendKey}`,"Content-Type":"application/json"},body:JSON.stringify({from:emailFrom,to:[n.email_to],subject:n.title,text:n.message})});
            if (!r.ok) throw new Error(await r.text());
            await db.from("notifications").update({email_status:"sent",email_sent_at:new Date().toISOString(),email_error:null}).eq("id",n.id);
          } catch(e) { await db.from("notifications").update({email_status:"failed",email_error:String(e)}).eq("id",n.id); }
        }
      }
      if (n.whatsapp_required && n.whatsapp_status === "pending") {
        if (!waToken || !waPhoneId) {
          await db.from("notifications").update({whatsapp_status:"skipped",whatsapp_error:"WhatsApp provider not configured"}).eq("id",n.id);
        } else {
          try {
            const to = String(n.whatsapp_to || "").replace(/\D/g,"");
            const r = await fetch(`https://graph.facebook.com/v22.0/${waPhoneId}/messages`,{method:"POST",headers:{Authorization:`Bearer ${waToken}`,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",to,type:"text",text:{body:`${n.title}\n\n${n.message}`}})});
            if (!r.ok) throw new Error(await r.text());
            await db.from("notifications").update({whatsapp_status:"sent",whatsapp_sent_at:new Date().toISOString(),whatsapp_error:null}).eq("id",n.id);
          } catch(e) { await db.from("notifications").update({whatsapp_status:"failed",whatsapp_error:String(e)}).eq("id",n.id); }
        }
      }
    }
    return new Response(JSON.stringify({ok:true}),{headers:{...cors,"Content-Type":"application/json"}});
  } catch(e) { return new Response(JSON.stringify({ok:false,error:String(e)}),{status:400,headers:{...cors,"Content-Type":"application/json"}}); }
});
