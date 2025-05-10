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
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  const loaderText = document.getElementById("mychecklists-loader-text");

  const regionLookup = await fetch(chrome.runtime.getURL("regionLookup/regionLookup-expanded.json"))
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
      chrome.runtime.sendMessage({
        type: "batchChecklistFeed",
        queries: [query],
        subIdMap: { [query]: subIdMap[query] },
        fallbackSubIds: []
      }, (response) => {
        if (chrome.runtime.lastError || !response) {
          reject(chrome.runtime.lastError || new Error("Empty response"));
        } else {
          resolve(response[query] || []);
        }
      });
    });
  });

  const fetchChecklistDetails = withRetries((subId) => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: "getChecklistDetails",
        subId
      }, (response) => {
        if (chrome.runtime.lastError || !response) {
          reject(chrome.runtime.lastError || new Error("No response from details"));
        } else {
          resolve(response);
        }
      });
    });
  });

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

  document.getElementById("mychecklists-loader")?.remove();

  if (locationMap.size === 0) return;

  const colorScale = d3.scaleSequential(d3.interpolateYlOrRd);
  const points = Array.from(locationMap.values()).sort((a, b) => a.subIds.length - b.subIds.length);
  const maxCount = Math.max(...points.map(p => p.subIds.length));

  points.forEach(point => {
    const color = colorScale(point.subIds.length / maxCount);
    L.circleMarker([point.lat, point.lng], {
      radius: 8,
      fillColor: color,
      color: "#333",
      weight: 1,
      fillOpacity: 0.9
    }).bindPopup(`<b>${point.name}</b><br>Checklists: ${point.subIds.length}`).addTo(map);
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

  // Show loader when starting
  document.getElementById('loader').style.display = 'block';
  let progress = 0;

  // Update progress function
  function updateProgressBar(progress) {
    const progressBar = document.getElementById('progress-bar');
    progressBar.style.width = `${progress}%`;
  }

// Begin d3 charting

  const durations = [];
  const speciesPerDay = [];
  const hoursPerDay = [];

  let totalSteps = checklistInfo.length;
  let stepCounter = 0;

  for (const { subId, date } of checklistInfo) {
    const details = await fetchChecklistDetails(subId);
    // console.log("Details:", details);
    if (details?.data?.durationHrs && !isNaN(details.data.durationHrs)) {
      const speciesCount = new Set();
      for (const [key, value] of Object.entries(details.data.obs)) {
        speciesCount.add(value.speciesCode);  // Use Set to count unique species
      }
      // console.log("Species Count:", speciesCount);
      const speciesUniqueCount = speciesCount.size;
      durations.push({ date: new Date(date), hours: parseFloat(details.data.durationHrs), speciesCount: speciesUniqueCount });
      speciesPerDay.push({ date: new Date(date), speciesCount: speciesUniqueCount });
      hoursPerDay.push({ date: new Date(date), hours: parseFloat(details.data.durationHrs) });

      // Update progress bar
      stepCounter++;
      progress = (stepCounter / totalSteps) * 100;
      updateProgressBar(progress);
    }
  }

  document.getElementById('loader').style.display = 'none';
  
  // Grouping the durations and species count by date
  const dateMap = new Map();
  for (const { date, hours, speciesCount } of durations) {
    const dateString = date.toISOString().split("T")[0];  // e.g. "2025-05-06"
    
    if (dateMap.has(dateString)) {
      dateMap.set(dateString, {
        hours: dateMap.get(dateString).hours + hours, // Sum the hours for the same date
        speciesCount: dateMap.get(dateString).speciesCount + speciesCount // Sum the species counts
      });
    } else {
      dateMap.set(dateString, { hours, speciesCount });
    }
  }

  // Sort by date
  const aggregatedData = Array.from(dateMap.entries()).sort((a, b) => new Date(a[0]) - new Date(b[0]));

  // Preparing the data for plotting
  const labels = [];
  const values = [];
  let cumulativeHours = 0;
  for (const [date, { hours, speciesCount }] of aggregatedData) {
    cumulativeHours += hours; // Add up the hours cumulatively
    labels.push(date); // Date string as label
    values.push(cumulativeHours); // Store cumulative hours
    // Optionally, store species counts separately or on the same graph
  }

  console.log("Labels:", labels); // Check labels
  console.log("Values:", values); // Check values
  
  // Set up SVG dimensions
  const margin = { top: 20, right: 80, bottom: 40, left: 80 };
  const width = 1000 - margin.left - margin.right; // Start with a wide default, still responsive
  const height = 400 - margin.top - margin.bottom;
  
  const svg = d3.select("#durationChart")
    .append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%")   // Let it scale to the container width
    .style("height", "auto")
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);  

  // Parse the date
  const parseDate = d3.timeParse("%Y-%m-%d");
  
  // Set up the scales
  const xOriginal = d3.scaleTime()
  .domain(d3.extent(labels, d => parseDate(d)))
  .range([0, width]);

  const x = xOriginal.copy();
  
  const y = d3.scaleLinear()
    .domain([0, d3.max(values)]) // Y axis range
    .nice()
    .range([height, 0]);
  
  // Add the X axis
  svg.append("g")
    .attr("class", "x-axis")
    .attr("transform", "translate(0," + height + ")")
    .call(d3.axisBottom(x).ticks(d3.timeMonth.every(1)));
  
  // Add the Y axis
  svg.append("g")
    .attr("class", "y-axis")
    .call(d3.axisLeft(y));

  const yRight = d3.scaleLinear()
    .domain([0, d3.max(aggregatedData, d => Math.max(d[1].speciesCount, d[1].hours))])
    .nice()
    .range([height, 0]);
  
  svg.append("g")
    .attr("class", "y-axis-right")
    .attr("transform", `translate(${width},0)`)
    .call(d3.axisRight(yRight));
  
  // Line generator
  const line = d3.line()
    .x(d => x(parseDate(d.date)))  // Date to X position
    .y(d => y(d.hours)); // Cumulative hours to Y position

    const speciesLine = d3.line()
    .x(d => x(parseDate(d.date)))
    .y(d => yRight(d.speciesCount));
  
  const hoursPerDayLine = d3.line()
    .x(d => x(parseDate(d.date)))
    .y(d => yRight(d.hours));  
  
  // Data for the line
  const data = labels.map((label, index) => ({
    date: label,
    hours: values[index]
  }));
  
  // Create the line chart
  svg.append("path")
    .data([data])
    .attr("class", "line")
    .attr("d", line)
    .attr("fill", "none")
    .attr("stroke", "#28a745")
    .attr("stroke-width", 2);
  
  // Add the area under the curve (for filled line chart)
  svg.append("path")
    .data([data])
    .attr("class", "area")
    .attr("d", d3.area()
      .x(d => x(parseDate(d.date)))
      .y0(height)
      .y1(d => y(d.hours)))
    .attr("fill", "rgba(40,167,69,0.2)");

    const tooltip = d3.select("#tooltip");

  const speciesData = aggregatedData.map(([date, { speciesCount }]) => ({
    date,
    speciesCount
  }));

  svg.append("path")
    .data([speciesData])
    .attr("class", "species-line")
    .attr("d", speciesLine)
    .attr("fill", "none")
    .attr("stroke", "#007bff")
    .attr("stroke-width", 2);

  const hoursPerDayData = aggregatedData.map(([date, { hours }]) => ({
    date,
    hours
  }));

  svg.append("path")
    .data([hoursPerDayData])
    .attr("class", "hours-per-day-line")
    .attr("d", hoursPerDayLine)
    .attr("fill", "none")
    .attr("stroke", "#ffc107") // yellow-orange
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "4 2"); // optional dashed style for distinction
  
  // Optional: Add a title and labels to the axes
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
    const x0 = x.invert(d3.pointer(event)[0]);
    const i = bisectDate(data, x0, 1);
    const d0 = data[i - 1];
    const d1 = data[i];
  
    if (!d0 || !d1) {
      // focusCircle.style("opacity", 0);
      focusLine.style("opacity", 0);
      tooltip.style("opacity", 0);
      return;
    }
  
    const d = x0 - parseDate(d0.date) > parseDate(d1.date) - x0 ? d1 : d0;
    const speciesPoint = aggregatedData.find(a => a[0] === d.date);
    const speciesCount = speciesPoint?.[1]?.speciesCount ?? 0;
    const hoursToday = speciesPoint?.[1]?.hours ?? 0;
    const xCoord = x(parseDate(d.date));
    const yCoord = y(d.hours);

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
    
  // Set up the zoom behavior
  const zoom = d3.zoom()
    .scaleExtent([1, 10]) // Zoom level range (1 is the initial, 10 is the max zoom)
    .translateExtent([[0, 0], [width, height]]) // Limit the panning area
    .on("zoom", zoomed);

  // Zoom function
  function zoomed(event) {
    const transform = event.transform;
    const newX = transform.rescaleX(x); // Correctly rescale x-axis
  
    // Update lines with rescaled x
    svg.selectAll(".line")
      .attr("d", d3.line()
        .x(d => newX(parseDate(d.date)))
        .y(d => y(d.hours))
      );
  
    svg.selectAll(".species-line")
      .attr("d", d3.line()
        .x(d => newX(parseDate(d.date)))
        .y(d => yRight(d.speciesCount))
      );
  
    svg.selectAll(".hours-per-day-line")
      .attr("d", d3.line()
        .x(d => newX(parseDate(d.date)))
        .y(d => yRight(d.hours))
      );
  
    svg.selectAll(".area")
      .attr("d", d3.area()
        .x(d => newX(parseDate(d.date)))
        .y0(height)
        .y1(d => y(d.hours))
      );
  
    svg.select(".x-axis")
      .call(d3.axisBottom(newX).ticks(d3.timeMonth.every(1)));
  }  

  // Apply the zoom to the chart
  svg.call(zoom);
  
})();
