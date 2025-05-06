(async function () {
    if (!window.L || !window.d3) {
        console.warn("Leaflet or D3 not loaded.");
        return;
    }

    if (document.getElementById("gfs-wind-map")) {
        console.log("Map already exists. Skipping injection.");
        return;
    }

    // === Cache for wind data per pressure level ===
    const windDataByLevel = {}; // e.g., { "850": [u, v], ... }
    let currentVelocityLayer = null;

    // // === Create the dropdown ===
    // const levelSelect = document.createElement("select");
    // levelSelect.id = "wind-level-select";
    // levelSelect.style.margin = "0 0 0.5em 0";
    // levelSelect.style.padding = "0.4em";
    // levelSelect.style.borderRadius = "6px";

    // ["925", "900", "850", "800", "750", "700"].forEach(level => {
    //     const option = document.createElement("option");
    //     option.value = level;
    //     option.textContent = `${level} mb`;
    //     levelSelect.appendChild(option);
    // });
    // levelSelect.value = "850"; // default level

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
        position: absolute; top: 50%; left: 50%;
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
    function requestGFSDataViaBackground(lat, lon, date, level) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                {
                    type: "fetchGFSData",
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

        if (currentVelocityLayer) map.removeLayer(currentVelocityLayer);

        const options = getVelocityOptionsForLevel(level);

        currentVelocityLayer = L.velocityLayer({
            displayValues: true,
            displayOptions: {
                speedUnit: "kn",
                customSpeedUnit: "knots",
                customSpeedFunction: function (speedInMps) {
                  return (speedInMps * 1.94384).toFixed(1);  // m/s to knots
                },
                velocityType: `${level}mb Wind`,
                displayPosition: "bottomleft",
                displayEmptyString: "No wind data",
                angleConvention: "meteoCCW",
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

        currentVelocityLayer.addTo(map);
    }

    function getVelocityOptionsForLevel(level) {
        switch (level) {
          case "925":
            d3ColorScale = d3.range(0, 1.01, 0.1).map(t => d3.interpolateYlGnBu(t));
            return {
              colorScale: d3ColorScale,
              maxVelocity: 20
            };
          case "900":
            d3ColorScale = d3.range(0, 1.01, 0.1).map(t => d3.interpolateYlGnBu(t));
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
      
        const legendWidth = 300;
        const legendHeight = 12;
      
        const legendSvg = d3.select("#gfs-wind-map").append("div")
          .attr("id", "velocity-legend")
          .style("position", "absolute")
          .style("bottom", "30px")
          .style("left", "10px")
          .style("background", "white")
          .style("padding", "6px")
          .style("border", "1px solid #ccc")
          .style("border-radius", "4px")
          .style("font", "12px sans-serif")
          .style("z-index", "10000")
          .append("svg")
          .attr("width", legendWidth)
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
          .attr("x", 0)
          .attr("y", 0)
          .attr("width", legendWidth)
          .attr("height", legendHeight)
          .style("fill", "url(#legend-gradient)");
      
        // Axis
        const axis = d3.axisBottom(scale)
          .ticks(5)
          .tickFormat(d => `${d} kt`);
      
        legendSvg.append("g")
          .attr("transform", `translate(0, ${legendHeight})`)
          .call(axis);
      
        // Label
        legendSvg.append("text")
          .attr("x", 0)
          .attr("y", -4)
          .text(`Wind speed @ ${level} mb`);
      }
      

    // === Main logic ===
    try {
        const coords = getLatLonFromLink();
        const date = getChecklistDate();
        if (!coords || !date) throw new Error("Missing coordinates or date");

        const checklistDate = new Date(date);
        const earliestGFSDate = new Date("2021-01-01T00:00:00Z");
        if (checklistDate < earliestGFSDate) {
            spinner.style.display = "none";
            overlay.style.display = "block";
            const msg = document.createElement("div");
            msg.style.cssText = "color: #fff; font-size: 18px; text-align: center; margin-top: 180px;";
            msg.innerText = "No wind data available before January 1, 2021.";
            overlay.appendChild(msg);
            return;
        }

        const map = L.map("gfs-wind-map").setView([coords.lat, coords.lon], 5);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 10,
            attribution: "&copy; OpenStreetMap contributors",
        }).addTo(map);

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

        function createPressureControl(map) {
            return L.Control.extend({
                options: { position: "topleft" },
                onAdd: function () {
                    const container = L.DomUtil.create("div", "leaflet-bar leaflet-control");
        
                    const select = L.DomUtil.create("select", "", container);
                    select.id = "wind-level-select";
                    select.style.padding = "4px";
                    select.style.border = "1px solid #ccc";
                    select.style.borderRadius = "4px";
                    select.style.background = "#fff";
                    select.style.fontSize = "14px";
        
                    ["925", "900", "850", "800", "750", "700"].forEach(level => {
                        const option = document.createElement("option");
                        option.value = level;
                        option.textContent = `${level} mb`;
                        select.appendChild(option);
                    });
        
                    select.value = "850"; // default
        
                    L.DomEvent.disableClickPropagation(container);
        
                    // ✅ Now map is in scope
                    L.DomEvent.on(select, "change", (e) => {
                        updateWindLayer(e.target.value, map);
                    });
        
                    return container;
                }
            });
        }
        

        // or, add to an existing map:
        map.addControl(new L.Control.Fullscreen());
        const pressureControl = new (createPressureControl(map))();
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

        // Load all four levels
        for (const level of ["925", "900", "850", "800", "750", "700"]) {
            try {
                const data = await requestGFSDataViaBackground(coords.lat, coords.lon, date, level);
                if (Array.isArray(data)) windDataByLevel[level] = data;
            } catch (err) {
                console.warn(`❌ Failed to fetch ${level}mb data:`, err);
            }
        }

        spinner.style.display = "none";
        overlay.style.display = "none";

        updateWindLayer("850", map, d3ColorScale);

        // Listen for dropdown changes
        // levelSelect.addEventListener("change", (e) => {
        //     updateWindLayer(e.target.value, map, d3ColorScale);
        // });
          

    } catch (error) {
        console.warn("Could not initialize wind map:", error);
        spinner.style.display = "none";
        overlay.style.display = "block";
        const msg = document.createElement("div");
        msg.style.cssText = "color: #fff; font-size: 18px; text-align: center; margin-top: 180px;";
        msg.innerText = "Failed to load wind data. Please try again later.";
        overlay.appendChild(msg);
    }
})();
