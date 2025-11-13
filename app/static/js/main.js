// main.js

// Grab the element where we will show the live mooring data
const locationsContainer = document.getElementById('locations-container');

// Open an EventSource connection to the SSE endpoint
const evtSource = new EventSource('/stream');

// Each time the server pushes new data, this handler is called
evtSource.onmessage = function(event) {
    const payload = JSON.parse(event.data);

    // payload.locations is the array we want to display
    const locations = payload.locations || [];

    // Clear the container
    locationsContainer.innerHTML = '';

    // Add each location as a div or list item
    locations.forEach(loc => {
        const div = document.createElement('div');
        div.textContent = loc;
        locationsContainer.appendChild(div);
    });
};

// Optional: handle SSE errors
evtSource.onerror = function(err) {
    console.error("SSE connection error:", err);
};
