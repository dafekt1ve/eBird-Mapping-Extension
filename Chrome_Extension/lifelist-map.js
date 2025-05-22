(async function () {
  if (!window.L || !window.d3) {
    console.warn("Leaflet or D3 not loaded.");
    return;
  }

  const existing = document.getElementById("lifelist-map-container");
  if (existing) existing.remove();

  // const list = document.querySelector("Heading Heading--h1 Heading--thin Heading--reverse u-margin-none");
  const list = document.getElementsByClassName("Heading-main");
  const typeOfList = list[1].innerText;
  const typeOfListSplit = typeOfList.split(" ");
  let typeOfBird;
  if (typeOfListSplit.length > 2) {
    typeOfBird = typeOfListSplit[1] + " Bird";
  } else {
    typeOfBird = typeOfListSplit[0] + "r";
  }

  const container = document.createElement("div");
  container.id = "lifelist-map-container";
  container.innerHTML = `
    <h2>Your ${typeOfList} Map</h2>
    <div id="lifelist-loader" class="lifelist-loader-container">
      <div class="lifelist-spinner"></div>
      <div id="lifelist-loader-text">Collecting birds...</div>
    </div>
    <div style="margin-bottom: 10px;">
      <label for="lifelist-year-filter">Filter by year:</label>
      <select id="lifelist-year-filter" style="width: 200px">
        <option value="">All</option>
      </select>
      <button id="lifelist-clear-filter" class="Button u-margin-none u-inset-sm" style="margin-left: 10px;">Clear Filter</button>
    </div>
    <div id="lifelist-map" style="height: 500px; width: 100%; border: 1px solid #ccc; border-radius: 8px; z-index: 0;"></div>
    <style>
      .lifelist-loader-container {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 10px;
        font-weight: bold;
        color: #555;
      }
      .lifelist-spinner {
        width: 20px;
        height: 20px;
        border: 3px solid #f3f3f3;
        border-top: 3px solid #4285f4;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .lifelist-popup-location {
        font-weight: bold;
        font-size: 1em;
        margin-bottom: 4px;
        color: #333;
      }
      .lifelist-popup-list {
        max-height: 150px;
        overflow-y: auto;
        font-size: 0.9em;
        margin-top: 4px;
      }
      .lifelist-expandable {
        margin-top: 8px;
        cursor: pointer;
        color: #0066cc;
      }
      .lifelist-hidden {
        display: none;
        font-size: 0.85em;
        margin-top: 5px;
      }
    </style>
  `;

  const anchor = document.querySelector("#updated-sort");
  anchor?.parentNode?.insertBefore(container, anchor);

  const loaderText = document.getElementById("lifelist-loader-text");

  const map = L.map("lifelist-map").setView([38, -97], 4);
  // Add tile layer
  const googleStreets = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',{
        maxZoom: 15,
        subdomains:['mt0','mt1','mt2','mt3'],
        attribution: "&copy; Google",
  }).addTo(map);

  const googleSat = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',{
        maxZoom: 15,
        subdomains:['mt0','mt1','mt2','mt3'],
        attribution: "&copy; Google",
  });

  const googleHybrid = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',{
        maxZoom: 15,
        subdomains:['mt0','mt1','mt2','mt3'],
        attribution: "&copy; Google",
  });

  const googleTerrain = L.tileLayer('https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',{
        maxZoom: 15,
        subdomains:['mt0','mt1','mt2','mt3'],
        attribution: "&copy; Google",
  });

  var baseMaps = {
      "Streets": googleStreets,
      "Hybrid": googleHybrid,
      "Satellite": googleSat,
      "Terrain": googleTerrain
  };

  var layerControl = L.control.layers(baseMaps).addTo(map);

  map.addControl(new L.Control.Fullscreen());

  const nativeSection = document.querySelector("#nativeNatProv");
  const observations = nativeSection?.querySelectorAll(".Observation") || [];

  const liferData = [];
  const yearSet = new Set();

  for (const obs of observations) {
    const speciesName = obs.querySelector(".Observation-species .Heading-main")?.innerText?.trim();
    const dateText = obs.querySelector(".Observation-meta-date a")?.innerText?.trim();
    const checklistUrl = obs.querySelector(".Observation-meta-date a")?.href;
    const subId = checklistUrl?.split("/").pop();

    if (speciesName && dateText && subId) {
      const [day, monthStr, yearStr] = dateText.split(" ");
      const year = parseInt(yearStr);
      yearSet.add(year);
      const dateStr = `${day} ${monthStr} ${yearStr}`;

      liferData.push({ speciesName, subId, year, dateStr });
    }
  }

  loaderText.textContent = `Fetching checklist locations...`;

  const fullLocationMap = new Map();
  const failedLookups = [];

  for (let i = 0; i < liferData.length; i++) {
    const { speciesName, subId, year, dateStr } = liferData[i];
    loaderText.textContent = `Processing ${i + 1} / ${liferData.length}`;

    try {
      const checklist = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "getChecklistDetails", subId }, resolve);
      });

      const locId = checklist?.data?.locId;
      if (!locId) throw new Error("No locId found");

      const loc = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "getLocationDetails", locId }, resolve);
      });

      if (loc?.data?.lat && loc?.data?.lng) {
        const { lat, lng, locName } = loc.data;
        const key = `${lat},${lng}`;
        if (!fullLocationMap.has(key)) {
          fullLocationMap.set(key, {
            lat,
            lng,
            locName: locName || "Unknown location",
            lifers: []
          });
        }
        fullLocationMap.get(key).lifers.push({ speciesName, subId, year, dateStr });
      } else {
        failedLookups.push({ speciesName, subId });
      }
    } catch (err) {
      console.error(`Failed lookup for ${subId}:`, err);
      failedLookups.push({ speciesName, subId });
    }
  }

  document.getElementById("lifelist-loader")?.remove();

  const yearFilter = document.getElementById("lifelist-year-filter");
  const sortedYears = Array.from(yearSet).sort((a, b) => a - b);
  sortedYears.forEach(y => {
    const option = document.createElement("option");
    option.value = y;
    option.textContent = y;
    yearFilter.appendChild(option);
  });

  const colorScale = d3.scaleSequential(d3.interpolateYlOrRd);
  let currentMarkers = [];
  let originalMaxCount = null;

  const renderMarkers = (beforeYear) => {
    currentMarkers.forEach(m => map.removeLayer(m));
    currentMarkers = [];

    const filtered = Array.from(fullLocationMap.values())
      .map(d => ({
        ...d,
        lifers: d.lifers.filter(l => l.year <= beforeYear)
      }))
      .filter(d => d.lifers.length > 0)
      .sort((a, b) => a.lifers.length - b.lifers.length);

    if (originalMaxCount === null) {
      const maxCount = Math.max(...filtered.map(d => d.lifers.length), 1);
      originalMaxCount = maxCount;
    }
    colorScale.domain([1, originalMaxCount]);

    for (const data of filtered) {
      const count = data.lifers.length;
      const color = colorScale(count);
      const popupContent = `
        <div class="lifelist-popup-location">${data.locName}</div>
        <div><strong>${count} ${typeOfBird}${count > 1 ? "s" : ""}</strong></div>
        <div class="lifelist-popup-list">
          ${data.lifers.map(l => `• <a href="https://ebird.org/checklist/${l.subId}" target="_blank">${l.speciesName}</a> (${l.dateStr})`).join("<br>")}
        </div>
      `;

      const marker = L.circleMarker([data.lat, data.lng], {
        radius: 8,
        fillColor: color,
        color: "#333",
        weight: 1,
        fillOpacity: 0.9
      }).bindPopup(popupContent).addTo(map);

      currentMarkers.push(marker);
    }

    if (currentMarkers.length > 0) {
      const group = L.featureGroup(currentMarkers);
      map.fitBounds(group.getBounds().pad(0.2));
    }
  };

  yearFilter.addEventListener("change", () => {
    const val = yearFilter.value;
    renderMarkers(val ? parseInt(val) : Infinity);
  });

  document.getElementById("lifelist-clear-filter").addEventListener("click", () => {
    renderMarkers(Math.max(...sortedYears) + 1);
    yearFilter.value = "";
  });

  renderMarkers(Math.max(...sortedYears) + 1);

  const legend = L.control({ position: "bottomright" });
  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "info legend");
    div.innerHTML = `<strong>Species Count</strong><br><canvas id="legend-canvas" width="100" height="10"></canvas><br>
      <div style="display: flex; justify-content: space-between;">
        <span>1</span><span>${originalMaxCount}</span>
      </div>`;
    return div;
  };
  legend.addTo(map);

  setTimeout(() => {
    const canvas = document.getElementById("legend-canvas");
    if (canvas) {
      const ctx = canvas.getContext("2d");
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
      for (let i = 0; i <= 1; i += 0.01) {
        gradient.addColorStop(i, colorScale(1 + i * 99));
      }
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, 100);

  if (failedLookups.length > 0) {
    const warning = document.createElement("div");
    warning.style = "background: #fff3cd; border: 1px solid #ffeeba; padding: 10px; margin-top: 10px; font-size: 0.9em;";
    warning.innerHTML = `
      <strong>Note:</strong> ${failedLookups.length} lifers could not be mapped due to unavailable checklist data.
      <span class="lifelist-expandable" style="margin-left: 8px; text-decoration: underline;">Show details...</span>
      <div class="lifelist-hidden">
        ${failedLookups.map(f => {
          return `• ${f.speciesName} <a href="https://ebird.org/checklist/${f.subId}" target="_blank" style="margin-left: 1em; font-size: 0.85em;">View checklist</a>`;
        }).join("<br>")}
      </div>
    `;
    const toggle = warning.querySelector(".lifelist-expandable");
    const details = warning.querySelector(".lifelist-hidden");

    toggle.addEventListener("click", () => {
      const isHidden = details.style.display === "none" || !details.style.display;
      details.style.display = isHidden ? "block" : "none";
      toggle.textContent = isHidden ? "Hide details..." : "Show details...";
    });

    container.appendChild(warning);
  }

})();