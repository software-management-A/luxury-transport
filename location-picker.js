(function () {
  "use strict";

  const state = { target: null, map: null, marker: null, selected: null, timer: null, verified: [] };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  function ensureModal() {
    if (document.getElementById("locationPickerModal")) return;
    const d = document.createElement("div");
    d.id = "locationPickerModal";
    d.className = "map-modal";
    d.innerHTML = `<div class="map-sheet"><div class="map-head"><div><strong>Choose on Map</strong><small>Move the pin or tap the exact location</small></div><button type="button" id="mapClose">✕</button></div><div id="locationMap"></div><p class="muted" id="mapSelectedText">Tap the map to place the pin.</p><button type="button" class="btn" id="mapUseBtn">Use this location</button></div>`;
    document.body.appendChild(d);
    document.getElementById("mapClose").onclick = () => d.classList.remove("open");
    d.addEventListener("click", e => { if (e.target === d) d.classList.remove("open"); });
    document.getElementById("mapUseBtn").onclick = use;
  }

  function initMap() {
    if (!window.L) return;
    if (state.map) { setTimeout(() => state.map.invalidateSize(), 80); return; }
    state.map = L.map("locationMap").setView([25.2048, 55.2708], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(state.map);
    state.map.on("click", e => setPin(e.latlng.lat, e.latlng.lng));
  }

  async function reverse(lat, lng) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en`);
      const j = await r.json();
      return j.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    } catch { return `${lat.toFixed(6)}, ${lng.toFixed(6)}`; }
  }

  async function setPin(lat, lng, label) {
    if (!state.map) return;
    if (state.marker) state.marker.setLatLng([lat, lng]);
    else state.marker = L.marker([lat, lng], { draggable: true }).addTo(state.map).on("dragend", async e => { const p = e.target.getLatLng(); await setPin(p.lat, p.lng); });
    state.map.setView([lat, lng], 16);
    const name = label || await reverse(lat, lng);
    state.selected = { lat, lng, label: name };
    const text = document.getElementById("mapSelectedText");
    if (text) text.textContent = name;
  }

  function apply(target, s) {
    target.name.value = s.label;
    target.lat.value = s.lat;
    target.lng.value = s.lng;
    if (target.link) target.link.value = `https://www.google.com/maps?q=${s.lat},${s.lng}`;
    target.name.dataset.locationSelected = "1";
    target.name.dispatchEvent(new CustomEvent("location:selected", { detail: s }));
    if (target.after) target.after(s);
  }

  function use() {
    if (!state.selected || !state.target) return;
    apply(state.target, state.selected);
    document.getElementById("locationPickerModal")?.classList.remove("open");
  }

  function open(opts) {
    ensureModal();
    state.target = opts;
    state.selected = null;
    document.getElementById("mapSelectedText").textContent = "Tap the map to place the pin.";
    document.getElementById("locationPickerModal").classList.add("open");
    initMap();
    const lat = +opts.lat.value, lng = +opts.lng.value;
    if (lat && lng) setPin(lat, lng, opts.name.value);
  }

  function current(opts) {
    if (!navigator.geolocation) return alert("Current Location is not supported on this device.");
    navigator.geolocation.getCurrentPosition(async p => {
      const lat = p.coords.latitude, lng = p.coords.longitude;
      const label = await reverse(lat, lng);
      apply(opts, { lat, lng, label });
      closeSuggestions(opts.name);
    }, () => alert("Location permission was not available. Please allow location access or choose on map."), { enableHighAccuracy: true, timeout: 12000 });
  }

  async function loadVerified() {
    if (!window.supabaseClient) return [];
    try {
      const { data } = await window.supabaseClient.from("verified_locations").select("name,address,latitude,longitude").eq("is_active", true).limit(100);
      state.verified = data || [];
    } catch { state.verified = []; }
    return state.verified;
  }

  function ensureSuggestions(input) {
    let box = input.parentElement.querySelector(".location-suggestions");
    if (!box) { box = document.createElement("div"); box.className = "location-suggestions"; input.insertAdjacentElement("afterend", box); }
    return box;
  }

  function closeSuggestions(input) {
    const box = input?.parentElement?.querySelector(".location-suggestions");
    if (box) box.classList.remove("open");
  }

  function quickOptions(opts) {
    const box = ensureSuggestions(opts.name);
    box.innerHTML = `<button type="button" class="location-option location-current"><b>📍 Current Location</b><small>Use your phone's current position</small></button><button type="button" class="location-option location-map"><b>🗺️ Choose on Map</b><small>Drop a pin on the exact location</small></button>`;
    box.classList.add("open");
    box.querySelector(".location-current").onclick = () => current(opts);
    box.querySelector(".location-map").onclick = () => { closeSuggestions(opts.name); open(opts); };
  }

  function rankVerified(q) {
    const s = q.toLowerCase();
    return state.verified.map(x => ({ x, text: `${x.name || ""} ${x.address || ""}`.toLowerCase() }))
      .filter(o => o.text.includes(s))
      .sort((a,b) => Number(b.text.startsWith(s)) - Number(a.text.startsWith(s)))
      .slice(0,6).map(o => o.x);
  }

  async function externalSearch(q) {
    if (q.length < 3) return [];
    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en&lat=25.2048&lon=55.2708`;
      const r = await fetch(url);
      const j = await r.json();
      return (j.features || []).map(f => {
        const p = f.properties || {}, c = f.geometry?.coordinates || [];
        const parts = [p.name, p.street, p.district, p.city, p.state, p.country].filter(Boolean);
        return { label: parts.join(", "), lat: +c[1], lng: +c[0] };
      }).filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lng));
    } catch { return []; }
  }

  async function showSearch(opts, q) {
    const box = ensureSuggestions(opts.name);
    const local = rankVerified(q).map(x => ({ label: x.address ? `${x.name}, ${x.address}` : x.name, lat: +x.latitude, lng: +x.longitude }));
    const remote = await externalSearch(q);
    const key = q.toLowerCase();
    const all = [...local, ...remote].filter((x,i,a) => x.label && a.findIndex(y => y.label.toLowerCase() === x.label.toLowerCase()) === i)
      .sort((a,b) => Number(b.label.toLowerCase().startsWith(key)) - Number(a.label.toLowerCase().startsWith(key))).slice(0,10);
    if (opts.name.value.trim() !== q) return;
    box.innerHTML = `<button type="button" class="location-option location-current"><b>📍 Current Location</b></button><button type="button" class="location-option location-map"><b>🗺️ Choose on Map</b></button>${all.length ? all.map((x,i)=>`<button type="button" class="location-option location-result" data-i="${i}"><b>${esc(x.label.split(",")[0])}</b><small>${esc(x.label)}</small></button>`).join("") : `<div class="location-no-result">${q.length < 3 ? "Type at least 3 characters for more places." : "No matching place found. You can choose it on the map."}</div>`}`;
    box.classList.add("open");
    box.querySelector(".location-current").onclick = () => current(opts);
    box.querySelector(".location-map").onclick = () => { closeSuggestions(opts.name); open(opts); };
    box.querySelectorAll(".location-result").forEach(b => b.onclick = () => { apply(opts, all[+b.dataset.i]); closeSuggestions(opts.name); });
  }

  function bind(opts) {
    if (!opts?.name || opts.name.dataset.locationBound === "1") return;
    opts.name.dataset.locationBound = "1";
    opts.name.removeAttribute("readonly");
    opts.name.setAttribute("autocomplete", "off");
    opts.name.addEventListener("focus", () => { if (!opts.name.value.trim()) quickOptions(opts); else showSearch(opts, opts.name.value.trim()); });
    opts.name.addEventListener("input", () => {
      opts.name.dataset.locationSelected = "0";
      opts.lat.value = ""; opts.lng.value = ""; if (opts.link) opts.link.value = "";
      clearTimeout(state.timer);
      const q = opts.name.value.trim();
      if (!q) return quickOptions(opts);
      state.timer = setTimeout(() => showSearch(opts, q), q.length < 3 ? 80 : 350);
    });
    document.addEventListener("click", e => { if (!opts.name.parentElement.contains(e.target)) closeSuggestions(opts.name); });
  }

  loadVerified();
  window.LocationPicker = { open, bind, current, refreshVerified: loadVerified };
})();
