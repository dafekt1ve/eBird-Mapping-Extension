const EBIRD_API_KEY = "2dhshtjdomjt";

// Cross-browser compatibility: Use chrome API in Chrome, browser API in Firefox
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

browserAPI.action.onClicked.addListener((tab) => {
  if (!tab.url) return;

  const isAlertPage = tab.url.startsWith("https://ebird.org/alert/");
  const isLifeListPage = tab.url.startsWith("https://ebird.org/lifelist");
  const isMyChecklistsPage = tab.url.startsWith("https://ebird.org/mychecklists");
  const isTargetsPage = tab.url.startsWith("https://ebird.org/targets");
  const isRegionPage = tab.url.startsWith("https://ebird.org/region/");
  
  // New: Detect media pages on media.ebird.org
  const isMediaPage = tab.url.startsWith("https://media.ebird.org/catalog");

  if (isAlertPage || isLifeListPage || isMyChecklistsPage || isTargetsPage || isRegionPage || isMediaPage) {
    // Inject CSS and JavaScript files
    browserAPI.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["leaflet/leaflet.css"]
    });

    browserAPI.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["leaflet/leaflet.js"]
    });

    browserAPI.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["leaflet/leaflet-velocity.css"]
    });

    browserAPI.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["leaflet/leaflet-velocity.min.js"]
    });

    browserAPI.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["leaflet/leaflet.fullscreen.css"]
    });

    browserAPI.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["leaflet/leaflet.fullscreen.min.js"]
    });

    browserAPI.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["d3/d3.v7.min.js"]
    });

    // Determine which content script to inject
    let scriptToInject;
    if (isAlertPage) {
      scriptToInject = "map.js";
    } else if (isLifeListPage) {
      scriptToInject = "lifelist-map.js";
    } else if (isMyChecklistsPage) {
      scriptToInject = "mychecklists-map.js";
    } else if (isTargetsPage) {
      scriptToInject = "targets-map.js";
    } else if (isRegionPage) {
      scriptToInject = "region-family-map.js";
    } else if (isMediaPage) {
      // New: Inject media map script
      scriptToInject = "media-map.js";
    }

    browserAPI.scripting.executeScript({
      target: { tabId: tab.id },
      files: [scriptToInject]
    });
  } else {
    console.log("This extension only works on eBird alert, lifelist, targets, MyChecklists, media, or checklist pages.");
    browserAPI.notifications.create("Error", {
      type: "basic",
      iconUrl: "icon.png",
      title: 'Warning',
      message: 'This extension only works on eBird alert, lifelist, targets, MyChecklists, media, or checklist pages.'
    });
    browserAPI.notifications.clear("Error");
  }
});

browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

    return true;
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

  if (message.type === "fetchGFSData") {
    console.log("Received fetchGFSData message:", message);
    const { lat, lon, date, level } = message;

    (async () => {
        try {
            console.log("Fetching GFS data for lat:", lat, "lon:", lon, "date:", date, "level:", level);
            const response = await fetch("http://localhost:8000/api/get_gfs_data", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ lat, lon, date, level }),
            });

            console.log("Request sent.");

            if (!response.ok) {
                console.error(`Server returned an error: ${response.status} ${response.statusText}`);
                sendResponse({ success: false, error: `Server returned an error: ${response.status}` });
                return;
            }

            const result = await response.json();
            console.log("Full response from server:", result);

            if (result.status === "success" && result.message) {
              sendResponse({ success: true, data: result.message });
            } else {
              console.warn("API returned failure:", result.message);
              sendResponse({ success: false, error: result.message || result.status });
            }
            
        } catch (err) {
            console.error("Failed to fetch GFS from server:", err);
            sendResponse({ success: false, error: err.message });
        }
    })();

    return true;
  }
});
