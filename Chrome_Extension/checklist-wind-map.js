(async function () {
    if (!window.L || !window.d3) {
        console.warn("Leaflet or D3 not loaded.");
        return;
    }

    if (document.getElementById("gfs-wind-map")) {
        console.log("Map already exists. Skipping injection.");
        return;
    }

    // Create the map container
    const mapDiv = document.createElement("div");
    mapDiv.id = "gfs-wind-map";
    mapDiv.style =
        "height: 400px; margin: 1em 0; border: 2px solid #ccc; border-radius: 8px; position: relative;"; // position relative for spinner

    const targetElement = document.querySelector("div.Page-section.Page-section--white.Page-section--grid-content.u-inset-responsive div.Page-section-inner");
    targetElement.parentNode.insertBefore(mapDiv, targetElement);

    // Create the spinner element and insert it into the map container
    const spinner = document.createElement("div");
    spinner.id = "loading-spinner";
    spinner.style.position = "absolute";
    spinner.style.top = "50%";
    spinner.style.left = "50%";
    spinner.style.transform = "translate(-50%, -50%)";
    spinner.style.width = "50px";
    spinner.style.height = "50px";
    spinner.style.border = "6px solid #f3f3f3";
    spinner.style.borderTop = "6px solid #3498db";
    spinner.style.borderRadius = "50%";
    spinner.style.animation = "spin 2s linear infinite";
    spinner.style.zIndex = "99999"; // Ensure it appears on top of the map

    mapDiv.appendChild(spinner); // Add the spinner inside the map container

    // Create the overlay element (semi-transparent layer)
    const overlay = document.createElement("div");
    overlay.id = "loading-overlay";
    overlay.style.position = "absolute";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.backgroundColor = "rgba(0, 0, 0, 0.5)"; // Semi-transparent black
    overlay.style.display = "none"; // Hidden by default
    overlay.style.zIndex = "99998"; // Just below the spinner

    mapDiv.appendChild(overlay); // Add the overlay inside the map container

    // CSS animation for the spinner
    const style = document.createElement("style");
    style.innerHTML = `
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    `;
    document.head.appendChild(style);

    // Helper functions to extract coordinates and date from the page
    function getLatLonFromLink() {
        const link = document.querySelector("a[title='View with Google Maps']");
        if (!link) return null;

        const url = new URL(link.href);
        const match = url.search.match(/query=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
        if (match) {
            return {
                lat: parseFloat(match[1]),
                lon: parseFloat(match[2]),
            };
        }
        return null;
    }

    function getChecklistDate(coords) {
        const timeEl = document.querySelector("time[datetime]");
        return timeEl?.getAttribute("datetime") ?? null;
    }

    // Request GFS data via background.js
    function requestGFSDataViaBackground(lat, lon, date) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                {
                    type: "fetchGFSData",
                    lat,
                    lon,
                    date
                },
                (response) => {
                    if (chrome.runtime.lastError) {
                        return reject(chrome.runtime.lastError);
                    }
                    if (response?.success) {
                        resolve(response.data);
                    } else {
                        reject(response?.error || "Unknown error fetching GFS data");
                    }
                }
            );
        });
    }

    try {
        const coords = getLatLonFromLink();
        const date = getChecklistDate(coords);

        if (!coords || !date) {
            throw new Error("Failed to get coordinates or date");
        }

        const targetElement = document.querySelector("div.Page-section.Page-section--white.Page-section--grid-content.u-inset-responsive div.Page-section-inner");
        if (!targetElement) return;

        // Initialize the map
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
        })
            .addTo(map)
            .bindPopup("Checklist Location");

        const d3ColorScale = d3
            .range(0, 1.01, 0.1)
            .map((t) => d3.interpolateBlues(t));

        // ⬇️ CHECK DATE FIRST
        const earliestGFSDate = new Date("2021-01-01T00:00:00Z");
        const checklistDate = new Date(date);

        if (checklistDate < earliestGFSDate) {
            spinner.style.display = "none";
            overlay.style.display = "block";

            const errorMessage = document.createElement("div");
            errorMessage.style.color = "#fff";
            errorMessage.style.fontSize = "18px";
            errorMessage.style.textAlign = "center";
            errorMessage.style.marginTop = "180px";
            errorMessage.innerText = "No wind data available before January 1, 2021.";
            overlay.appendChild(errorMessage);

            return;
        }

        // ⬇️ FETCH GFS WIND DATA from background.js
        try {
            const velocityData = await requestGFSDataViaBackground(

                coords.lat,
                coords.lon,
                date
            );
            console.log(`Checklist date: ${date}, lat/lon: ${coords.lat}, ${coords.lon}`);

            console.log("🚨 velocityData received:", velocityData);

            if (!Array.isArray(velocityData) || !velocityData[0] || !velocityData[1]) {
                console.error("❌ velocityData is not in expected [u, v] format:", velocityData);
                return;
            }

            console.log("✅ Final wind data received:", velocityData);
            console.log("🧪 First item:", velocityData[0]);
            console.log("🧪 First item header:", velocityData[0]?.header);
            console.log("🧪 First item data length:", velocityData[0]?.data?.length);

            // Remove the spinner and overlay once the data is fetched
            spinner.style.display = "none";
            overlay.style.display = "none"; // Hide overlay

            const velocityLayer = L.velocityLayer({
                displayValues: true,
                displayOptions: {
                    velocityType: "Global Wind",
                    displayPosition: "bottomleft",
                    displayEmptyString: "No wind data",
                    angleConvention: "bearingCW",
                    speedUnit: "m/s",
                },
                data: velocityData,
                maxVelocity: 20,
                velocityScale: 0.005,
                particleMultiplier: 0.05,
                lineWidth: 2,
                colorScale: d3ColorScale,
            });

            velocityLayer.addTo(map);
        } catch (windError) {
            // Show overlay with error message if fetch fails
            spinner.style.display = "none";
            overlay.style.display = "block"; // Show overlay
            console.warn("Failed to load wind data:", windError);

            // Optionally, display an error message on the overlay
            const errorMessage = document.createElement("div");
            errorMessage.style.color = "#fff";
            errorMessage.style.fontSize = "18px";
            errorMessage.style.textAlign = "center";
            errorMessage.style.marginTop = "180px";
            errorMessage.innerText = "Failed to load wind data. Please try again later.";
            overlay.appendChild(errorMessage);
        }
    } catch (error) {
        console.warn("Could not initialize wind map:", error);
        spinner.style.display = "none"; // Hide spinner if something fails
        overlay.style.display = "block"; // Show overlay if initialization fails
    }
})();
  

// (async function () {
//     if (!window.L && !window.d3) {
//       console.warn("Leaflet or D3 not loaded.");
//       return;
//     }
  
//     if (document.getElementById('gfs-wind-map')) {
//       console.log("Map already exists. Skipping injection.");
//       return;
//     }
  
//     function getLatLngFromLink() {
//       const link = document.querySelector("a[title='View with Google Maps']");
//       if (!link) return null;
  
//       const url = new URL(link.href);
//       const match = url.search.match(/query=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
//       if (match) {
//         return {
//           lat: parseFloat(match[1]),
//           lng: parseFloat(match[2])
//         };
//       }
//       return null;
//     }
  
//     function getChecklistDate() {
//       const timeEl = document.querySelector("time[datetime]");
//       return timeEl?.getAttribute("datetime") ?? null;
//     }
  
//     async function requestGFSData(coords, date) {
//       return new Promise((resolve, reject) => {
//         chrome.runtime.sendMessage({
//           type: "fetchGFSData",
//           lat: coords.lat,
//           lng: coords.lng,
//           date: date
//         }, (response) => {
//           if (chrome.runtime.lastError) {
//             reject(new Error(chrome.runtime.lastError.message));
//           } else if (response?.success) {
//             resolve(response.data);
//           } else {
//             reject(new Error(response?.message || "Unknown error"));
//           }
//         });
//       });
//     }
  
//     try {
//       const coords = getLatLngFromLink();
//       const date = getChecklistDate();
  
//       if (!coords || !date) {
//         throw new Error("Failed to get coordinates or date");
//       }
  
//       const targetElement = document.querySelector('div.Page-section.Page-section--white.Page-section--grid-content.u-inset-responsive div.Page-section-inner');
//       if (!targetElement) return;
  
//       const mapDiv = document.createElement('div');
//       mapDiv.id = 'gfs-wind-map';
//       mapDiv.style = 'height: 600px; margin: 1em 0; border: 2px solid #ccc; border-radius: 8px;';
//       mapDiv.dataset.lat = coords.lat;
//       mapDiv.dataset.lng = coords.lng;
//       mapDiv.dataset.date = date;
  
//       targetElement.parentNode.insertBefore(mapDiv, targetElement);
  
//       const map = L.map('gfs-wind-map').setView([coords.lat, coords.lng], 5);
//       L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
//         maxZoom: 10,
//         attribution: '&copy; OpenStreetMap contributors'
//       }).addTo(map);
  
//       const bounds = [
//         [coords.lat - 2.5, coords.lng - 3.5],
//         [coords.lat + 2.5, coords.lng + 3.5]
//       ];
//       map.fitBounds(bounds);
  
//       L.circleMarker([coords.lat, coords.lng], {
//         radius: 6,
//         color: '#007BFF',
//         fillColor: '#339AF0',
//         fillOpacity: 0.9,
//         weight: 2
//       }).addTo(map).bindPopup("Checklist Location");
  
//       const d3ColorScale = d3.range(0, 1.01, 0.1).map(t => d3.interpolateBlues(t));
  
//       // Request GFS data through the background script
//       try {
//         const velocityData = await requestGFSData(coords, date);
//         console.log("✅ Received GFS data:", velocityData);
  
//         const velocityLayer = L.velocityLayer({
//           displayValues: true,
//           displayOptions: {
//             velocityType: "Wind",
//             displayPosition: "bottomleft",
//             displayEmptyString: "No wind data",
//             angleConvention: "bearingCW",
//             speedUnit: "m/s",
//           },
//           data: velocityData, // Should be the proper JSON array
//           maxVelocity: 20,
//           velocityScale: 0.005,
//           particleMultiplier: 0.05,
//           lineWidth: 2,
//           colorScale: d3ColorScale
//         });
  
//         velocityLayer.addTo(map);
//       } catch (error) {
//         console.error("❌ Failed to load wind data:", error);
//       }
  
//       console.log(`Checklist date: ${date}, lat/lng: ${coords.lat}, ${coords.lng}`);
//     } catch (error) {
//       console.warn("Could not initialize wind map:", error);
//     }
//   })();
  