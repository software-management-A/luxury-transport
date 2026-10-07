const db=window.supabaseClient;
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function show(id,text){const e=$(id);if(e){e.textContent=text;e.style.display="block"}}
function safeUrl(u){try{const x=new URL(u);return ["http:","https:"].includes(x.protocol)?x.href:null}catch{return null}}
$("bookingForm")?.addEventListener("submit",async e=>{
 e.preventDefault(); show("bookingMessage","Sending request...");
 const v=id=>$(id)?.value||null;
 const {data,error}=await db.rpc("create_guest_booking",{p_first_name:v("firstName"),p_last_name:v("lastName"),p_mobile:v("mobile"),p_whatsapp:v("whatsapp"),p_pickup_location:v("pickupLocation"),p_pickup_map_link:v("pickupMapLink"),p_dropoff_location:v("dropoffLocation"),p_dropoff_map_link:v("dropoffMapLink"),p_pickup_time:v("pickupTime"),p_trip_type:v("tripType"),p_passengers:Number(v("passengers")||1),p_comment:v("comment")});
 if(error)return show("bookingMessage","Error: "+error.message);
 show("bookingMessage","Request sent successfully. Reference: "+(data?.reference_number||data||"Created")); e.target.reset();
});
$("trackForm")?.addEventListener("submit",async e=>{
 e.preventDefault();
 const box=$("trackResult"); box.style.display="block"; box.textContent="Checking...";
 const {data,error}=await db.rpc("lookup_guest_booking",{p_trip_date:$("trackDate").value,p_reference_number:$("trackReference").value,p_phone:null});
 if(error){box.textContent="Error: "+error.message;return}
 const r=Array.isArray(data)?data[0]:data;
 if(!r){box.textContent="No matching request found.";return}
 const pay=safeUrl(r.payment_link), pick=safeUrl(r.pickup_map_link), drop=safeUrl(r.dropoff_map_link);
 const status=String(r.status||"pending").replaceAll("_"," ");
 const pstatus=String(r.payment_status||"unpaid").replaceAll("_"," ");
 box.innerHTML=`<div class="track-card">
 <div class="track-head"><strong>${esc(r.reference_number||$("trackReference").value)}</strong><span class="status-pill">${esc(status)}</span></div>
 <div class="track-row"><span>Price</span><strong>${r.price==null?"Pending":esc(r.price)+" "+esc(r.currency||"AED")}</strong></div>
 <div class="track-row"><span>Payment status</span><strong>${esc(pstatus)}</strong></div>
 <div class="track-row"><span>Pickup</span><strong>${esc(r.pickup_location||"-")}</strong></div>
 ${pick?`<a class="map-btn" href="${esc(pick)}" target="_blank" rel="noopener">Open Pickup in Google Maps ↗</a>`:""}
 <div class="track-row"><span>Drop-off</span><strong>${esc(r.dropoff_location||"-")}</strong></div>
 ${drop?`<a class="map-btn" href="${esc(drop)}" target="_blank" rel="noopener">Open Drop-off in Google Maps ↗</a>`:""}
 ${r.admin_comment?`<div class="track-note"><span>Captain / Admin comment</span><p>${esc(r.admin_comment)}</p></div>`:""}
 ${pay && pstatus.toLowerCase()!=="paid"?`<a class="btn pay-btn" href="${esc(pay)}" target="_blank" rel="noopener">Pay Now</a>`:""}
 </div>`;
});