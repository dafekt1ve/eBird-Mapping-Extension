(function () {
  if (!window.L || !window.d3) {
    console.warn('Leaflet and D3 not available.');
    return;
  }

  let ebirdMapInstance = null;
  let lastMapView = null;
  let lastBaseLayer = null;
  let hasCenteredOnce = false;
  let layerControl = null;
  let legendControl = null;

  const existingContainer = document.getElementById('ebird-map-container');
  if (existingContainer) {
    existingContainer.remove();
  }

  const container = document.createElement('div');
  container.id = 'ebird-map-container';
  container.style.margin = '2rem 0';

  const mapDiv = document.createElement('div');
  mapDiv.id = 'ebird-map';
  mapDiv.style.height = '500px';
  mapDiv.style.width = '100%';
  mapDiv.style.border = '1px solid #ccc';
  mapDiv.style.borderRadius = '8px';
  container.appendChild(mapDiv);

  const content = document.querySelector('#content');
  content?.parentNode?.insertBefore(container, content.nextSibling);

  function isRecent(dateStr, daysBack) {
    const now = new Date();
    const parsed = Date.parse(dateStr);
    if (isNaN(parsed)) return true;
    const then = new Date(parsed);
    const diffMs = now - then;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays <= daysBack;
  }

  function createDaysBackControl(initialDays) {
    return L.Control.extend({
      options: { position: 'topleft' },
      onAdd: function () {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const select = L.DomUtil.create('select', '', container);
        select.id = 'days-filter';
        select.style.all = 'revert';

        for (let i = 1; i <= 7; i++) {
          const option = document.createElement('option');
          option.value = i;
          option.textContent = `${i} day${i > 1 ? 's' : ''} back`;
          if (i === initialDays) option.selected = true;
          select.appendChild(option);
        }

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.on(select, 'change', () => {
          renderMap(parseInt(select.value, 10));
        });

        return container;
      }
    });
  }

  // Define base layers once
  const googleStreets = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    maxZoom: 15,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: "&copy; Google",
  });

  const googleSat = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    maxZoom: 15,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: "&copy; Google",
  });

  const googleHybrid = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
    maxZoom: 15,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: "&copy; Google",
  });

  const googleTerrain = L.tileLayer('https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
    maxZoom: 15,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: "&copy; Google",
  });

  const baseMaps = {
    "Streets": googleStreets,
    "Hybrid": googleHybrid,
    "Satellite": googleSat,
    "Terrain": googleTerrain
  };

  function renderMap(daysBack = 7) {
    daysBack = Math.min(daysBack, 7);

    const mapElement = document.getElementById('ebird-map');

    // Only clear if map hasn't been initialized
    if (!ebirdMapInstance) {
      mapElement.innerHTML = '';
    }

    // Collect data
    const sightings = [];
    document.querySelectorAll('.Observation').forEach(entry => {
      const speciesElement = entry.querySelector('span.Heading-main');
      const checklistLink = entry.querySelector('a[title="Checklist"]')?.href;
      const dateTimeText = entry.querySelector('a[title="Checklist"]')?.textContent;

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

    // 🔄 Initialize or reuse map
    if (!ebirdMapInstance) {
      ebirdMapInstance = L.map('ebird-map', {
        layers: [googleStreets]
      });

      ebirdMapInstance.addControl(new L.Control.Fullscreen());

      const DaysBackControl = new (createDaysBackControl(daysBack));
      ebirdMapInstance.addControl(DaysBackControl);

      layerControl = L.control.layers(baseMaps).addTo(ebirdMapInstance);

      // Set default layer
      lastBaseLayer = googleStreets;
    } else {
      // Remove all non-base layers
      ebirdMapInstance.eachLayer(layer => {
        if (!Object.values(baseMaps).includes(layer)) {
          ebirdMapInstance.removeLayer(layer);
        }
      });

      // Reset base layer to the last one used
      if (lastBaseLayer && !ebirdMapInstance.hasLayer(lastBaseLayer)) {
        lastBaseLayer.addTo(ebirdMapInstance);
      }
    }

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

    if (markers.length > 0) {
      markers.forEach(marker => marker.addTo(ebirdMapInstance));

      if (!hasCenteredOnce) {
        const group = L.featureGroup(markers);
        ebirdMapInstance.fitBounds(group.getBounds().pad(0.2));
        hasCenteredOnce = true;
      } else if (lastMapView) {
        ebirdMapInstance.setView(lastMapView.center, lastMapView.zoom);
      }
    } else {
      ebirdMapInstance.setView([38, -97], 4);
    }

    lastMapView = {
      center: ebirdMapInstance.getCenter(),
      zoom: ebirdMapInstance.getZoom()
    };

    lastBaseLayer = Object.entries(baseMaps).find(([name, layer]) => ebirdMapInstance.hasLayer(layer))?.[1] || googleStreets;

    if (!legendControl) {
      legendControl = L.control({ position: 'bottomright' });
      legendControl.onAdd = function () {
        const div = L.DomUtil.create('div', 'info legend');
        div.innerHTML = `
          <strong>Species Count</strong><br>
          <canvas id="legend-canvas" width="100" height="10"></canvas><br>
          <div style="display: flex; justify-content: space-between;">
            <span>${minCount}</span><span>${maxCount}</span>
          </div>`;
        return div;
      };
      legendControl.addTo(ebirdMapInstance);
    }

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

  renderMap(7);
})();
