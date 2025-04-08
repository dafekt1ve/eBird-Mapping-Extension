(function () {
  if (!window.L) {
    console.warn('Leaflet not available.');
    return;
  }

  const existingMapContainer = document.getElementById('ebird-map-container');
  if (existingMapContainer) {
    // If the map already exists, remove the old one and refresh
    existingMapContainer.remove();
  }

  const mapContainer = document.createElement('div');
  mapContainer.id = 'ebird-map-container';
  mapContainer.style.margin = '2rem 0';
  mapContainer.innerHTML = `
    <h2 style="margin-bottom: 0.5rem;">Sightings Map</h2>
    <div id="ebird-map" style="height: 500px; width: 100%; border: 1px solid #ccc; border-radius: 8px;"></div>
  `;

  const contentDiv = document.querySelector('#content');
  if (contentDiv && contentDiv.parentNode) {
    contentDiv.parentNode.insertBefore(mapContainer, contentDiv.nextSibling);
  }

  // Function to extract sightings data
  function extractSightings() {
    const sightings = [];
    const speciesElements = document.querySelectorAll('.Observation');
    
    speciesElements.forEach(entry => {
      const speciesNameElement = entry.querySelector('span.Heading-main'); // ✔️ Species
      const checklistLink = entry.querySelector('a[title="Checklist"]')?.href; // ✔️ Checklist
      const dateTimeText = entry.querySelector('a[title="Checklist"]')?.textContent;
    
      const locationLink = entry.querySelector('a[href*="www.google.com/maps/search/"]'); // ✔️ Map link
      const locationName = locationLink?.innerText.trim();
      const locationUrl = locationLink?.href;
    
      // Extract lat/lng from query=39.7392,-104.9903
      let lat = null, lng = null;
      if (locationUrl && locationUrl.includes('query=')) {
        const latlng = locationUrl.split('query=')[1].split(',');
        lat = parseFloat(latlng[0]);
        lng = parseFloat(latlng[1]);
      }
    
      if (speciesNameElement && locationName && !isNaN(lat) && !isNaN(lng) && checklistLink) {
        sightings.push({
          species: speciesNameElement.textContent.trim(),
          locationName,
          lat,
          lng,
          checklistUrl: checklistLink,
          dateTime: dateTimeText || ''
        });
      }
    });
    
    console.log('Sightings:', sightings);  // Debugging line to check the parsed sightings data
    return sightings;
  }

    const sightings = extractSightings();

    if (sightings.length === 0) {
      console.warn('No sightings found. Ensure the selectors are correct and the page is fully loaded.');
      return;
    }

    const locationMap = new Map();

    sightings.forEach(({ species, locationName, lat, lng, checklistUrl, dateTime }) => {
      const key = `${lat},${lng}`;
      if (!locationMap.has(key)) {
        locationMap.set(key, {
          lat,
          lng,
          locationName,
          speciesList: new Map()  // species → { url, dateTime }
        });
      }
    
      const loc = locationMap.get(key);
      if (!loc.speciesList.has(species)) {
        loc.speciesList.set(species, { url: checklistUrl, dateTime });
      }
    });    
    

    console.log('Location Map:', locationMap);  // Debugging line to check the processed locations and species counts

    const map = L.map('ebird-map');
    const markers = [];

    function getColor(count) {
      if (count > 20) return 'red';
      if (count > 15) return 'orange';
      if (count > 10) return 'yellow';
      if (count > 5) return 'green';
      if (count > 2) return 'blue';
      return 'white';
    }

    // Convert Map to array and sort by species count ASCENDING
    const sortedLocations = Array.from(locationMap.values()).sort((a, b) => 
        a.speciesList.size - b.speciesList.size
    );
    
    sortedLocations.forEach(loc => {
      const speciesCount = loc.speciesList.size;
      const color = getColor(speciesCount);
    
      const marker = L.circleMarker([loc.lat, loc.lng], {
        radius: 10,
        fillColor: color,
        color: '#333',
        weight: 1,
        fillOpacity: 0.8
      }).bindPopup(
        `<strong>${loc.locationName}</strong><br>${speciesCount} species:<br>` +
        [...loc.speciesList.entries()].map(([species, { url, dateTime }]) =>
          `&bull; ${species}` +
          (dateTime ? ` <small>(<a href="${url}" target="_blank">${dateTime}</a>)</small>` : '')
        ).join('<br>')
      ).addTo(map);
    
      markers.push(marker);
    });    
  

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    if (markers.length > 0) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.2));
    } else {
      map.setView([38, -97], 4); // fallback view
    }

    // Legend
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function () {
      const div = L.DomUtil.create('div', 'info legend');
      const grades = [
        { label: "1–2 species", color: "white" },
        { label: "3–5 species", color: "blue" },
        { label: "6–10 species", color: "green" },
        { label: "11-15 species", color: "yellow" },
        { label: "16-20 species", color: "orange" },
        { label: "20+ species", color: "red" }
      ];
      div.innerHTML = `<strong>Species Count</strong><br>`;
      grades.forEach(g => {
        div.innerHTML += `
          <i style="
            background:${g.color};
            width:12px;
            height:12px;
            display:inline-block;
            margin-right:6px;
            border:1px solid #999;
          "></i>${g.label}<br>`;
      });

      div.style.background = 'white';
      div.style.padding = '6px 10px';
      div.style.borderRadius = '8px';
      div.style.boxShadow = '0 0 6px rgba(0,0,0,0.3)';
      div.style.fontSize = '13px';
      return div;
    };
    legend.addTo(map);
})();
