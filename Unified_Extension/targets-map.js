(async function () {
    // Cross-browser compatibility
    const isFirefox = typeof browser !== 'undefined';
    const extensionAPI = isFirefox ? browser : chrome;

    // Function to load script dynamically
    function loadScript(src) {
      return new Promise((resolve, reject) => {
        if (src.includes('leaflet.js') && window.L) {
          resolve();
          return;
        }
        if (src.includes('d3.') && window.d3) {
          resolve();
          return;
        }

        const script = document.createElement('script');
        script.src = extensionAPI.runtime.getURL(src);
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
      });
    }

    function loadCSS(href) {
      return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = extensionAPI.runtime.getURL(href);
        link.onload = () => resolve();
        link.onerror = () => reject(new Error(`Failed to load ${href}`));
        document.head.appendChild(link);
      });
    }

    // Load libraries if not already loaded
    if (!window.L || !window.d3) {
      console.log("Loading Leaflet and D3...");
      try {
        await loadScript("d3/d3.v7.min.js");
        await loadCSS("leaflet/leaflet.css");
        await loadCSS("leaflet/leaflet.fullscreen.css");
        await loadScript("leaflet/leaflet.js");
        await loadScript("leaflet/leaflet.fullscreen.min.js");
        console.log("âœ“ Libraries loaded");
      } catch (error) {
        console.error("Failed to load libraries:", error);
        return;
      }
    }

    // if (!window.L || !window.d3) {
    //   console.warn("Leaflet or D3 not loaded.");
    //   return;
    // }
  
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
      .leaflet-control-layers label {
        margin: 0 !important;
        padding: 0px 5px !important;
        line-height: 1.2 !important;
      }
      .leaflet-control-layers-separator {
        margin: 2px 0 !important;
      }
      .leaflet-control-layers input {
        margin: 2px 5px 2px 0 !important;
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
            return i;
          }
        }
        return -1;
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
              existingMap.remove();
              showRecentsButton.textContent = "Show Recents";
            } else {
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
      
              extensionAPI.runtime.sendMessage({
                type: "batchRecentSightings",
                queries: [{ speciesCode, regionCode }]
              }, (response) => {
                if (response && response[`${speciesCode}_${regionCode}`]) {
                  displaySpeciesMap(response[`${speciesCode}_${regionCode}`], speciesItem);
                  showRecentsButton.textContent = "Hide Recents";
                }
              });
            }
          });
      
          buttonLocation.appendChild(showRecentsButton);
        }
      });
      
  
      function displaySpeciesMap(sightingsData, speciesItem) {
        const mapWrapper = document.createElement("div");
        mapWrapper.classList.add("ebird-mapping-recent-map");
        mapWrapper.style.width = "100%";
        mapWrapper.style.gridColumn = "1 / -1";
        mapWrapper.style.marginTop = "15px";
        mapWrapper.style.position = "relative";

        const mapContainer = document.createElement("div");
        mapContainer.style.height = "300px";
        mapContainer.style.width = "100%";
        mapContainer.style.border = "1px solid #ccc";
        mapContainer.style.borderRadius = "8px";

        mapWrapper.appendChild(mapContainer);
        speciesItem.appendChild(mapWrapper);

        // Define base layers
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

        const map = L.map(mapContainer, {
          layers: [googleStreets]
        }).setView([40.015, -105.2705], 8);

        // Add layer control
        L.control.layers(baseMaps).addTo(map);

        map.addControl(new L.Control.Fullscreen());

        L.control.scale({ position: 'bottomleft' }).addTo(map);

    
        const colorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([30, 0]);
    
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
            overlay.style.zIndex = "9999";
            overlay.innerText = "No sightings in the last 30 days";
            mapWrapper.appendChild(overlay);
    
            return;
        }
    
        addColorLegend(map, colorScale, 30, 0, "Days Ago");
    
        let bounds = L.latLngBounds();
    
        sightingsData.sort((a, b) => new Date(a.obsDt) - new Date(b.obsDt));
    
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
  
        extensionAPI.runtime.sendMessage({
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

        const mapContainer = document.createElement("div");
        mapContainer.style.height = "600px";
        mapContainer.style.width = "100%";
        mapContainer.style.border = "1px solid #ccc";
        mapContainer.style.borderRadius = "8px";

        mapWrapper.appendChild(mapContainer);
        insertAfterElement.parentNode.insertBefore(mapWrapper, insertAfterElement.nextSibling);

        // Define base layers
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

        const map = L.map(mapContainer, {
          layers: [googleStreets]
        }).setView([0, 0], 2);

        // Add layer control
        L.control.layers(baseMaps).addTo(map);

        map.addControl(new L.Control.Fullscreen());

        L.control.scale({ position: 'bottomleft' }).addTo(map);

        let userMovedMap = false;

        map.on('zoomstart', () => { userMovedMap = true; });
        map.on('dragstart', () => { userMovedMap = true; });

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

        locationsArray.sort((a, b) => a.species.length - b.species.length);

        addColorLegend(map, colorScale, locationsArray[0].species.length, locationsArray.at(-1).species.length, "Species Count");

        let bounds = L.latLngBounds();

        let markers = [];

        // Create filter control
        const FilterControl = L.Control.extend({
          options: { position: 'topright' },
          onAdd: function () {
            const wrapper = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            wrapper.style.background = 'white';

            // Create toggle button with filter icon
            const toggleBtn = L.DomUtil.create('button', '', wrapper);
            toggleBtn.innerHTML = '&#9776;'; // Hamburger/filter icon
            toggleBtn.style.cssText = 'width: 30px; height: 30px; border: none; background: white; cursor: pointer; font-size: 18px;';
            toggleBtn.title = 'Toggle filters';

            // Create content container
            const content = L.DomUtil.create('div', '', wrapper);
            content.style.cssText = 'display: none; padding: 8px; background: white; border-top: 1px solid #ccc; white-space: nowrap;';

            const label = L.DomUtil.create('label', '', content);
            label.style.fontWeight = 'bold';
            label.style.marginRight = '8px';
            label.style.display = 'block';
            label.style.marginBottom = '4px';
            label.textContent = 'Show observations from last:';

            const select = L.DomUtil.create('select', '', content);
            select.id = 'daysBackSelect';
            select.style.all = 'revert';
            select.style.width = '100%';
            select.style.marginBottom = '8px';
            select.innerHTML = `
              <option value="30">30 days (max)</option>
              <option value="21">3 weeks</option>
              <option value="14">2 weeks</option>
              <option value="7">1 week</option>
              <option value="5">5 days</option>
              <option value="3">3 days</option>
              <option value="1">1 day</option>
            `;

            const checkboxDiv = L.DomUtil.create('div', '', content);
            const checkbox = L.DomUtil.create('input', '', checkboxDiv);
            checkbox.type = 'checkbox';
            checkbox.id = 'exotic-toggle';
            checkbox.style.marginRight = '5px';

            const checkboxLabel = L.DomUtil.create('label', '', checkboxDiv);
            checkboxLabel.setAttribute('for', 'exotic-toggle');
            checkboxLabel.textContent = 'Exclude Exotic Species';

            L.DomEvent.disableClickPropagation(wrapper);

            // Toggle functionality
            L.DomEvent.on(toggleBtn, 'click', (e) => {
              e.stopPropagation();
              if (content.style.display === 'none') {
                content.style.display = 'block';
                toggleBtn.style.background = '#f4f4f4';
              } else {
                content.style.display = 'none';
                toggleBtn.style.background = 'white';
              }
            });

            L.DomEvent.on(select, 'change', updateMarkers);
            L.DomEvent.on(checkbox, 'change', updateMarkers);

            return wrapper;
          }
        });

        map.addControl(new FilterControl());

        function updateMarkers() {
          const excludeExotics = document.getElementById('exotic-toggle').checked;
          const daysBack = parseInt(document.getElementById('daysBackSelect').value, 10);
      
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - daysBack);
      
          markers.forEach(marker => map.removeLayer(marker));
          markers = [];
      
          bounds = L.latLngBounds();
      
          locationsArray.forEach(loc => {
              const filteredSpecies = loc.species.filter(s => {
                  const isExotic = s.exoticCategory === "X" || s.exoticCategory === "P" || s.exoticCategory === "E";
                  const obsDate = new Date(s.obsDt);
                  return (!excludeExotics || !isExotic) && obsDate >= cutoffDate;
              });
      
              if (filteredSpecies.length === 0) return;
      
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
      

        updateMarkers();
    }

  // ========================================
  // NEW FEATURE: Map Species per County
  // ========================================
  
  /**
   * Extract target species from the targets page
   */
  function extractTargetSpecies() {
    const targets = [];
    
    document.querySelectorAll('.ResultsStats--toEdge').forEach(item => {
      const anchor = item.querySelector("a[href*='/species/']");
      if (!anchor) return;
      
      const speciesHref = anchor.getAttribute("href");
      const match = speciesHref.match(/\/species\/([^/]+)/);
      if (!match) return;
      
      const speciesCode = match[1];
      
      // Extract species name - it's directly in the anchor text, before the <em> tag
      // Example: "Mottled Duck <em class="sci">Anas fulvigula</em>"
      const textContent = anchor.textContent.trim();
      // Remove scientific name in parentheses or <em> tags
      const speciesName = textContent.split(/\s*[\(]/)[0].trim();
      
      if (speciesCode && speciesName) {
        targets.push({
          code: speciesCode,
          name: speciesName
        });
      }
    });
    
    console.log(`Extracted ${targets.length} target species`);
    return targets;
  }

  /**
   * Extract target month from URL parameters
   */
  function extractTargetMonth() {
    const urlParams = new URLSearchParams(window.location.search);
    const bmo = urlParams.get('bmo');
    const emo = urlParams.get('emo');
    
    // Check if it's year-round (January through December)
    if (bmo === '1' && emo === '12') {
      return 'year-round';
    }
    
    // If range with same start/end, use that month
    if (bmo === emo && bmo) {
      return parseInt(bmo);
    }
    
    // If different range, return an object with both
    if (bmo && emo && bmo !== emo) {
      return {
        start: parseInt(bmo),
        end: parseInt(emo),
        isRange: true
      };
    }
    
    // Default to begin month or current month
    return parseInt(bmo || emo || new Date().getMonth() + 1);
  }

  /**
   * Determine the appropriate label for sub-regions based on region code
   */
  function getRegionLevelLabel(regionCode) {
    const parts = regionCode.split('-');
    
    if (parts.length === 1) {
      // Country level (e.g., "US") → subdivisions are states/provinces
      return 'States/Provinces';
    } else if (parts.length === 2) {
      // State/province level (e.g., "US-AL") → subdivisions are counties
      return 'Counties';
    } else {
      // Already at lowest level
      return 'Sub-regions';
    }
  }
  
  /**
   * Get singular form of region level label
   */
  function getRegionLevelSingular(regionCode) {
    const parts = regionCode.split('-');
    
    if (parts.length === 1) {
      return 'State/Province';
    } else if (parts.length === 2) {
      return 'County';
    } else {
      return 'Sub-region';
    }
  }

  /**
   * Get sub-regions (counties, states) using eBird API
   */
  async function getSubRegions(regionCode) {
    const parts = regionCode.split('-');
    let apiUrl;
    
    // Region code structure:
    // - "US" (1 part) = Country → get states with subnational1
    // - "US-AK" (2 parts) = State → get counties with subnational2
    // - "US-AK-123" (3 parts) = County → no subdivisions
    
    if (parts.length === 1) {
      // Country level (e.g., "US") → Get states/provinces (subnational1)
      apiUrl = `https://api.ebird.org/v2/ref/region/list/subnational1/${regionCode}`;
    } else if (parts.length === 2) {
      // State/province level (e.g., "US-AK") → Get counties (subnational2)
      apiUrl = `https://api.ebird.org/v2/ref/region/list/subnational2/${regionCode}`;
    } else {
      // Already at county level
      console.warn(`${regionCode} is already at lowest level`);
      return [];
    }
    
    try {
      const response = await fetch(apiUrl, {
        headers: { "X-eBirdApiToken": "2dhshtjdomjt" }
      });
      
      if (!response.ok) {
        console.error(`Failed to get sub-regions for ${regionCode}`);
        return [];
      }
      
      return await response.json();
    } catch (err) {
      console.error('Error fetching sub-regions:', err);
      return [];
    }
  }

  // Cache for GeoJSON boundary data to avoid repeated fetches
  const boundaryCache = {
    states: null,
    counties: null
  };

  /**
   * Get GeoJSON boundary for a region from public data sources
   */
  async function getRegionBoundary(regionCode) {
    try {
      const parts = regionCode.split('-');
      
      // US State boundaries
      if (parts.length === 2 && parts[0] === 'US') {
        const stateCode = parts[1];
        
        // DC is not in state GeoJSON files (it's technically not a state)
        // Skip trying to fetch it and go straight to bounding box
        if (stateCode === 'DC') {
          console.log('ℹ️ Using bounding box for Washington DC (not in state boundaries file)');
          // Fall through to bounding box code below
        } else {
        
        // Fetch all states if not cached
        if (!boundaryCache.states) {
          try {
            // Try multiple sources for US states GeoJSON
            let statesData = null;
            
            // Source 1: Try Eric Celeste's US Atlas (same maintainer as counties)
            try {
              console.log('⏳ Loading US states GeoJSON...');
              const response1 = await fetch(
                `https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json`
              );
              
              if (response1.ok) {
                statesData = await response1.json();
                console.log(`✓ Loaded US states GeoJSON (${statesData.features.length} states)`);
              }
            } catch (e) {
              console.warn(`Failed to fetch from PublicaMundi:`, e);
            }
            
            // Source 2: Try alternate source if first failed
            if (!statesData) {
              try {
                const response2 = await fetch(
                  `https://eric.clst.org/assets/wiki/uploads/Stuff/gz_2010_us_040_00_5m.json`
                );
                
                if (response2.ok) {
                  statesData = await response2.json();
                  console.log(`✓ Loaded US states GeoJSON from alternate source (${statesData.features.length} states)`);
                }
              } catch (e) {
                console.warn(`Failed to fetch from alternate source:`, e);
              }
            }
            
            if (statesData) {
              boundaryCache.states = statesData;
            }
          } catch (e) {
            console.warn(`Failed to fetch state boundaries:`, e);
          }
        }
        
        if (boundaryCache.states) {
          const stateFeature = boundaryCache.states.features.find(f => {
            const props = f.properties;
            
            // Try various property names (case-insensitive where it makes sense)
            const matchesCode = 
              props.STATE === stateCode || 
              props.STUSPS === stateCode ||
              props.state === stateCode ||
              props.abbr === stateCode ||
              props.postal === stateCode ||
              props.STATE_ABBR === stateCode ||
              props.STUSPS === stateCode.toUpperCase() ||
              props.STATE === stateCode.toUpperCase();
            
            const matchesID = 
              f.id === stateCode ||
              f.id === `US-${stateCode}` ||
              f.id === stateCode.toUpperCase();
            
            // Also try matching by name if nothing else works
            const stateName = props.name || props.NAME || props.State || props.STATE_NAME;
            const stateNames = {
              'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
              'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
              'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
              'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
              'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
              'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
              'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
              'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
              'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
              'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
            };
            const matchesName = stateName && stateName === stateNames[stateCode];
            
            return matchesCode || matchesID || matchesName;
          });
          
          if (stateFeature) {
            console.log(`✓ Found actual state boundary for ${regionCode}`);
            return stateFeature;
          } else {
            console.warn(`⚠️ State ${regionCode} not found in GeoJSON`);
            console.log(`   Looking for: ${stateCode}`);
            console.log(`   Sample feature properties:`, boundaryCache.states.features[0]);
            console.log(`   Available state IDs:`, boundaryCache.states.features.slice(0, 5).map(f => 
              ({ id: f.id, props: Object.keys(f.properties), name: f.properties.name || f.properties.NAME })
            ));
          }
        }
        } // End of non-DC states
      }
      
      // US County boundaries
      if (parts.length === 3 && parts[0] === 'US') {
        const stateCode = parts[1];
        const countyCode = parts[2];
        
        // Fetch all counties if not cached (this is a ~3MB file, fetched once)
        if (!boundaryCache.counties) {
          try {
            console.log('⏳ Loading US counties GeoJSON (one-time download ~3MB)...');
            const response = await fetch(
              `https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json`
            );
            
            if (response.ok) {
              boundaryCache.counties = await response.json();
              console.log(`✓ Loaded US counties GeoJSON (${boundaryCache.counties.features.length} counties)`);
            }
          } catch (e) {
            console.warn(`Failed to fetch county boundaries:`, e);
          }
        }
        
        if (boundaryCache.counties) {
          // Map state abbreviation to FIPS code
          const stateFIPSMap = {
            'AL': '01', 'AK': '02', 'AZ': '04', 'AR': '05', 'CA': '06',
            'CO': '08', 'CT': '09', 'DE': '10', 'FL': '12', 'GA': '13',
            'HI': '15', 'ID': '16', 'IL': '17', 'IN': '18', 'IA': '19',
            'KS': '20', 'KY': '21', 'LA': '22', 'ME': '23', 'MD': '24',
            'MA': '25', 'MI': '26', 'MN': '27', 'MS': '28', 'MO': '29',
            'MT': '30', 'NE': '31', 'NV': '32', 'NH': '33', 'NJ': '34',
            'NM': '35', 'NY': '36', 'NC': '37', 'ND': '38', 'OH': '39',
            'OK': '40', 'OR': '41', 'PA': '42', 'RI': '44', 'SC': '45',
            'SD': '46', 'TN': '47', 'TX': '48', 'UT': '49', 'VT': '50',
            'VA': '51', 'WA': '53', 'WV': '54', 'WI': '55', 'WY': '56'
          };
          
          const stateFIPS = stateFIPSMap[stateCode];
          if (stateFIPS) {
            // Construct 5-digit FIPS code: state FIPS (2 digits) + county code (3 digits)
            const fipsCode = stateFIPS + countyCode;
            
            const countyFeature = boundaryCache.counties.features.find(f => 
              f.id === fipsCode
            );
            
            if (countyFeature) {
              console.log(`✓ Found actual county boundary for ${regionCode} (FIPS: ${fipsCode})`);
              return countyFeature;
            } else {
              console.warn(`⚠️ County ${regionCode} not found with FIPS ${fipsCode}`);
              console.log(`   Available FIPS codes starting with ${stateFIPS}:`, 
                boundaryCache.counties.features
                  .filter(f => f.id.startsWith(stateFIPS))
                  .slice(0, 10)
                  .map(f => f.id)
              );
            }
          } else {
            console.warn(`⚠️ State code ${stateCode} not in FIPS map`);
          }
        }
      }
      
      // Fallback: Create rectangle from eBird API bounds
      console.log(`📦 Falling back to bounding box for ${regionCode}`);
      
      const response = await fetch(
        `https://api.ebird.org/v2/ref/region/info/${regionCode}`,
        { headers: { "X-eBirdApiToken": "2dhshtjdomjt" } }
      );
      
      if (!response.ok) {
        console.warn(`Failed to get region info for ${regionCode}`);
        return null;
      }
      
      const data = await response.json();
      
      if (data.bounds) {
        const { minX, minY, maxX, maxY } = data.bounds;
        
        return {
          type: "Feature",
          properties: {
            regionCode: regionCode,
            name: data.result || regionCode
          },
          geometry: {
            type: "Polygon",
            coordinates: [[
              [minX, minY],
              [maxX, minY],
              [maxX, maxY],
              [minX, maxY],
              [minX, minY]
            ]]
          }
        };
      }
      
      return null;
    } catch (err) {
      console.error(`Failed to get boundary for ${regionCode}:`, err);
      return null;
    }
  }

  /**
   * Parse bar chart data from eBird barchart page
   * URL: https://ebird.org/barchart?r={regionCode}
   */
  function parseBarChartData(html, targetSpeciesCodes) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const speciesData = {};
    
    console.log(`Parsing bar chart data for ${targetSpeciesCodes.size} target species`);
    
    // Strategy 1: Look for species data in script tags
    // Barchart page often has data like: var speciesData = {...} or similar
    const scriptTags = doc.querySelectorAll('script:not([src])');
    
    console.log(`Found ${scriptTags.length} inline script tags`);
    
    for (const script of scriptTags) {
      const content = script.textContent;
      
      // Look for various data patterns in barchart page
      const patterns = [
        // Look for any object with species codes as keys
        /var\s+\w+\s*=\s*(\{[^}]*"[a-z]{6}"[^}]*\})/gi,
        // Look for frequency/bar data arrays
        /frequencies?\s*:\s*\[([^\]]+)\]/gi,
        // Look for month data
        /months?\s*:\s*\[([^\]]+)\]/gi,
      ];
      
      // Try to find species code patterns
      const codeMatches = content.match(/["']([a-z]{6})["']\s*:\s*\{/g);
      
      if (codeMatches && codeMatches.length > 0) {
        console.log(`Found ${codeMatches.length} potential species codes in script`);
        
        // Try to extract the full object
        try {
          // Find objects that look like they contain species data
          const objPattern = /\{[\s\S]{0,5000}?"[a-z]{6}"[\s\S]{0,5000}?\}/g;
          const matches = content.match(objPattern);
          
          if (matches) {
            for (const match of matches) {
              try {
                // Clean up the JSON
                let cleaned = match
                  .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
                  .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":'); // Ensure quoted keys
                
                const data = JSON.parse(cleaned);
                
                // Check if this looks like species data
                for (const [key, value] of Object.entries(data)) {
                  if (targetSpeciesCodes.has(key) && value && typeof value === 'object') {
                    // Look for frequency arrays in various formats
                    const freqs = value.frequencies || value.months || value.freq || 
                                 value.bars || value.data || value.values;
                    
                    if (Array.isArray(freqs) && freqs.length === 12) {
                      speciesData[key] = {
                        name: value.name || value.comName || value.commonName || '',
                        frequencies: freqs.map(f => typeof f === 'number' ? f : parseFloat(f) || 0)
                      };
                    }
                  }
                }
              } catch (e) {
                // Continue to next match
              }
            }
            
            if (Object.keys(speciesData).length > 0) {
              console.log(`Strategy 1 SUCCESS: Found ${Object.keys(speciesData).length} species with data`);
              return speciesData;
            }
          }
        } catch (e) {
          console.log('Failed to parse species data from script:', e.message);
        }
      }
    }
    
    console.log('Strategy 1 (script tags) failed, trying Strategy 2 (HTML parsing)');
    
    // Strategy 2: Parse HTML table structure
    // eBird barchart uses a table where each row is a species (tr.rC)
    // Each row has:
    //   - First 3 <td>: species name, map link, chart link
    //   - Next 12 <td>: one per month
    //     - Each month <td> contains 4 <div> elements (weekly subdivisions)
    //     - Each <div> has a class indicating frequency for that week:
    //       - "sp" = no data (0%)
    //       - "b1" through "b6" = frequency levels (1-10%, 11-25%, 26-40%, 41-60%, 61-80%, 81-100%)
    //   - We average the 4 weekly frequencies to get the monthly frequency
    
    const speciesRows = doc.querySelectorAll('tr.rC');
    
    console.log(`Found ${speciesRows.length} species rows (tr.rC)`);
    
    let rowsProcessed = 0;
    let rowsWithCode = 0;
    let targetRowsFound = 0;
    
    speciesRows.forEach(row => {
      rowsProcessed++;
      
      // Get species code from the link
      const link = row.querySelector('a[href*="/species/"]');
      if (!link) return;
      
      const code = link.dataset.speciesCode || 
                   link.href.match(/\/species\/([^/?]+)/)?.[1];
      
      if (!code) return;
      
      rowsWithCode++;
      
      if (!targetSpeciesCodes.has(code)) return;
      
      targetRowsFound++;
      console.log(`Found target species: ${code}`);
      
      // Get species name - it's in the link text before the <em> tag
      const nameText = link.textContent.trim();
      const name = nameText.split('(')[0].trim();
      
      console.log(`  Name: ${name}`);
      
      // Get all month cells (skip first 3 cells: species name, map, chart)
      const allTds = row.querySelectorAll('td');
      const monthCells = Array.from(allTds).slice(3);
      
      console.log(`  Month cells: ${monthCells.length}`);
      
      if (monthCells.length !== 12) {
        console.warn(`  Expected 12 month cells, got ${monthCells.length}`);
        return;
      }
      
      const frequencies = [];
      
      monthCells.forEach((cell, idx) => {
        // Each cell contains 4 <div> elements (one per week in the month)
        // Each div has a class indicating frequency for that week
        const divs = cell.querySelectorAll('div');
        
        if (divs.length !== 4) {
          console.warn(`  Month ${idx + 1}: Expected 4 weekly divs, got ${divs.length}`);
        }
        
        // Collect frequency for each week in this month
        const weeklyFrequencies = [];
        
        divs.forEach(div => {
          const className = div.className;
          
          // Map CSS classes to frequency values
          // Based on eBird's barchart representation
          const frequencyMap = {
            'sp': 0,      // No data
            'b1': 0.05,   // 1-10% (~5%)
            'b2': 0.175,  // 11-25% (~17.5%)
            'b3': 0.33,   // 26-40% (~33%)
            'b4': 0.50,   // 41-60% (~50%)
            'b5': 0.70,   // 61-80% (~70%)
            'b6': 0.90    // 81-100% (~90%)
          };
          
          if (frequencyMap.hasOwnProperty(className)) {
            weeklyFrequencies.push(frequencyMap[className]);
          }
        });
        
        // Calculate monthly average from weekly data
        const monthlyFrequency = weeklyFrequencies.length > 0
          ? weeklyFrequencies.reduce((sum, f) => sum + f, 0) / weeklyFrequencies.length
          : 0;
        
        frequencies.push(monthlyFrequency);
      });
      
      console.log(`  Frequencies: [${frequencies.map(f => f.toFixed(2)).join(', ')}]`);
      
      if (frequencies.length === 12 && name) {
        speciesData[code] = {
          name: name,
          frequencies: frequencies
        };
        console.log(`  ✓ Added ${code} to species data`);
      } else {
        console.log(`  ✗ Not adding - frequencies: ${frequencies.length}, name: ${!!name}`);
      }
    });
    
    console.log(`Strategy 2 summary: Processed ${rowsProcessed} rows, ${rowsWithCode} had species codes, ${targetRowsFound} were target species`);
    console.log(`Strategy 2 result: Found ${Object.keys(speciesData).length} species with frequency data`);
    
    if (Object.keys(speciesData).length === 0) {
      console.warn('No bar chart data found using either strategy!');
      console.log('Sample HTML preview (first 2000 chars):', html.substring(0, 2000));
    }
    
    return speciesData;
  }

  /**
   * Analyze a region for target species with frequency data
   */
  async function analyzeRegionWithFrequency(regionCode, targetSpecies, targetMonth) {
    try {
      // Use barchart page instead of bird-list to get frequency data
      const response = await fetch(
        `https://ebird.org/barchart?byr=1900&eyr=2026&bmo=1&emo=12&r=${regionCode}`
      );
      
      if (!response.ok) {
        console.warn(`Failed to fetch barchart for ${regionCode}: ${response.status}`);
        return null;
      }
      
      const html = await response.text();
      
      // Check for bot detection
      if (html.includes('Making sure you') || html.includes('not a bot')) {
        console.warn(`${regionCode}: Bot detection triggered - skipping`);
        return null;
      }
      
      const targetCodes = new Set(targetSpecies.map(t => t.code));
      const barChartData = parseBarChartData(html, targetCodes);
      
      console.log(`${regionCode}: Bar chart data returned ${Object.keys(barChartData).length} species`);
      
      const targetsInRegion = [];
      
      targetSpecies.forEach(target => {
        const speciesData = barChartData[target.code];
        
        if (speciesData && speciesData.frequencies.length === 12) {
          let frequency;
          
          // Calculate frequency based on time period
          if (targetMonth === 'year-round') {
            // Year-round: use maximum frequency across all 12 months
            frequency = Math.max(...speciesData.frequencies);
          } else if (typeof targetMonth === 'object' && targetMonth.isRange) {
            // Month range: use maximum frequency in the range
            const start = targetMonth.start - 1;
            const end = targetMonth.end - 1;
            const rangeFreqs = speciesData.frequencies.slice(start, end + 1);
            frequency = Math.max(...rangeFreqs);
          } else {
            // Single month
            frequency = speciesData.frequencies[targetMonth - 1];
          }
          
          if (frequency > 0) {
            targetsInRegion.push({
              code: target.code,
              name: target.name,
              frequency: frequency,
              commonness: frequency > 0.5 ? 'common' : 
                         frequency > 0.2 ? 'uncommon' : 'rare'
            });
          }
        }
      });
      
      const expectedTargets = targetsInRegion.reduce(
        (sum, t) => sum + t.frequency, 
        0
      );
      
      const timeDesc = targetMonth === 'year-round' ? 'year-round' : 
                       typeof targetMonth === 'object' ? `months ${targetMonth.start}-${targetMonth.end}` :
                       `month ${targetMonth}`;
      console.log(`${regionCode}: ${targetsInRegion.length} targets with frequency > 0 in ${timeDesc}`);
      
      return {
        regionCode,
        targetCount: targetsInRegion.length,
        expectedTargets: expectedTargets,
        targets: targetsInRegion.sort((a, b) => b.frequency - a.frequency)
      };
      
    } catch (err) {
      console.error(`Error analyzing ${regionCode}:`, err);
      return null;
    }
  }

  /**
   * Create the county targets map
   */
  async function createCountyTargetsMap() {
    const regionCode = extractRegionCode();
    const targetMonth = extractTargetMonth();
    const targetSpecies = extractTargetSpecies();
    
    if (targetSpecies.length === 0) {
      alert("No target species found on this page.");
      return;
    }
    
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const regionLabel = getRegionLevelLabel(regionCode);
    const regionSingular = getRegionLevelSingular(regionCode);
    
    // Generate appropriate time label
    let timeLabel;
    if (targetMonth === 'year-round') {
      timeLabel = 'Year-round';
    } else if (typeof targetMonth === 'object' && targetMonth.isRange) {
      timeLabel = `${monthNames[targetMonth.start - 1]}-${monthNames[targetMonth.end - 1]}`;
    } else {
      timeLabel = monthNames[targetMonth - 1];
    }
    
    // Create container with consistent styling
    const container = document.createElement("div");
    container.id = "county-targets-map-container";
    container.style.cssText = "width: 100%; margin-top: 20px; padding: 15px; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);";
    
    container.innerHTML = `
      <h3 style="margin-top: 0;">Target Species by ${regionSingular} - ${timeLabel}</h3>
      <p style="color: #666; font-size: 0.9em; margin-bottom: 15px;">
        Analyzing ${targetSpecies.length} target species in ${regionCode} with frequency data...
      </p>
      <div id="county-targets-loader" style="text-align: center; padding: 30px;">
        <div class="ebird-mapping-spinner"></div>
        <div id="county-targets-progress" style="margin-top: 15px; font-weight: bold; color: #555;">
          Initializing...
        </div>
      </div>
      <div id="county-targets-map" style="height: 600px; display: none; border: 1px solid #ccc; border-radius: 8px; margin-top: 15px;"></div>
      <div id="county-targets-summary" style="display: none; margin-top: 15px; padding: 12px; background: #f8f9fa; border-radius: 4px; font-size: 0.9em;"></div>
      <style>
        #county-targets-map .leaflet-control-layers label {
          margin: 2px 0 !important;
          padding: 1px 5px !important;
        }
        #county-targets-map .leaflet-control-layers-separator {
          margin: 2px 0 !important;
        }
        .county-target-popup .species-item {
          margin: 6px 0;
          padding: 6px;
          background: white;
          border-radius: 3px;
        }
        .county-target-popup .species-item.common {
          border-left: 3px solid #28a745;
        }
        .county-target-popup .species-item.uncommon {
          border-left: 3px solid #ffc107;
        }
        .county-target-popup .species-item.rare {
          border-left: 3px solid #dc3545;
        }
      </style>
    `;
    
    const sectionHeading = document.querySelector("div.SectionHeading.u-stack-sm");
    sectionHeading.parentNode.insertBefore(container, sectionHeading.nextSibling);
    
    // Get sub-regions
    const loaderText = document.getElementById("county-targets-progress");
    loaderText.textContent = `Finding sub-regions in ${regionCode}...`;
    
    const subRegions = await getSubRegions(regionCode);
    
    if (subRegions.length === 0) {
      loaderText.textContent = `No sub-regions found for ${regionCode}. This might already be at the county level.`;
      return;
    }
    
    console.log(`Found ${subRegions.length} sub-regions`);
    
    // Start preloading GeoJSON boundaries in parallel while we analyze regions
    // This saves time by downloading the ~3MB county file during the analysis loop
    const boundaryPreloadPromise = (async () => {
      if (subRegions.length > 0 && subRegions[0].code) {
        console.log('🌍 Pre-loading geographic boundaries in background...');
        await getRegionBoundary(subRegions[0].code);
        console.log('✓ Geographic boundaries ready');
      }
    })();
    
    // Analyze each sub-region
    const results = [];
    
    for (let i = 0; i < subRegions.length; i++) {
      const region = subRegions[i];
      loaderText.textContent = `Analyzing ${region.name} (${i + 1}/${subRegions.length})...`;
      
      try {
        const result = await analyzeRegionWithFrequency(
          region.code,
          targetSpecies,
          targetMonth
        );
        
        if (result) {
          results.push({
            ...result,
            region: region
          });
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (err) {
        console.error(`Failed to analyze ${region.name}:`, err);
      }
    }
    
    // Hide loader, show map
    document.getElementById("county-targets-loader").style.display = "none";
    document.getElementById("county-targets-map").style.display = "block";
    
    if (results.length === 0) {
      document.getElementById("county-targets-map").innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #666;">
          No sub-regions found with target species in ${monthNames[targetMonth - 1]}
        </div>
      `;
      return;
    }
    
    // Wait for boundary preload to complete (should be done by now)
    await boundaryPreloadPromise;
    
    // Create map with consistent base layers
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

    const map = L.map("county-targets-map", {
      layers: [googleStreets]
    });

    L.control.layers(baseMaps).addTo(map);
    map.addControl(new L.Control.Fullscreen());
    L.control.scale({ position: 'bottomleft' }).addTo(map);
    
    // Color scale using YlOrRd (consistent with other maps)
    const maxExpected = Math.max(...results.map(r => r.expectedTargets), 1);
    const colorScale = d3.scaleSequential(d3.interpolateYlOrRd)
      .domain([0, maxExpected]);
    
    // Sort so highest values render last (on top for overlapping areas)
    const sorted = results
      .filter(r => r.targetCount > 0)
      .sort((a, b) => a.expectedTargets - b.expectedTargets);
    
    const polygons = [];
    const allBounds = [];
    
    // Create choropleth polygons
    for (const result of sorted) {
      const color = colorScale(result.expectedTargets);
      
      const boundary = await getRegionBoundary(result.region.code);
      if (!boundary) {
        console.warn(`No boundary for ${result.region.code}`);
        continue;
      }
      
      // Create Leaflet GeoJSON layer
      const geoJsonLayer = L.geoJSON(boundary, {
        style: {
          fillColor: color,
          fillOpacity: 0.6,
          color: '#333',
          weight: 1,
          opacity: 0.8
        }
      });
      
      // Build popup with scrollable species list and color-coded frequencies
      const popupContent = `
        <div style="max-width: 320px;" class="county-target-popup">
          <div style="font-weight: bold; font-size: 1.1em; margin-bottom: 6px; padding-bottom: 6px; border-bottom: 2px solid #4285f4;">
            ${result.region.name}
          </div>
          <div style="margin: 8px 0; padding: 8px; background: #f0f0f0; border-radius: 4px;">
            <strong>${result.targetCount}</strong> of ${targetSpecies.length} targets present<br>
            <strong>${result.expectedTargets.toFixed(1)}</strong> expected lifers
            <div style="font-size: 0.85em; color: #666; margin-top: 4px;">
              (probability-weighted)
            </div>
          </div>
          
          <div style="max-height: 250px; overflow-y: auto; margin-top: 10px;">
            <strong style="display: block; margin-bottom: 6px;">Target Species:</strong>
            ${result.targets.map(t => {
              const freqPercent = (t.frequency * 100).toFixed(0);
              
              return `
                <div class="species-item ${t.commonness}">
                  <div style="font-weight: 500; font-size: 0.95em;">${t.name}</div>
                  <div style="font-size: 0.85em; color: #666;">
                    <span style="font-weight: 600; color: ${
                      t.commonness === 'common' ? '#28a745' : 
                      t.commonness === 'uncommon' ? '#ffc107' : '#dc3545'
                    };">${freqPercent}%</span> • ${t.commonness}
                  </div>
                </div>
                `;
              }).join('')}
            </div>
            
            <a href="https://ebird.org/region/${result.region.code}" target="_blank" 
               style="display: inline-block; margin-top: 10px; padding: 6px 12px; background: #4285f4; color: white; text-decoration: none; border-radius: 4px; font-size: 0.9em;">
              View on eBird →
            </a>
          </div>
        `;
        
        geoJsonLayer.bindPopup(popupContent, {
          maxWidth: 350,
          className: 'county-target-popup'
        });
        
        geoJsonLayer.addTo(map);
        polygons.push(geoJsonLayer);
        
        // Collect bounds for fitting map - handle both Polygon and MultiPolygon
        const geom = boundary.geometry;
        if (geom.type === 'Polygon') {
          // Polygon: coordinates[0] is the outer ring
          allBounds.push(...geom.coordinates[0].map(coord => [coord[1], coord[0]]));
        } else if (geom.type === 'MultiPolygon') {
          // MultiPolygon: coordinates is array of polygons, each with [outer ring, holes...]
          geom.coordinates.forEach(polygon => {
            allBounds.push(...polygon[0].map(coord => [coord[1], coord[0]]));
          });
        }
    }
    
    // Fit map to show all polygons with padding
    if (allBounds.length > 0) {
      const bounds = L.latLngBounds(allBounds);
      map.fitBounds(bounds.pad(0.05)); // 5% padding around edges
      console.log(`✓ Map fitted to ${allBounds.length} boundary points`);
    } else {
      console.warn('No bounds collected, map may not be properly zoomed');
    }
    
    // Add legend
    const legend = L.control({ position: "bottomright" });
    legend.onAdd = function () {
      const div = L.DomUtil.create("div", "info legend");
      div.style.cssText = 'background: white; padding: 10px; border-radius: 5px; box-shadow: 0 0 15px rgba(0,0,0,0.2);';
      div.innerHTML = `
        <strong>Expected Lifers</strong>
        <div style="font-size: 0.85em; color: #666; margin-bottom: 8px;">
          (probability-weighted)
        </div>
        <canvas id="county-legend-canvas" width="100" height="10"></canvas><br>
        <div style="display: flex; justify-content: space-between; font-size: 0.9em;">
          <span>0</span><span>${maxExpected.toFixed(1)}</span>
        </div>
        <div style="margin-top: 10px; font-size: 0.85em; border-top: 1px solid #ddd; padding-top: 8px;">
          <strong>Frequency:</strong><br>
          <div style="display: flex; align-items: center; gap: 4px; margin-top: 4px;">
            <span style="display: inline-block; width: 12px; height: 3px; background: #28a745;"></span>
            <span>>50% = Common</span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px; margin-top: 2px;">
            <span style="display: inline-block; width: 12px; height: 3px; background: #ffc107;"></span>
            <span>20-50% = Uncommon</span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px; margin-top: 2px;">
            <span style="display: inline-block; width: 12px; height: 3px; background: #dc3545;"></span>
            <span><20% = Rare</span>
          </div>
        </div>
      `;
      return div;
    };
    legend.addTo(map);
    
    // Draw gradient
    setTimeout(() => {
      const canvas = document.getElementById("county-legend-canvas");
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
      for (let i = 0; i <= 1; i += 0.01) {
        gradient.addColorStop(i, colorScale(i * maxExpected));
      }
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }, 100);
    
    // Show summary
    const summary = document.getElementById("county-targets-summary");
    summary.style.display = "block";
    
    if (sorted.length === 0) {
      summary.innerHTML = `
        <strong>Note:</strong> 
        Found ${results.length} sub-regions, but none had target species with frequency data available for ${monthNames[targetMonth - 1]}. 
        This could mean the bar chart data is not available for these regions.
      `;
      return;
    }
    
    const topRegion = sorted[sorted.length - 1]; // Highest is last after sorting
    const avgExpected = results.reduce((sum, r) => sum + r.expectedTargets, 0) / results.length;
    
    summary.innerHTML = `
      <strong>Summary:</strong> 
      Best location is <strong>${topRegion.region.name}</strong> 
      with ${topRegion.targetCount} targets and ${topRegion.expectedTargets.toFixed(1)} expected lifers. 
      Average across all locations: ${avgExpected.toFixed(1)} expected lifers.
    `;
  }

  // Add "Map Species per County/State" button
  if (sectionHeading && !document.getElementById("map-species-per-county-btn")) {
    const regionCode = extractRegionCode();
    const regionLabel = getRegionLevelLabel(regionCode);
    
    const mapCountiesButton = document.createElement('button');
    mapCountiesButton.textContent = `Map Species per ${regionLabel.replace('/Provinces', '')}`;
    mapCountiesButton.id = "map-species-per-county-btn";
    mapCountiesButton.classList.add("Button", "Button--large", "Button--highlight");
    mapCountiesButton.style.margin = "10px 5px";
    mapCountiesButton.style.display = "inline-flex";
    
    // Insert after "Map All Recent Targets" button
    const mapAllButton = document.getElementById("ebird-mapping-show-all-targets");
    if (mapAllButton) {
      mapAllButton.parentNode.insertBefore(mapCountiesButton, mapAllButton.nextSibling);
    } else {
      sectionHeading.insertAdjacentElement("afterend", mapCountiesButton);
    }
    
    mapCountiesButton.addEventListener("click", async () => {
      if (document.getElementById("county-targets-map-container")) {
        console.log("County map already shown.");
        return;
      }
      
      await createCountyTargetsMap();
    });
  }

  })();
