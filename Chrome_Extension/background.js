const EBIRD_API_KEY = "2dhshtjdomjt";

chrome.action.onClicked.addListener((tab) => {
  if (!tab.url) return;

  const isAlertPage = tab.url.startsWith("https://ebird.org/alert/");
  const isLifeListPage = tab.url.startsWith("https://ebird.org/lifelist");
  const isMyChecklistsPage = tab.url.startsWith("https://ebird.org/mychecklists");
  const isTargetsPage = tab.url.startsWith("https://ebird.org/targets");
  const isChecklistPage = tab.url.startsWith("https://ebird.org/checklist/");

  if (isAlertPage || isLifeListPage || isMyChecklistsPage || isTargetsPage || isChecklistPage) {
    chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["leaflet/leaflet.css"]
    });

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["leaflet/leaflet.js"]
    });

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["leaflet/leaflet-heat.js"]
    });

    chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["leaflet/leaflet-velocity.css"]
    });

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["leaflet/leaflet-velocity.min.js"]
    });

    chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["leaflet/leaflet.fullscreen.css"]
    });

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["leaflet/leaflet.fullscreen.min.js"]
    });

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["d3/d3.v7.min.js"]
    });

    let scriptToInject;
    if (isAlertPage) {
      scriptToInject = "map.js";
    } else if (isLifeListPage) {
      scriptToInject = "lifelist-map.js";
    } else if (isMyChecklistsPage) {
      scriptToInject = "mychecklists-map.js";
    } else if (isTargetsPage) {
      scriptToInject = "targets-map.js";
    } else if (isChecklistPage) {
      scriptToInject = "checklist-wind-map.js";
    }

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: [scriptToInject]
    });
  } else {
    console.log("This extension only works on eBird alert, lifelist, targets, MyChecklists, or checklist pages.");
    chrome.notifications.create("Error", {
      type: "basic",
      iconUrl: "icon.png",
      title: 'Warning',
      message: 'This extension only works on eBird alert, lifelist, targets, MyChecklists, or checklist pages.'
    });
    chrome.notifications.clear("Error");
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "getChecklistDetails") {
    const { subId } = message;
    const url = `https://api.ebird.org/v2/product/checklist/view/${subId}`;

    fetch(url, {
      headers: { "X-eBirdApiToken": EBIRD_API_KEY }
    })
      .then(response => response.json())
      .then(data => sendResponse({ data }))
      .catch(error => {
        console.error("Checklist fetch failed:", error);
        sendResponse({ error: error.message });
      });

    return true;
  }

  if (message.type === "getLocationDetails") {
    const { locId } = message;
    const url = `https://api.ebird.org/v2/ref/location/info/${locId}`;

    fetch(url, {
      headers: { "X-eBirdApiToken": EBIRD_API_KEY }
    })
      .then(response => response.json())
      .then(data => sendResponse({ data }))
      .catch(error => {
        console.error("Location fetch failed:", error);
        sendResponse({ error: error.message });
      });

    return true;
  }

  if (message.type === "batchChecklistFeed") {
    const { queries, subIdMap } = message;

    (async () => {
      const result = {};

      for (const query of queries) {
        const url = `https://api.ebird.org/v2/product/lists/${query}?maxResults=2000`;
        try {
          const res = await fetch(url, {
            headers: { "X-eBirdApiToken": EBIRD_API_KEY }
          });

          if (res.ok) {
            const data = await res.json();
            const filtered = data.filter(item => {
              const wanted = subIdMap[query];
              return wanted && wanted.includes(item.subId);
            });

            // console.log(`Filtered data for ${query}:`, filtered);
            result[query] = filtered;
          } else {
            console.warn(`Non-ok response for ${query}:`, res.status);
            result[query] = [];
          }
        } catch (err) {
          console.error(`Fetch failed for ${query}:`, err);
          result[query] = [];
        }
      }

      sendResponse(result);
    })();

    return true; // Keep port open for async response
  }

  if (message.type === "batchRecentSightings") {
    console.log("batchRecentSightings message received:", message);
    const { queries } = message;
  
    (async () => {
      try {
        const results = {};
        for (const { speciesCode, regionCode } of queries) {
          const url = `https://api.ebird.org/v2/data/obs/${regionCode}/recent/${speciesCode}?back=30&maxResults=100`;
  
          try {
            const res = await fetch(url, {
              headers: { "X-eBirdApiToken": EBIRD_API_KEY }
            });
  
            if (res.ok) {
              const data = await res.json();
              results[`${speciesCode}_${regionCode}`] = data;
            } else {
              console.warn(`Non-ok response for ${speciesCode} in ${regionCode}:`, res.status);
              results[`${speciesCode}_${regionCode}`] = [];
            }
          } catch (err) {
            console.error(`Fetch failed for ${speciesCode} in ${regionCode}:`, err);
            results[`${speciesCode}_${regionCode}`] = [];
          }
        }
  
        sendResponse(results);
      } catch (outerError) {
        console.error("Outer error in batchRecentSightings:", outerError);
        sendResponse({ error: outerError.message || "Unknown error" });
      }
    })();
  
    return true;
  }  

  if (message.type === "fetchGFSWindData") {
    console.log("Received fetchGFSWindData message:", message);
    const { lat, lon, date, level } = message;

    (async () => {
        try {
            console.log("Fetching GFS wind data for lat:", lat, "lon:", lon, "date:", date, "level:", level);
            const response = await fetch("http://localhost:8000/api/get_gfs_wind_data", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ lat, lon, date, level }),
            });

            console.log("Request sent.");

            if (!response.ok) {
                // If the response is not successful, log the error and return failure
                console.error(`Server returned an error: ${response.status} ${response.statusText}`);
                sendResponse({ success: false, error: `Server returned an error: ${response.status}` });
                return;
            }

            const result = await response.json();
            console.log("🔁 Full response from server:", result);

            if (result.status === "success" && result.message) {
              sendResponse({ success: true, data: result.message });
            } else {
              console.warn("API returned failure:", result.message);
              sendResponse({ success: false, error: result.message || result.status });
            }
            
        } catch (err) {
            // Catch network or JSON parsing errors
            console.error("Failed to fetch GFS from server:", err);
            sendResponse({ success: false, error: err.message });
        }
    })();

    return true; // Required for async sendResponse
  }

  if (message.type === "fetchGFSCloudData") {
    console.log("Received fetchGFSCloudData message:", message);
    const { lat, lon, date, level } = message;

    (async () => {
        try {
            console.log("Fetching GFS cloud data for lat:", lat, "lon:", lon, "date:", date, "level:", level);
            const response = await fetch("http://localhost:8000/api/get_gfs_cloud_data", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ lat, lon, date, level }),
            });

            console.log("Request sent.");

            if (!response.ok) {
                // If the response is not successful, log the error and return failure
                console.error(`Server returned an error: ${response.status} ${response.statusText}`);
                sendResponse({ success: false, error: `Server returned an error: ${response.status}` });
                return;
            }

            const result = await response.json();
            console.log("🔁 Full response from server:", result);

            if (result.status === "success" && result.message) {
              sendResponse({ success: true, data: result.message });
            } else {
              console.warn("API returned failure:", result.message);
              sendResponse({ success: false, error: result.message || result.status });
            }
            
        } catch (err) {
            // Catch network or JSON parsing errors
            console.error("Failed to fetch GFS from server:", err);
            sendResponse({ success: false, error: err.message });
        }
    })();

    return true; // Required for async sendResponse
  }

  if (message.type === "fetchGFSPrecipData") {
    console.log("Received fetchGFSPrecipData message:", message);
    const { lat, lon, date, level } = message;

    (async () => {
        try {
            console.log("Fetching GFS precip data for lat:", lat, "lon:", lon, "date:", date, "level:", level);
            const response = await fetch("http://localhost:8000/api/get_gfs_precip_data", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ lat, lon, date, level }),
            });

            console.log("Request sent.");

            if (!response.ok) {
                // If the response is not successful, log the error and return failure
                console.error(`Server returned an error: ${response.status} ${response.statusText}`);
                sendResponse({ success: false, error: `Server returned an error: ${response.status}` });
                return;
            }

            const result = await response.json();
            console.log("🔁 Full response from server:", result);

            if (result.status === "success" && result.message) {
              sendResponse({ success: true, data: result.message });
            } else {
              console.warn("API returned failure:", result.message);
              sendResponse({ success: false, error: result.message || result.status });
            }
            
        } catch (err) {
            // Catch network or JSON parsing errors
            console.error("Failed to fetch GFS from server:", err);
            sendResponse({ success: false, error: err.message });
        }
    })();

    return true; // Required for async sendResponse
  }

  if (message.type === "fetchGFSSfcTempData") {
    console.log("Received fetchGFSSfcTempData message:", message);
    const { lat, lon, date, level } = message;

    (async () => {
        try {
            console.log("Fetching GFS sfc temp data for lat:", lat, "lon:", lon, "date:", date, "level:", level);
            const response = await fetch("http://localhost:8000/api/get_gfs_sfc_temp_data", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ lat, lon, date, level }),
            });

            console.log("Request sent.");

            if (!response.ok) {
                // If the response is not successful, log the error and return failure
                console.error(`Server returned an error: ${response.status} ${response.statusText}`);
                sendResponse({ success: false, error: `Server returned an error: ${response.status}` });
                return;
            }

            const result = await response.json();
            console.log("🔁 Full response from server:", result);

            if (result.status === "success" && result.message) {
              sendResponse({ success: true, data: result.message });
            } else {
              console.warn("API returned failure:", result.message);
              sendResponse({ success: false, error: result.message || result.status });
            }
            
        } catch (err) {
            // Catch network or JSON parsing errors
            console.error("Failed to fetch GFS from server:", err);
            sendResponse({ success: false, error: err.message });
        }
    })();

    return true; // Required for async sendResponse
  }

  if (message.type === "fetchGFSRefcData") {
    console.log("Received fetchGFSRefcData message:", message);
    const { lat, lon, date, level } = message;

    (async () => {
        try {
            console.log("Fetching GFS reflectivity data for lat:", lat, "lon:", lon, "date:", date, "level:", level);
            const response = await fetch("http://localhost:8000/api/get_gfs_refc_data", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ lat, lon, date, level }),
            });

            console.log("Request sent.");

            if (!response.ok) {
                // If the response is not successful, log the error and return failure
                console.error(`Server returned an error: ${response.status} ${response.statusText}`);
                sendResponse({ success: false, error: `Server returned an error: ${response.status}` });
                return;
            }

            const result = await response.json();
            console.log("🔁 Full response from server:", result);

            if (result.status === "success" && result.message) {
              sendResponse({ success: true, data: result.message });
            } else {
              console.warn("API returned failure:", result.message);
              sendResponse({ success: false, error: result.message || result.status });
            }
            
        } catch (err) {
            // Catch network or JSON parsing errors
            console.error("Failed to fetch GFS from server:", err);
            sendResponse({ success: false, error: err.message });
        }
    })();

    return true; // Required for async sendResponse
  }

  if (message.type === "fetchGFSVvelData") {
    console.log("Received fetchGFSVvelData message:", message);
    const { lat, lon, date, level } = message;

    (async () => {
        try {
            console.log("Fetching GFS vertical velocity data for lat:", lat, "lon:", lon, "date:", date, "level:", level);
            const response = await fetch("http://localhost:8000/api/get_gfs_vvel_data", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ lat, lon, date, level }),
            });

            console.log("Request sent.");

            if (!response.ok) {
                // If the response is not successful, log the error and return failure
                console.error(`Server returned an error: ${response.status} ${response.statusText}`);
                sendResponse({ success: false, error: `Server returned an error: ${response.status}` });
                return;
            }

            const result = await response.json();
            console.log("🔁 Full response from server:", result);

            if (result.status === "success" && result.message) {
              sendResponse({ success: true, data: result.message });
            } else {
              console.warn("API returned failure:", result.message);
              sendResponse({ success: false, error: result.message || result.status });
            }
            
        } catch (err) {
            // Catch network or JSON parsing errors
            console.error("Failed to fetch GFS from server:", err);
            sendResponse({ success: false, error: err.message });
        }
    })();

    return true; // Required for async sendResponse
  }

  if (message.type === "fetchGFSCapeData") {
    console.log("Received fetchGFSCapeData message:", message);
    const { lat, lon, date, level } = message;

    (async () => {
        try {
            console.log("Fetching GFS CAPE data for lat:", lat, "lon:", lon, "date:", date, "level:", level);
            const response = await fetch("http://localhost:8000/api/get_gfs_cape_data", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ lat, lon, date, level }),
            });

            console.log("Request sent.");

            if (!response.ok) {
                // If the response is not successful, log the error and return failure
                console.error(`Server returned an error: ${response.status} ${response.statusText}`);
                sendResponse({ success: false, error: `Server returned an error: ${response.status}` });
                return;
            }

            const result = await response.json();
            console.log("🔁 Full response from server:", result);

            if (result.status === "success" && result.message) {
              sendResponse({ success: true, data: result.message });
            } else {
              console.warn("API returned failure:", result.message);
              sendResponse({ success: false, error: result.message || result.status });
            }
            
        } catch (err) {
            // Catch network or JSON parsing errors
            console.error("Failed to fetch GFS from server:", err);
            sendResponse({ success: false, error: err.message });
        }
    })();

    return true; // Required for async sendResponse
  }


  if (message.type === "fetchGFSCinData") {
    console.log("Received fetchGFSCinData message:", message);
    const { lat, lon, date, level } = message;

    (async () => {
        try {
            console.log("Fetching GFS CIN data for lat:", lat, "lon:", lon, "date:", date, "level:", level);
            const response = await fetch("http://localhost:8000/api/get_gfs_cin_data", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ lat, lon, date, level }),
            });

            console.log("Request sent.");

            if (!response.ok) {
                // If the response is not successful, log the error and return failure
                console.error(`Server returned an error: ${response.status} ${response.statusText}`);
                sendResponse({ success: false, error: `Server returned an error: ${response.status}` });
                return;
            }

            const result = await response.json();
            console.log("🔁 Full response from server:", result);

            if (result.status === "success" && result.message) {
              sendResponse({ success: true, data: result.message });
            } else {
              console.warn("API returned failure:", result.message);
              sendResponse({ success: false, error: result.message || result.status });
            }
            
        } catch (err) {
            // Catch network or JSON parsing errors
            console.error("Failed to fetch GFS from server:", err);
            sendResponse({ success: false, error: err.message });
        }
    })();

    return true; // Required for async sendResponse
  }

  if (message.type === "fetchGFSDivData") {
    console.log("Received fetchGFSDivData message:", message);
    const { lat, lon, date, level } = message;

    (async () => {
        try {
            console.log("Fetching GFS Divergence data for lat:", lat, "lon:", lon, "date:", date, "level:", level);
            const response = await fetch("http://localhost:8000/api/get_gfs_divergence_data", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ lat, lon, date, level }),
            });

            console.log("Request sent.");

            if (!response.ok) {
                // If the response is not successful, log the error and return failure
                console.error(`Server returned an error: ${response.status} ${response.statusText}`);
                sendResponse({ success: false, error: `Server returned an error: ${response.status}` });
                return;
            }

            const result = await response.json();
            console.log("🔁 Full response from server:", result);

            if (result.status === "success" && result.message) {
              sendResponse({ success: true, data: result.message });
            } else {
              console.warn("API returned failure:", result.message);
              sendResponse({ success: false, error: result.message || result.status });
            }
            
        } catch (err) {
            // Catch network or JSON parsing errors
            console.error("Failed to fetch GFS from server:", err);
            sendResponse({ success: false, error: err.message });
        }
    })();

    return true; // Required for async sendResponse
  }

});