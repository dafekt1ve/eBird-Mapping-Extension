const EBIRD_API_KEY = "2dhshtjdomjt";

browser.browserAction.onClicked.addListener((tab) => {
  if (!tab.url) return;

  const isAlertPage = tab.url.startsWith("https://ebird.org/alert/");
  const isLifeListPage = tab.url.startsWith("https://ebird.org/lifelist");
  const isMyChecklistsPage = tab.url.startsWith("https://ebird.org/mychecklists");
  const isTargetsPage = tab.url.startsWith("https://ebird.org/targets");

  if (isAlertPage || isLifeListPage || isMyChecklistsPage || isTargetsPage) {
    browser.tabs.insertCSS(tab.id, { file: "leaflet/leaflet.css" })
      .then(() => browser.tabs.executeScript(tab.id, { file: "leaflet/leaflet.js" }))
      .then(() => browser.tabs.executeScript(tab.id, { file: "d3/d3.v7.min.js" }))
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
        }


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
    console.log("This extension only works on eBird alert, lifelist, or MyChecklists pages.");
    browser.notifications.create({
      type: "basic",
      iconUrl: "icon.png",
      title: "Warning",
      message: "This extension only works on eBird alert, lifelist, or MyChecklists pages."
    }).then((id) => {
      console.log("Notification created with ID:", id);
    }).catch((err) => {
      console.error("Notification creation failed:", err);
    });
  }
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // console.log('Background received message:', message);
  // if (message.type === "batchChecklistFeed") {
  //   const { queries, subIdMap } = message;

  //   (async () => {
  //     const result = {};

  //     for (const query of queries) {
  //       const url = `https://api.ebird.org/v2/product/lists/${query}?maxResults=2000`;
  //       console.log(url);
  //       try {
  //         const res = await fetch(url, {
  //           headers: { "X-eBirdApiToken": EBIRD_API_KEY }
  //         });

  //         if (res.ok) {
  //           const data = await res.json();
  //           const filtered = data.filter(item => {
  //             const wanted = subIdMap[query];
  //             return wanted && wanted.includes(item.subId);
  //           });

  //           console.log(`Filtered data for ${query}:`, filtered);
  //           result[query] = filtered;
  //         } else {
  //           console.warn(`Non-ok response for ${query}:`, res.status);
  //           result[query] = [];
  //         }
  //       } catch (err) {
  //         console.error(`Fetch failed for ${query}:`, err);
  //         result[query] = [];
  //       }
  //     }

  //     sendResponse(result);
  //   })();

  //   return true; // Keep port open for async response
  // }

  // if (message.type === "getChecklistDetails") {
  //   const { subId } = message;
  //   const url = `https://api.ebird.org/v2/product/checklist/view/${subId}`;

  //   fetch(url, {
  //     headers: {
  //       "X-eBirdApiToken": EBIRD_API_KEY 
  //     }
  //   })
  //     .then(response => response.json())
  //     .then(data => sendResponse({ data }))
  //     .catch(error => {
  //       console.error("Checklist fetch failed:", error);
  //       sendResponse({ error: error.message });
  //     });

  //   return true; // Keep the message channel open
  // }

  // if (message.type === "getLocationDetails") {
  //   const { locId } = message;
  //   const url = `https://api.ebird.org/v2/ref/location/info/${locId}`;

  //   fetch(url, {
  //     headers: {
  //       "X-eBirdApiToken": EBIRD_API_KEY
  //     }
  //   })
  //     .then(response => response.json())
  //     .then(data => sendResponse({ data }))
  //     .catch(error => {
  //       console.error("Location fetch failed:", error);
  //       sendResponse({ error: error.message });
  //     });

  //   return true;
  // }

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
  