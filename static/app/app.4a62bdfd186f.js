// app/static/app/app.js
(function(){
  const map = L.map("map");
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
  map.setView([23.8859, 45.0792], 6);

  fetch("/api/sites/")
    .then(r => r.json())
    .then(fc => {
      const feats = (fc && fc.features) ? fc.features : [];
      if (!feats.length) return;
      const markers = [];
      feats.forEach(f => {
        if (!f || !f.geometry || !f.geometry.coordinates) return;
        const [lon, lat] = f.geometry.coordinates;
        const p = f.properties || {};
        const imgs = (p.images || []).slice(0,4).map(i =>
          `<a href="${i.image}" target="_blank" rel="noopener"><img src="${i.image}" alt="" loading="lazy"/></a>`
        ).join("");
        const du = (p.distribution_uniformity_pct != null) ? p.distribution_uniformity_pct + "%" : "-";
        const html = `
          <div class="popup">
            <div><strong>${p.farmer_name || ""}</strong></div>
            <div class="meta">
              <table>
                <tr><th>Region:</th><td>${p.region || ""}</td></tr>
                <tr><th>Governorate:</th><td>${p.governorate || ""}</td></tr>
                <tr><th>Crop Type:</th><td>${p.crop_type || ""}</td></tr>
                <tr><th>Water Source:</th><td>${p.water_source || ""}</td></tr>
                <tr><th>Irrigation System Type:</th><td>${p.irrigation_system_type || ""}</td></tr>
                <tr><th>Distribution Uniformity:</th><td>${du}</td></tr>
              </table>
            </div>
            <div style="margin-top:6px;">${p.description || ""}</div>
            <div class="gallery">${imgs}</div>
          </div>`;
        const m = L.marker([lat, lon]).addTo(map).bindPopup(html);
        markers.push(m);
      });
      if (markers.length) {
        const g = L.featureGroup(markers);
        map.fitBounds(g.getBounds().pad(0.2));
      }
    })
    .catch(err => console.error("Failed to load /api/sites/:", err));
})();
