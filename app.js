const db=window.supabaseClient;
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function safeUrl(u){try{let x=new URL(u);return ["http:","https:"].includes(x.protocol)?x.href:null}catch{return null}}
function show(id,text){let el=$(id);if(el){el.style.display="block";el.textContent=text}}
$("bookingForm")?.addEventListener("submit",async e=>{
 e.preventDefault();show("bookingMessage","Sending request...");
 const v=id=>$(id)?.value||null;
 const {data,error}=await db.rpc("create_guest_booking",{
 p_first_name:v("firstName"),p_last_name:v("lastName"),p_mobile:v("mobile"),
 p_whatsapp:v("whatsapp"),p_pickup_location:v("pickupLocation"),p_pickup_map_link:v("pickupMapLink"),
 p_dropoff_location:v("dropoffLocation"),p_dropoff_map_link:v("dropoffMapLink"),
 p_pickup_time:v("pickupTime"),p_trip_type:v("tripType"),
 p_passengers:Number(v("passengers")||1),p_comment:v("comment")
 });
 if(error)return show("bookingMessage","Error: "+error.message);
 const r=Array.isArray(data)?data[0]:data;
 const ref=r?.reference_number||"Created",pin=r?.tracking_pin||"";
 const box=$("bookingMessage");
 box.innerHTML=`<strong>Booking request received!</strong><p>Booking number: <strong>${esc(ref)}</strong></p><p>6-digit PIN: <strong>${esc(pin||"Not available")}</strong></p><p>Save both details and your trip date for tracking.</p><button type="button" id="copyTracking" class="btn dark">Copy Booking Details</button>`;
 $("copyTracking").onclick=()=>navigator.clipboard?.writeText(`Booking: ${ref}\nPIN: ${pin}\nDate: ${v("pickupTime")?.slice(0,10)||""}`).catch(()=>{});
 e.target.reset();
});
const labels={pin:["6-digit PIN","Enter tracking PIN"],reference:["Booking number","TRP-2026-000001"],mobile:["Mobile number","+971..."]};
$("trackMethod")?.addEventListener("change",()=>{
 const a=labels[$("trackMethod").value];$("trackKeyLabel").textContent=a[0];$("trackKey").placeholder=a[1];$("trackKey").value="";
});
function trackCard(r,limited){
 const pick=safeUrl(r.pickup_map_link),drop=safeUrl(r.dropoff_map_link),pay=safeUrl(r.payment_link);
 return `<div class="track-card"><div class="track-head"><strong>${esc(r.reference_number||"Booking found")}</strong><span class="status-pill">${esc(r.status||"pending")}</span></div>
 <div class="track-row"><span>Trip date</span><strong>${esc(r.trip_date||"-")}</strong></div>
 ${limited?`<p>For payment and route details, track using your booking number or 6-digit PIN.</p>`:`
 <div class="track-row"><span>Price</span><strong>${r.price==null?"Pending":esc(r.price)+" AED"}</strong></div>
 <div class="track-row"><span>Payment</span><strong>${esc(r.payment_status||"unpaid")}</strong></div>
 <div class="track-row"><span>Pickup</span><strong>${esc(r.pickup_location||"-")}</strong></div>
 ${pick?`<a class="map-btn" target="_blank" rel="noopener" href="${esc(pick)}">Pickup Google Maps ↗</a>`:""}
 <div class="track-row"><span>Drop-off</span><strong>${esc(r.dropoff_location||"-")}</strong></div>
 ${drop?`<a class="map-btn" target="_blank" rel="noopener" href="${esc(drop)}">Drop-off Google Maps ↗</a>`:""}
 ${r.admin_comment?`<div class="track-note"><span>Admin comment</span><p>${esc(r.admin_comment)}</p></div>`:""}
 ${pay&&r.payment_status!=="paid"?`<a class="btn pay-btn" href="${esc(pay)}" target="_blank" rel="noopener">Pay Now</a>`:""}`}
 </div>`;
}
$("trackForm")?.addEventListener("submit",async e=>{
 e.preventDefault();const box=$("trackResult");show("trackResult","Checking...");
 const method=$("trackMethod").value,key=$("trackKey").value.trim(),date=$("trackDate").value;
 if(method==="pin"&&!/^\d{6}$/.test(key))return show("trackResult","Enter exactly 6 digits.");
 const {data,error}=await db.rpc("track_booking_easy",{p_method:method,p_value:key,p_trip_date:date});
 if(error)return show("trackResult","Error: "+error.message);
 const rows=Array.isArray(data)?data:[];if(!rows.length)return show("trackResult","No matching booking found.");
 box.innerHTML=rows.map(r=>trackCard(r,method==="mobile")).join("");
});
