// main.js

// Grab the elements where we will show the location and berths
const locationNameContainer = document.getElementById('location-name');
const berthsContainer = document.getElementById('berths-container');

// Open an EventSource connection to the SSE endpoint
const evtSource = new EventSource('/stream');

// Track displayed berths to avoid duplicates
const displayedBerths = new Set();

// Each time the server pushes new data, this handler is called
evtSource.onmessage = function(event) {
    // Only process on index page
    if (!locationNameContainer || !berthsContainer) return;
    
    const payload = JSON.parse(event.data);

    // Display location name
    const locationName = payload.location_name || payload.data?.name || '';
    if (locationName) {
        locationNameContainer.textContent = locationName;
        locationNameContainer.style.display = 'block';
    }

    // Get berths from payload
    let berths = payload.berths || payload.data?.berths || [];
    
    // If berths is empty but data has berths, use that
    if (berths.length === 0 && payload.data && payload.data.berths) {
        berths = payload.data.berths;
    }
    
    // Update berths container - add new berths or update existing
    berths.forEach(berth => {
        if (berth && berth.name) {
            if (!displayedBerths.has(berth.name)) {
                displayedBerths.add(berth.name);
                createBerthCard(berth);
            }
        }
    });
};

function createBerthCard(berth) {
    const card = document.createElement('div');
    card.className = 'berth-card';
    card.onclick = function() {
        // Navigate to berth detail page
        window.location.href = `/berth/${encodeURIComponent(berth.name)}`;
    };

    const berthName = document.createElement('h3');
    berthName.textContent = berth.name || 'Unnamed Berth';
    berthName.className = 'berth-card-title';

    const berthInfo = document.createElement('div');
    berthInfo.className = 'berth-card-info';

    // Count active radars
    const activeRadars = (berth.radars || []).filter(r => r && r.distanceStatus === 'ACTIVE').length;
    const radarInfo = document.createElement('span');
    radarInfo.className = 'berth-info-item';
    radarInfo.innerHTML = `<strong>Radars:</strong> ${activeRadars} active`;

    // Count hooks in use
    let hooksInUse = 0;
    (berth.bollards || []).forEach(b => {
        if (b && b.hooks) {
            hooksInUse += (b.hooks || []).filter(h => h && h.attachedLine !== null && h.attachedLine !== undefined).length;
        }
    });
    const hooksInfo = document.createElement('span');
    hooksInfo.className = 'berth-info-item';
    hooksInfo.innerHTML = `<strong>Hooks:</strong> ${hooksInUse} in use`;

    berthInfo.appendChild(radarInfo);
    berthInfo.appendChild(hooksInfo);
    
    card.appendChild(berthName);
    card.appendChild(berthInfo);
    berthsContainer.appendChild(card);
}

// Optional: handle SSE errors
evtSource.onerror = function(err) {
    console.error("SSE connection error:", err);
};

window.evtSource = evtSource;
