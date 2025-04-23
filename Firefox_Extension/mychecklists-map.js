// (async function () {
//   if (!window.L && !window.d3) {
//     console.warn("Leaflet or D3 not loaded.");
//     return;
//   }

//   const container = document.createElement("div");
//   container.id = "mychecklists-map-container";
//   container.innerHTML = `
//     <h2>My Checklist Map</h2>
//     <div id="mychecklists-loader" class="mychecklists-loader-container">
//       <div class="mychecklists-spinner"></div>
//       <div id="mychecklists-loader-text">Loading checklist locations...</div>
//     </div>
//     <div id="mychecklists-map" style="height: 500px; width: 100%; border: 1px solid #ccc; border-radius: 8px; z-index: 0;"></div>
//     <style>
//       .mychecklists-loader-container {
//         display: flex;
//         align-items: center;
//         gap: 10px;
//         margin-bottom: 10px;
//         font-weight: bold;
//         color: #555;
//       }
//       .mychecklists-spinner {
//         width: 20px;
//         height: 20px;
//         border: 3px solid #f3f3f3;
//         border-top: 3px solid #28a745;
//         border-radius: 50%;
//         animation: spin 0.8s linear infinite;
//       }
//       @keyframes spin {
//         0% { transform: rotate(0deg); }
//         100% { transform: rotate(360deg); }
//       }
//     </style>
//   `;

//   const anchor = document.querySelector("#results-heading");
//   anchor?.parentNode?.insertBefore(container, anchor.nextSibling);

//   const loaderText = document.getElementById("mychecklists-loader-text");

//   const regionLookup = await fetch(chrome.runtime.getURL("regionLookup/regionLookup.json"))
//     .then(r => r.json())
//     .catch(() => ({}));

//   function getRegionCode(country, subregion) {
//     // console.log("🗺️ Looking up region for country:", country, "and subregion:", subregion);
    
//     const entry = regionLookup[country];
    
//     if (!entry) {
//       console.warn("🗺️ No regionLookup entry for country:", country);
//       return null;
//     }
    
//     // console.log("Found region entry:", entry);
    
//     // If no subregion or no subregions defined, return just the country code
//     if (!subregion || !entry.regions) {
//       console.log("No subregion or subregions, returning country code:", entry.code);
//       return entry.code;
//     }
    
//     // console.log("Available subregions:", Object.keys(entry.regions));
    
//     const match = Object.entries(entry.regions).find(([name]) => name === subregion);
    
//     if (!match) {
//       console.warn("📍 Subregion not found for", subregion, "in", entry.regions);
//       return entry.code;
//     }
    
//     // console.log("Subregion match found:", match);
//     return match[1]; // This is already like "US-CO"
//   }

//   const checklistBlocks = document.querySelectorAll(".ResultsStats--manageMyChecklists:not(.ResultsStats--header)");

//   const checklistInfo = Array.from(checklistBlocks).map(block => {
//     const link = block.querySelector("a[href*='/checklist/']");
//     const match = link?.href.match(/\/checklist\/(S\d+)/);
//     const subId = match?.[1];

//     const dateText = block.querySelector(".Heading-main")?.innerText || "";
//     const [day, monthStr, yearStr] = dateText.split(" ");
//     const year = parseInt(yearStr);
//     const month = new Date(`${monthStr} 1, 2000`).getMonth() + 1;
//     const paddedMonth = String(month).padStart(2, "0");
//     const paddedDay = String(day).padStart(2, "0");
//     const date = `${day} ${monthStr} ${yearStr}`;

//     const countyName = block.querySelector(".ResultsStats-details-county")?.innerText || "";
//     const stateCountry = block.querySelectorAll(".ResultsStats-details-stateCountry");
//     const subnationalName = stateCountry[0].innerText || "";
//     const countryName = stateCountry[1].innerText || "";

//     return {
//       subId,
//       year,
//       month: paddedMonth,
//       day: paddedDay,
//       countryName: countryName || "",
//       subnationalName: subnationalName || "",
//       countyName: countyName || ""
//     };    
//   }).filter(c => c.subId && c.year && c.month && c.day);

//   if (!checklistInfo.length) {
//     loaderText.textContent = "No valid checklists found.";
//     return;
//   }

//   loaderText.textContent = `Grouping by region & date...`;

//   const batchRequests = {};
//   const fallbackSubIds = [];

//   for (const { subId, year, month, day, countryName, subnationalName } of checklistInfo) {
//     console.log("➡️ Processing checklist:", { subId, year, month, day, countryName, subnationalName });
  
//     const regionCode = getRegionCode(countryName, subnationalName);
//     if (!regionCode) {
//       console.warn("❌ Failed to get regionCode for:", { countryName, subnationalName });
//       fallbackSubIds.push(subId);
//       continue;
//     }
  
//     const key = `${regionCode}|${year}-${month}-${day}`;
//     if (!batchRequests[key]) batchRequests[key] = [];
//     batchRequests[key].push(subId);
//   }

//   loaderText.textContent = `Fetching ${Object.keys(batchRequests).length} feed batches...`;

//   const subIdMap = {};
//   const queries = [];
  
//   for (const [key, subIds] of Object.entries(batchRequests)) {
//     const [regionCode, date] = key.split("|");
//     const [yyyy, mm, dd] = date.split("-");
    
//     // Defensive checks
//     if (!regionCode || !yyyy || !mm || !dd) {
//       console.warn("Skipping malformed key:", key);
//       continue;
//     }
  
//     const query = `${regionCode}/${yyyy}/${mm}/${dd}`;
//     queries.push(query);
//     subIdMap[query] = subIds;
//   }
  
//   console.log("🚀 Sending batchChecklistFeed message with:");
//   console.log("queries:", queries);
//   console.log("subIdMap:", subIdMap);
//   console.log("fallbackSubIds:", fallbackSubIds);
  
//   const locationMap = new Map();
//   let processed = 0;
  
//   let fetchesDone = 0;
//   const totalFetches = queries.length;
  
//   const parallelFetches = queries.map(query =>
//     new Promise(resolve => {
//       chrome.runtime.sendMessage(
//         {
//           type: "batchChecklistFeed",
//           queries: [query],
//           subIdMap: { [query]: subIdMap[query] },
//           fallbackSubIds: []
//         },
//         (response) => {
//           fetchesDone++;
//           loaderText.textContent = `Fetching checklist locations: ${fetchesDone} / ${totalFetches}`;
  
//           if (chrome.runtime.lastError || !response) {
//             console.error(`Error for query ${query}:`, chrome.runtime.lastError);
//             resolve([]);
//           } else {
//             resolve(response[query] || []);
//           }
//         }
//       );
//     })
//   );  
  
//   Promise.all(parallelFetches).then(results => {
//     results.flat().forEach(item => {
//       processed++;
//       if (!item.loc || !item.loc.lat || !item.loc.lng) {
//         console.warn(`❌ Missing location for ${item.subId}. Response: ${JSON.stringify(item)}`);
//         loaderText.textContent = `Skipping ${item.subId} due to missing location data.`;
//         return;
//       }
  
//       const { lat, lng, locName } = item.loc;
//       const key = `${lat},${lng}`;
//       if (!locationMap.has(key)) {
//         locationMap.set(key, {
//           lat,
//           lng,
//           name: locName || "Unknown",
//           subIds: []
//         });
//       }
  
//       locationMap.get(key).subIds.push(item.subId);
//       loaderText.textContent = `Mapping checklist locations: ${processed} / ${checklistInfo.length}`;
//     });
  
//     document.getElementById("mychecklists-loader")?.remove();
  
//     if (locationMap.size === 0) {
//       console.warn("No mappable locations found.");
//       return;
//     }
  
//     const map = L.map("mychecklists-map").setView([20, 0], 2);
//     L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
//       attribution: "&copy; OpenStreetMap contributors"
//     }).addTo(map);
  
//     const colorScale = d3.scaleSequential(d3.interpolateYlOrRd);
//     const points = Array.from(locationMap.values()).sort((a, b) => a.subIds.length - b.subIds.length);
//     const maxCount = Math.max(...points.map(p => p.subIds.length));
  
//     points.forEach(point => {
//       const color = colorScale(point.subIds.length / maxCount);
//       L.circleMarker([point.lat, point.lng], {
//         radius: 8,
//         fillColor: color,
//         color: "#333",
//         weight: 1,
//         fillOpacity: 0.9
//       }).bindPopup(`<b>${point.name}</b><br>Checklists: ${point.subIds.length}`).addTo(map);
//     });

//     const legend = L.control({ position: "bottomright" });
//     legend.onAdd = function () {
//       const div = L.DomUtil.create("div", "info legend");
//       div.innerHTML = `<strong>Species Count</strong><br><canvas id="legend-canvas" width="100" height="10"></canvas><br>
//         <div style="display: flex; justify-content: space-between;">
//           <span>1</span><span>Max</span>
//         </div>`;
//       return div;
//     };
//     legend.addTo(map);
    
//     const canvas = document.getElementById("legend-canvas");
//     if (canvas) {
//       const ctx = canvas.getContext("2d");
//       const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
//       for (let i = 0; i <= 1; i += 0.01) {
//         gradient.addColorStop(i, d3.interpolateYlOrRd(i));
//       }
//       ctx.fillStyle = gradient;
//       ctx.fillRect(0, 0, canvas.width, canvas.height);
//     }
    
  
//     console.log("Map generated with", points.length, "unique locations.");
//   });  
// })();

(async function () {
  if (!window.L && !window.d3) {
    console.warn("Leaflet or D3 not loaded.");
    return;
  }

  const container = document.createElement("div");
  container.id = "mychecklists-map-container";
  container.innerHTML = `
    <h2>My Checklist Map</h2>
    <div id="mychecklists-loader" class="mychecklists-loader-container">
      <div class="mychecklists-spinner"></div>
      <div id="mychecklists-loader-text">Loading checklist locations...</div>
    </div>
    <div id="mychecklists-map" style="height: 500px; width: 100%; border: 1px solid #ccc; border-radius: 8px; z-index: 0;"></div>
    <style>
      .mychecklists-loader-container {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 10px;
        font-weight: bold;
        color: #555;
      }
      .mychecklists-spinner {
        width: 20px;
        height: 20px;
        border: 3px solid #f3f3f3;
        border-top: 3px solid #28a745;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
  `;

  const anchor = document.querySelector("#results-heading");
  anchor?.parentNode?.insertBefore(container, anchor.nextSibling);

  const loaderText = document.getElementById("mychecklists-loader-text");

  const regionLookup = await fetch(chrome.runtime.getURL("regionLookup/regionLookup-expanded.json"))
    .then(r => r.json())
    .catch(() => ({}));

  function getRegionCode(country, state, subnational2, regionLookup) {
    const countryData = regionLookup[country];
    if (!countryData) return null;
    const stateData = countryData.regions[state];
    if (!stateData) return countryData.code;
    if (subnational2 && stateData.subregions && stateData.subregions[subnational2]) {
      return stateData.subregions[subnational2];
    }
    return stateData.code || countryData.code;
  }

  const checklistBlocks = document.querySelectorAll(".ResultsStats--manageMyChecklists:not(.ResultsStats--header)");
  const checklistInfo = Array.from(checklistBlocks).map(block => {
    const link = block.querySelector("a[href*='/checklist/']");
    const match = link?.href.match(/\/checklist\/(S\d+)/);
    const subId = match?.[1];

    const dateText = block.querySelector(".Heading-main")?.innerText || "";
    const [day, monthStr, yearStr] = dateText.split(" ");
    const year = parseInt(yearStr);
    const month = new Date(`${monthStr} 1, 2000`).getMonth() + 1;
    const paddedMonth = String(month).padStart(2, "0");
    const paddedDay = String(day).padStart(2, "0");

    const countyName = block.querySelector(".ResultsStats-details-county")?.innerText || "";
    const stateCountry = block.querySelectorAll(".ResultsStats-details-stateCountry");
    const subnationalName = stateCountry[0].innerText || "";
    const countryName = stateCountry[1].innerText || "";

    return {
      subId,
      year,
      month: paddedMonth,
      day: paddedDay,
      countryName,
      subnationalName,
      subnational2Name: countyName || ""
    };
  }).filter(c => c.subId && c.year && c.month && c.day);

  if (!checklistInfo.length) {
    loaderText.textContent = "No valid checklists found.";
    return;
  }

  loaderText.textContent = `Grouping by region & date...`;

  const batchRequests = {};
  const fallbackSubIds = [];

  for (const { subId, year, month, day, countryName, subnationalName, subnational2Name } of checklistInfo) {
    const regionCode = getRegionCode(countryName, subnationalName, subnational2Name, regionLookup);
    if (!regionCode) {
      fallbackSubIds.push(subId);
      continue;
    }
    const key = `${regionCode}|${year}-${month}-${day}`;
    if (!batchRequests[key]) batchRequests[key] = [];
    batchRequests[key].push(subId);
  }

  loaderText.textContent = `Fetching ${Object.keys(batchRequests).length} feed batches...`;

  const subIdMap = {};
  const queries = [];
  for (const [key, subIds] of Object.entries(batchRequests)) {
    const [regionCode, date] = key.split("|");
    const [yyyy, mm, dd] = date.split("-");
    const query = `${regionCode}/${yyyy}/${mm}/${dd}`;
    queries.push(query);
    subIdMap[query] = subIds;
  }

  const locationMap = new Map();
  let processed = 0;

  function throttleRequests(tasks, concurrency = 5) {
    return new Promise(resolve => {
      const results = [];
      let index = 0;
      let active = 0;

      function next() {
        while (active < concurrency && index < tasks.length) {
          const currentIndex = index++;
          active++;
          tasks[currentIndex]().then(result => {
            results[currentIndex] = result;
            active--;
            if (results.length === tasks.length && !results.includes(undefined)) {
              resolve(results);
            } else {
              next();
            }
          });
        }
      }

      next();
    });
  }

  function withRetries(fn, retries = 3, delay = 500) {
    return function retrying(...args) {
      return new Promise((resolve) => {
        const attempt = (n) => {
          fn(...args).then(resolve).catch(err => {
            if (n > 0) {
              setTimeout(() => attempt(n - 1), delay);
            } else {
              console.error("❌ Failed after retries:", err);
              resolve([]);
            }
          });
        };
        attempt(retries);
      });
    };
  }

  const fetchChecklistBatch = withRetries((query) => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: "batchChecklistFeed",
        queries: [query],
        subIdMap: { [query]: subIdMap[query] },
        fallbackSubIds: []
      }, (response) => {
        if (chrome.runtime.lastError || !response) {
          reject(chrome.runtime.lastError || new Error("Empty response"));
        } else {
          resolve(response[query] || []);
        }
      });
    });
  });

  const fetchTasks = queries.map((query, i) => () => {
    loaderText.textContent = `Fetching checklist locations: ${i + 1} / ${queries.length}`;
    return fetchChecklistBatch(query);
  });

  const results = await throttleRequests(fetchTasks, 5);

  results.flat().forEach(item => {
    processed++;
    if (!item.loc || !item.loc.lat || !item.loc.lng) return;
    const { lat, lng, locName } = item.loc;
    const key = `${lat},${lng}`;
    if (!locationMap.has(key)) {
      locationMap.set(key, {
        lat,
        lng,
        name: locName || "Unknown",
        subIds: []
      });
    }
    locationMap.get(key).subIds.push(item.subId);
    loaderText.textContent = `Mapping checklist locations: ${processed} / ${checklistInfo.length}`;
  });

  document.getElementById("mychecklists-loader")?.remove();

  if (locationMap.size === 0) return;

  const map = L.map("mychecklists-map").setView([20, 0], 2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  const colorScale = d3.scaleSequential(d3.interpolateYlOrRd);
  const points = Array.from(locationMap.values()).sort((a, b) => a.subIds.length - b.subIds.length);
  const maxCount = Math.max(...points.map(p => p.subIds.length));

  points.forEach(point => {
    const color = colorScale(point.subIds.length / maxCount);
    L.circleMarker([point.lat, point.lng], {
      radius: 8,
      fillColor: color,
      color: "#333",
      weight: 1,
      fillOpacity: 0.9
    }).bindPopup(`<b>${point.name}</b><br>Checklists: ${point.subIds.length}`).addTo(map);
  });

  const legend = L.control({ position: "bottomright" });
  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "info legend");
    div.innerHTML = `<strong>Checklist Count</strong><br><canvas id="legend-canvas" width="100" height="10"></canvas><br>
      <div style="display: flex; justify-content: space-between;">
        <span>1</span><span>${maxCount}</span>
      </div>`;
    return div;
  };
  legend.addTo(map);

  const canvas = document.getElementById("legend-canvas");
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, "#ffffcc");
  gradient.addColorStop(1, "#bd0026");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
})();
