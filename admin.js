
const db = window.supabaseClient;

const $ = id => document.getElementById(id);

const esc = s => String(s ?? "").replace(
  /[&<>"']/g,
  c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c])
);

const mapLink = (url, label) =>
  /^https?:\/\//i.test(String(url || ""))
    ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`
    : esc(label);

const telLink = (n, label) =>
  n ? `<a href="tel:${esc(n)}">${esc(label || n)}</a>` : "-";

const waLink = n =>
  n
    ? `<a href="https://wa.me/${String(n).replace(/\D/g, "")}" target="_blank" rel="noopener">WhatsApp ↗</a>`
    : "-";

let bookings = [];
let activeFilter = "all";
let searchText = "";

function localInput(v) {
  if (!v) return "";

  const d = new Date(v);
  const z = n => String(n).padStart(2, "0");

  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

function isoOrNull(v) {
  return v ? new Date(v).toISOString() : null;
}

function message(t) {
  $("adminMessage").textContent = t;
  $("adminMessage").style.display = "block";
}

const money = n =>
  new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED"
  }).format(n || 0);

const fmtTime = v =>
  v
    ? new Date(v).toLocaleString("en-AE", {
        timeZone: "Asia/Dubai",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    : "—";

function render() {
  const received = bookings
    .filter(b =>
      String(b.payment_status || "").toLowerCase() === "paid"
    )
    .reduce((s, b) => s + (Number(b.price) || 0), 0);

  const pendingPayments = bookings
    .filter(b =>
      String(b.payment_status || "").toLowerCase() !== "paid" &&
      Number(b.price) > 0
    )
    .reduce((s, b) => s + Number(b.price), 0);

  const stats = [
    [
      "Total Received",
      money(received),
      "Payments marked paid",
      "received"
    ],
    [
      "Total Bookings",
      bookings.length,
      "All booking requests",
      "total"
    ],
    [
      "Pending Requests",
      bookings.filter(b => b.status === "pending").length,
      "Awaiting action",
      "pending"
    ],
    [
      "Active Trips",
      bookings.filter(b =>
        ["accepted", "confirmed", "started", "in_progress"]
          .includes(b.status)
      ).length,
      "Accepted and ongoing",
      "active"
    ],
    [
      "Completed",
      bookings.filter(b => b.status === "completed").length,
      "Finished trips",
      "completed"
    ],
    [
      "Awaiting Payment",
      money(pendingPayments),
      "Quoted but not marked paid",
      "unpaid"
    ]
  ];

  $("adminSummary").innerHTML = stats.map(
    ([label, value, sub, key]) =>
      `<article class="metric metric-${key}">
        <span class="metric-label">${label}</span>
        <strong>${value}</strong>
        <small>${sub}</small>
      </article>`
  ).join("");

  const filtered = bookings.filter(b => {
    const matches =
      activeFilter === "all" ||
      (
        activeFilter === "paid"
          ? String(b.payment_status).toLowerCase() === "paid"
          : activeFilter === "unpaid"
            ? String(b.payment_status).toLowerCase() !== "paid"
            : activeFilter === "active"
              ? ["accepted", "confirmed", "started", "in_progress"]
                  .includes(b.status)
              : b.status === activeFilter
      );

    const q = searchText.toLowerCase();

    return matches && (
      !q ||
      [
        b.reference_number,
        b.first_name,
        b.last_name,
        b.phone,
        b.tracking_pin,
        b.pickup_location,
        b.dropoff_location
      ].some(x =>
        String(x || "").toLowerCase().includes(q)
      )
    );
  });

  $("resultsCount").textContent =
    `${filtered.length} booking${filtered.length === 1 ? "" : "s"}`;

  $("adminRows").innerHTML = filtered.length
    ? filtered.map(b => `
      <article class="trip-card">
        <div class="trip-top">
          <div>
            <span class="trip-ref">
              ${esc(b.reference_number)}
            </span>
            <h3>
              ${esc(
                [b.first_name, b.last_name]
                  .filter(Boolean)
                  .join(" ")
              )}
            </h3>
          </div>
          <span class="trip-status status-${esc(
            String(b.status || "pending")
              .replace(/[^a-z_]/gi, "")
          )}">
            ${esc(b.status || "pending")}
          </span>
        </div>

        <div class="trip-route">
          <div>
            <span class="route-dot start"></span>
            <span>
              ${mapLink(
                b.pickup_map_link,
                b.pickup_location || "Pickup"
              )}
            </span>
          </div>
          <div>
            <span class="route-dot end"></span>
            <span>
              ${mapLink(
                b.dropoff_map_link,
                b.dropoff_location || "Drop-off"
              )}
            </span>
          </div>
        </div>

        <div class="trip-facts">
          <div>
            <small>Pickup (Dubai)</small>
            <b>${esc(fmtTime(b.pickup_time))}</b>
          </div>
          <div>
            <small>Tracking PIN</small>
            <b class="pin">${esc(b.tracking_pin || "—")}</b>
          </div>
          <div>
            <small>Price</small>
            <b>
              ${b.price == null
                ? "Not quoted"
                : esc(money(b.price))}
            </b>
          </div>
          <div>
            <small>Payment</small>
            <b class="payment-${esc(
              String(b.payment_status || "unpaid")
                .replace(/[^a-z]/gi, "")
            )}">
              ${esc(b.payment_status || "unpaid")}
            </b>
          </div>
        </div>

        <button
          type="button"
          class="manage-button"
          data-manage="${esc(b.id)}"
        >
          Manage Booking <span>→</span>
        </button>
      </article>
    `).join("")
    : `<div class="empty-state">
         No bookings match this filter.
       </div>`;

  document.querySelectorAll("[data-manage]").forEach(x => {
    x.onclick = () => openBooking(x.dataset.manage);
  });
}

function coordsFromMapLink(url){
  const m=String(url||"").match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  return m ? [Number(m[1]),Number(m[2])] : null;
}
async function loadDrivingDistance(b){
  const el=$("bookingDistanceV25"); if(!el)return;
  const a=coordsFromMapLink(b.pickup_map_link), z=coordsFromMapLink(b.dropoff_map_link);
  if(!a||!z){el.textContent="Distance unavailable (exact map pins required)";return;}
  el.textContent="Calculating…";
  try{
    const u=`https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${z[1]},${z[0]}?overview=false`;
    const r=await fetch(u); const j=await r.json(); const meters=j?.routes?.[0]?.distance;
    el.textContent=Number.isFinite(meters)?`${(meters/1000).toFixed(1)} km driving distance`:`Distance unavailable`;
  }catch{el.textContent="Distance unavailable";}
}

async function loadBookingRouteV28(b){
  const el=$("bookingRouteV28"); if(!el)return;
  try{
    const {data,error}=await db.rpc("admin_get_booking_stops_v28",{p_booking_id:b.id});
    if(error) throw error;
    const stops=Array.isArray(data)?data:[];
    activeBookingStopsV29 = stops;
    const lines=[`<div><strong>Pickup:</strong> ${mapLink(b.pickup_map_link,b.pickup_location)}</div>`];
    stops.forEach((x,i)=>lines.push(`<div><strong>Stop ${i+1}:</strong> ${mapLink(x.map_link,x.name)}</div>`));
    lines.push(`<div><strong>Drop-off:</strong> ${mapLink(b.dropoff_map_link,b.dropoff_location)}</div>`);
    el.innerHTML=lines.join("");
  }catch(e){
    activeBookingStopsV29 = [];
    el.innerHTML=`<div><strong>Pickup:</strong> ${mapLink(b.pickup_map_link,b.pickup_location)}</div><div><strong>Drop-off:</strong> ${mapLink(b.dropoff_map_link,b.dropoff_location)}</div>`;
  }
}


let activeBookingStopsV29 = [];

function dubaiGreetingV29(){
  const hour=Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Dubai",hour:"2-digit",hour12:false}).format(new Date()));
  return hour<12?"Good morning":hour<17?"Good afternoon":"Good evening";
}
function trackingUrlV29(b){
  const u=new URL("./tracking.html",location.href);
  if(b?.reference_number) u.searchParams.set("ref",b.reference_number);
  if(b?.pickup_time) u.searchParams.set("date",new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Dubai",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(b.pickup_time)));
  return u.href;
}
function customerMessageV29(b){
  const name=[b.first_name,b.last_name].filter(Boolean).join(" ")||"Customer";
  const stops=activeBookingStopsV29.map((x,i)=>`Stop ${i+1}: ${x.name}`).join("\n");
  const amount=b.price ?? b.estimated_price;
  const paid=String(b.payment_status||"unpaid").toLowerCase()==="paid";
  const lines=[
    `Dear ${name},`, `${dubaiGreetingV29()}.`, "", "Thank you for choosing Luxury Transport Dubai.", "",
    "Booking Details", `Booking Reference: ${b.reference_number}`, `Status: ${b.status||"pending"}`,
    `Pickup: ${b.pickup_location||"—"}`, stops, `Drop-off: ${b.dropoff_location||"—"}`,
    `Pickup Date & Time: ${fmtTime(b.pickup_time)}`, `Estimated End Time: ${fmtTime(b.estimated_end_time)}`,
    b.estimated_distance_km!=null?`Distance: ${Number(b.estimated_distance_km).toFixed(1)} km`:"",
    b.estimated_duration_minutes!=null?`Estimated Time: ${b.estimated_duration_minutes} min`:"",
    amount!=null?`Total Price: AED ${Number(amount).toFixed(2)}`:"Total Price: Pending",
    `Payment Status: ${b.payment_status||"unpaid"}`
  ].filter(Boolean);
  if(!paid){ lines.push("","Payment","Your booking is currently unpaid. You can pay here:",b.payment_link||trackingUrlV29(b)); }
  lines.push("","Track / View Booking",trackingUrlV29(b),"","Thank you for choosing Luxury Transport Dubai.","We look forward to serving you again on your next booking.","","Kind regards,","Captain Abdur Raheem","Luxury Transport Dubai");
  return lines.join("\n");
}
function openWhatsAppV29(b){
  const n=String(b.whatsapp||b.phone||"").replace(/\D/g,"");
  if(!n) return message("Customer WhatsApp number is missing.");
  window.open(`https://wa.me/${n}?text=${encodeURIComponent(customerMessageV29(b))}`,"_blank","noopener");
}
function openEmailV29(b){
  if(!b.email) return message("Customer email address is missing.");
  const subject=`Booking Update — ${b.reference_number}`;
  location.href=`mailto:${encodeURIComponent(b.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(customerMessageV29(b))}`;
}

function openBooking(id) {
  const b = bookings.find(
    x => String(x.id) === String(id)
  );

  if (!b) return;

  $("bookingManager").style.display = "block";
  $("manageId").value = b.id;

  $("manageTitle").textContent =
    `Manage ${b.reference_number} · PIN: ${b.tracking_pin || "—"}`;

  $("bookingInfo").innerHTML = `
    <div>
      <strong>Tracking PIN</strong><br>
      ${esc(b.tracking_pin || "—")}
    </div>
    <div>
      <strong>Customer</strong><br>
      ${esc(b.first_name)} ${esc(b.last_name || "")}
    </div>
    <div>
      <strong>Contact</strong><br>
      ${telLink(b.phone, b.phone)} ·
      ${waLink(b.whatsapp || b.phone)}
    </div>
    <div>
      <strong>Pickup</strong><br>
      ${mapLink(b.pickup_map_link, b.pickup_location)}
    </div>
    <div>
      <strong>Route / Stops</strong><br>
      <div id="bookingRouteV28">Loading route…</div>
    </div>
    <div>
      <strong>Passengers</strong><br>
      ${esc(b.passengers)}
    </div>
    <div>
      <strong>Customer comment</strong><br>
      ${esc(b.customer_comment || "-")}
    </div>
    <div>
      <strong>End date & time</strong><br>
      ${esc(fmtTime(b.estimated_end_time))}
    </div>
    <div>
      <strong>Distance</strong><br>
      <span id="bookingDistanceV25">Calculating…</span>
    </div>
    <div>
      <strong>Payment amount</strong><br>
      ${b.price == null ? (b.estimated_price == null ? "Pending" : esc(money(Number(b.estimated_price)))) : esc(money(Number(b.price)))}
    </div>
    <div>
      <strong>Payment status</strong><br>
      ${esc(b.payment_status || "unpaid")}
    </div>
    <div class="v29-send-actions" style="grid-column:1/-1;display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
      <button type="button" class="btn" id="sendWhatsAppV29">Send via WhatsApp</button>
      <button type="button" class="btn" id="sendEmailV29">Send via Email</button>
    </div>
  `;

  $("managePrice").value = b.price ?? b.estimated_price ?? "";
  $("managePickup").value = localInput(b.pickup_time);
  $("manageComment").value = b.admin_comment || "";
  $("managePaymentLink").value = b.payment_link || "";
  loadDrivingDistance(b);
  loadBookingRouteV28(b);
  $("sendWhatsAppV29")?.addEventListener("click",()=>openWhatsAppV29(b));
  $("sendEmailV29")?.addEventListener("click",()=>openEmailV29(b));

  $("bookingManager").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

async function load() {
  const {
    data: { session }
  } = await db.auth.getSession();

  if (!session) {
    location.href = "./login.html";
    return;
  }

  const { data: p } = await db
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();

  if (p?.role !== "admin") {
    location.href = "./customer.html";
    return;
  }

  const { data, error } =
    await db.rpc("admin_get_bookings");

  if (error) {
    alert(error.message);
    return;
  }

  bookings = data || [];
  render();
}

$("manageForm").addEventListener(
  "submit",
  async e => {
    e.preventDefault();

    message("Saving...");

    const args = {
      p_booking_id: $("manageId").value,
      p_action: $("manageAction").value,
      p_price:
        $("managePrice").value === ""
          ? null
          : Number($("managePrice").value),
      p_admin_comment:
        $("manageComment").value || null,
      p_payment_link:
        $("managePaymentLink").value || null,
      p_pickup_time:
        isoOrNull($("managePickup").value),
      p_estimated_end_time: null
    };

    const { error } = await db.rpc(
      "admin_update_booking",
      args
    );

    if (error) {
      message("Error: " + error.message);
      return;
    }

    message("Booking updated successfully.");


    await load();
    openBooking(args.p_booking_id);
  }
);

$("logout").onclick = async () => {
  await db.auth.signOut();
  location.href = "./index.html";
};


// Start Admin Panel
load();
