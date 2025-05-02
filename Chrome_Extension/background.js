const EBIRD_API_KEY = "2dhshtjdomjt";

chrome.action.onClicked.addListener((tab) => {
  if (!tab.url) return;

  const isAlertPage = tab.url.startsWith("https://ebird.org/alert/");
  const isLifeListPage = tab.url.startsWith("https://ebird.org/lifelist");
  const isMyChecklistsPage = tab.url.startsWith("https://ebird.org/mychecklists");
  const isTargetsPage = tab.url.startsWith("https://ebird.org/targets");

  if (isAlertPage || isLifeListPage || isMyChecklistsPage || isTargetsPage) {
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
    }

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: [scriptToInject]
    });
  } else {
    console.log("This extension only works on eBird alert, lifelist, targets, or checklist pages.");
    chrome.notifications.create("Error", {
      type: "basic",
      iconUrl: "icon.png",
      title: 'Warning',
      message: 'This extension only works on eBird alert, lifelist, targets, or checklist pages.'
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
});
