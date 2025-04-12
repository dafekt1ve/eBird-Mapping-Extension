(function () {
  // console.log('Leaflet (L):', typeof L);
  // console.log('D3:', typeof d3);  

  if (!window.L && !window.d3) {
    console.warn('Leaflet or D3 not available.');
    return;
  }

  const existing = document.getElementById('ebird-map-container');
  if (existing) existing.remove();

  const container = document.createElement('div');
  container.id = 'ebird-map-container';
  container.style.margin = '2rem 0';
  container.innerHTML = `
    <h2>Sightings Map</h2>
    <div id="ebird-map" style="height: 500px; width: 100%; border: 1px solid #ccc; border-radius: 8px;"></div>
  `;
  const content = document.querySelector('#content');
  content?.parentNode?.insertBefore(container, content.nextSibling);

  const sightings = [];
  document.querySelectorAll('.Observation').forEach(entry => {
    const speciesElement = entry.querySelector('span.Heading-main');
    const checklistLink = entry.querySelector('a[title="Checklist"]')?.href;
    const metaText = entry.querySelector('.Observation-meta')?.textContent.trim() || '';
    const dateTimeText = entry.querySelector('a[title="Checklist"]')?.textContent;

    const locationLink = entry.querySelector('a[href*="www.google.com/maps/search/"]');
    const locationName = locationLink?.innerText.trim();
    const locationUrl = locationLink?.href;
    if (!locationUrl) return;

    const latlng = locationUrl.split('query=')[1]?.split(',');
    const lat = parseFloat(latlng?.[0]);
    const lng = parseFloat(latlng?.[1]);

    if (speciesElement && locationName && checklistLink && !isNaN(lat) && !isNaN(lng)) {
      sightings.push({
        species: speciesElement.textContent.trim(),
        locationName,
        lat,
        lng,
        checklistUrl: checklistLink,
        dateTime: dateTimeText
      });
    }
  });

  const locationMap = new Map();
  sightings.forEach(({ species, lat, lng, locationName, checklistUrl, dateTime }) => {
    const key = `${lat},${lng}`;
    if (!locationMap.has(key)) {
      locationMap.set(key, {
        lat, lng, locationName,
        speciesList: new Map()
      });
    }
    locationMap.get(key).speciesList.set(species, { url: checklistUrl, dateTime });
  });

  const counts = [...locationMap.values()].map(loc => loc.speciesList.size);
  const minCount = 1;
  let maxCount;
  if (Math.max(...counts) < 21) {
    maxCount = 20;
  } else {
    maxCount = Math.max(...counts);
  }

  const colorScale = d3.scaleSequential()
    .domain([minCount, maxCount])
    .interpolator(d3.interpolateYlOrRd);

  const map = L.map('ebird-map');
  const markers = [];

  const sorted = [...locationMap.values()].sort((a, b) => a.speciesList.size - b.speciesList.size);
  sorted.forEach(loc => {
    const count = loc.speciesList.size;
    const color = colorScale(count);

    const popupContent = `<strong>${loc.locationName}</strong><br>${count} species:<br>` +
      [...loc.speciesList.entries()].map(([s, { url, dateTime }]) =>
        `&bull; <a href="${url}" target="_blank">${s}</a> <small>(${dateTime})</small>`
      ).join('<br>');

    const marker = L.circleMarker([loc.lat, loc.lng], {
      radius: 10,
      fillColor: color,
      color: '#000',
      weight: 1,
      fillOpacity: 0.8
    }).bindPopup(popupContent).addTo(map);

    markers.push(marker);
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  if (markers.length > 0) {
    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.2));
  } else {
    map.setView([38, -97], 4); // fallback
  }

  // Add gradient legend
  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = function () {
    const div = L.DomUtil.create('div', 'info legend');
    div.innerHTML = `<strong>Species Count</strong><br><canvas id="legend-canvas" width="100" height="10"></canvas><br>
      <div style="display: flex; justify-content: space-between;">
        <span>${minCount}</span><span>${maxCount}</span>
      </div>`;
    return div;
  };
  legend.addTo(map);

  // Render D3 gradient in canvas
  setTimeout(() => {
    const canvas = document.getElementById('legend-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    for (let i = 0; i <= 1; i += 0.01) {
      gradient.addColorStop(i, colorScale(minCount + i * (maxCount - minCount)));
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, 100);
})();
