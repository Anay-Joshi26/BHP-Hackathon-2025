(function() {
    'use strict';

    const MAX_HISTORY = 5;
    const radarHistory = {};
    const hookHistory = {};
    const previousValues = {}; // Track previous values for trend detection

    // Get berth name from URL
    const pathParts = window.location.pathname.split('/');
    const berthName = decodeURIComponent(pathParts[pathParts.length - 1]);

    let locationNameContainer = null;
    let berthDetailContainer = null;

    function getContainers() {
        if (!locationNameContainer) {
            locationNameContainer = document.getElementById('location-name');
        }
        if (!berthDetailContainer) {
            berthDetailContainer = document.getElementById('berth-detail-container');
        }
        return { locationNameContainer, berthDetailContainer };
    }

    function addToHistory(store, key, value) {
        if (value === null || value === undefined) return;
        if (!store[key]) store[key] = [];
        store[key].push(value);
        if (store[key].length > MAX_HISTORY) store[key].shift();
    }

    function getTrend(current, previous) {
        if (previous === null || previous === undefined) return 'neutral';
        if (current > previous) return 'up';
        if (current < previous) return 'down';
        return 'neutral';
    }

    function formatValue(value, decimals = 2) {
        if (value === null || value === undefined) return '—';
        return Number(value).toFixed(decimals);
    }

    function createTrendArrow(trend) {
        if (trend === 'neutral') return '';
        const arrow = document.createElement('span');
        arrow.className = `trend-arrow ${trend}`;
        arrow.textContent = trend === 'up' ? '↑' : '↓';
        arrow.setAttribute('title', trend === 'up' ? 'Increased' : 'Decreased');
        return arrow;
    }

    function createValueBadge(value, isLatest = false, trend = 'neutral', isNew = false) {
        const badge = document.createElement('span');
        badge.className = 'value-badge';
        if (isLatest) {
            badge.classList.add('latest-value');
        }
        if (isNew) {
            badge.classList.add('updated');
        }

        const numberSpan = document.createElement('span');
        numberSpan.className = 'value-number';
        numberSpan.textContent = formatValue(value);
        badge.appendChild(numberSpan);

        if (isLatest && trend !== 'neutral') {
            const arrow = createTrendArrow(trend);
            badge.appendChild(arrow);
        }

        return badge;
    }

    function renderHistoryValues(history, key, previousValue) {
        const valuesContainer = document.createElement('div');
        valuesContainer.className = 'data-values';

        if (!history || history.length === 0) {
            valuesContainer.textContent = '—';
            return valuesContainer;
        }

        // Reverse to show latest first (most recent on the left)
        const reversedHistory = history.slice().reverse();
        const latestValue = reversedHistory[0];
        // Compare latest value with the value from before this update
        const compareValue = history.length > 1 ? history[history.length - 2] : previousValue;
        const trend = getTrend(latestValue, compareValue);

        reversedHistory.forEach((value, index) => {
            const isLatest = index === 0;
            const isNew = isLatest && previousValue !== null && previousValue !== undefined && previousValue !== latestValue;
            const badge = createValueBadge(value, isLatest, isLatest ? trend : 'neutral', isNew);
            valuesContainer.appendChild(badge);
        });

        return valuesContainer;
    }

    function renderBerthDetail(payload) {
        const containers = getContainers();
        if (!containers.berthDetailContainer) return console.warn('berth.js: Could not find container.');

        const data = (payload && payload.data) || payload;
        const locationName = payload.location_name || data?.name || 'Unknown location';
        let berths = payload.berths || data?.berths || [];
        
        // If berths is empty but data has berths, use that
        if (berths.length === 0 && data && data.berths) {
            berths = data.berths;
        }

        // Display location name
        if (containers.locationNameContainer) {
            containers.locationNameContainer.textContent = locationName;
        }

        // Find the berth matching the current page
        const berth = berths.find(b => b && b.name === berthName);
        
        if (!berth) {
            // Show waiting message if no berth found yet
            if (berths.length === 0) {
                containers.berthDetailContainer.innerHTML = '<div class="empty-state">Waiting for data...</div>';
            } else {
                containers.berthDetailContainer.innerHTML = '<div class="empty-state">Berth not found or no data available.</div>';
            }
            return;
        }

        // Clear container
        containers.berthDetailContainer.innerHTML = '';

        // Create main berth card
        const berthCard = document.createElement('div');
        berthCard.className = 'berth-detail-card';

        // Radars Section
        const radarSection = document.createElement('div');
        radarSection.className = 'detail-section';
        const radarTitle = document.createElement('h2');
        radarTitle.className = 'section-title';
        radarTitle.textContent = 'Active Radars (Distance Change History)';
        radarSection.appendChild(radarTitle);

        let hasActiveRadars = false;
        (berth.radars || []).forEach(r => {
            if (r && r.distanceStatus === 'ACTIVE') {
                hasActiveRadars = true;
                const key = `${berth.name}::RADAR::${r.name}`;
                const previousValue = previousValues[key] || null;
                addToHistory(radarHistory, key, r.distanceChange);
                previousValues[key] = r.distanceChange;

                const row = document.createElement('div');
                row.className = 'data-row';

                const label = document.createElement('span');
                label.className = 'data-label';
                label.textContent = r.name;
                row.appendChild(label);

                const valuesContainer = renderHistoryValues(radarHistory[key], key, previousValue);
                row.appendChild(valuesContainer);

                radarSection.appendChild(row);
            }
        });

        if (!hasActiveRadars) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.textContent = 'No active radars';
            radarSection.appendChild(emptyState);
        }

        berthCard.appendChild(radarSection);

        // Bollards & Hooks Section
        const bollardSection = document.createElement('div');
        bollardSection.className = 'detail-section';
        const bollardTitle = document.createElement('h2');
        bollardTitle.className = 'section-title';
        bollardTitle.textContent = 'Bollards & Hooks in Use (Tension History)';
        bollardSection.appendChild(bollardTitle);

        (berth.bollards || []).forEach(b => {
            const bDiv = document.createElement('div');
            bDiv.className = 'subsection';

            const bHeader = document.createElement('div');
            bHeader.className = 'subsection-title';
            bHeader.textContent = b.name;
            bDiv.appendChild(bHeader);

            let anyHook = false;
            (b.hooks || []).forEach(h => {
                if (h && h.attachedLine !== null && h.attachedLine !== undefined) {
                    anyHook = true;
                    const key = `${berth.name}::BOLLARD::${b.name}::HOOK::${h.name}`;
                    const previousValue = previousValues[key] || null;
                    addToHistory(hookHistory, key, h.tension);
                    previousValues[key] = h.tension;

                    const row = document.createElement('div');
                    row.className = 'data-row';

                    const label = document.createElement('span');
                    label.className = 'data-label';
                    label.textContent = `${h.name} (${h.attachedLine})`;
                    row.appendChild(label);

                    const valuesContainer = renderHistoryValues(hookHistory[key], key, previousValue);
                    row.appendChild(valuesContainer);

                    bDiv.appendChild(row);
                }
            });

            if (!anyHook) {
                const emptyState = document.createElement('div');
                emptyState.className = 'empty-state';
                emptyState.textContent = 'No hooks in use';
                bDiv.appendChild(emptyState);
            }

            bollardSection.appendChild(bDiv);
        });

        berthCard.appendChild(bollardSection);
        containers.berthDetailContainer.appendChild(berthCard);
    }

    function attachToEvtSource() {
        const es = window.evtSource;
        if (!es) {
            console.warn('berth.js: evtSource not found on window. Ensure main.js is loaded first.');
            return;
        }

        console.log('berth.js: attaching to evtSource for berth:', berthName);

        es.addEventListener('message', function(event) {
            try {
                const payload = JSON.parse(event.data);
                console.log('berth.js received payload:', payload);

                if (payload && (payload.data || payload.berths || payload.location_name)) {
                    renderBerthDetail(payload);
                }
            } catch (e) {
                console.error('berth.js: failed to parse SSE payload', e);
            }
        });

        es.addEventListener('error', function(err) {
            console.error('berth.js: SSE error', err);
        });
    }

    // Use requestAnimationFrame to ensure DOM is fully ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            requestAnimationFrame(attachToEvtSource);
        });
    } else {
        requestAnimationFrame(attachToEvtSource);
    }

    // Expose for debugging
    window._berthRadarHistory = radarHistory;
    window._berthHookHistory = hookHistory;
    window._berthPreviousValues = previousValues;
})();

