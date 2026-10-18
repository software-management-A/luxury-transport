(() => {
  "use strict";
  const db = window.supabaseClient;
  let currentUser = null;
  let logoutMinutes = 15;
  let warningSeconds = 60;
  let logoutTimer = null, warningTimer = null, countdownTimer = null;
  let lastActivityReset = 0;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

  function message(text, type = "info") { const el = $("customerMessage"); if (!el) return; el.style.display = "block"; el.className = `msg ${type === "error" ? "msg-error" : type === "success" ? "msg-success" : ""}`; el.textContent = text; setTimeout(() => { el.style.display = "none"; }, 4500); }
  async function signOut() { clearTimers(); await db.auth.signOut(); location.replace("./login.html"); }
  function clearTimers() { clearTimeout(logoutTimer); clearTimeout(warningTimer); clearInterval(countdownTimer); }
  function hideWarning() { const modal = $("logoutWarning"); if (modal) modal.hidden = true; clearInterval(countdownTimer); }
  function showWarning() { const modal = $("logoutWarning"); if (!modal) return; modal.hidden = false; let left = warningSeconds; $("logoutCountdown").textContent = left; clearInterval(countdownTimer); countdownTimer = setInterval(() => { left -= 1; $("logoutCountdown").textContent = Math.max(left, 0); if (left <= 0) clearInterval(countdownTimer); }, 1000); }
  function resetInactivity(force = false) { const now = Date.now(); if (!force && now - lastActivityReset < 1000) return; lastActivityReset = now; clearTimers(); hideWarning(); const totalMs = logoutMinutes * 60000; const warnMs = Math.max(0, totalMs - warningSeconds * 1000); warningTimer = setTimeout(showWarning, warnMs); logoutTimer = setTimeout(signOut, totalMs); }
  async function loadSessionSettings() { const { data } = await db.from("app_settings").select("customer_auto_logout_minutes,logout_warning_seconds").limit(1).maybeSingle(); logoutMinutes = Number(data?.customer_auto_logout_minutes) || 15; warningSeconds = Number(data?.logout_warning_seconds) || 60; resetInactivity(true); }
  function bindActivity() { ["click","keydown","touchstart","scroll"].forEach(name => window.addEventListener(name, () => resetInactivity(false), { passive: true })); $("stayLoggedIn")?.addEventListener("click", () => resetInactivity(true)); $("logoutNow")?.addEventListener("click", signOut); $("logout")?.addEventListener("click", e => { e.preventDefault(); signOut(); }); }

  function bindViews() { document.querySelectorAll(".account-menu-btn").forEach(btn => btn.addEventListener("click", () => { document.querySelectorAll(".account-menu-btn").forEach(b => b.classList.remove("active")); document.querySelectorAll(".account-view").forEach(v => v.classList.remove("active")); btn.classList.add("active"); $(btn.dataset.view)?.classList.add("active"); })); }

  async function loadProfile() {
    const { data: profile } = await db.from("profiles").select("first_name,last_name,phone,whatsapp,role,is_active").eq("id", currentUser.id).maybeSingle();
    if (profile?.is_active === false) return signOut();
    const first = profile?.first_name || currentUser.user_metadata?.first_name || "Customer";
    const last = profile?.last_name || currentUser.user_metadata?.last_name || "";
    $("welcomeText").textContent = `Welcome ${first}${last ? " " + last : ""}. Your account is private.`;
    $("profileDetails").innerHTML = `<div><span>Name</span><strong>${esc(`${first} ${last}`.trim())}</strong></div><div><span>Email</span><strong>${esc(currentUser.email)}</strong></div><div><span>Phone</span><strong>${esc(profile?.phone || currentUser.user_metadata?.phone || "—")}</strong></div>`;
  }

  async function loadBookings() {
    const { data, error } = await db.from("bookings").select("id,reference_number,pickup_time,pickup_location,dropoff_location,status,price,currency,payment_status").eq("user_id", currentUser.id).order("pickup_time", { ascending: false });
    if (error) { message("Could not load bookings: " + error.message, "error"); return; }
    const list = data || [], paid = list.filter(b => b.payment_status === "paid").length, upcoming = list.filter(b => b.pickup_time && new Date(b.pickup_time) >= new Date() && !["rejected","cancelled","completed"].includes(String(b.status).toLowerCase())).length;
    $("summary").innerHTML = `<div class="stat"><span>Bookings</span><strong>${list.length}</strong></div><div class="stat"><span>Upcoming</span><strong>${upcoming}</strong></div><div class="stat"><span>Paid</span><strong>${paid}</strong></div>`;
    const holder = $("bookingCards");
    if (!list.length) { holder.innerHTML = `<div class="empty-state"><strong>No account bookings yet</strong><p>New bookings made while signed in can appear here when linked to your account.</p><a class="btn" href="./booking.html">New Booking</a></div>`; return; }
    holder.innerHTML = list.map(b => `<article class="customer-booking"><div class="customer-booking-head"><strong>${esc(b.reference_number)}</strong><span class="status-pill">${esc(b.status)}</span></div><div class="customer-route">${esc(b.pickup_location)} <b>→</b> ${esc(b.dropoff_location)}</div><div class="customer-booking-meta"><span>${b.pickup_time ? esc(new Date(b.pickup_time).toLocaleString()) : "—"}</span><span>${b.price == null ? "Price pending" : `${esc(b.price)} ${esc(b.currency || "AED")}`}</span><span>Payment: ${esc(b.payment_status || "unpaid")}</span></div>${String(b.status).toLowerCase()==="completed"?`<button class="mini-btn review-trip" type="button" data-id="${esc(b.id)}">★ Leave Review</button>`:""}</article>`).join("");
    holder.querySelectorAll(".review-trip").forEach(btn=>btn.addEventListener("click",()=>submitReview(btn.dataset.id)));
  }

  async function loadLocations() {
    const { data, error } = await db.from("customer_saved_locations").select("id,label,location_type,location_name,address,latitude,longitude,google_maps_url,is_default").eq("user_id", currentUser.id).order("created_at", { ascending: false });
    if (error) { message("Could not load saved locations: " + error.message, "error"); return; }
    const holder = $("savedLocations"), list = data || [];
    holder.innerHTML = list.length ? list.map(l => `<div class="saved-location"><div><strong>${esc(l.label)}</strong><small>${esc(l.location_name)}${l.address ? " • " + esc(l.address) : ""}</small></div><button class="location-delete" data-id="${esc(l.id)}" type="button">Delete</button></div>`).join("") : `<div class="empty-state compact"><p>No saved locations yet.</p></div>`;
    holder.querySelectorAll(".location-delete").forEach(btn => btn.addEventListener("click", async () => { if (!confirm("Delete this saved location?")) return; const { error: delError } = await db.from("customer_saved_locations").delete().eq("id", btn.dataset.id).eq("user_id", currentUser.id); if (delError) return message(delError.message, "error"); message("Location deleted.", "success"); loadLocations(); }));
  }

  if ($("locationName")) LocationPicker.bind({name:$("locationName"),lat:$("locationLat"),lng:$("locationLng"),link:$("locationMap"),after:s=>{$("locationAddress").value=s.label;}});

  $("locationForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    const row = { user_id: currentUser.id, label: $("locationLabel").value.trim(), location_type: $("locationType").value, location_name: $("locationName").value.trim(), address: $("locationAddress").value.trim() || null, latitude: Number($("locationLat").value), longitude: Number($("locationLng").value), google_maps_url: $("locationMap").value.trim() || null };
    const { error } = await db.from("customer_saved_locations").insert(row);
    if (error) return message(error.message, "error"); e.target.reset(); message("Location saved.", "success"); loadLocations();
  });


  async function loadNotifications() {
    const holder = $("notificationList");
    if (!holder) return;
    const { data, error } = await db.from("notifications").select("id,title,message,is_read,created_at,booking_id").eq("user_id", currentUser.id).order("created_at", { ascending: false }).limit(100);
    if (error) { holder.innerHTML = `<div class="empty-state compact"><p>Notifications are not available yet.</p></div>`; return; }
    const list = data || [];
    const unread = list.filter(n => !n.is_read).length;
    const badge = $("notificationBadge");
    if (badge) { badge.textContent = unread; badge.hidden = unread === 0; }
    holder.innerHTML = list.length ? list.map(n => `<article class="customer-notification ${n.is_read ? "" : "unread"}" data-id="${esc(n.id)}"><div><strong>${esc(n.title || "Booking update")}</strong><p>${esc(n.message || "")}</p><small>${n.created_at ? esc(new Date(n.created_at).toLocaleString()) : ""}</small></div>${n.is_read ? "" : `<button type="button" class="mini-btn notification-read" data-id="${esc(n.id)}">Mark read</button>`}</article>`).join("") : `<div class="empty-state compact"><p>No notifications yet.</p></div>`;
    holder.querySelectorAll(".notification-read").forEach(btn => btn.addEventListener("click", async () => { await db.from("notifications").update({is_read:true}).eq("id",btn.dataset.id).eq("user_id",currentUser.id); loadNotifications(); }));
  }

  $("markAllRead")?.addEventListener("click", async () => {
    await db.from("notifications").update({is_read:true}).eq("user_id",currentUser?.id).eq("is_read",false);
    loadNotifications();
  });

  async function submitReview(bookingId) {
    const rating = Number(prompt("Rate this completed trip from 1 to 5 stars:"));
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return;
    const review = prompt("Write a short review:");
    if (!review?.trim()) return;
    const { error } = await db.from("customer_reviews").upsert({booking_id:bookingId,user_id:currentUser.id,rating,review_text:review.trim()},{onConflict:"booking_id"});
    if (error) return message(error.message,"error");
    message("Thank you. Your review will appear after Admin approval.","success");
  }

  async function start() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return location.replace("./login.html");
    currentUser = session.user;
    bindViews(); bindActivity(); await loadSessionSettings();
    await Promise.all([loadProfile(), loadBookings(), loadLocations(), loadNotifications()]);
  }
  db.auth.onAuthStateChange((event, session) => { if (event === "SIGNED_OUT" || (!session && event !== "INITIAL_SESSION")) location.replace("./login.html"); });
  start();
})();
