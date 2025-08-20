(function(){
  // --- Helpers ---
  const isAR = (document.documentElement.lang || "").toLowerCase().startsWith("ar");
  const pick = (en, ar) => (isAR && ar ? ar : en);

  // --- Saudi Arabia bounds (tight) ---
  const KSA_BOUNDS = L.latLngBounds([16.22, 34.29], [32.14, 55.40]);
  // Pad by ~1.5° each side so auto-pan has room with maxBounds
  const pad = 1.5;
  const KSA_PAD = L.latLngBounds(
    [KSA_BOUNDS.getSouth() - pad, KSA_BOUNDS.getWest() - pad],
    [KSA_BOUNDS.getNorth() + pad, KSA_BOUNDS.getEast() + pad]
  );

  // Create map clamped to padded KSA
  const map = L.map("map", {
    maxBounds: KSA_PAD,
    maxBoundsViscosity: 0.75,
    zoomSnap: 0.5,
    worldCopyJump: false
  });

  // Compute a min zoom that keeps view inside KSA on this screen
  const minZoom = map.getBoundsZoom(KSA_BOUNDS, true);
  map.setMinZoom(minZoom);
  map.fitBounds(KSA_BOUNDS);

  // Basemap, no world wrap
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    noWrap: true,
    bounds: KSA_PAD
  }).addTo(map);

  // --- Elements (filters) ---
  const el = (id) => document.getElementById(id);
  const $region = el("filter-region");
  const $gov    = el("filter-governorate");
  const $crop   = el("filter-crop");
  const $water  = el("filter-water");
  const $irr    = el("filter-irr");
  const $farmer = el("filter-farmer");
  const $clear  = el("filter-clear");

  // Ensure Clear button is localized correctly (EN/AR)
  if ($clear) $clear.textContent = isAR ? "مسح" : "Clear";

  // labels for popup (from hidden i18n div)
  const LBL = (() => {
    const n = document.getElementById("i18n");
    const d = n ? n.dataset : {};
    return {
      region:       d.region       || "Region",
      governorate:  d.governorate  || "Governorate",
      crop:         d["cropType"]     || d["crop-type"] || "Crop Type",
      water:        d["waterSource"]  || "Water Source",
      irr:          d["irrType"]      || "Irrigation System Type",
      du:           d.du           || "Distribution Uniformity",
    };
  })();

  let all = [];                 // GeoJSON features
  const layer = L.layerGroup().addTo(map);

  const by = (arr, key) => {
    const s = new Set();
    arr.forEach(f => {
      const p = f.properties || {};
      if (p[key]) s.add(String(p[key]).trim());
    });
    return Array.from(s).sort((a,b)=>a.localeCompare(b));
  };

  const fillOptions = (select, values) => {
    if (!select) return;
    const first = select.querySelector("option");
    select.innerHTML = "";
    if (first) select.append(first);
    values.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v; opt.textContent = v;
      select.append(opt);
    });
  };

  const normalize = (s) => (s||"").toString().toLowerCase().trim();

  const matches = (p) => {
    // Always filter on EN keys (the option lists are built from EN values)
    if ($region && $region.value && p.region !== $region.value) return false;
    if ($gov    && $gov.value    && p.governorate !== $gov.value) return false;
    if ($crop   && $crop.value   && p.crop_type !== $crop.value) return false;
    if ($water  && $water.value  && p.water_source !== $water.value) return false;
    if ($irr    && $irr.value    && p.irrigation_system_type !== $irr.value) return false;
    const q = $farmer ? normalize($farmer.value) : "";
    if (q && !normalize(p.farmer_name).includes(q)) return false;
    return true;
  };

  const popupHTML = (p) => {
    // Prefer AR content when available and page lang is AR
    const farmer       = pick(p.farmer_name, p.farmer_name_ar);
    const region       = pick(p.region, p.region_ar);
    const governorate  = pick(p.governorate, p.governorate_ar);
    const crop         = pick(p.crop_type, p.crop_type_ar);
    const water        = pick(p.water_source, p.water_source_ar);
    const irr          = pick(p.irrigation_system_type, p.irrigation_system_type_ar);
    const desc         = pick(p.description, p.description_ar);

    const imgs = (p.images || []).slice(0,4).map(i =>
      `<a href="${i.image}" target="_blank" rel="noopener"><img src="${i.image}" alt=""/></a>`
    ).join("");

    const du = (p.distribution_uniformity_pct != null) ? (p.distribution_uniformity_pct + "%") : "-";

    return `
      <div class="popup">
        <h3 class="popup-title">${farmer || ""}</h3>
        <div class="meta">
          <table>
            <tr><th>${LBL.region}:</th><td>${region || ""}</td></tr>
            <tr><th>${LBL.governorate}:</th><td>${governorate || ""}</td></tr>
            <tr><th>${LBL.crop}:</th><td>${crop || ""}</td></tr>
            <tr><th>${LBL.water}:</th><td>${water || ""}</td></tr>
            <tr><th>${LBL.irr}:</th><td>${irr || ""}</td></tr>
            <tr><th>${LBL.du}:</th><td>${du}</td></tr>
          </table>
        </div>
        <div class="desc">${desc || ""}</div>
        <div class="gallery">${imgs}</div>
      </div>`;
  };

  const render = () => {
    layer.clearLayers();
    const filtered = all.filter(f => matches(f.properties || {}));
    const markers = [];

    filtered.forEach(f => {
      const [lon, lat] = (f.geometry && f.geometry.coordinates) || [];
      if (lat == null || lon == null) return;
      const p = f.properties || {};
      const m = L.marker([lat, lon]).bindPopup(popupHTML(p));
      layer.addLayer(m);
      markers.push(m);
    });

    if (markers.length) {
      const group = L.featureGroup(markers);
      const b = group.getBounds().pad(0.2);
      const clamped = b.intersection(KSA_PAD) || KSA_BOUNDS;
      map.fitBounds(clamped);
    } else {
      map.fitBounds(KSA_BOUNDS);
    }
  };

  const debounce = (fn, ms=200) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

  [$region,$gov,$crop,$water,$irr].filter(Boolean).forEach(sel => sel.addEventListener("change", render));
  if ($farmer) $farmer.addEventListener("input", debounce(render, 250));
  if ($clear)  $clear.addEventListener("click", () => {
    [$region,$gov,$crop,$water,$irr].filter(Boolean).forEach(sel => sel.value="");
    if ($farmer) $farmer.value="";
    render();
  });

  fetch("/api/sites/")
    .then(r => r.json())
    .then(fc => {
      all = (fc && fc.features) ? fc.features : [];
      // Build filter lists from EN values (API always includes EN)
      if ($region) fillOptions($region, by(all, "region"));
      if ($gov)    fillOptions($gov,    by(all, "governorate"));
      if ($crop)   fillOptions($crop,   by(all, "crop_type"));
      if ($water)  fillOptions($water,  by(all, "water_source"));
      if ($irr)    fillOptions($irr,    by(all, "irrigation_system_type"));
      render();
    })
    .catch(err => console.error("Failed to load /api/sites/:", err));
})();