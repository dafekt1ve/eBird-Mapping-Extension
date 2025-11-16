const EBIRD_API_KEY = "2dhshtjdomjt";

// Cross-browser compatibility
const extensionAPI = typeof browser !== 'undefined' ? browser : chrome;

// Listen for action clicks
extensionAPI.action.onClicked.addListener(async (tab) => {
  const url = tab.url;

  try {
    // Determine which script to inject based on the URL
    let scriptFile = null;
    
    if (url.includes("ebird.org/lifelist")) {
      scriptFile = "lifelist-map.js";
    } else if (url.includes("ebird.org/mychecklists")) {
      scriptFile = "mychecklists-map.js";
    } else if (url.includes("ebird.org/targets")) {
      scriptFile = "targets-map.js";
    } else if (url.includes("ebird.org/region/")) {
      scriptFile = "region-family-map.js";
    } else {
      console.log("No matching eBird page detected");
      return;
    }

    console.log(`Injecting script: ${scriptFile}`);
    
    // Inject the appropriate content script
    await extensionAPI.scripting.executeScript({
      target: { tabId: tab.id },
      files: [scriptFile]
    });
    
  } catch (error) {
    console.error("Error injecting script:", error);
  }
});

// Message listener for API calls from content scripts
extensionAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message);

  // Handle taxonomy fetch
  if (message.type === "fetchTaxonomy") {
    (async () => {
      try {
        console.log("Fetching eBird taxonomy...");
        const response = await fetch("https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=json", {
          headers: { "X-eBirdApiToken": EBIRD_API_KEY }
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log(`Taxonomy loaded: ${data.length} species`);
          sendResponse({ data });
        } else {
          console.error("Taxonomy API error:", response.status);
          sendResponse({ error: `API returned ${response.status}` });
        }
      } catch (error) {
        console.error("Taxonomy fetch error:", error);
        sendResponse({ error: error.message });
      }
    })();
    
    return true; // Keep message channel open for async response
  }

  // Handle recent notable observations request
  if (message.type === "fetchRecentNotable") {
    const { regionCode, back } = message;
    
    (async () => {
      try {
        const url = `https://api.ebird.org/v2/data/obs/${regionCode}/recent/notable?back=${back}`;
        console.log("Fetching from:", url);
        
        const response = await fetch(url, {
          headers: { "X-eBirdApiToken": EBIRD_API_KEY }
        });
        
        if (response.ok) {
          const data = await response.json();
          sendResponse({ data });
        } else {
          console.error("API error:", response.status);
          sendResponse({ error: `API returned ${response.status}` });
        }
      } catch (error) {
        console.error("Fetch error:", error);
        sendResponse({ error: error.message });
      }
    })();
    
    return true; // Keep message channel open for async response
  }

  // Handle recent observations request
  if (message.type === "fetchRecentObservations") {
    const { regionCode, back } = message;
    
    (async () => {
      try {
        const url = `https://api.ebird.org/v2/data/obs/${regionCode}/recent?back=${back}`;
        console.log("Fetching from:", url);
        
        const response = await fetch(url, {
          headers: { "X-eBirdApiToken": EBIRD_API_KEY }
        });
        
        if (response.ok) {
          const data = await response.json();
          sendResponse({ data });
        } else {
          console.error("API error:", response.status);
          sendResponse({ error: `API returned ${response.status}` });
        }
      } catch (error) {
        console.error("Fetch error:", error);
        sendResponse({ error: error.message });
      }
    })();
    
    return true; // Keep message channel open for async response
  }

  // Handle batch recent sightings request
  if (message.type === "batchRecentSightings") {
    console.log("Received batchRecentSightings message:", message);
    const { requests } = message;

    (async () => {
      try {
        const results = {};
        
        for (const req of requests) {
          const { speciesCode, regionCode, back } = req;
          const url = `https://api.ebird.org/v2/data/obs/${regionCode}/recent/${speciesCode}?back=${back}`;
          
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
    
    return true; // Keep message channel open for async response
  }

  // Handle GFS data fetch request
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

    return true; // Keep message channel open for async response
  }
});
