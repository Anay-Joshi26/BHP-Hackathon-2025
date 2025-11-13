(function() {
    'use strict';

    const MAX_HISTORY = 5;
    const radarHistory = {};
    const hookHistory = {};
    const previousValues = {}; // Track previous values for trend detection

    let historyContainer = null;

    function getHistoryContainer() {
        if (!historyContainer) {
            historyContainer = document.createElement('div');
            historyContainer.id = 'location-history-container';
            document.body.appendChild(historyContainer);
        }
        return historyContainer;
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
        // If we only have one value, use previousValue; otherwise use the second value in the history
        const compareValue = history.length > 1 ? history[history.length - 2] : previousValue;
        const trend = getTrend(latestValue, compareValue);

        reversedHistory.forEach((value, index) => {
            const isLatest = index === 0;
            // Check if this is a new update (value changed from previous)
            const isNew = isLatest && previousValue !== null && previousValue !== undefined && previousValue !== latestValue;
            const badge = createValueBadge(value, isLatest, isLatest ? trend : 'neutral', isNew);
            valuesContainer.appendChild(badge);
        });

        return valuesContainer;
    }

    function renderLocationPayload(payload) {
        const container = getHistoryContainer();
        if (!container) return console.warn('locationHistory: Could not create container.');

        const data = (payload && payload.data) || payload.locations || payload;
        const locationName = (data && data.name) || 'Unknown location';
        const berths = (data && data.berths) || [];

        container.innerHTML = '';

        const h2 = document.createElement('h2');
        h2.textContent = `${locationName} - Live Data History`;
        container.appendChild(h2);

        berths.forEach(berth => {
            const berthDiv = document.createElement('div');
            berthDiv.className = 'berth';

            const berthHeader = document.createElement('h3');
            berthHeader.textContent = berth.name || 'Unnamed berth';
            berthDiv.appendChild(berthHeader);

            // Radars Section
            const radarSection = document.createElement('div');
            radarSection.className = 'radars';
            const radarTitle = document.createElement('span');
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

            berthDiv.appendChild(radarSection);

            // Bollards & Hooks Section
            const bollardSection = document.createElement('div');
            bollardSection.className = 'bollards';
            const bollardTitle = document.createElement('span');
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

                if (anyHook || !b.hooks || b.hooks.length === 0) {
                    bollardSection.appendChild(bDiv);
                }
            });

            berthDiv.appendChild(bollardSection);
            container.appendChild(berthDiv);
        });
    }

    function attachToEvtSource() {
        const es = window.evtSource;
        if (!es) {
            console.warn('locationHistory: evtSource not found on window. Ensure locationHistory.js is loaded after main.js.');
            return;
        }

        console.log('locationHistory: attaching to evtSource');

        es.addEventListener('message', function(event) {
            try {
                const payload = JSON.parse(event.data);
                console.log('locationHistory received payload:', payload);

                if (payload && (payload.data || payload.berths || payload.name)) {
                    renderLocationPayload(payload);
                }
            } catch (e) {
                console.error('locationHistory: failed to parse SSE payload', e);
            }
        });

        es.addEventListener('error', function(err) {
            console.error('locationHistory: SSE error', err);
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

    // Expose histories for debugging
    window._locationRadarHistory = radarHistory;
    window._locationHookHistory = hookHistory;
    window._previousValues = previousValues;
})();