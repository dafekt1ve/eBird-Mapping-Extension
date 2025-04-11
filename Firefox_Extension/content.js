(function () {
    const leafletCSS = document.createElement('link');
    leafletCSS.rel = 'stylesheet';
    leafletCSS.href = chrome.runtime.getURL('leaflet/leaflet.css');
    document.head.appendChild(leafletCSS);
  
    const leafletScript = document.createElement('script');
    leafletScript.src = chrome.runtime.getURL('leaflet/leaflet.js');
    leafletScript.onload = () => {
      const mapScript = document.createElement('script');
      mapScript.src = chrome.runtime.getURL('map.js');
      document.body.appendChild(mapScript);
    };
    document.body.appendChild(leafletScript);
  })();
  