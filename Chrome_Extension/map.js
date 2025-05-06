(function () {
  if (!window.L && !window.d3) {
    console.warn('Leaflet and D3 not available.');
    return;
  }

  let ebirdMapInstance = null;
  let lastMapView = null;
  let hasCenteredOnce = false;

  const existingContainer = document.getElementById('ebird-map-container');
  if (existingContainer) {
    existingContainer.remove();
  }

  const container = document.createElement('div');
  container.id = 'ebird-map-container';
  container.style.margin = '2rem 0';

  const dayOptions = Array.from({ length: 7 }, (_, i) => {
    const val = i + 1;
    return `<option value="${val}" ${val === 7 ? 'selected' : ''}> Up to ${val} day${val > 1 ? 's' : ''} ago</option>`;
  }).join('');

  container.innerHTML = `
    <h2>Sightings Map</h2>
    <label for="days-filter">Show sightings from: 
      <select id="days-filter" style="width: 200px; margin: 0 0.5rem;">
        ${dayOptions}
      </select>
    </label>
    <div id="ebird-map" style="height: 500px; width: 100%; border: 1px solid #ccc; border-radius: 8px; margin-top: 1rem;"></div>
  `;

  const content = document.querySelector('#content');
  content?.parentNode?.insertBefore(container, content.nextSibling);

  const daysSelect = document.getElementById('days-filter');
  daysSelect.addEventListener('change', () => {
    const days = parseInt(daysSelect.value, 10);
    renderMap(days);
  });

  renderMap(parseInt(daysSelect.value, 10));

  function isRecent(dateStr, daysBack) {
    const now = new Date();
    const parsed = Date.parse(dateStr);
    if (isNaN(parsed)) return true;
    const then = new Date(parsed);
    const diffMs = now - then;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays <= daysBack;
  }

  function renderMap(daysBack) {
    daysBack = Math.min(daysBack, 7);

    const mapElement = document.getElementById('ebird-map');
    mapElement.innerHTML = '';

    if (ebirdMapInstance) {
      lastMapView = {
        center: ebirdMapInstance.getCenter(),
        zoom: ebirdMapInstance.getZoom()
      };
      ebirdMapInstance.remove();
      ebirdMapInstance = null;
    }

    const sightings = [];
    document.querySelectorAll('.Observation').forEach(entry => {
      const speciesElement = entry.querySelector('span.Heading-main');
      const checklistLink = entry.querySelector('a[title="Checklist"]')?.href;
      const dateTimeText = entry.querySelector('a[title="Checklist"]')?.textContent;  // ← Corrected here

      const locationLink = entry.querySelector('a[href*="www.google.com/maps/search/"]');
      const locationName = locationLink?.innerText.trim();
      const locationUrl = locationLink?.href;
      if (!locationUrl) return;

      const latlng = locationUrl.split('query=')[1]?.split(',');
      const lat = parseFloat(latlng?.[0]);
      const lng = parseFloat(latlng?.[1]);

      if (
        speciesElement &&
        locationName &&
        checklistLink &&
        !isNaN(lat) &&
        !isNaN(lng) &&
        isRecent(dateTimeText, daysBack)
      ) {
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
    const maxCount = Math.max(Math.max(...counts), 20);

    const colorScale = d3.scaleSequential()
      .domain([minCount, maxCount])
      .interpolator(d3.interpolateYlOrRd);

    ebirdMapInstance = L.map('ebird-map');

    const markers = [];

    const sorted = [...locationMap.values()].sort((a, b) => a.speciesList.size - b.speciesList.size);
    sorted.forEach(loc => {
      const count = loc.speciesList.size;
      const color = colorScale(count);

      const popupContent = `
        <strong>${loc.locationName}</strong><br>${count} species:
        <div style="max-height:200px; overflow-y:auto; margin-top:4px; font-size: 0.9em;">
          ${[...loc.speciesList.entries()].map(([s, { url, dateTime }]) =>
            `<div>&bull; <a href="${url}" target="_blank">${s}</a> <span style="color: gray;">(${dateTime})</span></div>`
          ).join('')}
        </div>
      `;

      const marker = L.circleMarker([loc.lat, loc.lng], {
        radius: 10,
        fillColor: color,
        color: '#000',
        weight: 1,
        fillOpacity: 0.8
      }).bindPopup(popupContent);

      markers.push(marker);
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(ebirdMapInstance);

    if (markers.length > 0) {
      markers.forEach(marker => marker.addTo(ebirdMapInstance));

      if (!hasCenteredOnce) {
        const group = L.featureGroup(markers);
        ebirdMapInstance.fitBounds(group.getBounds().pad(0.2));
        hasCenteredOnce = true;
        lastMapView = {
          center: ebirdMapInstance.getCenter(),
          zoom: ebirdMapInstance.getZoom()
        };
      } else {
        ebirdMapInstance.setView(lastMapView.center, lastMapView.zoom);
      }
    } else {
      ebirdMapInstance.setView([38, -97], 4); // fallback center
    }

    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function () {
      const div = L.DomUtil.create('div', 'info legend');
      div.innerHTML = `
        <strong>Species Count</strong><br>
        <canvas id="legend-canvas" width="100" height="10"></canvas><br>
        <div style="display: flex; justify-content: space-between;">
          <span>${minCount}</span><span>${maxCount}</span>
        </div>`;
      return div;
    };
    legend.addTo(ebirdMapInstance);

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
  }
})();
