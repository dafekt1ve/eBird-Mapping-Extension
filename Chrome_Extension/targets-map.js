(async function () {
    if (!window.L || !window.d3) {
      console.warn("Leaflet or D3 not loaded.");
      return;
    }
  
    const spinnerStyle = document.createElement('style');
    spinnerStyle.textContent = `
      .ebird-mapping-spinner {
        border: 4px solid #f3f3f3;
        border-top: 4px solid #555;
        border-radius: 50%;
        width: 24px;
        height: 24px;
        animation: ebird-spin 1s linear infinite;
        margin: 0 auto;
      }
      @keyframes ebird-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(spinnerStyle);

    const speciesList = document.querySelectorAll("li.ResultsStats--toEdge");
    const buttonLocations = document.querySelectorAll("div.ResultsStats-action");
  
    function isWithinLast30Days() {
      const today = new Date();
      const currentMonth = today.getMonth() + 1;
  
      let selectedMonth = currentMonth;
      const urlParams = new URLSearchParams(window.location.search);
      const monthParam = urlParams.get('bmo') || urlParams.get('emo');
      if (monthParam) {
        selectedMonth = parseInt(monthParam, 10);
      }
  
      const currentYear = today.getFullYear();
      const currentMonthStart = new Date(currentYear, currentMonth - 1, 1);
  
      let selectedMonthYear = currentYear;
      if (selectedMonth === 12 && currentMonth === 1) {
        selectedMonthYear = currentYear - 1;
      }
  
      const selectedMonthStart = new Date(selectedMonthYear, selectedMonth - 1, 1);
      const diffTime = currentMonthStart - selectedMonthStart;
      const diffDays = diffTime / (1000 * 3600 * 24);
  
      return diffDays <= 30;
    }
  
    function findIndexWithSubstring(array, substring) {
        for (let i = 0; i < array.length; i++) {
          if (array[i].includes(substring)) {
            return i; // Return the index if the substring is found
          }
        }
        return -1; // Return -1 if the substring is not found in any element
      }

    function extractRegionCode() {
      const urlParts = window.location.search.split('&');
      const regionIdx = findIndexWithSubstring(urlParts, "r1=");
      const regSplit = urlParts[regionIdx].split('=');
      const reg = regSplit[1];
      return reg;
    }
  
    speciesList.forEach((speciesItem, index) => {
        const buttonLocation = buttonLocations[index];
        if (!buttonLocation) return;
      
        if (isWithinLast30Days() && !buttonLocation.querySelector(".ebird-mapping-show-recents")) {
          const showRecentsButton = document.createElement('button');
          showRecentsButton.textContent = "Show Recents";
          showRecentsButton.classList.add("Button", "Button--large", "Button--highlight", "ebird-mapping-show-recents");
          showRecentsButton.style.whiteSpace = 'nowrap';
          showRecentsButton.style.flexShrink = '0';
          showRecentsButton.style.display = 'inline-flex';
      
          showRecentsButton.addEventListener("click", () => {
            const existingMap = speciesItem.querySelector(".ebird-mapping-recent-map");
      
            if (existingMap) {
              // Map already exists, so remove it
              existingMap.remove();
              showRecentsButton.textContent = "Show Recents";
            } else {
              // No map yet, so fetch and display
              const anchor = speciesItem.querySelector("a[href*='/species/']");
              if (!anchor) {
                console.warn("No species anchor found.");
                return;
              }
      
              const speciesHref = anchor.getAttribute("href");
              const match = speciesHref.match(/\/species\/([^/]+)/);
              if (!match) {
                console.warn("Species code not found in href.");
                return;
              }
      
              const speciesCode = match[1];
              const regionCode = extractRegionCode();
      
              chrome.runtime.sendMessage({
                type: "batchRecentSightings",
                queries: [{ speciesCode, regionCode }]
              }, (response) => {
                if (response && response[`${speciesCode}_${regionCode}`]) {
                  displaySpeciesMap(response[`${speciesCode}_${regionCode}`], speciesItem);
                  showRecentsButton.textContent = "Hide Recents"; // Update after displaying map
                }
              });
            }
          });
      
          buttonLocation.appendChild(showRecentsButton);
        }
      });
      
  
      function displaySpeciesMap(sightingsData, speciesItem) {
        // Create the map wrapper and container
        const mapWrapper = document.createElement("div");
        mapWrapper.classList.add("ebird-mapping-recent-map");
        mapWrapper.style.width = "100%";
        mapWrapper.style.gridColumn = "1 / -1";
        mapWrapper.style.marginTop = "15px";
        mapWrapper.style.position = "relative"; // <-- ADD THIS so overlay div can position inside
    
        const mapContainer = document.createElement("div");
        mapContainer.style.height = "300px";
        mapContainer.style.width = "100%";
        mapContainer.style.border = "1px solid #ccc";
        mapContainer.style.borderRadius = "8px";
    
        mapWrapper.appendChild(mapContainer);
        speciesItem.appendChild(mapWrapper);
    
        // Create the map
        const map = L.map(mapContainer).setView([40.015, -105.2705], 8);
    
        // Add tile layer
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '© OpenStreetMap contributors',
        }).addTo(map);
    
        // Add scale control
        L.control.scale().addTo(map);
    
        // Color scale for recency
        const colorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([30, 0]); // 30 days as max recency threshold
    
        // Function to add the legend to the map
        function addColorLegend(map, colorScale, minValue, maxValue, label = "Sightings") {
            const legend = L.control({ position: "bottomright" });
            legend.onAdd = function () {
                const div = L.DomUtil.create('div', 'info legend');
                div.innerHTML = `
                    <strong>${label}</strong><br>
                    <canvas id="legend-canvas-${map._leaflet_id}" width="100" height="10" style="margin-top:4px;"></canvas><br>
                    <div style="display: flex; justify-content: space-between; font-size: 12px;">
                        <span>${minValue}</span><span>${maxValue}</span>
                    </div>`;
                return div;
            };
            legend.addTo(map);
    
            setTimeout(() => {
                const canvas = document.getElementById(`legend-canvas-${map._leaflet_id}`);
                if (!canvas) return;
                const ctx = canvas.getContext('2d');
                const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
                for (let i = 0; i <= 1; i += 0.01) {
                    gradient.addColorStop(i, colorScale(minValue + i * (maxValue - minValue)));
                }
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }, 100);
        }
    
        // If no sightings, add an overlay message
        if (sightingsData.length === 0) {
            const overlay = document.createElement("div");
            overlay.style.position = "absolute";
            overlay.style.top = "0";
            overlay.style.left = "0";
            overlay.style.width = "100%";
            overlay.style.height = "100%";
            overlay.style.backgroundColor = "rgba(255, 255, 255, 0.8)";
            overlay.style.display = "flex";
            overlay.style.alignItems = "center";
            overlay.style.justifyContent = "center";
            overlay.style.fontSize = "18px";
            overlay.style.fontWeight = "bold";
            overlay.style.color = "#666";
            overlay.style.borderRadius = "8px";
            overlay.style.zIndex = "9999"; // <-- This ensures it appears on top
            overlay.innerText = "No sightings in the last 30 days";
            mapWrapper.appendChild(overlay);
    
            // Don't try to add markers or fitBounds if empty
            return;
        }
    
        // Add the legend
        addColorLegend(map, colorScale, 30, 0, "Days Ago");
    
        // Create a LatLngBounds object to track the bounds for fitBounds
        let bounds = L.latLngBounds();
    
        // Sort sightings so oldest plot first
        sightingsData.sort((a, b) => new Date(a.obsDt) - new Date(b.obsDt));
    
        // Process the sightings data and add markers
        sightingsData.forEach(loc => {
            const obsDate = new Date(loc.obsDt);
            const daysAgo = Math.floor((new Date() - obsDate) / (1000 * 3600 * 24));
            const color = colorScale(Math.min(daysAgo, 30));
    
            const popupContent = `<strong>${loc.locName}</strong><br>
            <a href="https://ebird.org/checklist/${loc.subId}" target="_blank" style="font-weight:bold;">${loc.comName}</a> (${loc.obsDt})`;
    
            const marker = L.circleMarker([loc.lat, loc.lng], {
                radius: 8,
                fillColor: color,
                color: "#000",
                weight: 1,
                fillOpacity: 0.8
            }).bindPopup(popupContent);
    
            marker.addTo(map);
            bounds.extend(marker.getLatLng());
        });
    
        // Fit map to bounds
        map.fitBounds(bounds);
    }   
    
  
    const sectionHeading = document.querySelector("div.SectionHeading.u-stack-sm");
    if (!sectionHeading) {
      console.warn("Section heading not found.");
      return;
    }
  
    if (!document.getElementById("ebird-mapping-show-all-targets")) {
      const showAllLocationsButton = document.createElement('button');
      showAllLocationsButton.textContent = "Map All Recent Targets";
      showAllLocationsButton.id = "ebird-mapping-show-all-targets";
      showAllLocationsButton.classList.add("Button", "Button--large", "Button--highlight");
      showAllLocationsButton.style.margin = "10px auto"; 
      showAllLocationsButton.style.display = "inline-flex";
  
      sectionHeading.insertAdjacentElement("afterend", showAllLocationsButton);
  
      showAllLocationsButton.addEventListener("click", () => {
        if (document.getElementById("targets-all-map-container")) {
          console.log("All Targets map already shown.");
          return;
        }
  
        const loader = document.createElement("div");
        loader.id = "targets-all-loader";
        loader.style.textAlign = "center";
        loader.style.marginTop = "10px";
        loader.innerHTML = `
          <div class="ebird-mapping-spinner" style="margin-bottom: 8px;"></div>
          <div id="targets-loader-counter" style="font-size: 14px;">Preparing map...</div>
        `;
        sectionHeading.insertAdjacentElement("afterend", loader);
        
        const queries = [];
        speciesList.forEach(speciesItem => {
          const anchor = speciesItem.querySelector("a[href*='/species/']");
          if (anchor) {
            const speciesHref = anchor.getAttribute("href");
            const match = speciesHref.match(/\/species\/([^/]+)/);
            if (match) {
              const speciesCode = match[1];
              const regionCode = extractRegionCode();
              queries.push({ speciesCode, regionCode });
            }
          }
        });
  
        if (queries.length === 0) {
          console.warn("No species queries found.");
          loader.remove();
          return;
        }
  
        chrome.runtime.sendMessage({
            type: "batchRecentSightings",
            queries
            }, (response) => {
            loader.remove();
            if (!response) {
                console.warn("No response received.");
                return;
            }

            displayAllTargetsMap(response, sectionHeading);
        });
      });
    }

    function displayAllTargetsMap(allData, insertAfterElement) {
        const mapWrapper = document.createElement("div");
        mapWrapper.id = "targets-all-map-container";
        mapWrapper.style.width = "100%";
        mapWrapper.style.marginTop = "15px";
        
        const filterContainer = document.createElement("div");
        filterContainer.style.margin = "10px 0";
        filterContainer.style.width = "80%";
        filterContainer.style.display = "flex";

        const exoticCheckbox = document.createElement("input");
        exoticCheckbox.type = "checkbox";
        exoticCheckbox.id = "exotic-toggle";
        exoticCheckbox.checked = false;  // By default, exclude exotics
        exoticCheckbox.style.verticalAlign = "middle";
        exoticCheckbox.style.margin = "-25px 0px 5px 20px";
        
        const exoticLabel = document.createElement("label");
        exoticLabel.setAttribute("for", "exotic-toggle");
        exoticLabel.textContent = "Exclude Exotic Species";  // Updated label
        
        filterContainer.innerHTML = `
          <label for="daysBackSelect" style="font-weight:bold; margin-right: 8px">Show observations from last:</label>
          <select id="daysBackSelect" style="width: 40%">
            <option value="30">30 days (max)</option>
            <option value="21">3 weeks</option>
            <option value="14">2 weeks</option>
            <option value="7">1 week</option>
            <option value="5">5 days</option>
            <option value="3">3 days</option>
            <option value="1">1 day</option>
          </select>
        `;

        filterContainer.appendChild(exoticCheckbox);
        filterContainer.appendChild(exoticLabel);
        insertAfterElement.parentNode.insertBefore(filterContainer, insertAfterElement.nextSibling);

        const mapContainer = document.createElement("div");
        mapContainer.style.height = "600px";
        mapContainer.style.width = "100%";
        mapContainer.style.border = "1px solid #ccc";
        mapContainer.style.borderRadius = "8px";
        
        mapWrapper.appendChild(mapContainer);
        insertAfterElement.parentNode.insertBefore(mapWrapper, insertAfterElement.nextSibling);
        
        const map = L.map(mapContainer).setView([0, 0], 2);  // Initialize with a default view (global view)

        let userMovedMap = false;

        map.on('zoomstart', () => { userMovedMap = true; });
        map.on('dragstart', () => { userMovedMap = true; });
        
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '© OpenStreetMap contributors',
        }).addTo(map);
        
        L.control.scale().addTo(map);
        
        const sightingsByLocation = {};
        
        for (const key in allData) {
            const sightings = allData[key];
            sightings.forEach(loc => {
                const keyStr = `${loc.lat.toFixed(4)},${loc.lng.toFixed(4)}`;
                if (!sightingsByLocation[keyStr]) {
                    sightingsByLocation[keyStr] = [];
                }
                sightingsByLocation[keyStr].push(loc);
            });
        }
        
        const locationsArray = Object.entries(sightingsByLocation).map(([key, locs]) => {
            const [lat, lng] = key.split(",").map(Number);
            return { lat, lng, species: locs };
        });
        
        const colorScale = d3.scaleSequential(d3.interpolateYlOrRd)
            .domain([1, d3.max(locationsArray, d => d.species.length)]);
    
        function addColorLegend(map, colorScale, minValue, maxValue, label = "Species Count") {
            const legend = L.control({ position: "bottomright" });
            legend.onAdd = function () {
                const div = L.DomUtil.create('div', 'info legend');
                div.innerHTML = `
                    <strong>${label}</strong><br>
                    <canvas id="legend-canvas-${map._leaflet_id}" width="100" height="10" style="margin-top:4px;"></canvas><br>
                    <div style="display: flex; justify-content: space-between; font-size: 12px;">
                        <span>${minValue}</span><span>${maxValue}</span>
                    </div>`;
                return div;
            };
            legend.addTo(map);
        
            setTimeout(() => {
                const canvas = document.getElementById(`legend-canvas-${map._leaflet_id}`);
                if (!canvas) return;
                const ctx = canvas.getContext('2d');
                const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
                for (let i = 0; i <= 1; i += 0.01) {
                    gradient.addColorStop(i, colorScale(minValue + i * (maxValue - minValue)));
                }
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }, 100);
        }
        
        locationsArray.sort((a, b) => a.species.length - b.species.length); // Smallest first
        
        addColorLegend(map, colorScale, locationsArray[0].species.length, locationsArray.at(-1).species.length, "Species Count");
    
        // Create a LatLngBounds object to fit all the markers
        let bounds = L.latLngBounds();
    
        // Store markers for later removal
        let markers = [];

        function updateMarkers() {
          const excludeExotics = exoticCheckbox.checked;
          const daysBack = parseInt(document.getElementById("daysBackSelect").value, 10);
      
          // Calculate the cutoff date for filtering
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - daysBack);
      
          // Clear existing markers
          markers.forEach(marker => map.removeLayer(marker));
          markers = [];
      
          // Reset bounds before re-extending
          bounds = L.latLngBounds();
      
          locationsArray.forEach(loc => {
              // Filter species based on exotics and date
              const filteredSpecies = loc.species.filter(s => {
                  const isExotic = s.exoticCategory === "X" || s.exoticCategory === "P" || s.exoticCategory === "E";
                  const obsDate = new Date(s.obsDt);
                  return (!excludeExotics || !isExotic) && obsDate >= cutoffDate;
              });
      
              if (filteredSpecies.length === 0) return;
      
              // Color scale based on count of recent (and optionally non-exotic) species
              const color = colorScale(filteredSpecies.length);
      
              const marker = L.circleMarker([loc.lat, loc.lng], {
                  radius: 10,
                  color: "#000",
                  weight: 1,
                  fillOpacity: 0.8,
                  fillColor: color,
              }).bindPopup(
                  `<div style="max-height:200px; overflow-y:auto;">
                  <strong>${loc.species['0'].locName}</strong><br>
                  <strong>${filteredSpecies.length} Species</strong><br>
                  ${filteredSpecies.map(s => `<a href="https://ebird.org/checklist/${s.subId}" target="_blank" style="font-weight:bold;">${s.comName}</a> (${s.obsDt})`).join("<br>")}
                  </div>`
              );
      
              marker.addTo(map);
              markers.push(marker);
              bounds.extend(marker.getLatLng());
          });
      
          if (!userMovedMap && markers.length > 0) {
              map.fitBounds(bounds);
          }
      }
      
        
        // Initialize markers when the map is first displayed
        updateMarkers();
    
        // Re-filter the map when the checkbox changes
        exoticCheckbox.addEventListener("change", updateMarkers);
        document.getElementById("daysBackSelect").addEventListener("change", updateMarkers);
    }    
    

  })();
  