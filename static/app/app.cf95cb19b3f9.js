(function(){
  // --- Saudi Arabia bounds (tight) ---
  // [south, west] -> [north, east]
  const KSA_BOUNDS = L.latLngBounds([16.22, 34.29], [32.14, 55.40]);
  const isAR = document.documentElement.lang?.startsWith('ar');
  const t = (en, ar) => (isAR && ar) ? ar : en;

  // Create map clamped to KSA
  const map = L.map('map', {
    maxBounds: KSA_BOUNDS,
    maxBoundsViscosity: 1.0,
    zoomSnap: 0.5,
    worldCopyJump: false
  });

  // Compute a min zoom that keeps view inside KSA on this screen
  const minZoom = map.getBoundsZoom(KSA_BOUNDS, true);
  map.setMinZoom(minZoom);
  map.fitBounds(KSA_BOUNDS);

  // Basemap, no world wrap
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    noWrap: true,
    bounds: KSA_BOUNDS
  }).addTo(map);

  // --- Elements (optional filter UI) ---
  const el = (id) => document.getElementById(id);
  const $region = el('filter-region');
  const $gov    = el('filter-governorate');
  const $crop   = el('filter-crop');
  const $water  = el('filter-water');
  const $irr    = el('filter-irr');
  const $farmer = el('filter-farmer');
  const $clear  = el('filter-clear');

  // labels for popup (from hidden i18n div)
  const LBL = (() => {
    const n = document.getElementById('i18n');
    const d = n ? n.dataset : {};
    return {
      region:       d.region       || 'Region',
      governorate:  d.governorate  || 'Governorate',
      crop:         d.cropType     || d['crop-type'] || 'Crop Type',
      water:        d.waterSource  || 'Water Source',
      irr:          d.irrType      || 'Irrigation System Type',
      du:           d.du           || 'Distribution Uniformity',
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
    const first = select.querySelector('option');
    select.innerHTML = '';
    if (first) select.append(first);
    values.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = v;
      select.append(opt);
    });
  };

  const normalize = (s) => (s||'').toString().toLowerCase().trim();

  const matches = (p) => {
    if ($region && $region.value && p.region !== $region.value) return false;
    if ($gov    && $gov.value    && p.governorate !== $gov.value) return false;
    if ($crop   && $crop.value   && p.crop_type !== $crop.value) return false;
    if ($water  && $water.value  && p.water_source !== $water.value) return false;
    if ($irr    && $irr.value    && p.irrigation_system_type !== $irr.value) return false;
    const q = $farmer ? normalize($farmer.value) : '';
    if (q && !normalize(p.farmer_name).includes(q)) return false;
    return true;
  };

  const popupHTML = (p) => {
    const imgs = (p.images || []).slice(0,4).map(i =>
      `<a href="${i.image}" target="_blank" rel="noopener"><img src="${i.image}" alt=""/></a>`
    ).join('');
    const du = (p.distribution_uniformity_pct != null) ? (p.distribution_uniformity_pct + '%') : '-';
    return `
      <div class="popup">
        <h3 class="popup-title" style="text-align:center;margin:0 0 6px 0;">${p.farmer_name || ''}</h3>
        <div class="meta">
          <table>
            <tr><th>${LBL.region}:</th><td>${p.region || ''}</td></tr>
            <tr><th>${LBL.governorate}:</th><td>${p.governorate || ''}</td></tr>
            <tr><th>${LBL.crop}:</th><td>${p.crop_type || ''}</td></tr>
            <tr><th>${LBL.water}:</th><td>${p.water_source || ''}</td></tr>
            <tr><th>${LBL.irr}:</th><td>${p.irrigation_system_type || ''}</td></tr>
            <tr><th>${LBL.du}:</th><td>${du}</td></tr>
          </table>
        </div>
        <div class="desc">${p.description || ''}</div>
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
      const clamped = b.intersection(KSA_BOUNDS) || KSA_BOUNDS;
      map.fitBounds(clamped);
    } else {
      map.fitBounds(KSA_BOUNDS);
    }
  };

  const debounce = (fn, ms=200) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

  [$region,$gov,$crop,$water,$irr].filter(Boolean).forEach(sel => sel.addEventListener('change', render));
  if ($farmer) $farmer.addEventListener('input', debounce(render, 250));
  if ($clear)  $clear.addEventListener('click', () => {
    [$region,$gov,$crop,$water,$irr].filter(Boolean).forEach(sel => sel.value='');
    if ($farmer) $farmer.value='';
    render();
  });

  fetch('/api/sites/')
    .then(r => r.json())
    .then(fc => {
      all = (fc && fc.features) ? fc.features : [];
      if ($region) fillOptions($region, by(all, 'region'));
      if ($gov)    fillOptions($gov,    by(all, 'governorate'));
      if ($crop)   fillOptions($crop,   by(all, 'crop_type'));
      if ($water)  fillOptions($water,  by(all, 'water_source'));
      if ($irr)    fillOptions($irr,    by(all, 'irrigation_system_type'));
      render();
    })
    .catch(err => console.error('Failed to load /api/sites/:', err));
})();
