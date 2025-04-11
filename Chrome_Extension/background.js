chrome.action.onClicked.addListener((tab) => {
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

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["map.js"]
  });
});
