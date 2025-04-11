chrome.action.onClicked.addListener((tab) => {
  if (tab.url && tab.url.startsWith("https://ebird.org/alert/")) {
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

  } else {
    console.log("This extension only works on eBird alert pages.");
  }

});
