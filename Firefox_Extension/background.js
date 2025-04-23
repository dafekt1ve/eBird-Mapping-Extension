const EBIRD_API_KEY = "2dhshtjdomjt";

browser.browserAction.onClicked.addListener((tab) => {
  if (!tab.url) return;

  const isAlertPage = tab.url.startsWith("https://ebird.org/alert/");
  const isLifeListPage = tab.url.startsWith("https://ebird.org/lifelist");
  const isMyChecklistsPage = tab.url.startsWith("https://ebird.org/mychecklists");

  if (isAlertPage || isLifeListPage || isMyChecklistsPage) {
    // console.log("Injecting scripts for:", tab.url);

    browser.tabs.insertCSS(tab.id, { file: "leaflet/leaflet.css" })
      .then(() => browser.tabs.executeScript(tab.id, { file: "leaflet/leaflet.js" }))
      .then(() => browser.tabs.executeScript(tab.id, { file: "d3/d3.v7.min.js" }))
      .then(() => {
        // console.log("✅ Leaflet & D3 injected");

        // Determine which content script to inject
        let scriptToInject;
        if (isAlertPage) {
          scriptToInject = "map.js";
        } else if (isLifeListPage) {
          scriptToInject = "lifelist-map.js";
        } else if (isMyChecklistsPage) {
          scriptToInject = "mychecklists-map.js";
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

browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "batchChecklistFeed") {
    const { queries, subIdMap } = message;

    return Promise.all(queries.map(async (query) => {
      const url = `https://api.ebird.org/v2/product/lists/${query}?maxResults=2000`;
      try {
        const res = await fetch(url, {
          headers: { "X-eBirdApiToken": EBIRD_API_KEY }
        });
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const data = await res.json();
        const filtered = data.filter(item => {
          const wanted = subIdMap[query];
          return wanted && wanted.includes(item.subId);
        });
        return [query, filtered];
      } catch (err) {
        console.error(`Fetch failed for ${query}:`, err);
        return [query, []];
      }
    })).then(results => Object.fromEntries(results));
  }

  if (message.type === "lookupChecklistLocation") {
    const { subId, regionCode, date } = message;
    try {
      const [year, month, day] = date.split("-");
      const url = `https://api.ebird.org/v2/product/lists/${regionCode}/${year}/${month}/${day}`;
      return fetch(url, {
        headers: { "X-eBirdApiToken": EBIRD_API_KEY }
      })
        .then(res => res.json())
        .then(data => {
          const match = data.find(chk => chk.subId === subId);
          if (match?.lat && match?.lng) {
            return { success: true, lat: match.lat, lng: match.lng };
          }
          return { success: false };
        });
    } catch (err) {
      console.error("Checklist location error:", err);
      return { success: false };
    }
  }

  if (message.type === "batchChecklistView") {
    const { subIds } = message;

    return Promise.all(subIds.map(async (subId) => {
      const url = `https://api.ebird.org/v2/product/checklist/view/${subId}`;
      try {
        const res = await fetch(url, {
          headers: { "X-eBirdApiToken": EBIRD_API_KEY }
        });
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const data = await res.json();
        return [subId, (data?.loc?.lat && data?.loc?.lng) ? {
          lat: data.loc.lat,
          lng: data.loc.lng
        } : null];
      } catch (err) {
        console.error(`Checklist view fetch failed for ${subId}:`, err);
        return [subId, null];
      }
    })).then(results => Object.fromEntries(results));
  }

  return false;
});