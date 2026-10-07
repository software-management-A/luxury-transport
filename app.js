const db=window.supabaseClient;
const $=id=>document.getElementById(id);
function show(id,text){const e=$(id);if(e){e.textContent=text;e.style.display="block"}}
$("bookingForm")?.addEventListener("submit",async e=>{
 e.preventDefault(); show("bookingMessage","Sending request...");
 const v=id=>$(id)?.value||null;
 const {data,error}=await db.rpc("create_guest_booking",{p_first_name:v("firstName"),p_last_name:v("lastName"),p_mobile:v("mobile"),p_whatsapp:v("whatsapp"),p_pickup_location:v("pickupLocation"),p_dropoff_location:v("dropoffLocation"),p_pickup_time:v("pickupTime"),p_estimated_end_time:v("estimatedEndTime"),p_trip_type:v("tripType"),p_passengers:Number(v("passengers")||1),p_comment:v("comment")});
 if(error)return show("bookingMessage","Error: "+error.message);
 show("bookingMessage","Request sent successfully. Reference: "+(data?.reference_number||data||"Created")); e.target.reset();
});
$("trackForm")?.addEventListener("submit",async e=>{
 e.preventDefault(); show("trackResult","Checking...");
 const {data,error}=await db.rpc("lookup_guest_booking",{p_trip_date:$("trackDate").value,p_reference_number:$("trackReference").value,p_phone:null});
 if(error)return show("trackResult","Error: "+error.message);
 const r=Array.isArray(data)?data[0]:data;
 show("trackResult",r?`Status: ${r.status||"-"} | Pickup: ${r.pickup_location||"-"} | Drop-off: ${r.dropoff_location||"-"} | Price: ${r.price??"Pending"} AED`:"No matching request found.");
});