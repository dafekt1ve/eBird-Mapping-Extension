const EBIRD_API_KEY = "2dhshtjdomjt";

browser.browserAction.onClicked.addListener((tab) => {
  if (!tab.url) return;

  const isAlertPage = tab.url.startsWith("https://ebird.org/alert/");
  const isLifeListPage = tab.url.startsWith("https://ebird.org/lifelist");
  const isMyChecklistsPage = tab.url.startsWith("https://ebird.org/mychecklists");
  const isTargetsPage = tab.url.startsWith("https://ebird.org/targets");
  const isChecklistPage = tab.url.startsWith("https://ebird.org/checklist/");

  if (isAlertPage || isLifeListPage || isMyChecklistsPage || isTargetsPage || isChecklistPage) {
    function delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    browser.tabs.insertCSS(tab.id, { file: "leaflet/leaflet.css" })
      .then(() => browser.tabs.executeScript(tab.id, { file: "leaflet/leaflet.js" }))
      .then(() => browser.tabs.executeScript(tab.id, { file: "d3/d3.v7.min.js" }))
      .then(() => browser.tabs.executeScript(tab.id, { file: "leaflet/leaflet.fullscreen.min.js" }))
      .then(() => browser.tabs.insertCSS(tab.id, { file: "leaflet/leaflet.fullscreen.css" }))
      .then(() => browser.tabs.insertCSS(tab.id, { file: "leaflet/leaflet-velocity.css" }))
      // .then(() => delay(100))
      // .then(() => browser.tabs.executeScript(tab.id, { file: "leaflet/leaflet-velocity.min.js" }))
      .then(() => {
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

        browser.tabs.executeScript(tab.id, {
          file: "leaflet/leaflet-velocity.min.js",
          runAt: "document_idle"
        });

        // console.log("Injecting content script:", scriptToInject);
        return browser.tabs.executeScript(tab.id, { file: scriptToInject });
      })
      .catch((err) => {
        console.error("Script injection failed:", err);
        browser.notifications.create({
          type: "basic",
          iconUrl: "icon.png",
          title: "Warning",
          message: "Failed to inject required scripts. Check the console."
        }).then((id) => {
          console.log("Notification created with ID:", id);
        }).catch((err) => {
          console.error("Notification creation failed:", err);
        });
      });

  } else {
    console.log("This extension only works on eBird alert, lifelist, MyChecklists, Checklist, or targets pages.");
    browser.notifications.create({
      type: "basic",
      iconUrl: "icon.png",
      title: "Warning",
      message: "This extension only works on eBird alert, lifelist, MyChecklists, Checklist, or targets pages."
    }).then((id) => {
      console.log("Notification created with ID:", id);
    }).catch((err) => {
      console.error("Notification creation failed:", err);
    });
  }
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
  