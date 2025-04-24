const EBIRD_API_KEY = "2dhshtjdomjt";

chrome.action.onClicked.addListener((tab) => {
  if (!tab.url) return;

  const isAlertPage = tab.url.startsWith("https://ebird.org/alert/");
  const isLifeListPage = tab.url.startsWith("https://ebird.org/lifelist");
  const isMyChecklistsPage = tab.url.startsWith("https://ebird.org/mychecklists");

  if (isAlertPage || isLifeListPage || isMyChecklistsPage) {
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
    }

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: [scriptToInject]
    });
  } else {
    console.log("This extension only works on eBird alert, lifelist, or checklist pages.");
    chrome.notifications.create("Error", {
      type: "basic",
      iconUrl: "icon.png",
      title: 'Warning',
      message: 'This extension only works on eBird alert, lifelist, or checklist pages.'
    });
    chrome.notifications.clear("Error");
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);
  if (message.type === "batchChecklistFeed") {
    const { queries, subIdMap } = message;

    (async () => {
      const result = {};

      for (const query of queries) {
        const url = `https://api.ebird.org/v2/product/lists/${query}?maxResults=2000`;
        console.log(url);
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

            console.log(`Filtered data for ${query}:`, filtered);
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

  if (message.type === "getChecklistDetails") {
    const { subId } = message;
    const url = `https://api.ebird.org/v2/product/checklist/view/${subId}`;

    fetch(url, {
      headers: {
        "X-eBirdApiToken": EBIRD_API_KEY 
      }
    })
      .then(response => response.json())
      .then(data => sendResponse({ data }))
      .catch(error => {
        console.error("Checklist fetch failed:", error);
        sendResponse({ error: error.message });
      });

    return true; // Indicates async response
  }  
});
