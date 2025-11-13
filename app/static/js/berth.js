(function() {
    'use strict';

    const MAX_HISTORY = 5;
    const radarHistory = {};
    const hookHistory = {};
    const previousValues = {}; // Track previous values for trend detection
    
    // Threshold constants
    const TENSION_THRESHOLD_HIGH = 7;
    const TENSION_THRESHOLD_LOW = -1;
    const CONSECUTIVE_CHANGES_THRESHOLD = 5;
    
    // Track displayed items for delay
    const displayedPriorityItems = new Set();

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
    
    function updateConsecutiveChanges(key, history) {
        // Check last CONSECUTIVE_CHANGES_THRESHOLD changes in history
        if (!history || history.length < 2) {
            return { direction: 'neutral', count: 0 };
        }
        
        // Count consecutive changes from the most recent
        let consecutiveCount = 0;
        let direction = 'neutral';
        
        // Start from the most recent value and work backwards
        for (let i = history.length - 1; i > 0; i--) {
            const current = history[i];
            const previous = history[i - 1];
            const trend = getTrend(current, previous);
            
            if (trend === 'neutral') {
                break;
            }
            
            if (direction === 'neutral') {
                direction = trend;
                consecutiveCount = 1;
            } else if (direction === trend) {
                consecutiveCount++;
            } else {
                break;
            }
        }
        
        return { direction: direction, count: consecutiveCount };
    }
    
    function checkPriority(key, tension, consecutiveData) {
        const issues = [];
        
        // Check threshold
        if (tension > TENSION_THRESHOLD_HIGH) {
            issues.push({
                type: 'threshold',
                severity: 'high',
                message: 'Higher than threshold',
                color: 'red'
            });
        } else if (tension < TENSION_THRESHOLD_LOW) {
            issues.push({
                type: 'threshold',
                severity: 'low',
                message: 'Lower than threshold',
                color: 'red'
            });
        }
        
        // Check consecutive changes
        if (consecutiveData.count >= CONSECUTIVE_CHANGES_THRESHOLD) {
            const directionText = consecutiveData.direction === 'up' ? 'Increased' : 'Decreased';
            issues.push({
                type: 'consecutive',
                severity: 'consecutive',
                message: `${directionText} ${CONSECUTIVE_CHANGES_THRESHOLD} consecutive times`,
                color: 'orange'
            });
        }
        
        return issues;
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
    
    function createStatusSection(hasIssues) {
        const statusSection = document.createElement('div');
        statusSection.className = 'status-section';
        
        const audio = document.getElementById('alertSound');

        if (hasIssues) {
        statusSection.classList.add('status-red');
        
        // Play alert sound when issues are detected
            if (audio) {
                audio.pause();

                // Reset playback in case it's already playing
                audio.currentTime = 0;
                audio.play().catch(err => {
                    console.log("Audio playback failed (browser restriction):", err);
                });
        }
    } else {
            statusSection.classList.add('status-green');
                    // Stop audio when system returns to normal
            if (audio) {
                audio.pause();
                audio.currentTime = 0;
            }
        }
        
        const statusContent = document.createElement('div');
        statusContent.className = 'status-content';
        
        const statusIcon = document.createElement('div');
        statusIcon.className = 'status-icon';
        statusIcon.textContent = hasIssues ? '⚠️' : '✓';
        
        const statusTextContainer = document.createElement('div');
        statusTextContainer.className = 'status-text-container';
        
        const statusTitle = document.createElement('h2');
        statusTitle.className = 'status-title';
        statusTitle.textContent = 'Status';
        
        const statusMessage = document.createElement('p');
        statusMessage.className = 'status-message';
        statusMessage.textContent = hasIssues ? 'Issues Detected' : 'All Systems Normal';
        
        statusTextContainer.appendChild(statusTitle);
        statusTextContainer.appendChild(statusMessage);
        
        statusContent.appendChild(statusIcon);
        statusContent.appendChild(statusTextContainer);
        statusSection.appendChild(statusContent);
        
        return statusSection;
    }
    
    function createHookAlertItem(hookInfo, issue, tension) {
        const alertItem = document.createElement('div');
        alertItem.className = `hook-alert-item hook-alert-${issue.color}`;
        
        const leftContent = document.createElement('div');
        leftContent.className = 'hook-alert-left';
        
        const hookLabel = document.createElement('span');
        hookLabel.className = 'hook-alert-label';
        hookLabel.textContent = `${hookInfo.bollardName} - ${hookInfo.hookName} (${hookInfo.attachedLine})`;
        
        const tensionValue = document.createElement('span');
        tensionValue.className = 'hook-alert-tension';
        tensionValue.textContent = `Tension: ${formatValue(tension)}`;
        
        leftContent.appendChild(hookLabel);
        leftContent.appendChild(tensionValue);
        
        const rightContent = document.createElement('div');
        rightContent.className = 'hook-alert-right';
        rightContent.textContent = issue.message;
        
        alertItem.appendChild(leftContent);
        alertItem.appendChild(rightContent);
        
        return alertItem;
    }
    
    function createRadarAlertItem(radarName, directionText) {
        const alertItem = document.createElement('div');
        alertItem.className = 'radar-alert-item';
        
        const leftContent = document.createElement('div');
        leftContent.className = 'radar-alert-left';
        
        const radarLabel = document.createElement('span');
        radarLabel.className = 'radar-alert-label';
        radarLabel.textContent = radarName;
        
        leftContent.appendChild(radarLabel);
        
        const rightContent = document.createElement('div');
        rightContent.className = 'radar-alert-right';
        rightContent.textContent = `${directionText} ${CONSECUTIVE_CHANGES_THRESHOLD} consecutive times`;
        
        alertItem.appendChild(leftContent);
        alertItem.appendChild(rightContent);
        
        return alertItem;
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

        // Track all issues for status section
        let hasAnyIssues = false;
        const radarAlerts = [];
        const hookIssues = new Map(); // key -> { red: boolean, orange: boolean }

        // Create main berth card
        const berthCard = document.createElement('div');
        berthCard.className = 'berth-detail-card';

        // Radars Section
        const radarSection = document.createElement('div');
        radarSection.className = 'detail-section';
        const radarTitle = document.createElement('h2');
        radarTitle.className = 'section-title';
        radarTitle.textContent = 'Active Radars (Ship Distance History)';
        radarSection.appendChild(radarTitle);

        let hasActiveRadars = false;
        const radarRows = [];
        const orangeRadarRows = [];
        
        (berth.radars || []).forEach(r => {
            if (r && r.distanceStatus === 'ACTIVE') {
                hasActiveRadars = true;
                const key = `${berth.name}::RADAR::${r.name}`;
                
                // Use shipDistance instead of distanceChange
                const shipDistance = r.shipDistance !== undefined ? r.shipDistance : r.distanceChange;
                const previousValue = previousValues[key] || null;
                addToHistory(radarHistory, key, shipDistance);
                previousValues[key] = shipDistance;

                // Check for consecutive changes
                const history = radarHistory[key];
                const consecutiveData = updateConsecutiveChanges(key, history);
                
                const row = document.createElement('div');
                row.className = 'data-row';
                
                const label = document.createElement('span');
                label.className = 'data-label';
                label.textContent = r.name;
                row.appendChild(label);

                const valuesContainer = renderHistoryValues(radarHistory[key], key, previousValue);
                row.appendChild(valuesContainer);
                
                // Check if radar has 5 consecutive changes
                if (consecutiveData.count >= CONSECUTIVE_CHANGES_THRESHOLD) {
                    hasAnyIssues = true;
                    row.classList.add('data-row-orange');
                    
                    const directionText = consecutiveData.direction === 'up' ? 'Increased' : 'Decreased';
                    radarAlerts.push({
                        name: r.name,
                        direction: directionText
                    });
                    
                    orangeRadarRows.push(row);
                } else {
                    radarRows.push(row);
                }
            }
        });

        if (!hasActiveRadars) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.textContent = 'No active radars';
            radarSection.appendChild(emptyState);
        } else {
            // Add orange radar alerts at the top
            if (radarAlerts.length > 0) {
                const newItems = radarAlerts.filter(alert => {
                    const alertKey = `${berth.name}::RADAR::${alert.name}::ALERT`;
                    return !displayedPriorityItems.has(alertKey);
                });
                
                if (newItems.length > 0) {
                    // Render existing alerts immediately
                    const existingAlerts = radarAlerts.filter(alert => {
                        const alertKey = `${berth.name}::RADAR::${alert.name}::ALERT`;
                        return displayedPriorityItems.has(alertKey);
                    });
                    
                    if (existingAlerts.length > 0) {
                        const radarAlertsContainer = document.createElement('div');
                        radarAlertsContainer.className = 'radar-alerts-container';
                        existingAlerts.forEach(alert => {
                            const alertItem = createRadarAlertItem(alert.name, alert.direction);
                            radarAlertsContainer.appendChild(alertItem);
                        });
                        radarSection.appendChild(radarAlertsContainer);
                    }
                    
                    // Render new alerts with delay
                    setTimeout(() => {
                        const existingContainer = radarSection.querySelector('.radar-alerts-container');
                        if (existingContainer) {
                            existingContainer.remove();
                        }
                        
                        const radarAlertsContainer = document.createElement('div');
                        radarAlertsContainer.className = 'radar-alerts-container';
                        radarAlerts.forEach(alert => {
                            const alertItem = createRadarAlertItem(alert.name, alert.direction);
                            radarAlertsContainer.appendChild(alertItem);
                        });
                        
                        // Insert at the top (after title)
                        const titleElement = radarSection.querySelector('.section-title');
                        if (titleElement && titleElement.nextSibling) {
                            radarSection.insertBefore(radarAlertsContainer, titleElement.nextSibling);
                        } else {
                            radarSection.appendChild(radarAlertsContainer);
                        }
                    }, 1200);
                } else {
                    // All alerts already displayed, render immediately
                    const radarAlertsContainer = document.createElement('div');
                    radarAlertsContainer.className = 'radar-alerts-container';
                    radarAlerts.forEach(alert => {
                        const alertItem = createRadarAlertItem(alert.name, alert.direction);
                        radarAlertsContainer.appendChild(alertItem);
                    });
                    const titleElement = radarSection.querySelector('.section-title');
                    if (titleElement && titleElement.nextSibling) {
                        radarSection.insertBefore(radarAlertsContainer, titleElement.nextSibling);
                    } else {
                        radarSection.appendChild(radarAlertsContainer);
                    }
                }
                
                // Add orange radar rows at the top (after alerts)
                orangeRadarRows.forEach(row => radarSection.appendChild(row));
                
                // Add normal radar rows
                radarRows.forEach(row => radarSection.appendChild(row));
            } else {
                // No alerts, just add normal rows
                radarRows.forEach(row => radarSection.appendChild(row));
            }
        }

        berthCard.appendChild(radarSection);

        // Bollards & Hooks Section - Red alerts at top, Orange alerts next, then normal hooks
        const bollardSection = document.createElement('div');
        bollardSection.className = 'detail-section';
        const bollardTitle = document.createElement('h2');
        bollardTitle.className = 'section-title';
        bollardTitle.textContent = 'Bollards & Hooks in Use (Tension History)';
        bollardSection.appendChild(bollardTitle);

        // Collect hooks by category
        const redHooks = [];
        const orangeHooks = [];
        const whiteHooks = [];

        (berth.bollards || []).forEach(b => {
            (b.hooks || []).forEach(h => {
                if (h && h.attachedLine !== null && h.attachedLine !== undefined) {
                    const key = `${berth.name}::BOLLARD::${b.name}::HOOK::${h.name}`;
                    const previousValue = previousValues[key] || null;
                    addToHistory(hookHistory, key, h.tension);
                    previousValues[key] = h.tension;

                    // Check for priority issues
                    const history = hookHistory[key];
                    const consecutiveData = updateConsecutiveChanges(key, history);
                    const issues = checkPriority(key, h.tension, consecutiveData);
                    
                    const hookInfo = {
                        bollardName: b.name,
                        hookName: h.name,
                        attachedLine: h.attachedLine,
                        key: key,
                        previousValue: previousValue,
                        tension: h.tension
                    };
                    
                    // Check for red threshold issues (prioritize red over orange)
                    const redIssue = issues.find(i => i.color === 'red');
                    if (redIssue) {
                        hasAnyIssues = true;
                        redHooks.push({
                            info: hookInfo,
                            issue: redIssue
                        });
                    } else {
                        // Check for orange consecutive issues
                        const orangeIssue = issues.find(i => i.color === 'orange');
                        if (orangeIssue) {
                            hasAnyIssues = true;
                            orangeHooks.push({
                                info: hookInfo,
                                issue: orangeIssue
                            });
                        } else {
                            // Normal hook
                            whiteHooks.push({
                                bollard: b,
                                hook: h,
                                info: hookInfo
                            });
                        }
                    }
                }
            });
        });

        // Render red threshold hooks at the top
        if (redHooks.length > 0) {
            const redAlertsContainer = document.createElement('div');
            redAlertsContainer.className = 'hook-alerts-container hook-alerts-red';
            
            redHooks.forEach(hook => {
                const alertItem = createHookAlertItem(hook.info, hook.issue, hook.info.tension);
                redAlertsContainer.appendChild(alertItem);
            });
            
            bollardSection.appendChild(redAlertsContainer);
        }

        // Render orange consecutive change hooks next
        if (orangeHooks.length > 0) {
            const orangeAlertsContainer = document.createElement('div');
            orangeAlertsContainer.className = 'hook-alerts-container hook-alerts-orange';
            
            orangeHooks.forEach(hook => {
                const alertItem = createHookAlertItem(hook.info, hook.issue, hook.info.tension);
                orangeAlertsContainer.appendChild(alertItem);
            });
            
            bollardSection.appendChild(orangeAlertsContainer);
        }

        // Render normal hooks grouped by bollard (like image 4)
        const bollardsMap = new Map();
        whiteHooks.forEach(h => {
            if (!bollardsMap.has(h.bollard)) {
                bollardsMap.set(h.bollard, []);
            }
            bollardsMap.get(h.bollard).push(h);
        });

        bollardsMap.forEach((hooks, bollard) => {
            const bDiv = document.createElement('div');
            bDiv.className = 'subsection';

            const bHeader = document.createElement('div');
            bHeader.className = 'subsection-title';
            bHeader.textContent = bollard.name;
            bDiv.appendChild(bHeader);

            hooks.forEach(h => {
                const row = document.createElement('div');
                row.className = 'data-row';

                const label = document.createElement('span');
                label.className = 'data-label';
                label.textContent = `${h.hook.name} (${h.hook.attachedLine})`;
                row.appendChild(label);

                const valuesContainer = renderHistoryValues(hookHistory[h.info.key], h.info.key, h.info.previousValue);
                row.appendChild(valuesContainer);

                bDiv.appendChild(row);
            });

            bollardSection.appendChild(bDiv);
        });

        // Show empty state if no hooks at all
        if (redHooks.length === 0 && orangeHooks.length === 0 && whiteHooks.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.textContent = 'No hooks in use';
            bollardSection.appendChild(emptyState);
        }

        berthCard.appendChild(bollardSection);
        containers.berthDetailContainer.appendChild(berthCard);
        
        // Render Status section at the top
        const statusSection = createStatusSection(hasAnyIssues);
        containers.berthDetailContainer.insertBefore(statusSection, containers.berthDetailContainer.firstChild);
        
        // Update displayed items for radar alerts (after delay if new items)
        setTimeout(() => {
            radarAlerts.forEach(alert => {
                const alertKey = `${berth.name}::RADAR::${alert.name}::ALERT`;
                displayedPriorityItems.add(alertKey);
            });
            
            // Clean up displayedPriorityItems
            const currentKeys = new Set();
            radarAlerts.forEach(alert => {
                currentKeys.add(`${berth.name}::RADAR::${alert.name}::ALERT`);
            });
            
            displayedPriorityItems.forEach(key => {
                if (key.includes('::RADAR::') && !currentKeys.has(key)) {
                    displayedPriorityItems.delete(key);
                }
            });
        }, radarAlerts.length > 0 ? 1300 : 0);
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
