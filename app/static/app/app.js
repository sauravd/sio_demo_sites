(function () {
  // ----- Language (detect from <html lang="…">) -----
  const htmlLang = (document.documentElement.getAttribute('lang') || 'en').slice(0, 2);
  const isAR = htmlLang === 'ar';

  // ----- KSA bounds (slightly expanded so edge popups stay visible) -----
  // Format: [south, west], [north, east]
  const KSA_BOUNDS = L.latLngBounds([15.0, 32.0], [33.5, 57.0]);

  // Helper to clamp any bounds into an outer bounds (Leaflet has .intersects but not .intersection)
  const clampBounds = (inner, outer) => {
    // If inner is fully inside outer, return inner
    const inside =
      outer.contains(inner.getSouthWest()) && outer.contains(inner.getNorthEast());
    if (inside) return inner;

    const south = Math.max(inner.getSouth(), outer.getSouth());
    const west  = Math.max(inner.getWest(),  outer.getWest());
    const north = Math.min(inner.getNorth(), outer.getNorth());
    const east  = Math.min(inner.getEast(),  outer.getEast());
    // If clamping eliminated the box (degenerate), fall back to outer
    const ok = south < north && west < east;
    return ok ? L.latLngBounds([south, west], [north, east]) : outer;
  };

  // ----- Map -----
  const map = L.map('map', {
    maxBounds: KSA_BOUNDS,
    maxBoundsViscosity: 1.0,
    zoomSnap: 0.5,
    worldCopyJump: false
  });

  const minZoom = map.getBoundsZoom(KSA_BOUNDS, true);
  map.setMinZoom(minZoom);
  map.fitBounds(KSA_BOUNDS);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    noWrap: true,
    bounds: KSA_BOUNDS
  }).addTo(map);

  // ----- UI Elements -----
  const $ = (id) => document.getElementById(id);
  const $region = $('filter-region');
  const $gov    = $('filter-governorate');
  const $crop   = $('filter-crop');
  const $water  = $('filter-water');
  const $irr    = $('filter-irr');
  const $farmer = $('filter-farmer');
  const $clear  = $('filter-clear');

  // Labels coming from the template (for popup field titles)
  const LBL = (() => {
    const n = document.getElementById('i18n');
    const d = n ? n.dataset : {};
    return {
      region:      d.region      || 'Region',
      governorate: d.governorate || 'Governorate',
      crop:        d['cropType'] || d['crop-type'] || 'Crop Type',
      water:       d['waterSource'] || 'Water Source',
      irr:         d['irrType']  || 'Irrigation System Type',
      du:          d.du          || 'Distribution Uniformity',
    };
  })();

  // ----- Helpers -----
  let all = []; // GeoJSON features
  const layer = L.layerGroup().addTo(map);

  const norm = (s) => (s ?? '').toString().trim();
  const normLower = (s) => norm(s).toLowerCase();

  // show Arabic if available & UI is Arabic, otherwise English
  const textFor = (props, enKey, arKey) => {
    const ar = props[arKey];
    const en = props[enKey];
    return (isAR && ar) ? ar : (en || '');
  };

  // Build select options: value = EN (stable key), label = AR when Arabic UI
  const fillOptionsLocalized = (select, enKey, arKey) => {
    if (!select) return;
    const placeholder = select.querySelector('option'); // keep first option
    select.innerHTML = '';
    if (placeholder) select.append(placeholder);

    const seen = new Set();
    const rows = [];
    all.forEach((f) => {
      const p = f.properties || {};
      const en = norm(p[enKey]);
      if (!en || seen.has(en)) return;
      seen.add(en);
      rows.push({ value: en, label: textFor(p, enKey, arKey) });
    });
    rows.sort((a, b) => a.label.localeCompare(b.label));
    rows.forEach(({ value, label }) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      select.append(opt);
    });
  };

  // Filtering compares against EN base values (stable regardless of UI language)
  const matches = (p) => {
    if ($region && $region.value && norm(p.region) !== $region.value) return false;
    if ($gov    && $gov.value    && norm(p.governorate) !== $gov.value) return false;
    if ($crop   && $crop.value   && norm(p.crop_type) !== $crop.value) return false;
    if ($water  && $water.value  && norm(p.water_source) !== $water.value) return false;
    if ($irr    && $irr.value    && norm(p.irrigation_system_type) !== $irr.value) return false;

    const q = normLower($farmer && $farmer.value);
    if (q) {
      const hay = [
        normLower(p.farmer_name),
        normLower(p.farmer_name_ar)
      ].join(' || ');
      if (!hay.includes(q)) return false;
    }
    return true;
  };

  // Popup HTML (localized values + description)
  const popupHTML = (p) => {
    const imgs = (p.images || []).slice(0, 8).map(i =>
      `<a href="${i.image}" class="thumb" target="_blank" rel="noopener">
         <img src="${i.image}" alt="" loading="lazy"/>
       </a>`
    ).join('');

    const du = (p.distribution_uniformity_pct != null) ? (p.distribution_uniformity_pct + '%') : '-';

    const region      = textFor(p, 'region', 'region_ar');
    const governorate = textFor(p, 'governorate', 'governorate_ar');
    const crop        = textFor(p, 'crop_type', 'crop_type_ar');
    const water       = textFor(p, 'water_source', 'water_source_ar');
    const irr         = textFor(p, 'irrigation_system_type', 'irrigation_system_type_ar');
    const farmer      = textFor(p, 'farmer_name', 'farmer_name_ar');
    const desc        = textFor(p, 'description', 'description_ar');

    return `
      <div class="popup">
        <h3 class="popup-title">${farmer}</h3>
        <div class="meta">
          <table>
            <tr><th>${LBL.region}:</th><td>${region}</td></tr>
            <tr><th>${LBL.governorate}:</th><td>${governorate}</td></tr>
            <tr><th>${LBL.crop}:</th><td>${crop}</td></tr>
            <tr><th>${LBL.water}:</th><td>${water}</td></tr>
            <tr><th>${LBL.irr}:</th><td>${irr}</td></tr>
            <tr><th>${LBL.du}:</th><td>${du}</td></tr>
          </table>
        </div>
        <div class="desc">${desc}</div>
        <div class="gallery">${imgs}</div>
      </div>`;
  };

  // Render markers + fit bounds
  const render = () => {
    layer.clearLayers();
    const filtered = all.filter(f => matches(f.properties || {}));
    const markers = [];

    filtered.forEach((f) => {
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
      map.fitBounds(clampBounds(b, KSA_BOUNDS));
    } else {
      map.fitBounds(KSA_BOUNDS);
    }
  };

  // Debounce helper
  const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // Filter events
  [$region, $gov, $crop, $water, $irr].filter(Boolean).forEach(sel => sel.addEventListener('change', render));
  if ($farmer) $farmer.addEventListener('input', debounce(render, 250));
  if ($clear) {
    $clear.addEventListener('click', () => {
      [$region, $gov, $crop, $water, $irr].forEach(sel => { if (sel) sel.value = ''; });
      if ($farmer) $farmer.value = '';
      render();
    });
  }

  // Fetch data and populate
  fetch('/api/sites/')
    .then(r => r.json())
    .then(fc => {
      all = (fc && fc.features) ? fc.features : [];
      fillOptionsLocalized($region, 'region', 'region_ar');
      fillOptionsLocalized($gov,    'governorate', 'governorate_ar');
      fillOptionsLocalized($crop,   'crop_type', 'crop_type_ar');
      fillOptionsLocalized($water,  'water_source', 'water_source_ar');
      fillOptionsLocalized($irr,    'irrigation_system_type', 'irrigation_system_type_ar');
      render();
    })
    .catch(err => console.error('Failed to load /api/sites/:', err));

  // ----- Simple Lightbox for images inside popups -----
  const lb = document.createElement('div');
  lb.className = 'lb hidden';
  lb.innerHTML = `
    <div class="lb-backdrop"></div>
    <div class="lb-panel" role="dialog" aria-modal="true">
      <button type="button" class="lb-close" aria-label="${isAR ? 'إغلاق' : 'Close'}">×</button>
      <img class="lb-img" alt="" />
      <div class="lb-nav">
        <button type="button" class="lb-prev" aria-label="${isAR ? 'السابق' : 'Previous'}">‹</button>
        <button type="button" class="lb-next" aria-label="${isAR ? 'التالي' : 'Next'}">›</button>
      </div>
    </div>
  `;
  document.body.appendChild(lb);

  const imgEl = lb.querySelector('.lb-img');
  const closeBtn = lb.querySelector('.lb-close');
  const prevBtn = lb.querySelector('.lb-prev');
  const nextBtn = lb.querySelector('.lb-next');
  const backdrop = lb.querySelector('.lb-backdrop');

  let lbUrls = [];
  let lbIndex = 0;

  const showIndex = (i) => {
    if (!lbUrls.length) return;
    lbIndex = (i + lbUrls.length) % lbUrls.length;
    imgEl.src = lbUrls[lbIndex];
  };
  const openLightbox = (urls, start = 0) => {
    lbUrls = urls.slice();
    showIndex(start);
    lb.classList.remove('hidden');
    document.body.classList.add('no-scroll');
  };
  const closeLightbox = () => {
    lb.classList.add('hidden');
    document.body.classList.remove('no-scroll');
    imgEl.src = '';
    lbUrls = [];
    lbIndex = 0;
  };

  closeBtn.addEventListener('click', closeLightbox);
  backdrop.addEventListener('click', closeLightbox);
  prevBtn.addEventListener('click', () => showIndex(lbIndex - 1));
  nextBtn.addEventListener('click', () => showIndex(lbIndex + 1));
  document.addEventListener('keydown', (e) => {
    if (lb.classList.contains('hidden')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') showIndex(lbIndex - 1);
    if (e.key === 'ArrowRight') showIndex(lbIndex + 1);
  });

  // Delegate clicks from any popup gallery <a>
  document.body.addEventListener('click', (e) => {
    const a = e.target.closest('.popup .gallery a');
    if (!a) return;
    e.preventDefault();
    const popup = e.target.closest('.popup');
    const links = Array.from(popup.querySelectorAll('.gallery a'));
    const urls = links.map(el => el.getAttribute('href'));
    const start = Math.max(0, links.indexOf(a));
    openLightbox(urls, start);
  });
})();
