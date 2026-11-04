const db = window.supabaseClient;

const $ = (id) => document.getElementById(id);

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );

function show(id, text) {
  const e = $(id);

  if (e) {
    e.textContent = text;
    e.style.display = "block";
  }
}

function safeUrl(u) {
  try {
    const x = new URL(u);

    return ["http:", "https:"].includes(x.protocol)
      ? x.href
      : null;
  } catch {
    return null;
  }
}


/* =====================================================
   OPTIONAL MULTI-STOP BOOKING
   ===================================================== */
let extraStopCounter = 0;
$("addStopBtn")?.addEventListener("click", () => {
  extraStopCounter += 1; const row=document.createElement("div"); row.className="extra-stop-row route-point";
  row.innerHTML=`<div class="field"><label>Stop ${extraStopCounter}</label><input class="extra-stop-name" placeholder="Enter stop location" autocomplete="off" required><input class="extra-stop-map" type="hidden"><input class="extra-stop-lat" type="hidden"><input class="extra-stop-lng" type="hidden"></div><button type="button" class="location-delete extra-stop-remove">Remove</button>`;
  LocationPicker.bind({name:row.querySelector(".extra-stop-name"),lat:row.querySelector(".extra-stop-lat"),lng:row.querySelector(".extra-stop-lng"),link:row.querySelector(".extra-stop-map")});
  row.querySelector(".extra-stop-remove").onclick=()=>{row.remove(); scheduleEstimateV26();}; $("extraStops").appendChild(row);
});
function collectExtraStops(){return [...document.querySelectorAll("#extraStops .extra-stop-row")].map((row,i)=>({order:i+1,name:row.querySelector(".extra-stop-name").value.trim(),map_link:row.querySelector(".extra-stop-map").value.trim()||null,latitude:Number(row.querySelector(".extra-stop-lat").value)||null,longitude:Number(row.querySelector(".extra-stop-lng").value)||null})).filter(x=>x.name);}

/* =====================================================
   INTERNATIONAL PHONE INPUTS - V25
   ===================================================== */
const phoneInputs = {};
function initInternationalPhones(){
  if (!window.intlTelInput) return;
  const common = {
    initialCountry: "ae",
    separateDialCode: true,
    nationalMode: true,
    autoPlaceholder: "aggressive",
    strictMode: true,
    loadUtils: () => import("https://cdn.jsdelivr.net/npm/intl-tel-input@25.12.5/build/js/utils.js")
  };
  if ($("mobile")) phoneInputs.mobile = window.intlTelInput($("mobile"), common);
  if ($("whatsapp")) phoneInputs.whatsapp = window.intlTelInput($("whatsapp"), common);
}
function validPhone(key, required){
  const input=$(key), iti=phoneInputs[key];
  if(!input) return {ok:!required,value:null};
  if(!input.value.trim()) return {ok:!required,value:null};
  if(!iti || !iti.isValidNumber()) return {ok:false,value:null};
  return {ok:true,value:iti.getNumber()};
}
initInternationalPhones();


/* =====================================================
   V26 LIVE ROUTE ESTIMATE
   End time = OSRM driving duration + 10 minutes.
   Approximate price = distance x configured price/km.
   ===================================================== */
let routeEstimateV26 = null;
let estimateTimerV26 = null;
async function getPricePerKmV26(){
  try{
    const {data,error}=await db.from("app_settings").select("price_per_km").limit(1).maybeSingle();
    if(!error && Number(data?.price_per_km)>0) return Number(data.price_per_km);
  }catch(_e){}
  return 5;
}
function routePointsV26(){
  const pts=[];
  const a=[Number($("pickupLat")?.value),Number($("pickupLng")?.value)];
  if(a.every(Number.isFinite)&&a[0]&&a[1]) pts.push(a);
  document.querySelectorAll("#extraStops .extra-stop-row").forEach(row=>{
    const x=[Number(row.querySelector(".extra-stop-lat")?.value),Number(row.querySelector(".extra-stop-lng")?.value)];
    if(x.every(Number.isFinite)&&x[0]&&x[1]) pts.push(x);
  });
  const z=[Number($("dropoffLat")?.value),Number($("dropoffLng")?.value)];
  if(z.every(Number.isFinite)&&z[0]&&z[1]) pts.push(z);
  return pts;
}
function fmtEndV26(iso){
  if(!iso)return "—";
  return new Date(iso).toLocaleString("en-GB",{timeZone:"Asia/Dubai",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
}
async function updateRouteEstimateV26(){
  const box=$("tripEstimateV26"), pts=routePointsV26(), pickup=$("pickupTime")?.value;
  if(!box)return;
  if(pts.length<2){box.style.display="none";routeEstimateV26=null;return;}
  box.style.display="block";
  $("estimateDistance").textContent="Distance: calculating…";
  $("estimateDuration").textContent="Driving time: calculating…";
  $("estimateEnd").textContent="Approx. end time: calculating…";
  $("estimatePrice").textContent="Approx. price: calculating…";
  try{
    const coords=pts.map(([lat,lng])=>`${lng},${lat}`).join(";");
    const res=await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`);
    const json=await res.json(); const route=json?.routes?.[0];
    if(!res.ok||!route) throw new Error("Route unavailable");
    const km=route.distance/1000, driveMin=Math.ceil(route.duration/60), totalMin=driveMin+10;
    const rate=await getPricePerKmV26(); const approx=Math.ceil(km*rate);
    let endIso=null;
    if(pickup){const d=new Date(pickup); if(!Number.isNaN(d.getTime())){d.setMinutes(d.getMinutes()+totalMin);endIso=d.toISOString();}}
    routeEstimateV26={distance_km:Number(km.toFixed(2)),driving_minutes:driveMin,total_minutes:totalMin,estimated_price:approx,estimated_end_time:endIso};
    $("estimateDistance").textContent=`Distance: ${km.toFixed(1)} km`;
    $("estimateDuration").textContent=`Estimated trip time: approx. ${totalMin} min`;
    $("estimateEnd").textContent=`Approx. end time: ${fmtEndV26(endIso)}`;
    $("estimatePrice").textContent=`Approx. price: AED ${approx.toFixed(2)}`;
  }catch(e){
    routeEstimateV26=null;
    $("estimateDistance").textContent="Route estimate temporarily unavailable";
    $("estimateDuration").textContent="Driving time: —"; $("estimateEnd").textContent="Approx. end time: —"; $("estimatePrice").textContent="Approx. price: —";
  }
}
function scheduleEstimateV26(){clearTimeout(estimateTimerV26);estimateTimerV26=setTimeout(updateRouteEstimateV26,250);}
document.addEventListener("location:selected",scheduleEstimateV26);
$("pickupTime")?.addEventListener("change",scheduleEstimateV26);

/* =====================================================
   BOOKING FORM
   ===================================================== */

$("bookingForm")?.addEventListener(
  "submit",
  async (e) => {
    e.preventDefault();

    if (!LocationPicker.isSelected($("pickupLocation")) || !LocationPicker.isSelected($("dropoffLocation"))) {
      return show("bookingMessage", "Please select exact pickup and drop-off from search, Current Location, or Choose on Map.");
    }
    const invalidStop = [...document.querySelectorAll("#extraStops .extra-stop-name")].find(x => x.value.trim() && !LocationPicker.isSelected(x));
    if (invalidStop) return show("bookingMessage", "Please select every additional stop from search, Current Location, or Choose on Map.");

    const mobileCheck = validPhone("mobile", true);
    if (!mobileCheck.ok) return show("bookingMessage", "Please enter a valid mobile number for the selected country.");
    const whatsappCheck = validPhone("whatsapp", false);
    if (!whatsappCheck.ok) return show("bookingMessage", "Please enter a valid WhatsApp number for the selected country, or leave it empty.");
    if (!$('email')?.checkValidity()) return show("bookingMessage", "Please enter a valid email address.");

    const extraStopsPreview = collectExtraStops();
    if (extraStopsPreview.length) {
      if (!routeEstimateV26) {
        await updateRouteEstimateV26();
      }
      if (!routeEstimateV26) return show("bookingMessage", "Please wait for the route calculation and try again.");
      const routeLines = [
        `Pickup: ${$("pickupLocation").value.trim()}`,
        ...extraStopsPreview.map((x,i)=>`Stop ${i+1}: ${x.name}`),
        `Drop-off: ${$("dropoffLocation").value.trim()}`
      ];
      const summary = [
        "Please confirm stops",
        "",
        ...routeLines,
        "",
        `Distance: ${routeEstimateV26.distance_km.toFixed(1)} km`,
        `Estimated time: ${routeEstimateV26.total_minutes} min`,
        `Approx. end time: ${fmtEndV26(routeEstimateV26.estimated_end_time)}`,
        `Approx. price: AED ${Number(routeEstimateV26.estimated_price).toFixed(2)}`
      ].join("\n");
      if (!window.confirm(summary)) return;
    }

    show(
      "bookingMessage",
      "Sending request...",
    );

    const v = (id) =>
      $(id)?.value || null;

    const tripDate =
      (v("pickupTime") || "").slice(
        0,
        10,
      );

    const { data, error } =
      await db.rpc(
        "create_guest_booking_v28",
        {
          p_first_name:
            v("firstName"),
          p_email:
            v("email"),

          p_last_name:
            v("lastName"),

          p_mobile:
            mobileCheck.value,

          p_whatsapp:
            whatsappCheck.value,

          p_pickup_location:
            v("pickupLocation"),

          p_pickup_map_link:
            v("pickupMapLink"),

          p_dropoff_location:
            v("dropoffLocation"),

          p_dropoff_map_link:
            v("dropoffMapLink"),

          p_pickup_time:
            v("pickupTime"),

          p_trip_type:
            v("tripType"),

          p_passengers:
            Number(
              v("passengers") || 1,
            ),

          p_comment:
            v("comment"),

          p_estimated_distance_km: routeEstimateV26?.distance_km ?? null,
          p_estimated_duration_minutes: routeEstimateV26?.total_minutes ?? null,
          p_estimated_end_time: routeEstimateV26?.estimated_end_time ?? null,
          p_estimated_price: routeEstimateV26?.estimated_price ?? null,
        },
      );

    if (error) {
      return show(
        "bookingMessage",
        "Error: " + error.message,
      );
    }

    const r =
      Array.isArray(data)
        ? data[0]
        : data;


    if (!r) {
      box.textContent =
        "No matching request found.";

      return;
    }

    const limited =
      method === "mobile";

    if (limited) {
      box.innerHTML = `
        <div class="track-card">

          <strong>
            ${esc(
              r.reference_number ||
                "Booking",
            )}
          </strong>

          <p>
            Status:
            ${esc(
              r.status ||
                "pending",
            )}
          </p>

          <p>
            For full details,
            use your PIN or booking number.
          </p>

        </div>
      `;

      return;
    }

    const pick =
      safeUrl(
        r.pickup_map_link,
      );

    const drop =
      safeUrl(
        r.dropoff_map_link,
      );

    const status =
      String(
        r.status ||
          "pending",
      ).replaceAll(
        "_",
        " ",
      );

    const pstatus =
      String(
        r.payment_status ||
          "unpaid",
      ).replaceAll(
        "_",
        " ",
      );

    const normalizedStatus =
      status
        .trim()
        .toLowerCase();

    const normalizedPaymentStatus =
      pstatus
        .trim()
        .toLowerCase();

    const price =
      Number(r.price);

    const bookingFils =
      Number.isFinite(price)
        ? Math.round(price * 100)
        : 0;

    const processingFeeFils =
      bookingFils > 0
        ? Math.round((bookingFils * 5) / 100) + 100
        : 0;

    const totalFils =
      bookingFils + processingFeeFils;

    const money = (fils) =>
      (fils / 100).toLocaleString("en-AE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    const customerName =
      String(r.first_name || "Guest").trim() || "Guest";

    const displayTripDate = (() => {
      const parts = String(tripDate || "").split("-");
      if (parts.length !== 3) return tripDate;
      const d = new Date(`${parts[0]}-${parts[1]}-${parts[2]}T12:00:00`);
      return Number.isNaN(d.getTime())
        ? tripDate
        : new Intl.DateTimeFormat("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }).format(d);
    })();

    /*
     * Pay Now is available only when:
     *
     * 1. Booking is accepted
     * 2. Price is valid
     * 3. Price is at least AED 2
     * 4. Booking is not already paid
     */
    const canPay =
      normalizedStatus ===
        "accepted" &&
      Number.isFinite(price) &&
      price >= 2 &&
      normalizedPaymentStatus !==
        "paid";

    box.innerHTML = `
      <div class="track-card">

        <div class="track-head">

          <strong>
            ${esc(
              r.reference_number ||
                $("trackKey").value,
            )}
          </strong>

          <span class="status-pill">
            ${esc(status)}
          </span>

        </div>

        <div class="track-row">

          <span>
            Price
          </span>

          <strong>
            ${
              r.price == null
                ? "Pending"
                : esc(r.price) +
                  " " +
                  esc(
                    r.currency ||
                      "AED",
                  )
            }
          </strong>

        </div>

        <div class="track-row">

          <span>
            Payment status
          </span>

          <strong>
            ${esc(pstatus)}
          </strong>

        </div>

        <div class="track-row">

          <span>
            Pickup
          </span>

          <strong>
            ${esc(
              r.pickup_location ||
                "-",
            )}
          </strong>

        </div>

        ${
          pick
            ? `
              <a
                class="map-btn"
                href="${esc(pick)}"
                target="_blank"
                rel="noopener"
              >
                Open Pickup in Google Maps ↗
              </a>
            `
            : ""
        }

        <div class="track-row">

          <span>
            Drop-off
          </span>

          <strong>
            ${esc(
              r.dropoff_location ||
                "-",
            )}
          </strong>

        </div>

        ${
          drop
            ? `
              <a
                class="map-btn"
                href="${esc(drop)}"
                target="_blank"
                rel="noopener"
              >
                Open Drop-off in Google Maps ↗
              </a>
            `
            : ""
        }

        ${
          r.admin_comment
            ? `
              <div class="track-note">

                <span>
                  Captain / Admin comment
                </span>

                <p>
                  ${esc(
                    r.admin_comment,
                  )}
                </p>

              </div>
            `
            : ""
        }

        ${
          canPay
            ? `
              <section class="payment-panel" aria-label="Secure payment summary">
                <div class="payment-welcome">
                  <span class="payment-lock">🔒</span>
                  <div>
                    <h3>Welcome, ${esc(customerName)}</h3>
                    <p>Thank you for choosing Luxury Transport Dubai. We truly appreciate your trust in us.</p>
                  </div>
                </div>

                <div class="payment-meta">
                  <div>
                    <span>Booking ID</span>
                    <strong>${esc(r.reference_number || "-")}</strong>
                  </div>
                  <div>
                    <span>Trip Date</span>
                    <strong>${esc(displayTripDate || "-")}</strong>
                  </div>
                </div>

                <div class="payment-breakdown">
                  <div>
                    <span>Booking Amount</span>
                    <strong>${esc(money(bookingFils))} AED</strong>
                  </div>
                  <div>
                    <span>Ziina Processing Fee</span>
                    <strong>${esc(money(processingFeeFils))} AED</strong>
                  </div>
                  <div class="payment-total">
                    <span>Total</span>
                    <strong>${esc(money(totalFils))} AED</strong>
                  </div>
                </div>

                <p class="payment-tip">Optional tip can be added at checkout when available.</p>

                <button
                  type="button"
                  id="ziinaPayNow"
                  class="btn pay-btn"
                >
                  Pay Securely — ${esc(money(totalFils))} AED
                </button>

                <p class="payment-powered">Secure payment powered by Ziina</p>
              </section>
            `
            : normalizedPaymentStatus === "paid"
              ? `
                <div class="payment-success">
                  <strong>✓ Payment received</strong>
                  <p>Thank you for your payment and for trusting Luxury Transport Dubai. We look forward to serving you.</p>
                </div>
              `
              : ""
        }

      </div>
    `;

    if (canPay) {
      const payButton =
        $("ziinaPayNow");

      payButton?.addEventListener(
        "click",
        () => {
          createZiinaPayment(
            r.reference_number,
            tripDate,
            payButton,
          );
        },
      );
    }
  },
);

/* =====================================================
   TRACKING METHOD LABELS
   ===================================================== */

const trackLabels = {
  pin: [
    "6-digit PIN",
    "Enter 6-digit PIN",
  ],

  reference: [
    "Booking number",
    "TRP-2026-000002",
  ],

  mobile: [
    "Mobile number",
    "+971...",
  ],
};

$("trackMethod")?.addEventListener(
  "change",
  () => {
    const a =
      trackLabels[
        $("trackMethod").value
      ];

    $("trackKeyLabel").textContent =
      a[0];

    $("trackKey").placeholder =
      a[1];

    $("trackKey").value =
      "";
  },
);

/* =====================================================
   SHARED TRACKING LINKS
   ===================================================== */

// Supports:
// #track?ref=TRP-...&date=YYYY-MM-DD
//
// PIN is never included in shared URLs.

function openSharedTrackingLink() {
  const query =
    new URLSearchParams(
      window.location.search,
    );

  const hash =
    window.location.hash ||
    "";

  const hashQuery =
    hash.includes("?")
      ? new URLSearchParams(
          hash.slice(
            hash.indexOf("?") +
              1,
          ),
        )
      : new URLSearchParams();

  const ref =
    hashQuery.get("ref") ||
    query.get("ref");

  const date =
    hashQuery.get("date") ||
    query.get("date");

  if (
    !ref ||
    !/^TRP-[0-9]{4}-[0-9]{6}$/i.test(
      ref,
    ) ||
    !date ||
    !/^\d{4}-\d{2}-\d{2}$/.test(
      date,
    )
  ) {
    return;
  }

  const form =
    $("trackForm");

  const method =
    $("trackMethod");

  const key =
    $("trackKey");

  const day =
    $("trackDate");

  const target =
    $("track");

  if (
    !form ||
    !method ||
    !key ||
    !day
  ) {
    return;
  }

  method.value =
    "reference";

  method.dispatchEvent(
    new Event("change"),
  );

  key.value =
    ref.toUpperCase();

  day.value =
    date;

  target?.scrollIntoView({
    behavior: "auto",
    block: "start",
  });

  if (
    typeof form.requestSubmit ===
    "function"
  ) {
    form.requestSubmit();
  } else {
    form.dispatchEvent(
      new Event(
        "submit",
        {
          bubbles: true,
          cancelable: true,
        },
      ),
    );
  }
}

window.addEventListener(
  "hashchange",
  openSharedTrackingLink,
);

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    openSharedTrackingLink,
    {
      once: true,
    },
  );
} else {
  openSharedTrackingLink();
}
