browser.browserAction.onClicked.addListener((tab) => {
  browser.tabs.executeScript(tab.id, { file: "leaflet/leaflet.js" });
  browser.tabs.insertCSS(tab.id, { file: "leaflet/leaflet.css" });
  browser.tabs.executeScript(tab.id, { file: "map.js" });
});
