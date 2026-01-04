/**
 * eBird Macaulay Library Media Mapper
 * 
 * Works with media.ebird.org/catalog (Macaulay Library interface)
 * Activated by clicking extension icon after page loads
 * 
 * Supported pages:
 * - https://media.ebird.org/catalog (all media)
 * - https://media.ebird.org/catalog?mediaType=photo (photos)
 * - https://media.ebird.org/catalog?mediaType=audio (audio)  
 * - https://media.ebird.org/catalog?mediaType=video (video)
 */

(async function () {
  // Cross-browser API compatibility
  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

  /**
   * Dynamically load a script if not already loaded
   */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (src.includes('leaflet.js') && window.L) {
        resolve();
        return;
      }
      if (src.includes('d3.') && window.d3) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = browserAPI.runtime.getURL(src);
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  /**
   * Dynamically load CSS if not already loaded
   */
  function loadCSS(href) {
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = browserAPI.runtime.getURL(href);
      link.onload = () => resolve();
      link.onerror = () => reject(new Error(`Failed to load ${href}`));
      document.head.appendChild(link);
    });
  }

  // Load required libraries
  if (!window.L || !window.d3) {
    console.log("Loading Leaflet and D3...");
    try {
      await loadScript("d3/d3.v7.min.js");
      await loadCSS("leaflet/leaflet.css");
      await loadCSS("leaflet/leaflet.fullscreen.css");
      await loadScript("leaflet/leaflet.js");
      await loadScript("leaflet/leaflet.fullscreen.min.js");
      console.log("âœ“ Libraries loaded");
    } catch (error) {
      console.error("Failed to load libraries:", error);
      return;
    }
  }

  // Remove any existing media map container
  const existing = document.getElementById("macaulay-map-container");
  if (existing) existing.remove();

  // Load eBird taxonomy for taxonomic ordering
  let ebirdTaxonomy = null;
  try {
    const taxonomyResponse = await fetch(browserAPI.runtime.getURL("ebird-taxonomy.json"));
    ebirdTaxonomy = await taxonomyResponse.json();
    console.log(`âœ“ Loaded ${ebirdTaxonomy.length} species from eBird taxonomy`);
  } catch (error) {
    console.warn("Could not load eBird taxonomy, taxonomic sorting will be unavailable:", error);
  }

  /**
   * Determine the current media type from URL
   */
  function getMediaType() {
    const urlParams = new URLSearchParams(window.location.search);
    const mediaTypeParam = urlParams.get('mediaType');
    
    if (mediaTypeParam === 'photo') return 'photo';
    if (mediaTypeParam === 'audio') return 'audio';
    if (mediaTypeParam === 'video') return 'video';
    return 'all';
  }

  /**
   * Get user-friendly title based on media type
   */
  function getMapTitle() {
    const mediaType = getMediaType();
    const titles = {
      'all': 'Media Map',
      'photo': 'Photo Map',
      'audio': 'Audio Map',
      'video': 'Video Map'
    };
    return titles[mediaType] || 'Media Map';
  }

  /**
   * Clean species name by removing scientific name in parentheses
   * e.g. "Northern Cardinal (Cardinalis cardinalis)" -> "Northern Cardinal"
   */
  function cleanSpeciesName(name) {
    if (!name) return "Unknown species";
    // Remove anything in parentheses (scientific names)
    return name.replace(/\s*\([^)]*\)/g, '').trim();
  }

  /**
   * Extract metadata from a container element
   * @param {Element} container - The DOM container element
   * @param {Element} link - The link element (optional)
   * @param {string} assetId - Asset ID (optional)
   * @param {string} subId - Checklist submission ID (optional)
   * @returns {Object|null} - Metadata object or null
   */
  function extractMetadataFromContainer(container, link, assetId, subId) {
    if (!container) return null;

    // Extract asset ID if not provided
    if (!assetId) {
      const assetLink = container.querySelector('a[href*="/asset/"]');
      if (assetLink) {
        const match = assetLink.href.match(/\/asset\/(\d+)/);
        if (match) assetId = match[1];
      }
    }

    // Extract species name - try multiple selectors, prioritizing the clean common name
    let speciesName = null;
    
    // First try: Look for the specific Species-common span anywhere in container
    const speciesCommonSpan = container.querySelector('.Species-common');
    if (speciesCommonSpan && speciesCommonSpan.textContent.trim()) {
      speciesName = speciesCommonSpan.textContent.trim();
      console.log(`    Found via .Species-common: "${speciesName}"`);
    }
    
    // Second try: Look for .Species class which should contain the common name
    if (!speciesName) {
      const speciesElement = container.querySelector('.Species');
      if (speciesElement) {
        const commonSpan = speciesElement.querySelector('.Species-common');
        if (commonSpan && commonSpan.textContent.trim()) {
          speciesName = commonSpan.textContent.trim();
          console.log(`    Found via .Species > .Species-common: "${speciesName}"`);
        }
      }
    }
    
    // Third try: Species link text (in case grid view uses different structure)
    if (!speciesName) {
      const speciesLink = container.querySelector('a[href*="/species/"]');
      if (speciesLink) {
        // Try to get Species-common span first
        const commonSpan = speciesLink.querySelector('.Species-common');
        if (commonSpan && commonSpan.textContent.trim()) {
          speciesName = commonSpan.textContent.trim();
          console.log(`    Found via species link > .Species-common: "${speciesName}"`);
        } else {
          // Try first span child
          const firstSpan = speciesLink.querySelector('span:first-child');
          if (firstSpan && firstSpan.textContent.trim()) {
            speciesName = firstSpan.textContent.trim();
            console.log(`    Found via species link > first span: "${speciesName}"`);
          } else if (speciesLink.textContent.trim()) {
            speciesName = cleanSpeciesName(speciesLink.textContent.trim());
            console.log(`    Found via species link text: "${speciesName}"`);
          }
        }
      } else {
        console.log(`    No species link found in container`);
      }
    }
    
    // Fourth try: aria-label on links (but filter out common false positives)
    if (!speciesName) {
      const ariaLabelLink = container.querySelector('a[aria-label], a[title]');
      if (ariaLabelLink) {
        const ariaLabel = ariaLabelLink.getAttribute('aria-label') || ariaLabelLink.getAttribute('title');
        if (ariaLabel) {
          const cleaned = cleanSpeciesName(ariaLabel);
          // Filter out common false positives
          const falsePositives = ['Report', 'View', 'Photo', 'Audio', 'Video', 'Media', 'Checklist'];
          if (cleaned && !falsePositives.includes(cleaned)) {
            speciesName = cleaned;
          }
        }
      }
    }
    
    // Fifth try: Look for any heading or title-like elements
    if (!speciesName) {
      const headingSelectors = [
        '[class*="Species"]',
        '[class*="species"]',
        '.Heading-main',
        'h2', 'h3', 'h4',
        '[class*="title"]',
        '[class*="Title"]'
      ];

      for (const selector of headingSelectors) {
        const element = container.querySelector(selector);
        if (element && element.textContent.trim()) {
          speciesName = cleanSpeciesName(element.textContent.trim());
          break;
        }
      }
    }

    // Extract date - try multiple selectors
    let dateText = null;
    const dateSelectors = [
      'time',
      '[datetime]',
      '[class*="date"]',
      '[class*="Date"]'
    ];

    for (const selector of dateSelectors) {
      const element = container.querySelector(selector);
      if (element) {
        dateText = element.textContent.trim() || element.getAttribute('datetime');
        if (dateText) break;
      }
    }

    // Extract location name - try multiple selectors
    let locationName = null;
    const locationSelectors = [
      'a[href*="/hotspot/"]',
      '[class*="location"]',
      '[class*="Location"]'
    ];

    for (const selector of locationSelectors) {
      const element = container.querySelector(selector);
      if (element && element.textContent.trim()) {
        locationName = element.textContent.trim();
        break;
      }
    }

    // Extract checklist ID if not provided
    if (!subId) {
      const checklistLink = container.querySelector('a[href*="/checklist/"]');
      if (checklistLink) {
        const match = checklistLink.href.match(/\/checklist\/(S\d+)/);
        if (match) subId = match[1];
      }
    }

    // Need at least asset ID or checklist ID to be useful
    if (!assetId && !subId) return null;

    return {
      assetId,
      subId,
      speciesName,
      dateText,
      locationName,
      mediaType: getMediaType(),
      element: container
    };
  }

  /**
   * Extract media data from Macaulay Library page
   * Handles both list view and grid view
   */
  function extractMediaData() {
    const mediaItems = [];
    console.log("🔍 Extracting media data from Macaulay Library page...");

    // Detect view type from URL
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get('view');
    const isGridView = viewParam === 'grid';
    
    console.log(`View type: ${isGridView ? 'grid' : 'list'}`);

    // Different selectors for list vs grid view
    let mediaElements;
    if (isGridView) {
      // Grid view: li.ResultsGrid-card
      mediaElements = document.querySelectorAll('li.ResultsGrid-card');
      console.log(`Found ${mediaElements.length} media elements in li.ResultsGrid-card`);
    } else {
      // List view: ol.ResultsList > li
      mediaElements = document.querySelectorAll('ol.ResultsList > li');
      console.log(`Found ${mediaElements.length} media elements in ol.ResultsList > li`);
    }
    
    // DEBUG: If no elements found, try to find what IS on the page
    if (mediaElements.length === 0) {
      console.log("DEBUG: No media elements found, checking page structure...");
      console.log("  - ol.ResultsList > li count:", document.querySelectorAll('ol.ResultsList > li').length);
      console.log("  - li.ResultsGrid-card count:", document.querySelectorAll('li.ResultsGrid-card').length);
      console.log("  - Total li elements:", document.querySelectorAll('li').length);
    }

    mediaElements.forEach((element, index) => {
      let assetId = null;
      let subId = null;

      if (isGridView) {
        // Grid view: Extract from data-asset-id attribute
        const dataAssetDiv = element.querySelector('[data-asset-id]');
        if (dataAssetDiv) {
          assetId = dataAssetDiv.getAttribute('data-asset-id');
        }
        
        // Extract checklist ID from link in ResultsGrid-row
        const checklistLink = element.querySelector('a[href*="/checklist/"]');
        if (checklistLink) {
          const match = checklistLink.href.match(/\/checklist\/(S\d+)/);
          if (match) subId = match[1];
        }
      } else {
        // List view: Extract from image alt attribute
        const img = element.querySelector('img[alt*="ML"]');
        if (img) {
          const altMatch = img.alt.match(/ML(\d+)/);
          if (altMatch) assetId = altMatch[1];
        }
        if (!assetId) {
          const assetLink = element.querySelector('a[href*="/asset/"]');
          if (assetLink) {
            const match = assetLink.href.match(/\/asset\/(\d+)/);
            if (match) assetId = match[1];
          }
        }

        // Extract checklist ID
        const checklistLink = element.querySelector('a[href*="/checklist/"]');
        if (checklistLink) {
          const match = checklistLink.href.match(/\/checklist\/(S\d+)/);
          if (match) subId = match[1];
        }
      }

      // DEBUG: Log first few extractions
      if (index < 3) {
        console.log(`DEBUG Element ${index}:`, {
          assetId,
          subId,
          hasSpeciesCommon: !!element.querySelector('.Species-common'),
          hasSpeciesLink: !!element.querySelector('a[href*="/species/"]'),
          elementClasses: element.className,
          isGridView
        });
      }

      // Need at least asset ID or checklist ID
      if (!assetId && !subId) {
        if (index < 3) console.warn('No asset ID or checklist ID found in element', index);
        return;
      }

      const metadata = extractMetadataFromContainer(element, null, assetId, subId);
      if (metadata && metadata.speciesName && metadata.subId) {
        mediaItems.push(metadata);
        if (index < 3) console.log(`  ✓ Extracted: ${metadata.speciesName}`);
      } else {
        if (index < 3) console.warn(`  ✗ Incomplete metadata for element ${index}:`, metadata);
      }
    });

    // Strategy 2: If no checklist links found, try asset links
    if (mediaItems.length === 0) {
      console.log("No checklist links found, trying asset links...");
      const assetLinks = document.querySelectorAll('a[href*="/catalog/"], a[href*="/asset/"]');
      console.log(`Found ${assetLinks.length} asset links`);

      assetLinks.forEach(link => {
        const href = link.getAttribute('href');
        const assetIdMatch = href.match(/\/(catalog|asset)\/(\d+)/);
        if (!assetIdMatch) return;

        const assetId = assetIdMatch[2];
        let container;
        
        if (isGridView) {
          container = link.closest('[class*="Asset"]') || 
                     link.closest('[class*="Card"]') ||
                     link.closest('article') || 
                     link.closest('div[class]');
        } else {
          container = link.closest('[class*="Result"]') || 
                     link.closest('[class*="Asset"]') || 
                     link.closest('[class*="Media"]') || 
                     link.closest('article') || 
                     link.closest('li') || 
                     link.closest('div[class]');
        }
        
        // Still need to find checklist link within container
        if (container) {
          const checklistLink = container.querySelector('a[href*="/checklist/"]');
          let subId = null;
          if (checklistLink) {
            const match = checklistLink.href.match(/\/checklist\/(S\d+)/);
            if (match) subId = match[1];
          }
          
          const metadata = extractMetadataFromContainer(container, link, assetId, subId);
          if (metadata && metadata.subId) {
            mediaItems.push(metadata);
          }
        }
      });
    }

    console.log(`âœ“ Extracted ${mediaItems.length} media items`);
    
    // Remove duplicates based on assetId (individual photos, not checklists)
    const uniqueItems = Array.from(
      new Map(mediaItems.map(item => [item.assetId, item])).values()
    );
    
    console.log(`âœ“ ${uniqueItems.length} unique media items after deduplication`);
    return uniqueItems;
  }

  /**
   * Fetch checklist details to get location ID
   */
  async function getChecklistDetails(subId) {
    return new Promise((resolve, reject) => {
      browserAPI.runtime.sendMessage(
        { type: "getChecklistDetails", subId },
        (response) => {
          if (browserAPI.runtime.lastError || !response || response.error) {
            reject(new Error(browserAPI.runtime.lastError?.message || response?.error || "Unknown error"));
          } else {
            resolve(response.data);
          }
        }
      );
    });
  }

  /**
   * Fetch location details using location ID
   */
  async function getLocationDetails(locId) {
    return new Promise((resolve, reject) => {
      browserAPI.runtime.sendMessage(
        { type: "getLocationDetails", locId },
        (response) => {
          if (browserAPI.runtime.lastError || !response || response.error) {
            reject(new Error(browserAPI.runtime.lastError?.message || response?.error || "Unknown error"));
          } else {
            resolve(response.data);
          }
        }
      );
    });
  }

  /**
   * Create and inject the map container with species list panel
   */
  function createMapContainer() {
    const container = document.createElement("div");
    container.id = "macaulay-map-container";
    container.innerHTML = `
      <h2>${getMapTitle()}</h2>
      <div id="macaulay-loader" class="macaulay-loader-container">
        <div class="macaulay-spinner"></div>
        <div id="macaulay-loader-text">Loading media locations...</div>
      </div>
      <div id="macaulay-content-wrapper" style="display: none;">
        <div id="macaulay-map-wrapper" style="flex: 0 0 70%; height: 600px;">
          <div id="macaulay-map" style="height: 100%; width: 100%; border: 1px solid #ccc; border-radius: 8px 0 0 8px;"></div>
        </div>
        <div id="macaulay-species-panel" style="flex: 0 0 30%; height: 600px; border: 1px solid #ccc; border-left: none; border-radius: 0 8px 8px 0; background: #f8f9fa; overflow-y: auto;">
          <div style="padding: 1rem; position: sticky; top: 0; background: #f8f9fa; border-bottom: 2px solid #dee2e6; z-index: 1;">
            <h3 style="margin: 0 0 0.5rem 0; font-size: 1.1em; color: #333;">Species Photographed</h3>
            <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
              <input type="text" id="species-search" placeholder="Search species..." style="flex: 1; padding: 0.4rem; border: 1px solid #ccc; border-radius: 4px; font-size: 0.9em;">
              <select id="species-sort" style="padding: 0.4rem; border: 1px solid #ccc; border-radius: 4px; font-size: 0.9em;">
                <option value="taxonomic">Taxonomic</option>
                <option value="alpha">A-Z</option>
                <option value="alpha-desc">Z-A</option>
                <option value="count">Most Photos</option>
                <option value="count-asc">Fewest Photos</option>
                <option value="date">Most Recent</option>
                <option value="date-asc">Oldest</option>
              </select>
            </div>
            <div style="margin-bottom: 0.5rem;">
              <select id="year-filter" style="width: 100%; padding: 0.4rem; border: 1px solid #ccc; border-radius: 4px; font-size: 0.9em;">
                <option value="all">All Years</option>
              </select>
            </div>
            <div id="species-count" style="font-size: 0.85em; color: #666; font-weight: bold;"></div>
          </div>
          <div id="species-list" style="padding: 0.5rem;"></div>
        </div>
      </div>
      <style>
        #macaulay-map-container {
          margin: 2rem 0;
          padding: 1.5rem;
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        #macaulay-map-container h2 {
          margin-top: 0;
          margin-bottom: 1rem;
          color: #333;
          font-size: 1.5em;
        }
        #macaulay-content-wrapper {
          display: flex;
          gap: 0;
          margin-top: 1rem;
        }
        #macaulay-map .leaflet-control-layers label {
          margin: 2px 0 !important;
          padding: 1px 5px !important;
        }
        #macaulay-map .leaflet-control-layers-separator {
          margin: 2px 0 !important;
        }
        /* Lower map z-index so eBird page dropdowns (z-index: 2) appear above */
        #macaulay-map {
          z-index: 0 !important;
        }
        #macaulay-map .leaflet-pane,
        #macaulay-map .leaflet-top,
        #macaulay-map .leaflet-bottom,
        #macaulay-map .leaflet-control-layers,
        #macaulay-map .leaflet-bar,
        #macaulay-map .leaflet-control {
          z-index: 1 !important;
        }
        .macaulay-loader-container {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
          font-weight: bold;
          color: #555;
        }
        .macaulay-spinner {
          width: 20px;
          height: 20px;
          border: 3px solid #f3f3f3;
          border-top: 3px solid #4285f4;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        /* Pulsing outline animation for highlighted circle markers */
        @keyframes pulse-stroke {
          0% {
            stroke-width: 1;
            stroke-opacity: 1;
          }
          50% {
            stroke-width: 6;
            stroke-opacity: 0.3;
          }
          100% {
            stroke-width: 1;
            stroke-opacity: 1;
          }
        }
        .leaflet-interactive.pulse-highlight {
          animation: pulse-stroke 1.5s ease-in-out infinite;
          stroke: #4285f4 !important;
        }
        .macaulay-popup-location {
          font-weight: bold;
          font-size: 1.1em;
          margin-bottom: 6px;
          color: #333;
          border-bottom: 2px solid #4285f4;
          padding-bottom: 4px;
        }
        .macaulay-popup-list {
          max-height: 200px;
          overflow-y: auto;
          font-size: 0.9em;
          margin-top: 8px;
        }
        .macaulay-popup-item {
          margin: 6px 0;
          padding: 6px 0;
          border-bottom: 1px solid #eee;
        }
        .macaulay-popup-item:last-child {
          border-bottom: none;
        }
        .macaulay-popup-item a {
          color: #1a73e8;
          text-decoration: none;
          font-weight: 500;
        }
        .macaulay-popup-item a:hover {
          text-decoration: underline;
        }
        .macaulay-popup-date {
          font-size: 0.85em;
          color: #666;
          font-style: italic;
        }
        .species-item {
          padding: 0.6rem;
          margin-bottom: 0.4rem;
          background: white;
          border-radius: 4px;
          border: 1px solid #dee2e6;
          cursor: pointer;
          transition: all 0.2s;
        }
        .species-item:hover {
          background: #e7f3ff;
          border-color: #4285f4;
          transform: translateX(2px);
        }
        .species-item.filtered {
          display: none;
        }
        .species-name {
          font-weight: 600;
          color: #333;
          font-size: 0.95em;
          margin-bottom: 0.2rem;
        }
        .species-meta {
          font-size: 0.8em;
          color: #666;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .species-count {
          background: #4285f4;
          color: white;
          padding: 0.1rem 0.4rem;
          border-radius: 3px;
          font-weight: 600;
        }
        .species-date {
          font-style: italic;
        }
      </style>
    `;

    // Insert after the h2#results heading if it exists
    const resultsHeading = document.querySelector('h2#results');
    if (resultsHeading) {
      resultsHeading.parentNode.insertBefore(container, resultsHeading.nextSibling);
      console.log("âœ“ Inserted map container after h2#results");
    } else {
      // Fallback: insert at top of main content
      const mainContent = document.querySelector('main, #content, [role="main"], .main-content');
      if (mainContent) {
        mainContent.insertBefore(container, mainContent.firstChild);
        console.log("âœ“ Inserted map container into main content");
      } else {
        // Fallback: insert after header or at top of body
        const header = document.querySelector('header');
        if (header && header.nextSibling) {
          header.parentNode.insertBefore(container, header.nextSibling);
          console.log("âœ“ Inserted map container after header");
        } else {
          document.body.insertBefore(container, document.body.firstChild);
          console.log("âš ï¸ Inserted map container at top of body");
        }
      }
    }

    return container;
  }

  /**
   * Create base map layers
   */
  function createBaseLayers() {
    const googleStreets = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 15,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: "&copy; Google",
    });

    const googleSat = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
      maxZoom: 15,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: "&copy; Google",
    });

    const googleHybrid = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
      maxZoom: 15,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: "&copy; Google",
    });

    const googleTerrain = L.tileLayer('https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
      maxZoom: 15,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: "&copy; Google",
    });

    return {
      "Streets": googleStreets,
      "Hybrid": googleHybrid,
      "Satellite": googleSat,
      "Terrain": googleTerrain
    };
  }

  /**
   * Main execution function
   */
  async function initializeMediaMap() {
    console.log("ðŸ—ºï¸ Initializing Macaulay Library Media Map...");
    
    // Detect which view we're on
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get('view');
    
    // Gallery view (no view param or view=gallery) doesn't have checklist data
    if (!viewParam || viewParam === 'gallery') {
      // Show notification to switch views
      const notification = document.createElement("div");
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        max-width: 400px;
        background: #fff3cd;
        border: 2px solid #ffc107;
        border-radius: 8px;
        padding: 1rem;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      `;
      notification.innerHTML = `
        <div style="display: flex; align-items: start; gap: 0.75rem;">
          <div style="font-size: 24px;">ðŸ“</div>
          <div style="flex: 1;">
            <div style="font-weight: bold; margin-bottom: 0.5rem; color: #333;">eBird Media Mapper</div>
            <div style="font-size: 0.9em; color: #666; margin-bottom: 0.75rem;">
              The gallery view doesn't include location data. Please switch to <strong>Grid View</strong> or <strong>List View</strong> to use the mapping feature.
            </div>
            <button id="close-mapper-notification" style="
              background: #4285f4;
              color: white;
              border: none;
              padding: 0.5rem 1rem;
              border-radius: 4px;
              cursor: pointer;
              font-size: 0.9em;
              font-weight: 500;
            ">Got it</button>
          </div>
        </div>
      `;
      document.body.appendChild(notification);
      
      document.getElementById('close-mapper-notification').addEventListener('click', () => {
        notification.remove();
      });
      
      console.warn("âš ï¸ Gallery view detected - mapping not available");
      return;
    }
    
    console.log(`âœ“ Detected view: ${viewParam || 'list'}`);
    
    // Create map container
    const container = createMapContainer();
    const loaderText = document.getElementById("macaulay-loader-text");

    // Extract media data from the loaded page
    loaderText.textContent = "Extracting media items...";
    const mediaItems = extractMediaData();

    if (mediaItems.length === 0) {
      loaderText.textContent = "No media items with checklist data found on this page.";
      console.warn("âš ï¸ No media items found. Page may need to be scrolled or filters applied.");
      console.log("ðŸ’¡ Try scrolling to load more media, then click the extension again.");
      return;
    }

    console.log(`âœ“ Found ${mediaItems.length} media items to map`);

    // Fetch location data for each media item
    loaderText.textContent = `Fetching locations for ${mediaItems.length} media items...`;
    
    const locationMap = new Map();
    const failedLookups = [];

    for (let i = 0; i < mediaItems.length; i++) {
      const item = mediaItems[i];
      loaderText.textContent = `Processing ${i + 1} / ${mediaItems.length}`;

      try {
        // Step 1: Get checklist to find location ID
        const checklistData = await getChecklistDetails(item.subId);
        
        const locId = checklistData?.locId;
        if (!locId) {
          console.warn(`No locId found for checklist ${item.subId}`);
          failedLookups.push(item);
          continue;
        }

        // Step 2: Get location details using the location ID
        const locationData = await getLocationDetails(locId);
        
        if (locationData && locationData.lat && locationData.lng) {
          const { lat, lng, locName } = locationData;
          const key = `${lat},${lng}`;
          
          if (!locationMap.has(key)) {
            locationMap.set(key, {
              lat,
              lng,
              locName: locName || item.locationName || "Unknown location",
              mediaItems: []
            });
          }
          
          // Add media item to this location
          locationMap.get(key).mediaItems.push({
            subId: item.subId,
            assetId: item.assetId,
            speciesName: cleanSpeciesName(item.speciesName || "Unknown species"),
            dateText: item.dateText || new Date(checklistData.obsDt).toLocaleDateString(),
            checklistUrl: `https://ebird.org/checklist/${item.subId}`,
            mediaType: item.mediaType
          });
        } else {
          console.warn(`No coordinates for location ${locId} (checklist ${item.subId})`);
          failedLookups.push(item);
        }
      } catch (err) {
        console.error(`Failed to fetch location for ${item.subId}:`, err);
        failedLookups.push(item);
      }
    }

    console.log(`âœ“ Mapped ${locationMap.size} unique locations`);
    console.log(`âš ï¸ ${failedLookups.length} items failed to map`);

    // Hide loader and show map + species panel
    document.getElementById("macaulay-loader")?.remove();
    const contentWrapper = document.getElementById("macaulay-content-wrapper");
    if (contentWrapper) contentWrapper.style.display = 'flex';

    // Create the map
    const baseMaps = createBaseLayers();
    const map = L.map("macaulay-map", {
      layers: [baseMaps["Streets"]]
    }).setView([38, -97], 4);

    // Add controls
    L.control.layers(baseMaps).addTo(map);
    map.addControl(new L.Control.Fullscreen());
    L.control.scale({ position: 'bottomleft' }).addTo(map);

    // Create markers
    const points = Array.from(locationMap.values()).sort((a, b) => a.mediaItems.length - b.mediaItems.length);
    
    if (points.length === 0) {
      loaderText.textContent = "Could not map any media items (no location data available).";
      return;
    }

    const maxCount = Math.max(...points.map(p => p.mediaItems.length));
    const colorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([1, maxCount]);

    // Helper function to extract year from date string
    function extractYear(dateText) {
      if (!dateText) return null;
      
      // Try to parse various date formats
      const yearMatch = dateText.match(/\b(19|20)\d{2}\b/);
      if (yearMatch) return parseInt(yearMatch[0]);
      
      // Try parsing as date
      const parsed = new Date(dateText);
      if (!isNaN(parsed.getTime())) {
        return parsed.getFullYear();
      }
      
      return null;
    }

    const markers = [];

    points.forEach(point => {
      const count = point.mediaItems.length;
      const color = colorScale(count);
      
      // Create marker first
      const marker = L.circleMarker([point.lat, point.lng], {
        radius: 8,
        fillColor: color,
        color: "#333",
        weight: 1,
        fillOpacity: 0.9
      });

      // Store point data on marker for filtering
      marker._pointData = point;
      
      // Function to build popup content with optional year filter
      function buildPopupContent(yearFilter = 'all') {
        let filteredItems = point.mediaItems;
        
        // Filter by year if specified
        if (yearFilter !== 'all') {
          const selectedYear = parseInt(yearFilter);
          filteredItems = point.mediaItems.filter(item => {
            const year = extractYear(item.dateText);
            return year === selectedYear;
          });
        }
        
        // If no items match filter, return null (marker should be hidden)
        if (filteredItems.length === 0) {
          return null;
        }
        
        // Group by species, then by date
        const speciesGroups = new Map();
        filteredItems.forEach(item => {
          if (!speciesGroups.has(item.speciesName)) {
            speciesGroups.set(item.speciesName, new Map());
          }
          const dateGroups = speciesGroups.get(item.speciesName);
          if (!dateGroups.has(item.dateText)) {
            dateGroups.set(item.dateText, []);
          }
          dateGroups.get(item.dateText).push(item);
        });
        
        const itemCount = filteredItems.length;
        const speciesCount = speciesGroups.size;
        
        let speciesHtml = '';
        let speciesIndex = 0;
        
        for (const [speciesName, dateGroups] of speciesGroups) {
          const totalPhotos = Array.from(dateGroups.values()).flat().length;
          const dateCount = dateGroups.size;
          
          // Build date summary
          let dateSummary = '';
          if (dateCount === 1) {
            const [date, photos] = Array.from(dateGroups.entries())[0];
            dateSummary = `${date} (${totalPhotos} photo${totalPhotos > 1 ? 's' : ''})`;
          } else {
            dateSummary = Array.from(dateGroups.entries())
              .map(([date, photos]) => `${date} (${photos.length})`)
              .join(' | ');
          }
          
          // Create expandable row
          speciesHtml += `
            <div class="species-group" data-species-index="${speciesIndex}">
              <div class="species-header" style="cursor: pointer; padding: 4px 0; border-bottom: 1px solid #eee;">
                <span class="expand-icon" style="display: inline-block; width: 12px; font-size: 10px;">▶</span>
                <strong>${speciesName}</strong> - ${dateSummary}
              </div>
              <div class="species-photos" style="display: none; padding-left: 16px; margin-top: 4px;">
          `;
          
          // Add individual photo links (hidden by default)
          for (const [date, photos] of dateGroups) {
            photos.forEach((photo, photoIndex) => {
              speciesHtml += `
                <div style="padding: 2px 0;">
                  • <span class="media-link" data-asset-id="${photo.assetId}" style="color: #1a73e8; cursor: pointer; text-decoration: underline; font-size: 0.9em;">Photo ${photoIndex + 1}</span>
                  <span style="color: #666; font-size: 0.85em;">(${date})</span>
                </div>
              `;
            });
          }
          
          speciesHtml += `
              </div>
            </div>
          `;
          
          speciesIndex++;
        }
        
        return `
          <div class="macaulay-popup-location">${point.locName}</div>
          <div style="margin-bottom: 8px;"><strong>${speciesCount} species</strong> • ${itemCount} photo${itemCount > 1 ? 's' : ''}</div>
          <div class="macaulay-popup-list">
            ${speciesHtml}
          </div>
        `;
      }
      
      // Set initial popup content
      const initialContent = buildPopupContent('all');
      marker.bindPopup(initialContent);
      
      // Store the build function on the marker for later use
      marker._buildPopupContent = buildPopupContent;

      // Add click handler to popup links after popup opens
      marker.on('popupopen', function() {
        const popup = marker.getPopup();
        const popupElement = popup.getElement();
        
        console.log('Popup opened for location:', point.locName);
        
        // Add expand/collapse functionality to species headers
        const speciesHeaders = popupElement.querySelectorAll('.species-header');
        speciesHeaders.forEach(header => {
          header.addEventListener('click', function(e) {
            e.stopPropagation();
            
            const speciesGroup = this.parentElement;
            const photosDiv = speciesGroup.querySelector('.species-photos');
            const expandIcon = this.querySelector('.expand-icon');
            
            if (photosDiv.style.display === 'none') {
              photosDiv.style.display = 'block';
              expandIcon.textContent = '▼';
            } else {
              photosDiv.style.display = 'none';
              expandIcon.textContent = '▶';
            }
          });
        });
        
        // Find all media links in the popup
        const mediaLinks = popupElement.querySelectorAll('.media-link');
        console.log(`Found ${mediaLinks.length} media links in popup`);
        
        mediaLinks.forEach((link, idx) => {
          link.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const assetId = this.dataset.assetId;
            console.log(`Clicked photo: Asset ID = ${assetId}`);
            
            // Find the image element with this asset ID in its alt text
            // The lightbox opens when you click the image, not the link
            const imageElement = document.querySelector(`img[alt*="ML${assetId}"]`);
            
            if (imageElement) {
              console.log('✓ Found image element:', imageElement);
              console.log('  Image src:', imageElement.src);
              console.log('  Image alt:', imageElement.alt);
              
              // Click the image to open lightbox (no scrolling - stays on map)
              console.log('Clicking image...');
              imageElement.click();
            } else {
              console.error(`✗ Could not find image for asset ${assetId}`);
              // Try alternate selector
              const altImage = document.querySelector(`img[src*="${assetId}"]`);
              if (altImage) {
                console.log('Found image via src selector:', altImage);
              }
            }
          });
        });
      });

      marker.addTo(map);
      markers.push(marker);
    });

    // Fit map to show all markers
    if (markers.length > 0) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.2));
    }

    // Build species list from all media items
    const speciesMap = new Map();
    const yearsSet = new Set();
    
    points.forEach(point => {
      point.mediaItems.forEach(item => {
        const speciesName = cleanSpeciesName(item.speciesName);
        
        // Extract year from date
        const year = extractYear(item.dateText);
        if (year) yearsSet.add(year);
        
        if (!speciesMap.has(speciesName)) {
          speciesMap.set(speciesName, {
            name: speciesName,
            count: 0,
            dates: [],
            years: new Set(),
            checklists: []
          });
        }
        const species = speciesMap.get(speciesName);
        species.count++;
        species.dates.push(item.dateText);
        if (year) species.years.add(year);
        species.checklists.push(item.checklistUrl);
      });
    });

    // Helper function to extract year from date string
    function extractYear(dateText) {
      if (!dateText) return null;
      
      // Try to parse various date formats
      const yearMatch = dateText.match(/\b(19|20)\d{2}\b/);
      if (yearMatch) return parseInt(yearMatch[0]);
      
      // Try parsing as date
      const parsed = new Date(dateText);
      if (!isNaN(parsed.getTime())) {
        return parsed.getFullYear();
      }
      
      return null;
    }

    // Populate year filter dropdown
    const yearFilter = document.getElementById('year-filter');
    const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);
    sortedYears.forEach(year => {
      const option = document.createElement('option');
      option.value = year;
      option.textContent = year;
      yearFilter.appendChild(option);
    });

    // Convert species map to array
    let speciesList = Array.from(speciesMap.values()).map(species => ({
      ...species,
      years: Array.from(species.years)
    }));

    // Function to check if a species is a hybrid or sp.
    function isHybridOrSp(speciesName) {
      const nameLower = speciesName.toLowerCase();
      return nameLower.includes('hybrid') || 
             nameLower.includes(' x ') || 
             nameLower.includes(' sp.') ||
             nameLower.includes(' sp ') ||
             nameLower.endsWith(' sp');
    }

    // Function to get taxonomic order for a species
    function getTaxonOrder(speciesName) {
      if (!ebirdTaxonomy) return 999999;
      
      // Check if hybrid or sp. - these go to end
      if (isHybridOrSp(speciesName)) {
        return 999999;
      }
      
      // Clean the name and try exact match first
      const cleanName = speciesName.trim();
      let taxon = ebirdTaxonomy.find(t => t.comName === cleanName);
      
      // Try case-insensitive match
      if (!taxon) {
        taxon = ebirdTaxonomy.find(t => 
          t.comName.toLowerCase() === cleanName.toLowerCase()
        );
      }
      
      // Try matching without special characters/extra spaces
      if (!taxon) {
        const normalizedName = cleanName.replace(/[^a-zA-Z\s]/g, '').replace(/\s+/g, ' ').toLowerCase();
        taxon = ebirdTaxonomy.find(t => 
          t.comName.replace(/[^a-zA-Z\s]/g, '').replace(/\s+/g, ' ').toLowerCase() === normalizedName
        );
      }
      
      if (taxon) {
        return taxon.taxonOrder;
      } else {
        console.warn(`No taxonomy match for: "${speciesName}"`);
        return 999999;
      }
    }

    // Separate into regular species and hybrids/sp.
    const regularSpecies = speciesList.filter(sp => !isHybridOrSp(sp.name));
    const hybridsAndSp = speciesList.filter(sp => isHybridOrSp(sp.name));

    // Sort regular species by taxonomic order
    regularSpecies.sort((a, b) => getTaxonOrder(a.name) - getTaxonOrder(b.name));
    
    // Sort hybrids/sp. alphabetically within their group
    hybridsAndSp.sort((a, b) => a.name.localeCompare(b.name));
    
    // Combine: regular species first, then hybrids/sp.
    speciesList = [...regularSpecies, ...hybridsAndSp];
    
    console.log("Sample species with taxon orders:");
    regularSpecies.slice(0, 5).forEach(sp => {
      console.log(`  ${sp.name}: ${getTaxonOrder(sp.name)}`);
    });
    if (hybridsAndSp.length > 0) {
      console.log("Hybrids and sp.:");
      hybridsAndSp.forEach(sp => {
        console.log(`  ${sp.name}`);
      });
    }
    
    // Function to render the species list and update map
    function renderSpeciesList(filteredList, selectedYear = 'all', searchTerm = '') {
      const listContainer = document.getElementById("species-list");
      const countDisplay = document.getElementById("species-count");
      
      // Filter by year if selected
      let displayList = filteredList;
      if (selectedYear !== 'all') {
        displayList = filteredList.filter(species => 
          species.years.includes(parseInt(selectedYear))
        );
      }
      
      // Count regular species vs hybrids/sp.
      const regularSpecies = displayList.filter(sp => !isHybridOrSp(sp.name));
      const hybridsSp = displayList.filter(sp => isHybridOrSp(sp.name));
      
      // Further separate hybrids from sp.
      const hybrids = hybridsSp.filter(sp => {
        const nameLower = sp.name.toLowerCase();
        return nameLower.includes('hybrid') || nameLower.includes(' x ');
      });
      const spOnly = hybridsSp.filter(sp => {
        const nameLower = sp.name.toLowerCase();
        return !nameLower.includes('hybrid') && !nameLower.includes(' x ');
      });
      
      // Build count display
      let countText = `${regularSpecies.length} species`;
      if (hybrids.length > 0) {
        countText += ` • ${hybrids.length} hybrid${hybrids.length > 1 ? 's' : ''}`;
      }
      if (spOnly.length > 0) {
        countText += ` • ${spOnly.length} sp.`;
      }
      countDisplay.textContent = countText;
      
      // Get set of species names that should be visible
      const visibleSpeciesNames = new Set(displayList.map(s => s.name));
      
      // Update map markers visibility, popup content, and bounds
      let visibleMarkers = [];
      markers.forEach(marker => {
        // Regenerate popup content with year filter
        const newPopupContent = marker._buildPopupContent(selectedYear);
        
        // If no content (no media items match the year filter), hide marker
        if (!newPopupContent) {
          if (map.hasLayer(marker)) {
            map.removeLayer(marker);
          }
          return;
        }
        
        // Update popup content
        marker.setPopupContent(newPopupContent);
        
        // Check if this marker contains any visible species
        let hasVisibleSpecies = false;
        visibleSpeciesNames.forEach(speciesName => {
          if (newPopupContent.includes(speciesName)) {
            hasVisibleSpecies = true;
          }
        });
        
        // Show/hide marker based on filter
        if (hasVisibleSpecies) {
          if (!map.hasLayer(marker)) {
            marker.addTo(map);
          }
          visibleMarkers.push(marker);
        } else {
          if (map.hasLayer(marker)) {
            map.removeLayer(marker);
          }
        }
      });
      
      // Fit map to visible markers
      if (visibleMarkers.length > 0) {
        const group = L.featureGroup(visibleMarkers);
        map.fitBounds(group.getBounds().pad(0.2));
      }
      
      // Separate regular species from hybrids/sp. for display
      const regularDisplay = displayList.filter(sp => !isHybridOrSp(sp.name));
      const hybridsDisplay = displayList.filter(sp => isHybridOrSp(sp.name));
      
      let html = '';
      
      // Render regular species
      html += regularDisplay.map(species => {
        const mostRecentDate = species.dates[species.dates.length - 1];
        return `
          <div class="species-item" data-species="${species.name}">
            <div class="species-name">${species.name}</div>
            <div class="species-meta">
              <span class="species-date">${mostRecentDate}</span>
              <span class="species-count">${species.count}</span>
            </div>
          </div>
        `;
      }).join('');
      
      // Add separator and hybrids/sp. section if there are any
      if (hybridsDisplay.length > 0) {
        html += `
          <div style="margin: 1rem 0 0.5rem 0; padding: 0.5rem; background: #e9ecef; border-radius: 4px; font-weight: bold; font-size: 0.9em; color: #495057;">
            Hybrids and Sp.
          </div>
        `;
        
        html += hybridsDisplay.map(species => {
          const mostRecentDate = species.dates[species.dates.length - 1];
          return `
            <div class="species-item" data-species="${species.name}">
              <div class="species-name">${species.name}</div>
              <div class="species-meta">
                <span class="species-date">${mostRecentDate}</span>
                <span class="species-count">${species.count}</span>
              </div>
            </div>
          `;
        }).join('');
      }
      
      listContainer.innerHTML = html;
      
      // Add click handlers to zoom to species locations
      listContainer.querySelectorAll('.species-item').forEach(item => {
        item.addEventListener('click', () => {
          const speciesName = item.dataset.species;
          
          // Remove pulse effect from all markers first
          markers.forEach(marker => {
            const path = marker.getElement();
            if (path) {
              path.classList.remove('pulse-highlight');
            }
          });
          
          // Find all markers with this species
          const speciesMarkers = markers.filter(marker => {
            const popup = marker.getPopup();
            const content = popup.getContent();
            return content && content.includes(speciesName) && map.hasLayer(marker);
          });
          
          if (speciesMarkers.length > 0) {
            // Add pulse effect to species markers
            speciesMarkers.forEach(marker => {
              const path = marker.getElement();
              if (path) {
                path.classList.add('pulse-highlight');
              }
            });
            
            // Remove pulse effect after 5 seconds
            setTimeout(() => {
              speciesMarkers.forEach(marker => {
                const path = marker.getElement();
                if (path) {
                  path.classList.remove('pulse-highlight');
                }
              });
            }, 5000);
            
            // If single location, zoom to it and open popup
            if (speciesMarkers.length === 1) {
              map.setView(speciesMarkers[0].getLatLng(), 12);
              speciesMarkers[0].openPopup();
            } else {
              // Multiple locations, fit bounds to show all
              const group = L.featureGroup(speciesMarkers);
              map.fitBounds(group.getBounds().pad(0.2));
            }
          }
        });
      });
    }
    
    // Initial render
    renderSpeciesList(speciesList);
    
    // Search functionality
    const searchInput = document.getElementById('species-search');
    const sortSelect = document.getElementById('species-sort');
    const yearFilterSelect = document.getElementById('year-filter');
    
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      const selectedYear = yearFilterSelect.value;
      const filtered = speciesList.filter(species => 
        species.name.toLowerCase().includes(searchTerm)
      );
      renderSpeciesList(filtered, selectedYear, searchTerm);
    });
    
    // Year filter functionality
    yearFilterSelect.addEventListener('change', (e) => {
      const selectedYear = e.target.value;
      const searchTerm = searchInput.value.toLowerCase();
      const filtered = speciesList.filter(species => 
        species.name.toLowerCase().includes(searchTerm)
      );
      renderSpeciesList(filtered, selectedYear, searchTerm);
    });
    
    // Sort functionality
    sortSelect.addEventListener('change', (e) => {
      const sortType = e.target.value;
      
      // Separate species into regular and hybrids/sp.
      const regularSpecies = speciesList.filter(sp => !isHybridOrSp(sp.name));
      const hybridsAndSp = speciesList.filter(sp => isHybridOrSp(sp.name));
      
      switch(sortType) {
        case 'taxonomic':
          if (ebirdTaxonomy) {
            regularSpecies.sort((a, b) => getTaxonOrder(a.name) - getTaxonOrder(b.name));
            hybridsAndSp.sort((a, b) => a.name.localeCompare(b.name));
          } else {
            alert('Taxonomy data not available. Defaulting to alphabetical.');
            regularSpecies.sort((a, b) => a.name.localeCompare(b.name));
            hybridsAndSp.sort((a, b) => a.name.localeCompare(b.name));
          }
          break;
        case 'alpha':
          regularSpecies.sort((a, b) => a.name.localeCompare(b.name));
          hybridsAndSp.sort((a, b) => a.name.localeCompare(b.name));
          break;
        case 'alpha-desc':
          regularSpecies.sort((a, b) => b.name.localeCompare(a.name));
          hybridsAndSp.sort((a, b) => b.name.localeCompare(a.name));
          break;
        case 'count':
          regularSpecies.sort((a, b) => b.count - a.count);
          hybridsAndSp.sort((a, b) => b.count - a.count);
          break;
        case 'count-asc':
          regularSpecies.sort((a, b) => a.count - b.count);
          hybridsAndSp.sort((a, b) => a.count - b.count);
          break;
        case 'date':
          regularSpecies.sort((a, b) => {
            // Most recent first
            const dateA = new Date(a.dates[a.dates.length - 1]);
            const dateB = new Date(b.dates[b.dates.length - 1]);
            return dateB - dateA;
          });
          hybridsAndSp.sort((a, b) => {
            // Most recent first
            const dateA = new Date(a.dates[a.dates.length - 1]);
            const dateB = new Date(b.dates[b.dates.length - 1]);
            return dateB - dateA;
          });
          break;
        case 'date-asc':
          regularSpecies.sort((a, b) => {
            // Oldest first
            const dateA = new Date(a.dates[a.dates.length - 1]);
            const dateB = new Date(b.dates[b.dates.length - 1]);
            return dateA - dateB;
          });
          hybridsAndSp.sort((a, b) => {
            // Oldest first
            const dateA = new Date(a.dates[a.dates.length - 1]);
            const dateB = new Date(b.dates[b.dates.length - 1]);
            return dateA - dateB;
          });
          break;
      }
      
      // Recombine with hybrids/sp. always at the end
      speciesList = [...regularSpecies, ...hybridsAndSp];
      
      // Re-apply current filters (sorting doesn't affect map display)
      const searchTerm = searchInput.value.toLowerCase();
      const selectedYear = yearFilterSelect.value;
      const filtered = speciesList.filter(species => 
        species.name.toLowerCase().includes(searchTerm)
      );
      renderSpeciesList(filtered, selectedYear, searchTerm);
    });

    // Add legend
    const legend = L.control({ position: "bottomright" });
    legend.onAdd = function () {
      const div = L.DomUtil.create("div", "info legend");
      div.innerHTML = `
        <strong>Media Count</strong><br>
        <canvas id="macaulay-legend-canvas" width="100" height="10"></canvas><br>
        <div style="display: flex; justify-content: space-between;">
          <span>1</span><span>${maxCount}</span>
        </div>
      `;
      return div;
    };
    legend.addTo(map);

    // Draw gradient legend
    setTimeout(() => {
      const canvas = document.getElementById("macaulay-legend-canvas");
      if (canvas) {
        const ctx = canvas.getContext("2d");
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
        for (let i = 0; i <= 1; i += 0.01) {
          gradient.addColorStop(i, colorScale(1 + i * (maxCount - 1)));
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }, 100);

    // Show warning for failed lookups
    if (failedLookups.length > 0) {
      const warning = document.createElement("div");
      warning.style = "background: #fff3cd; border: 1px solid #ffeeba; padding: 10px; margin-top: 10px; border-radius: 4px; font-size: 0.9em;";
      warning.innerHTML = `
        <strong>Note:</strong> ${failedLookups.length} media item${failedLookups.length > 1 ? 's' : ''} could not be mapped (no location data available).
      `;
      container.appendChild(warning);
    }

    console.log(`âœ… Media map created successfully!`);
    console.log(`   - ${points.length} locations`);
    console.log(`   - ${mediaItems.length - failedLookups.length} media items mapped`);
    console.log(`   - ${failedLookups.length} items failed`);
  }

  // Initialize the map
  await initializeMediaMap();

})();
