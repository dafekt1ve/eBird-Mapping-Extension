(async function () {
    if (!window.L || !window.d3 || !window.L.velocityLayer) {
        console.warn("Leaflet or D3 not loaded.");
        console.log("Leaflet: ", window.L);
        console.log("D3: ", window.d3);
        console.log("Leaflet-velocity: ", window.L.velocityLayer);
        return;
    }

    if (document.getElementById("gfs-wind-map")) {
        console.log("Map already exists. Skipping injection.");
        return;
    }

    // === Cache for wind data per pressure level ===
    const windDataByLevel = {}; // e.g., { "850": [u, v], ... }
    const divDataByLevel = {}; // e.g., { "850": [u, v], ... }
    let currentVelocityLayer = null;

    // === Map container ===
    const mapDiv = document.createElement("div");
    mapDiv.id = "gfs-wind-map";
    mapDiv.style =
        "height: 400px; margin: 1em 0; border: 2px solid #ccc; border-radius: 8px; position: relative;";

    // === Insert map ===
    const targetElement = document.querySelector("div.Page-section.Page-section--white.Page-section--grid-content.u-inset-responsive div.Page-section-inner");
    if (!targetElement) return;
    targetElement.parentNode.insertBefore(mapDiv, targetElement);

    // === Spinner ===
    const spinner = document.createElement("div");
    spinner.id = "loading-spinner";
    spinner.style.cssText = `
        position: absolute; top: 48%; left: 48%;
        transform: translate(-50%, -50%);
        width: 50px; height: 50px;
        border: 6px solid #f3f3f3;
        border-top: 6px solid #3498db;
        border-radius: 50%;
        animation: spin 2s linear infinite;
        z-index: 99999;
    `;
    mapDiv.appendChild(spinner);

    // === Overlay ===
    const overlay = document.createElement("div");
    overlay.id = "loading-overlay";
    overlay.style.cssText = `
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        display: none;
        z-index: 99998;
    `;
    mapDiv.appendChild(overlay);

    // === Spinner animation ===
    const style = document.createElement("style");
    style.innerHTML = `
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }`;
    document.head.appendChild(style);

    // === Coordinate & date extraction ===
    function getLatLonFromLink() {
        const link = document.querySelector("a[title='View with Google Maps']");
        if (!link) return null;
        const match = new URL(link.href).search.match(/query=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
        return match ? { lat: parseFloat(match[1]), lon: parseFloat(match[2]) } : null;
    }

    function getChecklistDate() {
        const timeEl = document.querySelector("time[datetime]");
        return timeEl?.getAttribute("datetime") ?? null;
    }

    // === Request wind data from background ===
    function requestGFSDataViaBackground(lat, lon, date, variable, level) {
        return new Promise((resolve, reject) => {
            if (variable == "wind") {
                message = "fetchGFSWindData";
            } else if (variable == "precip") {
                message = "fetchGFSPrecipData";
            } else if (variable == "cloud") {
                message = "fetchGFSCloudData";
            } else if (variable == "refc") {
                message = "fetchGFSRefcData";
            } else if (variable == "sfc_temp") {
                message = "fetchGFSSfcTempData";
            } else if (variable == "vvel") {
                message = "fetchGFSVvelData";
            } else if (variable == "cape") {
                message = "fetchGFSCapeData";
            } else if (variable == "cin") {
                message = "fetchGFSCinData";
            } else if (variable == "divergence") {
                message = "fetchGFSDivData";
            } else  {
                return "Error: Incorrect message to GFS background script";
            }

            chrome.runtime.sendMessage(
                {
                    type: message,
                    lat, lon, date, level
                },
                (response) => {
                    if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                    response?.success ? resolve(response.data) : reject(response?.error || "Unknown error");
                }
            );
        });
    }

    // === Update wind layer ===
    function updateWindLayer(level, map, d3ColorScale) {
        const data = windDataByLevel[level];
        if (!data || !Array.isArray(data)) {
            console.error("Invalid or missing data for level", level);
            return;
        }

        const windsVisible = map.hasLayer(windsWrapperLayer);

        // Update the inner layer
        windsWrapperLayer.clearLayers();

        // Remove previous velocity layer if it exists
        if (currentVelocityLayer) {
            windsWrapperLayer.removeLayer(currentVelocityLayer);
        }

        const options = getVelocityOptionsForLevel(level);

        map.createPane('velocityPane');
        map.getPane('velocityPane').style.zIndex = 600;     // Adjust as needed

        currentVelocityLayer = L.velocityLayer({
            pane: 'velocityPane',
            displayValues: true,
            displayOptions: {
                speedUnit: "kn",
                customSpeedUnit: "knots",
                customSpeedFunction: function (speedInMps) {
                  return (speedInMps * 1.94384).toFixed(1);  // m/s to knots
                },
                velocityType: `Wind`,
                displayPosition: "bottomleft",
                displayEmptyString: "No wind data",
                angleConvention: "meteoCW",
            },
            data,
            velocityScale: 0.005,
            particleMultiplier: 0.05,
            lineWidth: 2,
            colorScale: options.colorScale,
            maxVelocity: options.maxVelocity,
        });
        
        if (map.isFullscreen()) {
            currentVelocityLayer.setOptions({
                particleMultiplier: 0.01 // Lower value for fewer particles
            });
            console.log("Fullscreen: ", currentVelocityLayer.options);
        } else {
            currentVelocityLayer.setOptions({
                particleMultiplier: 0.05 // Lower value for fewer particles
            });      
            console.log("Not Fullscreen: ", currentVelocityLayer.options);
        }

        createLegendForLevel(level, options.colorScale, options.maxVelocity);

        // currentVelocityLayer.addTo(map);
        windsWrapperLayer.addLayer(currentVelocityLayer);

        if (!windsVisible) {
            map.removeLayer(windsWrapperLayer);
        }

    }

    function getVelocityOptionsForLevel(level) {
        switch (level) {
          case "925":
            d3ColorScale = d3.range(0, 1.01, 0.1).map(t => d3.interpolatePuRd(t));
            return {
              colorScale: d3ColorScale,
              maxVelocity: 20
            };
          case "900":
            d3ColorScale = d3.range(0, 1.01, 0.1).map(t => d3.interpolatePuRd(t));
            return {
                colorScale: d3ColorScale,
                maxVelocity: 20
            };
          case "850":
            d3ColorScale = d3.range(0, 1.01, 0.1).map(t => d3.interpolateBuPu(t));
            return {
                colorScale: d3ColorScale,
                maxVelocity: 30
            };
          case "800":
            d3ColorScale = d3.range(0, 1.01, 0.1).map(t => d3.interpolateBuPu(t));
            return {
                colorScale: d3ColorScale,
                maxVelocity: 30
            };
          case "750":
            d3ColorScale = d3.range(0, 1.01, 0.1).map(t => d3.interpolateOrRd(t));
            return {
                colorScale: d3ColorScale,
                maxVelocity: 40
            };
          case "700":
            d3ColorScale = d3.range(0, 1.01, 0.1).map(t => d3.interpolateOrRd(t));
            return {
              colorScale: d3ColorScale,
              maxVelocity: 40
            };
          default:
            return {
              colorScale: ['#91bfdb', '#ffffbf', '#fc8d59'], // Generic fallback
              maxVelocity: 30
            };
        }
    }
      
    function createLegendForLevel(level, colorScale, maxVelocity) {
        // Remove old legend if it exists
        d3.select("#velocity-legend").remove();
      
        const legendWidth = 214;
        const legendHeight = 12;
        const margins = 10;
      
        const svgWrapper = d3.select("#gfs-wind-map").append("div")
          .attr("id", "velocity-legend")
          .style("position", "absolute")
          .style("bottom", "17px")
          .style("left", "-1px")
          .style("background", "#FFFFFF99")
          .style("padding", "6px")
          .style("border", "1px solid #ccc")
          .style("border-top-right-radius", "4px")
          .style("font", "12px sans-serif")
          .style("z-index", "700");

        // Label
        svgWrapper.append("p")
          .style("font", "10px sans-serif")
          .style("padding", "0px")
          .style("margin", "0px")
          .text(`Wind speed @ ${level} mb`);

        const legendSvg = svgWrapper
          .append("svg")
          .attr("width", legendWidth+2*margins)
          .attr("height", 30);
      
        const scale = d3.scaleLinear()
          .domain([0, maxVelocity])
          .range([0, legendWidth]);
      
        // Create gradient
        const defs = legendSvg.append("defs");
        const gradient = defs.append("linearGradient")
          .attr("id", "legend-gradient");
      
        colorScale.forEach((color, i) => {
          gradient.append("stop")
            .attr("offset", `${(i / (colorScale.length - 1)) * 100}%`)
            .attr("stop-color", color);
        });
      
        legendSvg.append("rect")
          .attr("x", margins)
          .attr("y", 0)
          .attr("width", legendWidth)
          .attr("height", legendHeight)
          .style("fill", "url(#legend-gradient)");
    
        // Axis
        const axis = d3.axisBottom(scale)
          .ticks(5)
          .tickFormat(d => `${d}kt`);
      
        legendSvg.append("g")
          .attr("transform", `translate(${margins}, ${legendHeight})`)
          .call(axis);

    }
      

    // === Main logic ===
    try {
        const optionsMap = {}; // We'll store references to the option elements here
        let currentWindLayer = null;
        const windOverlayName = "Winds";

        const coords = getLatLonFromLink();
        let date = getChecklistDate();
        date = new Date(date);
        console.log("Date: ", date.toISOString());
        if (!coords || !date) throw new Error("Missing coordinates or date");

        const map = L.map("gfs-wind-map", {maxBounds: [[-90, -Infinity], [90, Infinity]]}).setView([coords.lat, coords.lon], 5);
        let width = document.querySelector("#gfs-wind-map").clientWidth;
        let height = document.querySelector("#gfs-wind-map").clientHeight;
        let minZoom = Math.ceil(Math.log2(Math.max(width, height) / 256));
        map.options.minZoom = minZoom;

        let windsWrapperLayer = L.layerGroup(); // constant reference
        let currentVelocityLayer = null;

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

        // Register as an overlay
        let overlayMaps = {};

        const layerControl = L.control.layers(baseMaps, overlayMaps, {collapsed: false}).addTo(map);

        const bounds = [
            [coords.lat - 2.5, coords.lon - 3.5],
            [coords.lat + 2.5, coords.lon + 3.5],
        ];
        map.fitBounds(bounds);

        L.circleMarker([coords.lat, coords.lon], {
            radius: 6,
            color: "#007BFF",
            fillColor: "#339AF0",
            fillOpacity: 0.9,
            weight: 2,
        }).addTo(map).bindPopup("Checklist Location");     

        // or, add to an existing map:
        map.addControl(new L.Control.Fullscreen());
        const pressureControl = new (createPressureControl(map, optionsMap))();
        map.addControl(pressureControl);

        map.on('fullscreenchange', function () {
            if (map.isFullscreen()) {
                currentVelocityLayer.setOptions({
                    particleMultiplier: 0.01 // Lower value for fewer particles
                });
                console.log("Fullscreen: ", currentVelocityLayer.options);
            } else {
                currentVelocityLayer.setOptions({
                    particleMultiplier: 0.05 // Lower value for fewer particles
                });      
                console.log("Not Fullscreen: ", currentVelocityLayer.options);
            }
        });

        let d3ColorScale = d3.range(0, 1.01, 0.1).map(t => d3.interpolateBlues(t));

        const levels = ["850", "925", "900", "800", "750", "700"]
        const totalCount = levels.length;
        let currentCount = 0;

        // Load all levels
        for (const level of levels) {
            try {
                currentCount++;
                if (level == 850) {
                    overlay.style.display = "block";
                }
                overlay.innerHTML = `<p style="color: #fff; font-size: 18px; text-align: center; margin-top: 160px;">Fetching 850mb wind data...</p>`;
                const data = await requestGFSDataViaBackground(coords.lat, coords.lon, date, "wind", level);
                const select = document.querySelector("#wind-level-select");

                if (Array.isArray(data)) windDataByLevel[level] = data;

                if (level == 850) {
                    spinner.style.display = "none";
                    overlay.style.display = "none";
                    layerControl.addOverlay(windsWrapperLayer, 'Winds'); // once only                      
                    updateWindLayer("850", map, d3ColorScale);
                    console.log(windDataByLevel)
                    console.log(currentVelocityLayer)
                    // layerControl.addOverlay(currentVelocityLayer, 'Winds');                  
                    
                    // Temporarily remove the layer during interaction
                    map.on('movestart zoomstart', function () {
                        if (map.hasLayer(windsWrapperLayer)) {
                            map.removeLayer(windsWrapperLayer);
                        }
                    });

                    // Re-add the layer when done
                    map.on('moveend zoomend', function () {
                        if (!map.hasLayer(windsWrapperLayer)) {
                            map.addLayer(windsWrapperLayer);
                        }
                    });
                }
                enableLevel(level, optionsMap); // Enable the dropdown option
            } catch (err) {
                console.warn(`❌ Failed to fetch ${level}mb data:`, err);
            }
        }

        for (const level of levels) {
            try {
                const div_data = await requestGFSDataViaBackground(coords.lat, coords.lon, date, "divergence", level);
                divPoints = div_data[0].data.filter(p => p.value > -99)
                    .map(p => [
                        p.lat,
                        p.lng,
                        p.value
                    ]);

                if (Array.isArray(div_data)) divDataByLevel[level] = div_data;

                const divScale = d3.scaleSequential(d3.interpolateRdBu).domain([-.0005, .0005]);

                map.createPane('gridPane');
                map.getPane('gridPane').style.zIndex = 650;

                const divLayer = createGriddedLayer(divPoints, {
                    colorScale: divScale,
                    opacity: 0.7,
                    pane: 'gridPane'
                });

                if (level == 850) {
                    layerControl.addOverlay(divLayer, 'Divergence');
                }

            } catch (err) {
                console.warn(`❌ Failed to fetch ${level}mb divergence data:`, err);
            }
        }


        function createGriddedLayer(data, options = {}) {
            const {
                colorScale = d3.scaleSequential(d3.interpolateViridis).domain([0, 100]),
                opacity = 0.5,
            } = options;

            const tileSize = 256;

            // Build a cache of data by zoom level and tile coordinates
            const tileCache = {};

            const layer = L.gridLayer({
                tileSize,
                opacity,
            });

            // Pre-bin data points into tile coordinates for each zoom level
            function binDataToTiles(zoom) {
                if (tileCache[zoom]) return;

                tileCache[zoom] = {};

                data.forEach(([lat, lon, value, dx = 0.25, dy = 0.25]) => {
                    const sw = L.latLng(lat - dy / 2, lon - dx / 2);
                    const ne = L.latLng(lat + dy / 2, lon + dx / 2);
                    const swPoint = layer._map.project(sw, zoom);
                    const nePoint = layer._map.project(ne, zoom);

                    const minX = Math.floor(swPoint.x / tileSize);
                    const maxX = Math.floor(nePoint.x / tileSize);
                    const minY = Math.floor(nePoint.y / tileSize);
                    const maxY = Math.floor(swPoint.y / tileSize);

                    for (let x = minX; x <= maxX; x++) {
                        for (let y = minY; y <= maxY; y++) {
                            const key = `${x}:${y}`;
                            if (!tileCache[zoom][key]) tileCache[zoom][key] = [];
                            tileCache[zoom][key].push({ lat, lon, value, dx, dy });
                        }
                    }
                });
            }

            layer.createTile = function (coords) {
                const tile = L.DomUtil.create('canvas', 'leaflet-tile');
                tile.width = tile.height = tileSize;
                const ctx = tile.getContext('2d');
                ctx.globalAlpha = opacity;

                const zoom = coords.z;
                const tileKey = `${coords.x}:${coords.y}`;

                binDataToTiles(zoom); // Make sure binned data exists

                const map = layer._map;
                const dataPoints = tileCache[zoom][tileKey] || [];

                dataPoints.forEach(({ lat, lon, value, dx, dy }) => {
                    const sw = map.project([lat - dy / 2, lon - dx / 2], zoom);
                    const ne = map.project([lat + dy / 2, lon + dx / 2], zoom);

                    const x = Math.round(sw.x - coords.x * tileSize);
                    const y = Math.round(ne.y - coords.y * tileSize);
                    const width = Math.round(ne.x - sw.x);
                    const height = Math.round(sw.y - ne.y);

                    if (width <= 0 || height <= 0) return;

                    ctx.fillStyle = colorScale(value);
                    ctx.fillRect(x, y, width + 1, height + 1); // buffer to avoid gaps
                });

                return tile;
            };

            return layer;
        }

        try {
            const cloud_data = await requestGFSDataViaBackground(coords.lat, coords.lon, date, "cloud", null);
            cloudPoints = cloud_data[0].data.filter(p => p.value > 0)
                .map(p => [
                    p.lat,
                    p.lng,
                    p.value
                ]
            );
            const cloudThresholdScale = d3.scaleThreshold()
            .domain([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
            .range([
                '#aee3f5',  // very clear sky (light sky blue)
                '#90cde8',
                '#72b8dc',
                '#549fbc',
                '#768fa3',
                '#8b8b8b',
                '#7a7a7a',
                '#666666',
                '#4d4d4d',
                '#2f2f2f'   // heavy overcast (dark gray)
            ]);

            map.createPane('gridPane');
            map.getPane('gridPane').style.zIndex = 650;

            const cloudLayer = createGriddedLayer(cloudPoints, {
                colorScale: cloudThresholdScale,
                opacity: 0.7,
                pane: 'gridPane'
            });

            layerControl.addOverlay(cloudLayer, 'Cloud Cover');

        } catch (err) {
            console.warn(`❌ Failed to fetch cloud data:`, err);
        }


        try {
            const precip_data = await requestGFSDataViaBackground(coords.lat, coords.lon, date, "precip", null);                
            precipPoints = precip_data[0].data.filter(p => p.value > 0)
                .map(p => [
                    p.lat,
                    p.lng,
                    p.value
                ]
            );
            const precipThresholdScale = d3.scaleThreshold()
            .domain([0.1, 1, 2.5, 5, 10, 20, 35, 50, 75, 100])
            .range([
                '#f7fbff', '#deebf7', '#c6dbef', '#9ecae1',
                '#6baed6', '#4292c6', '#2171b5', '#08519c',
                '#08306b', '#041f3d'
            ]);

            const nwsRadarScale = d3.scaleThreshold()
            .domain([0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 40, 80])  // Precipitation (mm/hr) thresholds
            .range([
                "#FFFFFF",  // < 0.1 - transparent/white (no precip)
                "#A6CEE3",  // light blue
                "#1F78B4",  // medium blue
                "#33A02C",  // light green
                "#B2DF8A",  // medium green
                "#FFFF33",  // yellow
                "#FDBF6F",  // orange
                "#FF7F00",  // dark orange
                "#E31A1C",  // red
                "#B15928"   // brownish purple (heavy precip)
            ]);

            map.createPane('gridPane');
            map.getPane('gridPane').style.zIndex = 650;

            const precipLayer = createGriddedLayer(precipPoints, {
                // colorScale: precipThresholdScale,
                colorScale: nwsRadarScale,
                opacity: 0.7,
                pane: 'gridPane'
            });
            // }).addTo(map);

            layerControl.addOverlay(precipLayer, 'Precipitation');

        } catch (err) {
            console.warn(`❌ Failed to fetch precip data:`, err);
        }

        try {
            const refc_data = await requestGFSDataViaBackground(coords.lat, coords.lon, date, "refc", null);                
            refcPoints = refc_data[0].data.filter(p => p.value > 0)
                .map(p => [
                    p.lat,
                    p.lng,
                    p.value
                ]
            );

            const nwsRadarScale = d3.scaleThreshold()
                .domain([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70])  // Reflectivity in dBZ
                .range([
                    "#FFFFFF",  // <5 dBZ: white (no return)
                    "#C8C8C8",  // 5–10 dBZ: light gray
                    "#00FFFF",  // 10–15: cyan
                    "#00CFFF",  // 15–20: light blue
                    "#0099FF",  // 20–25: medium blue
                    "#0066FF",  // 25–30: dark blue
                    "#33CC33",  // 30–35: green
                    "#009900",  // 35–40: darker green
                    "#FFFF00",  // 40–45: yellow
                    "#FFCC00",  // 45–50: dark yellow
                    "#FF9900",  // 50–55: orange
                    "#FF0000",  // 55–60: red
                    "#CC0000",  // 60–65: dark red
                    "#990099",  // 65–70: purple
                    "#660066"   // >70 dBZ: very heavy (hail core)
                ]);


            map.createPane('gridPane');
            map.getPane('gridPane').style.zIndex = 650;

            const refcLayer = createGriddedLayer(refcPoints, {
                // colorScale: precipThresholdScale,
                colorScale: nwsRadarScale,
                opacity: 0.7,
                pane: 'gridPane'
            });
            // }).addTo(map);

            layerControl.addOverlay(refcLayer, 'Reflectivity');

        } catch (err) {
            console.warn(`❌ Failed to fetch reflectivity data:`, err);
        }

        try {
            const sfc_temp_data = await requestGFSDataViaBackground(coords.lat, coords.lon, date, "sfc_temp", null);
            tempPoints = sfc_temp_data[0].data.filter(p => p.value > 0)
                .map(p => [
                    p.lat,
                    p.lng,
                    p.value
                ]
            );

            const sfcTempScale = d3.scaleSequential()
            .domain([233, 323])
            .interpolator(d3.interpolateTurbo);

            map.createPane('gridPane');
            map.getPane('gridPane').style.zIndex = 650;

            const sfcTempLayer = createGriddedLayer(tempPoints, {
                colorScale: sfcTempScale,
                opacity: 0.7,
                pane: 'gridPane'
            });
            // }).addTo(map);

            layerControl.addOverlay(sfcTempLayer, 'Sfc Temp');

        } catch (err) {
            console.warn(`❌ Failed to fetch sfc temp data:`, err);
        }

        try {
            const vvel_data = await requestGFSDataViaBackground(coords.lat, coords.lon, date, "vvel", 850);
            vvelPoints = vvel_data[0].data.filter(p => p.value < 200)
                .map(p => [
                    p.lat,
                    p.lng,
                    p.value
                ]
            );

            const vvelScale = d3.scaleSequential()
            .domain([-5, 5])
            .interpolator(d3.interpolatePuOr);

            map.createPane('gridPane');
            map.getPane('gridPane').style.zIndex = 650;

            const vvelLayer = createGriddedLayer(vvelPoints, {
                colorScale: vvelScale,
                opacity: 0.7,
                pane: 'gridPane'
            });
            // }).addTo(map);

            layerControl.addOverlay(vvelLayer, 'Vert Vel');

        } catch (err) {
            console.warn(`❌ Failed to fetch sfc temp data:`, err);
        }

        try {
            const cape_data = await requestGFSDataViaBackground(coords.lat, coords.lon, date, "cape", "surface");
            capePoints = cape_data[0].data.filter(p => p.value > 0)
                .map(p => [
                    p.lat,
                    p.lng,
                    p.value
                ]
            );

            const capeScale = d3.scaleSequential()
            .domain([500, 4000])
            .interpolator(d3.interpolateTurbo);

            map.createPane('gridPane');
            map.getPane('gridPane').style.zIndex = 650;

            const capeLayer = createGriddedLayer(capePoints, {
                colorScale: capeScale,
                opacity: 0.7,
                pane: 'gridPane'
            });
            // }).addTo(map);

            layerControl.addOverlay(capeLayer, 'CAPE');

        } catch (err) {
            console.warn(`❌ Failed to fetch CAPE data:`, err);
        }

        try {
            const cin_data = await requestGFSDataViaBackground(coords.lat, coords.lon, date, "cin", "surface");
            cinPoints = cin_data[0].data.filter(p => p.value < 0)
                .map(p => [
                    p.lat,
                    p.lng,
                    p.value
                ]
            );

            const cinScale = d3.scaleThreshold()
            .domain([-100, -50, -25, -10, -5, -1])
            .range([
                d3.interpolateYlOrRd(1.0),
                d3.interpolateYlOrRd(0.75),
                d3.interpolateYlOrRd(0.45),
                d3.interpolateYlOrRd(0.35),
                d3.interpolateYlOrRd(0.25),
                d3.interpolateYlOrRd(0.15),
                d3.interpolateYlOrRd(0.05)
            ]);

            map.createPane('gridPane');
            map.getPane('gridPane').style.zIndex = 650;

            const cinLayer = createGriddedLayer(cinPoints, {
                colorScale: cinScale,
                opacity: 0.7,
                pane: 'gridPane'
            });
            // }).addTo(map);

            layerControl.addOverlay(cinLayer, 'CIN');

        } catch (err) {
            console.warn(`❌ Failed to fetch CIN data:`, err);
        }

    } catch (error) {
        console.warn("Could not initialize wind map:", error);
        spinner.style.display = "none";
        overlay.style.display = "block";
        const msg = document.createElement("div");
        msg.style.cssText = "color: #fff; font-size: 18px; text-align: center; margin-top: 180px;";
        msg.innerText = "Failed to load wind data. Please try again later.";
        overlay.appendChild(msg);
    }

    function enableLevel(level, optionsMap) {
        if (optionsMap[level]) {
            optionsMap[level].disabled = false;
        }
    }

    function createPressureControl(map, optionsMap) {
        return L.Control.extend({
            options: { position: "topright" },
            onAdd: function () {
                const container = L.DomUtil.create("div", "leaflet-bar leaflet-control");
    
                const select = L.DomUtil.create("select", "", container);
                select.id = "wind-level-select";
                select.style.padding = "4px";
                select.style.border = "1px solid #ccc";
                select.style.borderRadius = "4px";
                select.style.background = "#fff";
                select.style.fontSize = "14px";

                const pressureList = ["925", "900", "850", "800", "750", "700"];  
                pressureList.forEach(level => {
                    const option = document.createElement("option");
                    option.value = level;
                    option.disabled = true;
                    option.textContent = `${level} mb`;
                    select.appendChild(option);
                    optionsMap[level] = option;
                });
    
                select.value = "850"; // default
    
                L.DomEvent.disableClickPropagation(container);
    
                // ✅ Now map is in scope
                L.DomEvent.on(select, "change", (e) => {
                    updateWindLayer(e.target.value, map);
                });
                console.log(windDataByLevel)
                console.log(currentVelocityLayer)
    
                return container;
            }
        });
    }

})();
