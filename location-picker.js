(function(){
  const state={target:null,map:null,marker:null};
  function ensureModal(){
    if(document.getElementById('locationPickerModal')) return;
    const d=document.createElement('div'); d.id='locationPickerModal'; d.className='map-modal'; d.innerHTML=`<div class="map-sheet"><div class="map-head"><strong>Select exact location</strong><button type="button" id="mapClose">✕</button></div><div class="map-search"><input id="mapSearchInput" placeholder="Search place, building or area"><button type="button" id="mapSearchBtn">Search</button><button type="button" id="mapCurrentBtn">Current location</button></div><div id="locationMap"></div><p class="muted" id="mapSelectedText">Tap the map to place the pin.</p><button type="button" class="btn" id="mapUseBtn">Use this location</button></div>`; document.body.appendChild(d);
    document.getElementById('mapClose').onclick=()=>d.classList.remove('open');
    d.addEventListener('click',e=>{if(e.target===d)d.classList.remove('open')});
    document.getElementById('mapSearchBtn').onclick=search;
    document.getElementById('mapCurrentBtn').onclick=current;
    document.getElementById('mapUseBtn').onclick=use;
  }
  function initMap(){
    if(state.map){setTimeout(()=>state.map.invalidateSize(),50);return;}
    state.map=L.map('locationMap').setView([25.2048,55.2708],11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(state.map);
    state.map.on('click',e=>setPin(e.latlng.lat,e.latlng.lng));
  }
  async function reverse(lat,lng){
    try{const r=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en`);const j=await r.json();return j.display_name||`${lat.toFixed(6)}, ${lng.toFixed(6)}`;}catch{return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;}
  }
  async function setPin(lat,lng,name){
    if(state.marker) state.marker.setLatLng([lat,lng]); else state.marker=L.marker([lat,lng],{draggable:true}).addTo(state.map).on('dragend',async e=>{const p=e.target.getLatLng();await setPin(p.lat,p.lng)});
    state.map.setView([lat,lng],16); const label=name||await reverse(lat,lng); state.selected={lat,lng,label}; document.getElementById('mapSelectedText').textContent=label;
  }
  async function search(){const q=document.getElementById('mapSearchInput').value.trim();if(!q)return; const r=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ae&q=${encodeURIComponent(q)}`);const a=await r.json();if(a[0])setPin(+a[0].lat,+a[0].lon,a[0].display_name);else document.getElementById('mapSelectedText').textContent='Location not found. Try another search.';}
  function current(){if(!navigator.geolocation)return; navigator.geolocation.getCurrentPosition(p=>setPin(p.coords.latitude,p.coords.longitude),()=>document.getElementById('mapSelectedText').textContent='Location permission was not available.');}
  function use(){if(!state.selected||!state.target)return; const t=state.target,s=state.selected; t.name.value=s.label; t.lat.value=s.lat; t.lng.value=s.lng; if(t.link)t.link.value=`https://www.google.com/maps?q=${s.lat},${s.lng}`; document.getElementById('locationPickerModal').classList.remove('open'); if(t.after)t.after(s);}
  window.LocationPicker={open(opts){ensureModal();state.target=opts;state.selected=null;document.getElementById('mapSelectedText').textContent='Tap the map to place the pin.';document.getElementById('locationPickerModal').classList.add('open');initMap(); const lat=+opts.lat.value,lng=+opts.lng.value;if(lat&&lng)setPin(lat,lng,opts.name.value);}}
})();
