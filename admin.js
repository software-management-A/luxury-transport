const db=window.supabaseClient;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const mapLink=(url,label)=>url?`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`:esc(label);
(async()=>{
 const {data:{session}}=await db.auth.getSession(); if(!session)return location.href="./login.html";
 const {data:p}=await db.from("profiles").select("role").eq("id",session.user.id).single();
 if(p?.role!=="admin")return location.href="./customer.html";
 const {data}=await db.rpc("admin_get_bookings"); const list=data||[];
 document.getElementById("adminSummary").innerHTML=`<div class="stat"><span>Total bookings</span><strong>${list.length}</strong></div><div class="stat"><span>Pending</span><strong>${list.filter(x=>x.status==="pending").length}</strong></div>`;
 list.slice(0,50).forEach(b=>document.getElementById("adminRows").insertAdjacentHTML("beforeend",
 `<tr><td>${esc(b.reference_number)}</td><td>${esc(b.customer_first_name||b.first_name)}</td><td>${mapLink(b.pickup_map_link,b.pickup_location||"Pickup")}<br>${mapLink(b.dropoff_map_link,b.dropoff_location||"Drop-off")}</td><td>${esc(b.status)}</td><td>${esc(b.price??"-")} AED</td></tr>`));
})();
document.getElementById("logout").onclick=async()=>{await db.auth.signOut();location.href="./index.html"};