(async function () {
  if (!window.L && !window.d3) {
    console.warn("Leaflet or D3 not loaded.");
    return;
  }

  const existing = document.getElementById("mychecklists-map-container");
  if (existing) existing.remove();

  const container = document.createElement("div");
  container.id = "mychecklists-map-container";
  container.innerHTML = `
    <h2>My Checklist Map</h2>
    <div id="mychecklists-loader" class="mychecklists-loader-container">
      <div class="mychecklists-spinner"></div>
      <div id="mychecklists-loader-text">Loading checklist locations...</div>
    </div>
    <div id="mychecklists-map" style="height: 500px; width: 100%; border: 1px solid #ccc; border-radius: 8px; z-index: 0;"></div>
    <div id="loader" style="display: none; text-align: center; margin-top: 20px;">
      <span>Loading...</span>
      <div style="border: 2px solid #ccc; border-radius: 5px; width: 100%; height: 20px; background-color: #f3f3f3;">
        <div id="progress-bar" style="height: 100%; width: 0; background-color: #4caf50; border-radius: 5px;"></div>
      </div>
    </div>
    <div id="durationChartContainer" style="width: 100%; margin-top: 20px;">
      <div id="durationChart" style="width: 100%;"></div>
    </div>
    <div id="tooltip" style="
      position: absolute;
      background-color: white;
      border: 1px solid #ccc;
      padding: 6px;
      font-size: 12px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
      box-shadow: 0px 2px 6px rgba(0,0,0,0.2);
      border-radius: 4px;
    "></div>
    <style>
      .mychecklists-loader-container {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 10px;
        font-weight: bold;
        color: #555;
      }
      .mychecklists-spinner {
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
    </style>
  `;

  const anchor = document.querySelector("#results-heading");
  anchor?.parentNode?.insertBefore(container, anchor.nextSibling);

  const map = L.map("mychecklists-map").setView([20, 0], 2);
  const googleStreets = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',{
        maxZoom: 15,
        subdomains:['mt0','mt1','mt2','mt3'],
        attribution: "&copy; Google",
  }).addTo(map);

  const googleSat = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',{
        maxZoom: 15,
        subdomains:['mt0','mt1','mt2','mt3'],
        attribution: "&copy; Google",
  });

  const googleHybrid = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',{
        maxZoom: 15,
        subdomains:['mt0','mt1','mt2','mt3'],
        attribution: "&copy; Google",
  });

  const googleTerrain = L.tileLayer('https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',{
        maxZoom: 15,
        subdomains:['mt0','mt1','mt2','mt3'],
        attribution: "&copy; Google",
  });

  // NEW: Create layer groups for GPS tracks and markers
  const gpsTrackLayer = L.layerGroup().addTo(map);
  const markerLayer = L.layerGroup().addTo(map);

  var baseMaps = {
      "Streets": googleStreets,
      "Hybrid": googleHybrid,
      "Satellite": googleSat,
      "Terrain": googleTerrain
  };

  // NEW: Add overlay layers to control
  var overlayMaps = {
      "GPS Tracks": gpsTrackLayer,
      "Markers": markerLayer
  };

  var layerControl = L.control.layers(baseMaps, overlayMaps).addTo(map);

  const loaderText = document.getElementById("mychecklists-loader-text");

  // Detect if we're in Chrome or Firefox for extension API
  const isFirefox = typeof browser !== 'undefined';
  const extensionAPI = isFirefox ? browser : chrome;

  const regionLookup = await fetch(extensionAPI.runtime.getURL("regionLookup/regionLookup-expanded.json"))
    .then(r => r.json())
    .catch(() => ({}));

  function getRegionCode(country, state, subnational2, regionLookup) {
    const countryData = regionLookup[country];
    if (!countryData) return null;
    const stateData = countryData.regions[state];
    if (!stateData) return countryData.code;
    if (subnational2 && stateData.subregions && stateData.subregions[subnational2]) {
      return stateData.subregions[subnational2];
    }
    return stateData.code || countryData.code;
  }

  const checklistBlocks = document.querySelectorAll(".ResultsStats--manageMyChecklists:not(.ResultsStats--header)");
  const checklistInfo = Array.from(checklistBlocks).map(block => {
    const link = block.querySelector("a[href*='/checklist/']");
    const match = link?.href.match(/\/checklist\/(S\d+)/);
    const subId = match?.[1];

    const dateText = block.querySelector(".Heading-main")?.innerText || "";
    const [day, monthStr, yearStr] = dateText.split(" ");
    const year = parseInt(yearStr);
    const month = new Date(`${monthStr} 1, 2000`).getMonth() + 1;
    const paddedMonth = String(month).padStart(2, "0");
    const paddedDay = String(day).padStart(2, "0");

    const countyName = block.querySelector(".ResultsStats-details-county")?.innerText || "";
    const stateCountry = block.querySelectorAll(".ResultsStats-details-stateCountry");
    const subnationalName = stateCountry[0].innerText || "";
    const countryName = stateCountry[1].innerText || "";

    return {
      subId,
      year,
      month: paddedMonth,
      day: paddedDay,
      countryName,
      subnationalName,
      subnational2Name: countyName || "",
      date: `${year}-${paddedMonth}-${paddedDay}`
    };
  }).filter(c => c.subId && c.year && c.month && c.day);

  if (!checklistInfo.length) {
    loaderText.textContent = "No valid checklists found.";
    return;
  }

  loaderText.textContent = `Grouping by region & date...`;

  const batchRequests = {};
  const fallbackSubIds = [];

  for (const { subId, year, month, day, countryName, subnationalName, subnational2Name } of checklistInfo) {
    const regionCode = getRegionCode(countryName, subnationalName, subnational2Name, regionLookup);
    if (!regionCode) {
      fallbackSubIds.push(subId);
      continue;
    }
    const key = `${regionCode}|${year}-${month}-${day}`;
    if (!batchRequests[key]) batchRequests[key] = [];
    batchRequests[key].push(subId);
  }

  loaderText.textContent = `Fetching ${Object.keys(batchRequests).length} feed batches...`;

  const subIdMap = {};
  const queries = [];
  for (const [key, subIds] of Object.entries(batchRequests)) {
    const [regionCode, date] = key.split("|");
    const [yyyy, mm, dd] = date.split("-");
    const query = `${regionCode}/${yyyy}/${mm}/${dd}`;
    queries.push(query);
    subIdMap[query] = subIds;
  }

  const locationMap = new Map();
  let processed = 0;

  function throttleRequests(tasks, concurrency = 5) {
    return new Promise(resolve => {
      const results = [];
      let index = 0;
      let active = 0;

      function next() {
        while (active < concurrency && index < tasks.length) {
          const currentIndex = index++;
          active++;
          tasks[currentIndex]().then(result => {
            results[currentIndex] = result;
            active--;
            if (results.length === tasks.length && !results.includes(undefined)) {
              resolve(results);
            } else {
              next();
            }
          });
        }
      }

      next();
    });
  }

  function withRetries(fn, retries = 3, delay = 500) {
    return function retrying(...args) {
      return new Promise((resolve) => {
        const attempt = (n) => {
          fn(...args).then(resolve).catch(err => {
            if (n > 0) {
              setTimeout(() => attempt(n - 1), delay);
            } else {
              console.error("❌ Failed after retries:", err);
              resolve([]);
            }
          });
        };
        attempt(retries);
      });
    };
  }

  const fetchChecklistBatch = withRetries((query) => {
    return new Promise((resolve, reject) => {
      extensionAPI.runtime.sendMessage({
        type: "batchChecklistFeed",
        queries: [query],
        subIdMap: { [query]: subIdMap[query] },
        fallbackSubIds: []
      }, (response) => {
        if (extensionAPI.runtime.lastError || !response) {
          reject(extensionAPI.runtime.lastError || new Error("Empty response"));
        } else {
          resolve(response[query] || []);
        }
      });
    });
  });

  const fetchChecklistDetails = withRetries((subId) => {
    return new Promise((resolve, reject) => {
      extensionAPI.runtime.sendMessage({
        type: "getChecklistDetails",
        subId
      }, (response) => {
        if (extensionAPI.runtime.lastError || !response) {
          reject(extensionAPI.runtime.lastError || new Error("No response from details"));
        } else {
          resolve(response);
        }
      });
    });
  });

  // NEW: Function to fetch GPS track data from checklist page
  async function fetchGPSTrack(subId) {
    try {
      const response = await fetch(`https://ebird.org/checklist/${subId}`);
      const html = await response.text();
      
      const match = html.match(/data-maptrack-data="([^"]+)"/);
      if (match) {
        const coordString = match[1];
        const coords = [];
        const parts = coordString.split(',');
        
        // Convert "lng,lat,lng,lat" to [[lat,lng], [lat,lng], ...]
        for (let i = 0; i < parts.length; i += 2) {
          coords.push([parseFloat(parts[i+1]), parseFloat(parts[i])]);
        }
        
        return coords;
      }
      return null;
    } catch (error) {
      console.error(`Error fetching GPS track for ${subId}:`, error);
      return null;
    }
  }

  const fetchTasks = queries.map((query, i) => () => {
    loaderText.textContent = `Fetching checklist locations: ${i + 1} / ${queries.length}`;
    return fetchChecklistBatch(query);
  });

  const results = await throttleRequests(fetchTasks, 5);

  results.flat().forEach(item => {
    processed++;
    if (!item.loc || !item.loc.lat || !item.loc.lng) return;
    const { lat, lng, locName } = item.loc;
    const key = `${lat},${lng}`;
    if (!locationMap.has(key)) {
      locationMap.set(key, {
        lat,
        lng,
        name: locName || "Unknown",
        subIds: []
      });
    }
    locationMap.get(key).subIds.push(item.subId);
    loaderText.textContent = `Mapping checklist locations: ${processed} / ${checklistInfo.length}`;
  });

  // NEW: Fetch GPS tracks
  loaderText.textContent = "Fetching GPS tracks...";
  const trackColors = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf'];
  let colorIndex = 0;
  
  const trackTasks = checklistInfo.map((info, i) => async () => {
    loaderText.textContent = `Fetching GPS tracks: ${i + 1} / ${checklistInfo.length}`;
    const coords = await fetchGPSTrack(info.subId);
    if (coords && coords.length > 0) {
      const color = trackColors[colorIndex % trackColors.length];
      colorIndex++;
      
      const polyline = L.polyline(coords, {
        color: color,
        weight: 3,
        opacity: 0.7
      }).bindPopup(`<b><a href="https://ebird.org/checklist/${info.subId}" target="_blank">Checklist ${info.subId}</a></b><br>Date: ${info.date}`);
      
      gpsTrackLayer.addLayer(polyline);
    }
    return coords;
  });

  await throttleRequests(trackTasks, 3);

  document.getElementById("mychecklists-loader")?.remove();

  if (locationMap.size === 0) return;

  const colorScale = d3.scaleSequential(d3.interpolateYlOrRd);
  const points = Array.from(locationMap.values()).sort((a, b) => a.subIds.length - b.subIds.length);
  const maxCount = Math.max(...points.map(p => p.subIds.length));

  points.forEach(point => {
    const color = colorScale(point.subIds.length / maxCount);
    const marker = L.circleMarker([point.lat, point.lng], {
      radius: 8,
      fillColor: color,
      color: "#333",
      weight: 1,
      fillOpacity: 0.9
    }).bindPopup(`<b>${point.name}</b><br>Checklists: ${point.subIds.length}`);
    
    markerLayer.addLayer(marker);
  });

  const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
  map.fitBounds(bounds, { padding: [20, 20] });
  map.addControl(new L.Control.Fullscreen());

  const legend = L.control({ position: "bottomright" });
  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "info legend");
    div.innerHTML = `<strong>Checklist Count</strong><br><canvas id="legend-canvas" width="100" height="10"></canvas><br>
      <div style="display: flex; justify-content: space-between;">
        <span>1</span><span>${maxCount}</span>
      </div>`;
    return div;
  };
  legend.addTo(map);

  const canvas = document.getElementById("legend-canvas");
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, "#ffffcc");
  gradient.addColorStop(1, "#bd0026");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  document.getElementById('loader').style.display = 'block';
  let progress = 0;

  function updateProgressBar(progress) {
    const progressBar = document.getElementById('progress-bar');
    progressBar.style.width = `${progress}%`;
  }

  const durations = [];
  const speciesPerDay = [];

  let totalSteps = checklistInfo.length;
  let stepCounter = 0;

  const speciesPerDayMap = new Map();
  const hoursPerDayMap = new Map();

  for (const { subId, date } of checklistInfo) {
    try {
      const details = await fetchChecklistDetails(subId);
      const dateString = new Date(date).toISOString().split("T")[0];

      if (!speciesPerDayMap.has(dateString)) {
        speciesPerDayMap.set(dateString, new Set());
      }

      if (details.data.obs) {
        for (const obs of Object.values(details.data.obs)) {
          if (obs?.speciesCode) {
            speciesPerDayMap.get(dateString).add(obs.speciesCode);
          }
        }
      }

      if (details?.data?.durationHrs && !isNaN(details.data.durationHrs)) {        
        hoursPerDayMap.set(
          dateString,
          (hoursPerDayMap.get(dateString) || 0) + parseFloat(details.data.durationHrs)
        );
      } else {
        hoursPerDayMap.set(
          dateString,
          (hoursPerDayMap.get(dateString) || 0) + 0
        );
      }
    } catch (error) {
      console.error(`Failed on checklist ${subId}:`, error);
    }

    stepCounter++;
    progress = (stepCounter / totalSteps) * 100;
    updateProgressBar(progress);
  }

  function daysBetween(date1, date2) {
    const start = new Date(date1);
    const end = new Date(date2);
    const timeDifference = Math.abs(end.getTime() - start.getTime());
    const daysDifference = Math.round(timeDifference / (1000 * 60 * 60 * 24));
    return daysDifference;
  }

  const sortedSpeciesPerDayMap = new Map(
    [...speciesPerDayMap.entries()].sort(([dateA], [dateB]) =>
      new Date(dateA) - new Date(dateB)
    )
  );

  const daysTotal = daysBetween([...sortedSpeciesPerDayMap.keys()][0], [...sortedSpeciesPerDayMap.keys()][sortedSpeciesPerDayMap.size-1]);

  document.getElementById('loader').style.display = 'none';
  
  const dateMap = new Map();

  for (const [dateString, speciesSet] of sortedSpeciesPerDayMap.entries()) {
    dateMap.set(dateString, {
      speciesCount: speciesSet.size,
      hours: hoursPerDayMap.get(dateString) || 0
    });
  }

  const aggregatedData = Array.from(dateMap.entries()).sort((a, b) => new Date(a[0]) - new Date(b[0]));

  const labels = [];
  const values = [];
  let cumulativeHours = 0;
  for (const [date, { hours, speciesCount }] of aggregatedData) {
    cumulativeHours += isNaN(hours) ? 0 : hours;
    labels.push(date);
    values.push(cumulativeHours);
  }
  
  const margin = { top: 20, right: 80, bottom: 40, left: 80 };
  const width = 1000 - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;
  
  const svg = d3.select("#durationChart")
    .append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%")
    .style("height", "auto")
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const parseDate = d3.timeParse("%Y-%m-%d");
  
  const xOriginal = d3.scaleTime()
    .domain(d3.extent(labels, d => parseDate(d)))
    .range([0, width]);

  const x = xOriginal.copy();
  
  const y = d3.scaleLinear()
    .domain([0, d3.max(values)])
    .nice()
    .range([height, 0]);
  
  const baseTicks = 5;
  const maxTickLabels = Math.floor(width / 80);
  const tickCount = Math.min(maxTickLabels, baseTicks);

  const [start, end] = x.domain();
  const tickStep = (end - start) / (tickCount - 1);
  const tickDates = d3.range(tickCount).map(i => new Date(start.getTime() + i * tickStep));

  svg.append("g")
    .attr("class", "x-axis")
    .attr("transform", "translate(0," + height + ")")
    .call(d3.axisBottom(x)
        .tickValues(tickDates)
        .tickFormat(d3.timeFormat("%b '%y")));

  svg.append("g")
    .attr("class", "y-axis")
    .call(d3.axisLeft(y));

  const yRight = d3.scaleLinear()
    .domain([0, d3.max(aggregatedData, d => Math.max(d[1].speciesCount || 0, d[1].hours || 0))])
    .nice()
    .range([height, 0]);
  
  svg.append("g")
    .attr("class", "y-axis-right")
    .attr("transform", `translate(${width},0)`)
    .call(d3.axisRight(yRight));

  svg.append("clipPath")
    .attr("id", "clip")
    .append("rect")
    .attr("width", width)
    .attr("height", height);

  const plotArea = svg.append("g")
    .attr('class', 'plot-area')
    .attr('clip-path', 'url(#clip)');

  const line = d3.line()
    .defined(d => d.hours != null && d.date != null)
    .x(d => x(parseDate(d.date)))
    .y(d => y(d.hours));

  const speciesLine = d3.line()
    .defined(d => d.speciesCount != null && d.date != null)
    .x(d => x(parseDate(d.date)))
    .y(d => yRight(d.speciesCount));
  
  const hoursPerDayLine = d3.line()
    .defined(d => d.hours != null && d.date != null)
    .x(d => x(parseDate(d.date)))
    .y(d => yRight(d.hours));
  
  const data = labels.map((label, index) => ({
    date: label,
    hours: values[index]
  }));
  
  plotArea.append("path")
    .data([data])
    .attr("class", "line")
    .attr("d", line)
    .attr("fill", "none")
    .attr("stroke", "#28a745")
    .attr("stroke-width", 2);
  
  plotArea.append("path")
    .data([data])
    .attr("class", "area")
    .attr("d", d3.area()
      .x(d => x(parseDate(d.date)))
      .y0(height)
      .y1(d => y(d.hours)))
    .attr("fill", "rgba(40,167,69,0.2)");

  const tooltip = d3.select("#tooltip");

  function getBarWidth(scale) {
    const baseWidth = width / daysTotal;
    return Math.max(1, baseWidth * scale);
  }

  const barWidth = getBarWidth(1);
  const barPadding = Math.max(0, barWidth * 0.1);

  plotArea.selectAll(".species-bar")
    .data(aggregatedData)
    .enter()
    .append("rect")
    .attr("class", "species-bar bar")
    .attr("x", d => x(parseDate(d[0])))
    .attr("y", d => yRight(d[1].speciesCount))
    .attr("width", Math.max(0.5, barWidth - barPadding))
    .attr("height", d => height - yRight(d[1].speciesCount))
    .attr("fill", "#007bff")
    .attr("opacity", 0.7);

  plotArea.selectAll(".hours-bar")
    .data(aggregatedData)
    .enter()
    .append("rect")
    .attr("class", "hours-bar bar")
    .attr("x", d => x(parseDate(d[0])))
    .attr("y", d => yRight(d[1].hours))
    .attr("width", Math.max(0.5, barWidth - barPadding))
    .attr("height", d => height - yRight(d[1].hours))
    .attr("fill", "#ffc107")
    .attr("opacity", 0.7);
  
  svg.append("text")
    .attr("transform", "translate(" + (width / 2) + " ," + (height + margin.bottom - 10) + ")")
    .style("text-anchor", "middle")
    .text("Date");
  
  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", 0 - (margin.left)/2)
    .attr("x", 0 - (height / 2))
    .style("text-anchor", "middle")
    .text("Cumulative Hours");

  svg.append("text")
    .attr("transform", `rotate(-90)`)
    .attr("y", width + (margin.right)/2)
    .attr("x", 0 - (height / 2))
    .attr("dy", "1em")
    .style("text-anchor", "middle")
    .text("Species & Hours Per Day");

  const focusLine = svg.append("line")
    .attr("stroke", "#aaa")
    .attr("stroke-width", 1)
    .attr("y1", 0)
    .attr("y2", height)
    .style("opacity", 0);

  function mousemove(event) {
    const bisectDate = d3.bisector(d => parseDate(d.date)).left;
    const [mx] = d3.pointer(event, svg.node());
    const x0 = x.invert(mx);
    const i = bisectDate(data, x0, 1);
    const d0 = data[i - 1];
    const d1 = data[i];
  
    if (!d0 || !d1) {
      focusLine.style("opacity", 0);
      tooltip.style("opacity", 0);
      return;
    }
  
    const d = x0 - parseDate(d0.date) > parseDate(d1.date) - x0 ? d1 : d0;
    const speciesPoint = aggregatedData.find(a => a[0] === d.date);
    const speciesCount = speciesPoint?.[1]?.speciesCount ?? 0;
    const hoursToday = speciesPoint?.[1]?.hours ?? 0;
    const xCoord = x(parseDate(d.date));

    focusLine
      .attr("x1", xCoord)
      .attr("x2", xCoord)
      .style("opacity", 1);
  
    tooltip
      .style("opacity", 1)
      .html(`
        <strong>${d.date}</strong><br/>
        Species: ${speciesCount}<br/>
        Hours: ${hoursToday.toFixed(2)}<br/>
        Cumulative Hours: ${d.hours.toFixed(2)}
      `)
      .style("left", (event.pageX + 20) + "px")
      .style("top", (event.pageY - 20) + "px");
  }

  svg.append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("class", "zoom-rect")
    .style("fill", "none")
    .style("pointer-events", "all")
    .on("mousemove", mousemove)
    .on("mouseout", () => {
      tooltip.style("opacity", 0);
      focusLine.style("opacity", 0);
    });
    
  const legendData = [
    { label: "Cumulative Hours", color: "#28a745", stroke: "solid" },
    { label: "Species Per Day", color: "#007bff", stroke: "solid" },
    { label: "Hours Per Day", color: "#ffc107", stroke: "dashed" }
  ];
  
  const chartLegend = svg.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(0, ${-margin.top})`);
  
  chartLegend.selectAll("line")
    .data(legendData)
    .enter()
    .append("line")
    .attr("x1", (d, i) => i * 200)
    .attr("x2", (d, i) => i * 200 + 30)
    .attr("y1", 0)
    .attr("y2", 0)
    .attr("stroke", d => d.color)
    .attr("stroke-width", 3)
    .attr("stroke-dasharray", d => d.stroke === "dashed" ? "4 2" : "none");
  
  chartLegend.selectAll("text")
    .data(legendData)
    .enter()
    .append("text")
    .attr("x", (d, i) => i * 200 + 35)
    .attr("y", 5)
    .text(d => d.label)
    .style("font-size", "12px")
    .attr("alignment-baseline", "middle");

  const zoom = d3.zoom()
    .scaleExtent([1, daysTotal/10])
    .translateExtent([[0, 0], [width, height]])
    .extent([[0, 0], [width, height]])
    .on("zoom", zoomed);

  svg.call(zoom);

  function zoomed(event) {
    const newX = event.transform.rescaleX(xOriginal);
    x.domain(newX.domain());

    let tickFormat = d3.timeFormat("%b '%y");
    if (event.transform.k < 2) {
      tickFormat = d3.timeFormat("%b '%y");
    } else {
      tickFormat = d3.timeFormat("%b %d '%y"); 
    }
  
    const baseTicks = 5;
    const maxTickLabels = Math.floor(width / 80);
    const tickCount = Math.min(maxTickLabels, Math.round(baseTicks * event.transform.k));

    const [start, end] = newX.domain();
    const tickStep = (end - start) / (tickCount - 1);
    const tickDates = d3.range(tickCount).map(i => new Date(start.getTime() + i * tickStep));

    const barWidth = getBarWidth(event.transform.k);
    const barPadding = Math.max(0, barWidth * 0.1);

    svg.select(".x-axis")
      .call(d3.axisBottom(newX)
        .tickValues(tickDates)
        .tickFormat(tickFormat));

    svg.select(".line")
      .attr("d", d3.line()
        .x(d => newX(parseDate(d.date)))
        .y(d => y(d.hours)));

    svg.select(".area")
      .attr("d", d3.area()
        .x(d => newX(parseDate(d.date)))
        .y0(height)
        .y1(d => y(d.hours)));

    svg.selectAll(".bar")
      .attr("x", d => {
        const parsed = parseDate(d[0]);
        const xVal = newX(parsed);
        return xVal;
      })
      .attr("width", Math.max(0.5, barWidth - barPadding));
  }

})();
