browser.browserAction.onClicked.addListener((tab) => {
  if (tab.url && tab.url.startsWith("https://ebird.org/alert/")) {
    browser.tabs.insertCSS(tab.id, { file: "leaflet/leaflet.css" });

    browser.tabs.executeScript(tab.id, { file: "leaflet/leaflet.js" }).then(() => {
      return browser.tabs.executeScript(tab.id, { file: "d3/d3.v7.min.js" });
    }).then(() => {
      return browser.tabs.executeScript(tab.id, { file: "map.js" });
    }).catch((err) => {
      console.error("Script injection failed:", err);
      browser.notifications.create("Error", {
        type: "basic",
        iconUrl: "icon.png",
        title: "Warning",
        message: "Failed to inject required scripts. Check the console."
      });
    });
  } else {
    console.log("This extension only works on eBird alert pages.");
    browser.notifications.create("Error", {
      type: "basic",
      iconUrl: "icon.png",
      title: "Warning",
      message: "This extension can only be used on eBird Alert pages."
    });
  }
});
