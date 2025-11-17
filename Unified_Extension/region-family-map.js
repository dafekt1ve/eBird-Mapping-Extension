// region-family-map.js - Map bird family diversity on eBird region pages

(async function() {
  "use strict";

  try {
    console.log("=== REGION FAMILY MAP SCRIPT STARTED ===");
    console.log("Current URL:", window.location.href);
    console.log("Pathname:", window.location.pathname);

    // Cross-browser API compatibility
    let extensionAPI;
    try {
      extensionAPI = typeof browser !== 'undefined' ? browser : chrome;
      console.log("Using API:", typeof browser !== 'undefined' ? "browser" : "chrome");
    } catch (e) {
      console.error("Error setting up extension API:", e);
      extensionAPI = chrome;
      console.log("Falling back to chrome API");
    }

    // Only run on region pages
    if (!window.location.pathname.includes('/region/')) {
      console.log("Not a region page, exiting.");
      return;
    }
    console.log("✓ Confirmed this is a region page");

  // Extract region code from URL
  const regionMatch = window.location.pathname.match(/\/region\/([^\/\?]+)/);
  if (!regionMatch) {
    console.log("Could not extract region code from URL.");
    return;
  }
  const regionCode = regionMatch[1];
  console.log("✓ Region code extracted:", regionCode);

  // Block world-level region (causes discovery API errors)
  if (regionCode === 'world') {
    console.log("❌ World-level regions not supported");
    
    // Show a friendly message to the user
    const message = document.createElement('div');
    message.style.cssText = `
      padding: 20px;
      margin: 20px 0;
      background: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 8px;
      color: #856404;
      font-weight: 600;
    `;
    message.innerHTML = `
      <strong>⚠️ Family Diversity Map Not Available for World</strong><br>
      This feature works best for countries, states, provinces, and sub-regions.<br>
      Please navigate to a specific region (e.g., <a href="https://ebird.org/region/US">United States</a> or <a href="https://ebird.org/region/US-CO">Colorado</a>) to use this tool.
    `;
    
    const anchor = document.querySelector(".OverviewSectionWrapper");
    if (anchor) {
      anchor.parentNode.insertBefore(message, anchor);
    }
    
    return; // Exit script
  }

  // Check if map already exists
  const existing = document.getElementById("family-map-container");
  if (existing) {
    console.log("Family map already exists, removing it first.");
    existing.remove();
  }
  console.log("✓ No existing map, proceeding...");

  // Create the container and UI
  const container = document.createElement("div");
  container.id = "family-map-container";
  container.innerHTML = `
    <style>
      #family-map-container {
        margin: 20px 0;
      }
      #family-map .leaflet-control-layers label {
        margin: 2px 0 !important;
        padding: 1px 5px !important;
      }
      #family-map .leaflet-control-layers-separator {
        margin: 2px 0 !important;
      }
      #family-map-loader {
        display: none;
        align-items: center;
        gap: 10px;
        padding: 10px 15px;
        background: #fff3cd;
        border: 1px solid #ffc107;
        border-radius: 8px 8px 0 0;
        font-weight: 600;
        color: #856404;
      }
      .family-spinner {
        width: 20px;
        height: 20px;
        border: 3px solid #f3f3f3;
        border-top: 3px solid #28a745;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      #family-map {
        height: 600px;
        width: 100%;
        border: 1px solid #dee2e6;
        border-radius: 8px;
        z-index: 0;
      }
      .leaflet-popup-content {
        max-height: 300px;
        overflow-y: auto;
      }
      .species-list {
        margin: 5px 0 0 0;
        padding-left: 20px;
      }
      .species-list li {
        margin: 3px 0;
        font-size: 13px;
      }
      .map-legend {
        position: absolute;
        bottom: 30px;
        right: 10px;
        background: white;
        padding: 10px;
        border-radius: 5px;
        box-shadow: 0 0 15px rgba(0,0,0,0.2);
        z-index: 1000;
        font-size: 12px;
        min-width: 200px;
      }
      .legend-title {
        font-weight: bold;
        margin-bottom: 8px;
        text-align: center;
      }
      .legend-gradient {
        height: 20px;
        background: linear-gradient(to right,
          #ffffcc 0%, #ffeda0 12.5%, #fed976 25%, #feb24c 37.5%,
          #fd8d3c 50%, #fc4e2a 62.5%, #e31a1c 75%, #bd0026 87.5%, #800026 100%);
        border: 1px solid #999;
        border-radius: 3px;
      }
      .legend-labels {
        display: flex;
        justify-content: space-between;
        margin-top: 3px;
        font-size: 11px;
      }
      .species-list {
        margin: 5px 0 0 0;
        padding-left: 20px;
        line-height: 1.3;
      }
      .species-list li {
        margin: 1px 0;
        font-size: 13px;
      }
    </style>

    <div id="family-map-loader">
      <div class="family-spinner"></div>
      <span id="loader-text">Loading...</span>
    </div>

    <div id="family-map"></div>
  `;

  // Insert before OverviewSectionWrapper
  const anchor = document.querySelector(".OverviewSectionWrapper");
  if (!anchor) {
    console.error("❌ Could not find OverviewSectionWrapper anchor!");
    console.log("Available elements on page:");
    console.log("- .Overview:", document.querySelector(".Overview"));
    console.log("- .PageContent:", document.querySelector(".PageContent"));
    console.log("- body children:", document.body.children);
    return;
  }
  console.log("✓ Found anchor element:", anchor);
  
  anchor.parentNode.insertBefore(container, anchor);
  console.log("✓ Container inserted into page!");

  // Verify it's actually in the DOM
  const verify = document.getElementById("family-map-container");
  if (verify) {
    console.log("✓ Container verified in DOM");
  } else {
    console.error("❌ Container not found in DOM after insertion!");
    return;
  }

  // Function to load script dynamically
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = extensionAPI.runtime.getURL(src);
      script.onload = () => {
        console.log(`✓ Loaded: ${src}`);
        resolve();
      };
      script.onerror = () => {
        console.error(`❌ Failed to load: ${src}`);
        reject(new Error(`Failed to load ${src}`));
      };
      document.head.appendChild(script);
    });
  }

  // Function to load CSS dynamically
  function loadCSS(href) {
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = extensionAPI.runtime.getURL(href);
      link.onload = () => {
        console.log(`✓ Loaded CSS: ${href}`);
        resolve();
      };
      link.onerror = () => {
        console.error(`❌ Failed to load CSS: ${href}`);
        reject(new Error(`Failed to load ${href}`));
      };
      document.head.appendChild(link);
    });
  }

  // Load Leaflet and dependencies
  console.log("Loading Leaflet libraries...");
  await loadCSS("leaflet/leaflet.css");
  await loadCSS("leaflet/leaflet.fullscreen.css");
  await loadScript("leaflet/leaflet.js");
  await loadScript("leaflet/leaflet.fullscreen.min.js");
  console.log("✓ All Leaflet libraries loaded");

  // Extract region bounds from hotspots map link
  function getRegionBounds() {
    try {
      // Look for the PlaceLinks div with the Map button
      const mapLink = document.querySelector('.PlaceLinks a[href*="hotspots"]');
      if (!mapLink) {
        console.log("No hotspots map link found, using default bounds");
        return null;
      }

      const href = mapLink.href;
      console.log("Found map link:", href);

      // Extract lat/lng from URL parameters (env.minX, env.maxX, env.minY, env.maxY)
      const urlParams = new URLSearchParams(href.split('?')[1]);
      const minX = parseFloat(urlParams.get('env.minX'));
      const maxX = parseFloat(urlParams.get('env.maxX'));
      const minY = parseFloat(urlParams.get('env.minY'));
      const maxY = parseFloat(urlParams.get('env.maxY'));

      if (minX && maxX && minY && maxY) {
        console.log("✓ Extracted bounds:", { minX, maxX, minY, maxY });
        // Return as [[south, west], [north, east]]
        return [[minY, minX], [maxY, maxX]];
      }

      return null;
    } catch (error) {
      console.error("Error extracting bounds:", error);
      return null;
    }
  }

  // Get region-specific species list from bird-list page (excluding exotics)
  async function getRegionSpeciesList() {
    try {
      console.log("Fetching region bird list...");
      const birdListURL = `https://ebird.org/region/${regionCode}/bird-list`;
      const response = await fetch(birdListURL);
      
      if (!response.ok) {
        console.warn("Could not fetch bird list, using all species");
        return null;
      }

      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Extract species codes from the bird list page
      // Exclude exotics and additional taxa
      const speciesCodes = new Set();
      
      // eBird uses specific section IDs or classes for different lists
      // Try multiple strategies to identify the main species list
      
      // Strategy 1: Look for the main species table/section (not in exotic sections)
      // Find all species links
      const allLinks = Array.from(doc.querySelectorAll('a[href*="/species/"]'));
      
      // Strategy 2: Stop adding species when we hit "Exotics" or similar headers
      let inMainSection = true;
      let exoticsSectionFound = false;
      
      // Look through all text nodes and elements to find section markers
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
      const sectionsToSkip = [];
      
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const text = node.textContent?.toLowerCase() || '';
        
        // Check if this is a section header
        if ((node.tagName === 'H3' || node.tagName === 'H2' || node.tagName === 'H4') &&
            (text.includes('exotic') || text.includes('additional taxa') || 
             text.includes('provisional') || text.includes('escapee'))) {
          // Mark this section to skip
          sectionsToSkip.push(node);
          console.log("Found exotic/additional section:", text.trim());
        }
      }
      
      // Now filter species links
      allLinks.forEach(link => {
        let shouldInclude = true;
        
        // Check if this link comes after any "skip" sections
        for (const skipSection of sectionsToSkip) {
          // Check if link is a descendant of or comes after the skip section
          if (skipSection.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING) {
            // The link comes after this skip section
            // Check if there's a main section header between them
            let hasMainSectionBetween = false;
            
            // Simple heuristic: if we found an exotic section, skip everything after it
            // unless there's clear evidence of a new main section
            shouldInclude = false;
            break;
          }
        }
        
        // Also check: if link text or parent contains "exotic" or "introduced"
        const linkText = link.textContent?.toLowerCase() || '';
        const parentText = link.parentElement?.textContent?.toLowerCase() || '';
        
        if (linkText.includes('exotic') || linkText.includes('domestic') ||
            parentText.includes('(exotic)') || parentText.includes('(domestic)')) {
          shouldInclude = false;
        }
        
        if (shouldInclude) {
          const match = link.href.match(/\/species\/([a-z0-9]+)/i);
          if (match) {
            speciesCodes.add(match[1]);
          }
        }
      });

      console.log(`✓ Found ${speciesCodes.size} species in ${regionCode} (excluding exotics)`);
      console.log("Sample species codes:", Array.from(speciesCodes).slice(0, 10));
      console.log("Exotic sections found:", sectionsToSkip.length);
      
      // Debug: check if any problematic species made it through
      const problematicSpecies = ['gocass1', 'emu1', 'y00478', 'y00934']; // Cassowary, Emu codes
      const foundProblematic = problematicSpecies.filter(code => speciesCodes.has(code));
      if (foundProblematic.length > 0) {
        console.warn("⚠️ Found exotic species that should be filtered:", foundProblematic);
      }
      
      return speciesCodes;
    } catch (error) {
      console.error("Error fetching region species list:", error);
      return null;
    }
  }

  // Initialize Leaflet map
  console.log("Initializing Leaflet map...");
  
  const bounds = getRegionBounds();
  let map;
  
  if (bounds) {
    map = L.map("family-map").fitBounds(bounds);
    console.log("✓ Map initialized and zoomed to region bounds");
  } else {
    map = L.map("family-map").setView([39.5, -98.35], 4); // Default US center
    console.log("✓ Map initialized with default view");
  }
  
  // Add base layers
  console.log("Adding base layers...");
  const googleStreets = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    maxZoom: 18,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: "&copy; Google"
  }).addTo(map);

  const googleSat = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    maxZoom: 18,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: "&copy; Google"
  });

  const googleHybrid = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
    maxZoom: 18,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: "&copy; Google"
  });

  const googleTerrain = L.tileLayer('https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
    maxZoom: 18,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: "&copy; Google"
  });

  // Marker layer
  const markerLayer = L.layerGroup().addTo(map);

  // Layer control
  const baseMaps = {
    "Streets": googleStreets,
    "Hybrid": googleHybrid,
    "Satellite": googleSat,
    "Terrain": googleTerrain
  };

  const overlayMaps = {
    "Markers": markerLayer
  };

  L.control.layers(baseMaps, overlayMaps).addTo(map);

  // Add fullscreen control
  L.control.fullscreen({
    position: 'topleft',
    title: 'Enter fullscreen',
    titleCancel: 'Exit fullscreen'
  }).addTo(map);

  L.control.scale({ position: 'bottomleft' }).addTo(map);

  // Track user interaction with map (zoom or pan)
  map._userHasInteracted = false;

  map.on('zoomend', function() {
    map._userHasInteracted = true;
  });

  map.on('moveend', function() {
    map._userHasInteracted = true;
  });

  // UI elements (will be populated by control)
  let familySelector = null;
  let daysSelector = null;
  let runButton = null;
  const loader = document.getElementById("family-map-loader");
  const loaderText = document.getElementById("loader-text");

  // Create family control (will be populated after taxonomy loads)
  const FamilyControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function () {
      const wrapper = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
      wrapper.style.background = 'white';

      // Create toggle button with filter icon
      const toggleBtn = L.DomUtil.create('button', '', wrapper);
      toggleBtn.innerHTML = '&#9776;'; // Hamburger/filter icon
      toggleBtn.style.cssText = 'width: 30px; height: 30px; border: none; background: #f4f4f4; cursor: pointer; font-size: 18px;';
      toggleBtn.title = 'Toggle filters';

      // Create content container (initially visible)
      const content = L.DomUtil.create('div', '', wrapper);
      content.style.cssText = 'display: block; padding: 10px; background: white; border-top: 1px solid #ccc; max-width: 350px;';

      const familyDiv = L.DomUtil.create('div', '', content);
      familyDiv.style.marginBottom = '8px';

      const familyLabel = L.DomUtil.create('label', '', familyDiv);
      familyLabel.textContent = 'Bird Family: ';
      familyLabel.style.fontWeight = 'bold';
      familyLabel.style.marginRight = '8px';
      familyLabel.style.display = 'block';
      familyLabel.style.marginBottom = '4px';

      const familySelect = L.DomUtil.create('select', '', familyDiv);
      familySelect.id = 'family-selector';
      familySelect.style.all = 'revert';
      familySelect.style.width = '100%';
      familySelect.innerHTML = '<option value="">Loading families...</option>';

      const daysDiv = L.DomUtil.create('div', '', content);
      daysDiv.style.marginBottom = '8px';

      const daysLabel = L.DomUtil.create('label', '', daysDiv);
      daysLabel.textContent = 'Time Range: ';
      daysLabel.style.fontWeight = 'bold';
      daysLabel.style.marginRight = '8px';
      daysLabel.style.display = 'block';
      daysLabel.style.marginBottom = '4px';

      const daysSelect = L.DomUtil.create('select', '', daysDiv);
      daysSelect.id = 'days-selector';
      daysSelect.style.all = 'revert';
      daysSelect.style.width = '100%';
      daysSelect.innerHTML = `
        <option value="30" selected>Last 30 days</option>
        <option value="21">Last 3 weeks</option>
        <option value="14">Last 2 weeks</option>
        <option value="7">Last 1 week</option>
        <option value="3">Last 3 days</option>
        <option value="1">Last 1 day</option>
      `;

      const button = L.DomUtil.create('button', '', content);
      button.id = 'run-family-map';
      button.textContent = 'Show Map';
      button.style.all = 'revert';
      button.style.padding = '8px 16px';
      button.style.background = '#28a745';
      button.style.color = 'white';
      button.style.fontWeight = '600';
      button.style.cursor = 'pointer';
      button.style.border = 'none';
      button.style.borderRadius = '4px';
      button.style.width = '100%';

      L.DomEvent.disableClickPropagation(wrapper);

      // Toggle functionality
      L.DomEvent.on(toggleBtn, 'click', (e) => {
        e.stopPropagation();
        if (content.style.display === 'none') {
          content.style.display = 'block';
          toggleBtn.style.background = '#f4f4f4';
        } else {
          content.style.display = 'none';
          toggleBtn.style.background = 'white';
        }
      });

      // Collapse panel when "Show Map" is clicked
      L.DomEvent.on(button, 'click', () => {
        content.style.display = 'none';
        toggleBtn.style.background = 'white';
      });

      // Store references for later use
      familySelector = familySelect;
      daysSelector = daysSelect;
      runButton = button;

      return wrapper;
    }
  });

  map.addControl(new FamilyControl());

  // Fetch eBird taxonomy and populate family selector
  let taxonomyData = [];
  let familyLookup = {}; // Maps speciesCode -> family info
  let regionSpeciesCodes = null; // Will hold region-specific species if available

  async function loadTaxonomy() {
    try {
      console.log("=== LOADING TAXONOMY ===");
      loaderText.textContent = "Loading bird families...";
      loader.style.display = "flex";

      // Try to get region-specific species list first
      regionSpeciesCodes = await getRegionSpeciesList();

      // Load taxonomy from local file bundled with extension
      const taxonomyURL = extensionAPI.runtime.getURL("ebird-taxonomy.json");
      console.log("Taxonomy URL:", taxonomyURL);
      
      const response = await fetch(taxonomyURL);
      console.log("Fetch response:", response.status, response.ok);
      
      if (!response.ok) throw new Error("Failed to load taxonomy file");
      
      console.log("Parsing JSON...");
      taxonomyData = await response.json();
      console.log("✓ Taxonomy loaded:", taxonomyData.length, "species");
      
      // Build family lookup and filter to region if possible
      const families = new Set();
      const familyOrder = []; // Track order from taxonomy file
      const familySciNames = {}; // Map common name to scientific name
      
      taxonomyData.forEach(species => {
        if (species.familyComName) {
          // If we have region species list, only include species found in this region
          if (!regionSpeciesCodes || regionSpeciesCodes.has(species.speciesCode)) {
            if (!families.has(species.familyComName)) {
              families.add(species.familyComName);
              familyOrder.push(species.familyComName);
              familySciNames[species.familyComName] = species.familySciName;
            }
            familyLookup[species.speciesCode] = {
              family: species.familyComName,
              familySci: species.familySciName,
              comName: species.comName,
              sciName: species.sciName
            };
          }
        }
      });
      console.log("✓ Family lookup built:", Object.keys(familyLookup).length, "species");

      // Use taxonomic order (order from file) instead of alphabetical
      console.log("✓ Found", familyOrder.length, regionSpeciesCodes ? "region-specific" : "total", "families");
      
      familySelector.innerHTML = '<option value="">Select a family...</option>' +
        familyOrder.map(family => 
          `<option value="${family}">${family} (${familySciNames[family]})</option>`
        ).join('');
      
      loader.style.display = "none";
      console.log("✓ Family selector populated!");
      console.log("=== TAXONOMY LOADING COMPLETE ===");
    } catch (error) {
      console.error("❌ Error loading taxonomy:", error);
      console.error("Error details:", error.message, error.stack);
      familySelector.innerHTML = `<option value="">Error: ${error.message}</option>`;
      loader.style.display = "none";
    }
  }

  // Load taxonomy on page load
  console.log("About to call loadTaxonomy()...");
  await loadTaxonomy();
  console.log("loadTaxonomy() completed");

  // Color scale function based on species count (YlOrRd palette - yellow to orange to red)
  function getColorForCount(count, maxCount) {
    // YlOrRd: Yellow-Orange-Red gradient
    // Interpolate based on ratio
    const ratio = Math.min(count / Math.max(maxCount, 1), 1);

    // YlOrRd color palette (low to high diversity)
    const colors = [
      '#ffffcc', // Very light yellow (1 species)
      '#ffeda0', // Light yellow
      '#fed976', // Yellow
      '#feb24c', // Yellow-orange
      '#fd8d3c', // Orange
      '#fc4e2a', // Orange-red
      '#e31a1c', // Red
      '#bd0026', // Dark red
      '#800026'  // Very dark red (max species)
    ];
    
    // Determine which color based on ratio
    const index = Math.floor(ratio * (colors.length - 1));
    const lowerColor = colors[index];
    const upperColor = colors[Math.min(index + 1, colors.length - 1)];
    
    // Simple interpolation between colors (for smoother gradient)
    const localRatio = (ratio * (colors.length - 1)) - index;
    
    if (localRatio === 0) {
      return lowerColor;
    }
    
    // Linear interpolation between two hex colors
    const lower = {
      r: parseInt(lowerColor.slice(1, 3), 16),
      g: parseInt(lowerColor.slice(3, 5), 16),
      b: parseInt(lowerColor.slice(5, 7), 16)
    };
    const upper = {
      r: parseInt(upperColor.slice(1, 3), 16),
      g: parseInt(upperColor.slice(3, 5), 16),
      b: parseInt(upperColor.slice(5, 7), 16)
    };
    
    const r = Math.round(lower.r + (upper.r - lower.r) * localRatio);
    const g = Math.round(lower.g + (upper.g - lower.g) * localRatio);
    const b = Math.round(lower.b + (upper.b - lower.b) * localRatio);
    
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  // Create legend with horizontal gradient
  function createLegend(maxCount) {
    // Remove existing legend if any
    const existingLegend = document.querySelector('.map-legend');
    if (existingLegend) existingLegend.remove();

    const legend = document.createElement('div');
    legend.className = 'map-legend';
    
    legend.innerHTML = `
      <div class="legend-title">Species Diversity</div>
      <div class="legend-gradient"></div>
      <div class="legend-labels">
        <span>1</span>
        <span>${maxCount}+</span>
      </div>
    `;
    
    document.getElementById('family-map').appendChild(legend);
  }

  // Main function to fetch and map family observations
  // Cache for observations to avoid re-fetching when changing time filter
  let observationsCache = null;
  let cachedFamily = null;

  async function mapFamilyObservations() {
    const selectedFamily = familySelector.value;
    const days = parseInt(daysSelector.value);

    if (!selectedFamily) {
      alert("Please select a bird family first.");
      return;
    }

    // Clear existing markers
    markerLayer.clearLayers();

    // Show loader
    loader.style.display = "flex";
    runButton.disabled = true;

    try {
      let allObservations;
      
      // Check if we need to fetch new data or can use cached data
      if (cachedFamily === selectedFamily && observationsCache) {
        console.log("Using cached observations");
        allObservations = observationsCache;
        loaderText.textContent = "Filtering cached observations...";
      } else {
        // Step 1: Discovery - Get all recent observations (always 30 days for max data)
        loaderText.textContent = `Discovering ${selectedFamily} species in ${regionCode}...`;
        
        const discoveryResponse = await fetch(
          `https://api.ebird.org/v2/data/obs/${regionCode}/recent?back=30`,
          { headers: { "X-eBirdApiToken": "2dhshtjdomjt" } }
        );

        if (!discoveryResponse.ok) {
          throw new Error(`Discovery API error: ${discoveryResponse.status}`);
        }

        const allRecent = await discoveryResponse.json();
        console.log(`Found ${allRecent.length} total recent observations`);

        // Filter to selected family
        const familySpecies = allRecent
          .filter(obs => familyLookup[obs.speciesCode]?.family === selectedFamily)
          .map(obs => obs.speciesCode);

        const uniqueSpecies = [...new Set(familySpecies)];
        console.log(`Found ${uniqueSpecies.length} ${selectedFamily} species`);

        if (uniqueSpecies.length === 0) {
          alert(`No ${selectedFamily} species found in ${regionCode} in the last 30 days.`);
          loader.style.display = "none";
          runButton.disabled = false;
          return;
        }

        // Step 2: Detail - Fetch all observations for each species (always 30 days)
        loaderText.textContent = `Fetching observations for ${uniqueSpecies.length} species...`;
        
        allObservations = [];
        for (let i = 0; i < uniqueSpecies.length; i++) {
          const speciesCode = uniqueSpecies[i];
          
          loaderText.textContent = `Fetching ${familyLookup[speciesCode].comName} (${i + 1}/${uniqueSpecies.length})...`;
          
          try {
            const response = await fetch(
              `https://api.ebird.org/v2/data/obs/${regionCode}/recent/${speciesCode}?back=30`,
              { headers: { "X-eBirdApiToken": "2dhshtjdomjt" } }
            );

            if (response.ok) {
              const observations = await response.json();
              allObservations.push(...observations);
            }
            
            // Small delay to be polite to API
            if (i < uniqueSpecies.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          } catch (error) {
            console.error(`Error fetching ${speciesCode}:`, error);
          }
        }

        // Cache the results
        observationsCache = allObservations;
        cachedFamily = selectedFamily;
        console.log(`Retrieved and cached ${allObservations.length} total observations`);
      }

      // Step 3: Filter observations by selected days
      loaderText.textContent = "Creating map markers...";
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const filteredObservations = allObservations.filter(obs => {
        const obsDate = new Date(obs.obsDt);
        return obsDate >= cutoffDate;
      });
      
      console.log(`Filtered to ${filteredObservations.length} observations within last ${days} days`);
      
      // Step 4: Group observations by location and count species diversity
      const locationGroups = {};
      filteredObservations.forEach(obs => {
        const key = `${obs.lat},${obs.lng}`;
        if (!locationGroups[key]) {
          locationGroups[key] = {
            lat: obs.lat,
            lng: obs.lng,
            locName: obs.locName,
            species: new Set(),
            observations: []
          };
        }
        locationGroups[key].species.add(obs.speciesCode);
        locationGroups[key].observations.push(obs);
      });

      // Find max species count for color scaling
      const maxSpeciesCount = Math.max(...Object.values(locationGroups).map(loc => loc.species.size));

      // Create markers - sort by species count (low to high) so high diversity is on top
      const bounds = [];
      const sortedLocations = Object.values(locationGroups).sort((a, b) => a.species.size - b.species.size);
      
      sortedLocations.forEach(location => {
        const speciesCount = location.species.size;
        const color = getColorForCount(speciesCount, maxSpeciesCount);

        // Create marker
        const marker = L.circleMarker([location.lat, location.lng], {
          radius: 8,
          fillColor: color,
          color: '#000',
          weight: 1,
          opacity: 1,
          fillOpacity: 0.8
        });

        // Build species list for popup
        const speciesList = Array.from(location.species)
          .map(code => familyLookup[code].comName)
          .sort()
          .map(name => `<li>${name}</li>`)
          .join('');

        const popupContent = `
          <div>
            <strong>${location.locName}</strong><br>
            <strong>${speciesCount}</strong> ${selectedFamily} species:<br>
            <ul class="species-list">
              ${speciesList}
            </ul>
          </div>
        `;

        marker.bindPopup(popupContent);
        marker.addTo(markerLayer);
        bounds.push([location.lat, location.lng]);
      });

      // Create legend
      createLegend(maxSpeciesCount);

      // Fit map to bounds only if this is the first time showing markers
      if (bounds.length > 0) {
        // Check if user has manually zoomed/panned
        const currentZoom = map.getZoom();
        const currentCenter = map.getCenter();
        
        // If map is still at initial position, auto-fit to bounds
        // Otherwise preserve user's zoom/pan
        if (!map._userHasInteracted) {
          map.fitBounds(bounds, { padding: [50, 50] });
        } else {
          console.log("Preserving user's zoom and position");
        }
      }

      loader.style.display = "none";
      runButton.disabled = false;
      
      // Count unique species from location groups
      const allSpeciesInMap = new Set();
      Object.values(locationGroups).forEach(loc => {
        loc.species.forEach(code => allSpeciesInMap.add(code));
      });
      
      console.log(`Map complete: ${Object.keys(locationGroups).length} locations with ${allSpeciesInMap.size} species`);

    } catch (error) {
      console.error("Error mapping family observations:", error);
      alert(`Error: ${error.message}`);
      loader.style.display = "none";
      runButton.disabled = false;
    }
  }

  // Event listener for Run button
  runButton.addEventListener("click", mapFamilyObservations);
  console.log("✓ Event listener attached to Run button");
  
  // Event listener for days selector - update map automatically if already showing
  daysSelector.addEventListener("change", () => {
    if (cachedFamily && markerLayer.getLayers().length > 0) {
      console.log("Days changed, updating map from cache...");
      mapFamilyObservations();
    }
  });
  console.log("✓ Event listener attached to days selector");
  
  console.log("=== REGION FAMILY MAP SCRIPT COMPLETED SUCCESSFULLY ===");

  } catch (error) {
    console.error("=== FATAL ERROR IN REGION FAMILY MAP SCRIPT ===");
    console.error("Error:", error);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
  }

})();
