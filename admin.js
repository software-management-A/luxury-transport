const db=window.supabaseClient;
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const mapLink=(url,label)=>url?`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`:esc(label);
const telLink=(n,label)=>n?`<a href="tel:${esc(n)}">${esc(label||n)}</a>`:"-";
const waLink=n=>n?`<a href="https://wa.me/${String(n).replace(/\D/g,"")}" target="_blank" rel="noopener">WhatsApp ↗</a>`:"-";
let bookings=[];
function localInput(v){if(!v)return"";const d=new Date(v);const z=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;}
function isoOrNull(v){return v?new Date(v).toISOString():null}
function message(t){$("adminMessage").textContent=t;$("adminMessage").style.display="block"}
function render(){
 $("adminSummary").innerHTML=
 `<div class="stat"><span>Total bookings</span><strong>${bookings.length}</strong></div>
  <div class="stat"><span>Pending</span><strong>${bookings.filter(x=>x.status==="pending").length}</strong></div>
  <div class="stat"><span>Accepted / Confirmed</span><strong>${bookings.filter(x=>["accepted","confirmed"].includes(x.status)).length}</strong></div>
  <div class="stat"><span>Completed</span><strong>${bookings.filter(x=>x.status==="completed").length}</strong></div>`;
 $("adminRows").innerHTML="";
 bookings.slice(0,100).forEach(b=>$("adminRows").insertAdjacentHTML("beforeend",
 `<tr><td>${esc(b.reference_number)}</td><td>${esc(b.first_name)} ${esc(b.last_name)}</td>
 <td>${mapLink(b.pickup_map_link,b.pickup_location||"Pickup")}<br>→ ${mapLink(b.dropoff_map_link,b.dropoff_location||"Drop-off")}</td>
 <td>${esc(b.status)}</td><td>${esc(b.price??"-")} AED</td>
 <td><button class="mini-btn" data-manage="${esc(b.id)}">Manage</button></td></tr>`));
 document.querySelectorAll("[data-manage]").forEach(x=>x.onclick=()=>openBooking(x.dataset.manage));
}
function openBooking(id){
 const b=bookings.find(x=>String(x.id)===String(id));if(!b)return;
 $("bookingManager").style.display="block";$("manageId").value=b.id;$("manageTitle").textContent=`Manage ${b.reference_number} · PIN: ${b.tracking_pin||"—"}`;
 $("bookingInfo").innerHTML=`<div><strong>Tracking PIN</strong><br>${esc(b.tracking_pin||"—")}</div><div><strong>Customer</strong><br>${esc(b.first_name)} ${esc(b.last_name||"")}</div>
 <div><strong>Contact</strong><br>${telLink(b.phone,b.phone)} · ${waLink(b.whatsapp||b.phone)}</div>
 <div><strong>Pickup</strong><br>${mapLink(b.pickup_map_link,b.pickup_location)}</div>
 <div><strong>Drop-off</strong><br>${mapLink(b.dropoff_map_link,b.dropoff_location)}</div>
 <div><strong>Passengers</strong><br>${esc(b.passengers)}</div><div><strong>Customer comment</strong><br>${esc(b.customer_comment||"-")}</div>
 <div><strong>Payment status</strong><br>${esc(b.payment_status||"unpaid")}</div>`;
 $("managePrice").value=b.price??"";$("managePickup").value=localInput(b.pickup_time);$("manageEnd").value=localInput(b.estimated_end_time);
 $("manageComment").value=b.admin_comment||"";$("managePaymentLink").value=b.payment_link||"";
 $("bookingManager").scrollIntoView({behavior:"smooth",block:"start"});
}
async function load(){
 const {data:{session}}=await db.auth.getSession();if(!session)return location.href="./login.html";
 const {data:p}=await db.from("profiles").select("role").eq("id",session.user.id).single();if(p?.role!=="admin")return location.href="./customer.html";
 const {data,error}=await db.rpc("admin_get_bookings");if(error){alert(error.message);return}bookings=data||[];render();
}
$("manageForm").addEventListener("submit",async e=>{
 e.preventDefault();message("Saving...");
 const args={p_booking_id:$("manageId").value,p_action:$("manageAction").value,p_price:$("managePrice").value===""?null:Number($("managePrice").value),p_admin_comment:$("manageComment").value||null,p_payment_link:$("managePaymentLink").value||null,p_pickup_time:isoOrNull($("managePickup").value),p_estimated_end_time:isoOrNull($("manageEnd").value)};
 const {error}=await db.rpc("admin_update_booking",args);
 if(error)return message("Error: "+error.message);
 message("Booking updated successfully.");await load();openBooking(args.p_booking_id);
});
$("logout").onclick=async()=>{await db.auth.signOut();location.href="./index.html"};
load();