(async function () {
  if (!window.L && !window.d3) {
    console.warn("Leaflet or D3 not loaded.");
    return;
  }
  function getLatLngFromLink() {
    const link = document.querySelector("a[title='View with Google Maps']");
    if (!link) return null;

    const url = new URL(link.href);
    const match = url.search.match(/query=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (match) {
      return {
        lat: parseFloat(match[1]),
        lng: parseFloat(match[2])
      };
    }
    return null;
  }

  function getChecklistDate() {
    const timeEl = document.querySelector("time[datetime]");
    return timeEl?.getAttribute("datetime") ?? null;
  }

  try {
    const coords = getLatLngFromLink();
    const date = getChecklistDate();

    if (!coords || !date) {
      throw new Error("Failed to get coordinates or date");
    }

    const targetElement = document.querySelector('div.Page-section-inner');
    if (!targetElement) return;

    const mapDiv = document.createElement('div');
    mapDiv.id = 'gfs-wind-map';
    mapDiv.style = 'height: 400px; margin: 1em 0; border: 2px solid #ccc; border-radius: 8px;';
    targetElement.parentNode.insertBefore(mapDiv, targetElement);

    // Assume Leaflet is already loaded via manifest/background
    const map = L.map('gfs-wind-map').setView([coords.lat, coords.lng], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 10,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const bounds = [
      [coords.lat - 15, coords.lng - 20],
      [coords.lat + 15, coords.lng + 20]
    ];
    L.rectangle(bounds, { color: "#ff7800", weight: 1 }).addTo(map);
    map.fitBounds(bounds);

    console.log(`Checklist date: ${date}, lat/lng: ${coords.lat}, ${coords.lng}`);
  } catch (error) {
    console.warn("Could not initialize wind map:", error);
  }
})();
