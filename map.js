import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
console.log("Mapbox GL JS Loaded:", mapboxgl);


// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoiaHB1Y3NkIiwiYSI6ImNtN2VzNHAyZzBmd3cya3B2ZXZpaHRvcGsifQ.TlfGq9R8m7uFtpDK1qIR1w';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-71.09415, 42.36027], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18 // Maximum allowed zoom
});

let stations = []

map.on('load', async () => { 
  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...'
  });
  
  map.addLayer({
    id: 'bos_bike-lanes',
    type: 'line',
    source: 'boston_route',
    paint: {
      'line-color': '#48A86C',  // A bright green using hex code
      'line-width': 5,          // Thicker lines
      'line-opacity': 0.6       // Slightly less transparent
    }
  });

  map.addSource('cambridge_route', {
    type: 'geojson',
    data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson?...'
  });
  
  map.addLayer({
    id: 'cam_bike-lanes',
    type: 'line',
    source: 'cambridge_route',
    paint: {
      'line-color': '#74C365',  // A bright green using hex code
      'line-width': 5,          // Thicker lines
      'line-opacity': 0.6       // Slightly less transparent
    }
  });

  // Load the nested JSON file
  let jsonData;
  try {
    const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json'
    
    // Await JSON fetch
    jsonData = await d3.json(jsonurl);
    
    console.log('Loaded JSON Data:', jsonData); // Log to verify structure

  } catch (error) {
      console.error('Error loading JSON:', error); // Handle errors
  }

  //Load the nested csv file
  let trips;
  try {
    const csvurl = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv'
    
    // Await CSV fetch
    trips = await d3.csv(
      'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
      (trip) => {
        trip.started_at = new Date(trip.started_at);
        trip.ended_at = new Date(trip.ended_at);
        return trip;
      },
    );
    
    console.log('Loaded JSON Data:', trips); // Log to verify structure

  } catch (error) {
      console.error('Error loading JSON:', error); // Handle errors
  }

  console.log('Loaded JSON Data:', jsonData); // Log to verify structure
  const stations = computeStationTraffic(jsonData.data.stations, trips);
  console.log('Stations Array:', stations);

  let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

  const svg = d3.select('#map').select('svg');

  const radiusScale = d3
    .scaleSqrt()
    .domain([0, d3.max(stations, (d) => d.totalTraffic)])
    .range([0, 25]);

  // Append circles to the SVG for each station
  const circles = svg.selectAll('circle')
    .data(stations, (d) => d.short_name)
    .enter()
    .append('circle')
    .attr('r', d => radiusScale(d.totalTraffic))               // Radius of the circle
    .attr('fill', 'steelblue')  // Circle fill color
    .attr('stroke', 'white')    // Circle border color
    .attr('stroke-width', 1)    // Circle border thickness
    .attr('opacity', 0.8)      // Circle opacity
    .each(function(d) {
      // Add <title> for browser tooltips
      d3.select(this)
        .append('title')
        .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
    })
    .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic));

  // Function to update circle positions when the map moves/zooms
  function updatePositions() {
    circles
      .attr('cx', d => getCoords(d).cx)  // Set the x-position using projected coordinates
      .attr('cy', d => getCoords(d).cy); // Set the y-position using projected coordinates
  }

  // Initial position update when map loads
  updatePositions();

    // Reposition markers on map interactions
  map.on('move', updatePositions);     // Update during map movement
  map.on('zoom', updatePositions);     // Update during zooming
  map.on('resize', updatePositions);   // Update on window resize
  map.on('moveend', updatePositions);  // Final adjustment after movement ends

  const timeSlider = document.getElementById('time-slider');
  const selectedTime = document.getElementById('selected-time');
  const anyTimeLabel = document.getElementById('any-time');

  function updateTimeDisplay() {
    let timeFilter = Number(timeSlider.value);  // Get slider value

    if (timeFilter === -1) {
      selectedTime.textContent = '';  // Clear time display
      anyTimeLabel.style.display = 'block';  // Show "(any time)"
    } else {
      selectedTime.textContent = formatTime(timeFilter);  // Display formatted time
      anyTimeLabel.style.display = 'none';  // Hide "(any time)"
    }
  
    // Trigger filtering logic which will be implemented in the next step
    updateScatterPlot(timeFilter)
  }

  function updateScatterPlot(timeFilter) {
    // Get only the trips that match the selected time filter
    const filteredTrips = filterTripsbyTime(trips, timeFilter);
    
    // Recompute station traffic based on the filtered trips
    const filteredStations = computeStationTraffic(stations, filteredTrips);
    
    timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);
    // Update the scatterplot by adjusting the radius of circles
    circles
      .data(filteredStations, (d) => d.short_name)
      .join('circle') // Ensure the data is bound correctly
      .attr('r', (d) => radiusScale(d.totalTraffic))
      .style('--departure-ratio', (d) =>
        stationFlow(d.departures / d.totalTraffic),
      ); // Update circle sizes
  }

  updateTimeDisplay();

  timeSlider.addEventListener('input', updateTimeDisplay);
});

function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat);  // Convert lon/lat to Mapbox LngLat
  const { x, y } = map.project(point);  // Project to pixel coordinates
  return { cx: x, cy: y };  // Return as object for use in SVG attributes
}

function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);  // Set hours & minutes
  return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
}

function computeStationTraffic(stations, trips) {
  // Computed arrivals as you did in step 4.2
  let departures = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.start_station_id
  );

  let arrivals = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.end_station_id
  );

  let totalTraffic = new Map();

  for (let [station, depCount] of departures) {
    totalTraffic.set(station, (totalTraffic.get(station) || 0) + depCount);
  }
  
  for (let [station, arrCount] of arrivals) {
    totalTraffic.set(station, (totalTraffic.get(station) || 0) + arrCount);
  }

  // console.log('Departures:', departures);
  // console.log('Arrivals:', arrivals);
  // console.log('Total Traffic:', totalTraffic);

  // Update each station..
  return stations.map((station) => {
    let id = station.short_name;
    station.arrivals = arrivals.get(id) ?? 0;
    // what you updated in step 4.2
    station.departures = departures.get(id) ?? 0;
    station.totalTraffic = totalTraffic.get(id) ?? 0;
    return station;
  });
}

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function filterTripsbyTime(trips, timeFilter) {
  return timeFilter === -1 
    ? trips // If no filter is applied (-1), return all trips
    : trips.filter((trip) => {
        // Convert trip start and end times to minutes since midnight
        const startedMinutes = minutesSinceMidnight(trip.started_at);
        const endedMinutes = minutesSinceMidnight(trip.ended_at);
        
        // Include trips that started or ended within 60 minutes of the selected time
        return (
          Math.abs(startedMinutes - timeFilter) <= 60 ||
          Math.abs(endedMinutes - timeFilter) <= 60
        );
    });
}