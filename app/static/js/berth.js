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
    
    // Distance threshold constants
    const DISTANCE_THRESHOLD_HIGH = 12;
    const DISTANCE_THRESHOLD_LOW = 2;
    
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
            // Calculate percentage decrease needed to reach high threshold
            const decreaseNeeded = tension - TENSION_THRESHOLD_HIGH;
            const percentage = tension !== 0 ? (decreaseNeeded / tension) * 100 : 0;
            issues.push({
                type: 'threshold',
                severity: 'high',
                message: `Tension higher than the threshold decrease it by ${formatValue(percentage)}%`,
                color: 'red'
            });
        } else if (tension < TENSION_THRESHOLD_LOW && tension !== null && tension !== undefined) {
            // Calculate percentage increase needed to reach low threshold
            // Avoid division by zero for very small or zero tension values
            if (Math.abs(tension) < 0.001) {
                // If tension is essentially zero, just state it needs to reach threshold
                issues.push({
                    type: 'threshold',
                    severity: 'low',
                    message: `Tension lower than the threshold increase it to ${TENSION_THRESHOLD_LOW}`,
                    color: 'red'
                });
            } else {
                const increaseNeeded = TENSION_THRESHOLD_LOW - tension;
                const percentage = (increaseNeeded / Math.abs(tension)) * 100;
                issues.push({
                    type: 'threshold',
                    severity: 'low',
                    message: `Tension lower than the threshold increase it by ${formatValue(percentage)}%`,
                    color: 'red'
                });
            }
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
    
    function prepareBollardChartData(hooksData) {
        const traces = [];
        const annotations = [];
        const colors = [
            '#667eea', '#f093fb', '#4facfe', '#43e97b', 
            '#fa709a', '#fee140', '#30cfd0', '#a8edea',
            '#ff9a9e', '#fecfef', '#ffecd2', '#a8c8ec'
        ];
        
        // Find min and max values for scaling
        let minValue = Infinity;
        let maxValue = -Infinity;
        let maxX = 5;
        
        hooksData.forEach((hook, index) => {
            const history = hookHistory[hook.key] || [];
            if (history.length === 0) return;
            
            // Create x axis data (time points)
            const x = history.map((_, i) => i + 1);
            const y = history.filter(val => val !== null && val !== undefined);
            const xFiltered = x.slice(0, y.length);
            
            if (y.length === 0) return;
            
            maxX = Math.max(maxX, Math.max(...xFiltered));
            
            // Update min/max
            y.forEach(val => {
                minValue = Math.min(minValue, val);
                maxValue = Math.max(maxValue, val);
            });
            
            // Get the last point for annotation
            const lastX = xFiltered[xFiltered.length - 1];
            const lastY = y[y.length - 1];
            
            // Create trace for this hook
            traces.push({
                x: xFiltered,
                y: y,
                type: 'scatter',
                mode: 'lines+markers',
                name: `${hook.hookName} (${hook.attachedLine})`,
                line: {
                    color: colors[index % colors.length],
                    width: 2.5
                },
                marker: {
                    color: colors[index % colors.length],
                    size: 7,
                    line: {
                        color: 'white',
                        width: 1
                    }
                },
                hovertemplate: `<b>${hook.hookName} (${hook.attachedLine})</b><br>` +
                              `Tension: %{y:.2f}<br>` +
                              `Time: %{x}<extra></extra>`,
                showlegend: false
            });
            
            // Add annotation for line label
            annotations.push({
                x: lastX,
                y: lastY,
                text: `${hook.hookName}`,
                showarrow: false,
                font: {
                    color: colors[index % colors.length],
                    size: 11,
                    family: 'Arial, sans-serif',
                    weight: 'bold'
                },
                bgcolor: 'rgba(255, 255, 255, 0.8)',
                bordercolor: colors[index % colors.length],
                borderwidth: 1,
                borderpad: 4,
                xanchor: 'left',
                xshift: 8
            });
        });
        
        // Include thresholds in the range
        minValue = Math.min(minValue, TENSION_THRESHOLD_LOW - 1);
        maxValue = Math.max(maxValue, TENSION_THRESHOLD_HIGH + 1);
        
        // Add padding to range
        const range = maxValue - minValue;
        const padding = range * 0.1;
        minValue -= padding;
        maxValue += padding;
        
        // Add threshold lines
        traces.push({
            x: [0.5, maxX + 0.5],
            y: [TENSION_THRESHOLD_LOW, TENSION_THRESHOLD_LOW],
            type: 'scatter',
            mode: 'lines',
            name: `Low Threshold (${TENSION_THRESHOLD_LOW})`,
            line: {
                color: '#dc2626',
                width: 2,
                dash: 'dash'
            },
            hoverinfo: 'skip',
            showlegend: false
        });
        
        traces.push({
            x: [0.5, maxX + 0.5],
            y: [TENSION_THRESHOLD_HIGH, TENSION_THRESHOLD_HIGH],
            type: 'scatter',
            mode: 'lines',
            name: `High Threshold (${TENSION_THRESHOLD_HIGH})`,
            line: {
                color: '#dc2626',
                width: 2,
                dash: 'dash'
            },
            hoverinfo: 'skip',
            showlegend: false
        });
        
        // Add threshold labels as annotations
        annotations.push({
            x: maxX + 0.3,
            y: TENSION_THRESHOLD_LOW,
            text: `Low: ${TENSION_THRESHOLD_LOW}`,
            showarrow: false,
            font: {
                color: '#dc2626',
                size: 10,
                family: 'Arial, sans-serif'
            },
            bgcolor: 'rgba(255, 255, 255, 0.9)',
            bordercolor: '#dc2626',
            borderwidth: 1,
            borderpad: 3,
            xanchor: 'left'
        });
        
        annotations.push({
            x: maxX + 0.3,
            y: TENSION_THRESHOLD_HIGH,
            text: `High: ${TENSION_THRESHOLD_HIGH}`,
            showarrow: false,
            font: {
                color: '#dc2626',
                size: 10,
                family: 'Arial, sans-serif'
            },
            bgcolor: 'rgba(255, 255, 255, 0.9)',
            bordercolor: '#dc2626',
            borderwidth: 1,
            borderpad: 3,
            xanchor: 'left'
        });
        
        return { traces, annotations, minValue, maxValue, maxX };
    }
    
    function createBollardChart(bollardName, hooksData) {
        // Create chart container with consistent ID based on bollard name
        const chartContainer = document.createElement('div');
        chartContainer.className = 'bollard-chart-container';
        const chartId = `chart-${bollardName.replace(/\s+/g, '-')}`;
        chartContainer.id = chartId;
        
        const chartData = prepareBollardChartData(hooksData);
        
        // Layout configuration
        const layout = {
            title: {
                text: `${bollardName} Tension History`,
                font: {
                    size: 16,
                    color: '#2d3748',
                    family: 'Arial, sans-serif'
                },
                x: 0.5,
                xanchor: 'center'
            },
            xaxis: {
                title: {
                    text: 'Time',
                    font: { size: 13, color: '#718096' }
                },
                tickfont: { size: 11, color: '#718096' },
                gridcolor: '#e2e8f0',
                zeroline: false,
                range: [0.5, Math.max(chartData.maxX + 0.5, 5.5)],
                showgrid: true
            },
            yaxis: {
                title: {
                    text: 'Tension',
                    font: { size: 13, color: '#718096' }
                },
                tickfont: { size: 11, color: '#718096' },
                gridcolor: '#e2e8f0',
                range: [chartData.minValue, chartData.maxValue],
                showgrid: true
            },
            plot_bgcolor: 'white',
            paper_bgcolor: 'white',
            hovermode: 'closest',
            showlegend: false,
            annotations: chartData.annotations,
            margin: { l: 70, r: 80, t: 60, b: 60 },
            height: 450,
            autosize: true
        };
        
        // Configuration
        const config = {
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
            toImageButtonOptions: {
                format: 'png',
                filename: `${bollardName}-tension-history`,
                height: 450,
                width: 800,
                scale: 2
            }
        };
        
        // Render the chart after container is added to DOM
        setTimeout(() => {
            if (typeof Plotly !== 'undefined') {
                Plotly.newPlot(chartId, chartData.traces, layout, config);
            }
        }, 100);
        
        return chartContainer;
    }
    
    function updateBollardChart(chartId, hooksData) {
        if (typeof Plotly === 'undefined' || !document.getElementById(chartId)) return;
        
        const chartData = prepareBollardChartData(hooksData);
        
        // Update only the data, not the layout
        const update = {
            x: chartData.traces.map(t => t.x),
            y: chartData.traces.map(t => t.y),
            'marker.size': chartData.traces.map(t => t.marker?.size || 7),
            'line.width': chartData.traces.map(t => t.line?.width || 2.5)
        };
        
        const layoutUpdate = {
            'yaxis.range': [chartData.minValue, chartData.maxValue],
            'xaxis.range': [0.5, Math.max(chartData.maxX + 0.5, 5.5)],
            'annotations': chartData.annotations
        };
        
        Plotly.update(chartId, update, layoutUpdate, {}, {transition: {
            duration: 300,
            easing: 'cubic-in-out'
        }});
    }
    
    function createStatusSection(hasIssues, recommendations = []) {
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
        
        // Add recommendations if there are issues
        if (hasIssues && recommendations.length > 0) {
            const recommendationsContainer = document.createElement('div');
            recommendationsContainer.className = 'status-recommendations';
            
            const recommendationsList = document.createElement('ul');
            recommendationsList.className = 'recommendations-list';
            
            recommendations.forEach(recommendation => {
                const listItem = document.createElement('li');
                listItem.className = 'recommendation-item';
                listItem.textContent = recommendation;
                recommendationsList.appendChild(listItem);
            });
            
            recommendationsContainer.appendChild(recommendationsList);
            statusSection.appendChild(recommendationsContainer);
        }
        
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
    
    function createRadarAlertItem(radarName, directionText, isThreshold = false, distance = null) {
        const alertItem = document.createElement('div');
        alertItem.className = isThreshold ? 'radar-alert-item radar-alert-red' : 'radar-alert-item radar-alert-orange';
        
        const leftContent = document.createElement('div');
        leftContent.className = 'radar-alert-left';
        
        const radarLabel = document.createElement('span');
        radarLabel.className = 'radar-alert-label';
        radarLabel.textContent = radarName;
        
        if (isThreshold && distance !== null) {
            const distanceValue = document.createElement('span');
            distanceValue.className = 'radar-alert-distance';
            distanceValue.textContent = `Distance: ${formatValue(distance)}`;
            leftContent.appendChild(radarLabel);
            leftContent.appendChild(distanceValue);
        } else {
            leftContent.appendChild(radarLabel);
        }
        
        const rightContent = document.createElement('div');
        rightContent.className = 'radar-alert-right';
        
        if (isThreshold && distance !== null) {
            let message = '';
            let percentage = 0;
            
            if (distance < DISTANCE_THRESHOLD_LOW) {
                // Calculate percentage increase needed to reach low threshold
                const increaseNeeded = DISTANCE_THRESHOLD_LOW - distance;
                percentage = (increaseNeeded / distance) * 100;
                message = `Distance is below the threshold increase it by ${formatValue(percentage)}%`;
            } else if (distance > DISTANCE_THRESHOLD_HIGH) {
                // Calculate percentage decrease needed to reach high threshold
                const decreaseNeeded = distance - DISTANCE_THRESHOLD_HIGH;
                percentage = (decreaseNeeded / distance) * 100;
                message = `Distance is higher than the threshold decrease it by ${formatValue(percentage)}%`;
            } else {
                message = 'Distance is within threshold';
            }
            
            rightContent.textContent = message;
        } else {
            rightContent.textContent = `${directionText} ${CONSECUTIVE_CHANGES_THRESHOLD} consecutive times`;
        }
        
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

        // Find the berth matching the current page
        const berth = berths.find(b => b && b.name === berthName);
        
        // Get ship name from berth
        const shipName = (berth && berth.ship && berth.ship.name) ? berth.ship.name : 'No Ship';
        
        // Display location name and ship name
        if (containers.locationNameContainer) {
            containers.locationNameContainer.innerHTML = `
                <span class="location-name">${locationName}</span>
                <span class="ship-name">${shipName}</span>
            `;
        }
        
        if (!berth) {
            // Show waiting message if no berth found yet
            if (berths.length === 0) {
                containers.berthDetailContainer.innerHTML = '<div class="empty-state">Waiting for data...</div>';
            } else {
                containers.berthDetailContainer.innerHTML = '<div class="empty-state">Berth not found or no data available.</div>';
            }
            return;
        }

        // Preserve existing chart containers before clearing
        const existingCharts = new Map();
        if (containers.berthDetailContainer) {
            const chartContainers = containers.berthDetailContainer.querySelectorAll('.bollard-chart-container');
            chartContainers.forEach(chartContainer => {
                const chartId = chartContainer.id;
                if (chartId) {
                    const bollardName = chartId.replace('chart-', '').replace(/-/g, ' ');
                    existingCharts.set(bollardName, {
                        element: chartContainer,
                        id: chartId
                    });
                }
            });
        }
        
        // Clear container
        containers.berthDetailContainer.innerHTML = '';

        // Track all issues for status section
        let hasAnyIssues = false;
        const hookIssues = new Map(); // key -> { red: boolean, orange: boolean }
        
        // Initialize chart tracking
        if (!window.bollardChartsMap) {
            window.bollardChartsMap = new Map();
        }

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
        const redRadarAlerts = [];
        const orangeRadarAlerts = [];
        const radarRows = [];
        
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
                
                // Check for distance threshold violations (prioritize red over orange)
                const isThresholdViolation = shipDistance !== null && shipDistance !== undefined && 
                    (shipDistance < DISTANCE_THRESHOLD_LOW || shipDistance > DISTANCE_THRESHOLD_HIGH);
                
                const row = document.createElement('div');
                row.className = 'data-row';
                
                const label = document.createElement('span');
                label.className = 'data-label';
                label.textContent = r.name;
                row.appendChild(label);

                const valuesContainer = renderHistoryValues(radarHistory[key], key, previousValue);
                row.appendChild(valuesContainer);
                
                // Check for threshold violations first (red)
                if (isThresholdViolation) {
                    hasAnyIssues = true;
                    row.classList.add('data-row-red');
                    
                    redRadarAlerts.push({
                        name: r.name,
                        distance: shipDistance
                    });
                } else if (consecutiveData.count >= CONSECUTIVE_CHANGES_THRESHOLD) {
                    // Check for consecutive changes (orange) - only if not threshold violation
                    hasAnyIssues = true;
                    row.classList.add('data-row-orange');
                    
                    const directionText = consecutiveData.direction === 'up' ? 'Increased' : 'Decreased';
                    orangeRadarAlerts.push({
                        name: r.name,
                        direction: directionText
                    });
                    
                    radarRows.push(row);
                } else {
                    // Normal radar
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
            // Add red radar alerts at the top (threshold violations)
            if (redRadarAlerts.length > 0) {
                const redAlertsContainer = document.createElement('div');
                redAlertsContainer.className = 'radar-alerts-container radar-alerts-red';
                
                redRadarAlerts.forEach(alert => {
                    const alertItem = createRadarAlertItem(alert.name, null, true, alert.distance);
                    redAlertsContainer.appendChild(alertItem);
                });
                
                const titleElement = radarSection.querySelector('.section-title');
                if (titleElement && titleElement.nextSibling) {
                    radarSection.insertBefore(redAlertsContainer, titleElement.nextSibling);
                } else {
                    radarSection.appendChild(redAlertsContainer);
                }
            }

            // Add orange radar alerts next (consecutive changes)
            if (orangeRadarAlerts.length > 0) {
                const newItems = orangeRadarAlerts.filter(alert => {
                    const alertKey = `${berth.name}::RADAR::${alert.name}::ALERT`;
                    return !displayedPriorityItems.has(alertKey);
                });
                
                if (newItems.length > 0) {
                    // Render existing alerts immediately
                    const existingAlerts = orangeRadarAlerts.filter(alert => {
                        const alertKey = `${berth.name}::RADAR::${alert.name}::ALERT`;
                        return displayedPriorityItems.has(alertKey);
                    });
                    
                    if (existingAlerts.length > 0) {
                        const orangeAlertsContainer = document.createElement('div');
                        orangeAlertsContainer.className = 'radar-alerts-container radar-alerts-orange';
                        existingAlerts.forEach(alert => {
                            const alertItem = createRadarAlertItem(alert.name, alert.direction, false);
                            orangeAlertsContainer.appendChild(alertItem);
                        });
                        
                        const redContainer = radarSection.querySelector('.radar-alerts-red');
                        if (redContainer && redContainer.nextSibling) {
                            radarSection.insertBefore(orangeAlertsContainer, redContainer.nextSibling);
                        } else {
                            radarSection.appendChild(orangeAlertsContainer);
                        }
                    }
                    
                    // Render new alerts with delay
                    setTimeout(() => {
                        const existingContainer = radarSection.querySelector('.radar-alerts-orange');
                        if (existingContainer) {
                            existingContainer.remove();
                        }
                        
                        const orangeAlertsContainer = document.createElement('div');
                        orangeAlertsContainer.className = 'radar-alerts-container radar-alerts-orange';
                        orangeRadarAlerts.forEach(alert => {
                            const alertItem = createRadarAlertItem(alert.name, alert.direction, false);
                            orangeAlertsContainer.appendChild(alertItem);
                        });
                        
                        // Insert after red alerts or at top
                        const redContainer = radarSection.querySelector('.radar-alerts-red');
                        if (redContainer && redContainer.nextSibling) {
                            radarSection.insertBefore(orangeAlertsContainer, redContainer.nextSibling);
                        } else {
                            const titleElement = radarSection.querySelector('.section-title');
                            if (titleElement && titleElement.nextSibling) {
                                radarSection.insertBefore(orangeAlertsContainer, titleElement.nextSibling);
                            } else {
                                radarSection.appendChild(orangeAlertsContainer);
                            }
                        }
                    }, 1200);
                } else {
                    // All alerts already displayed, render immediately
                    const orangeAlertsContainer = document.createElement('div');
                    orangeAlertsContainer.className = 'radar-alerts-container radar-alerts-orange';
                    orangeRadarAlerts.forEach(alert => {
                        const alertItem = createRadarAlertItem(alert.name, alert.direction, false);
                        orangeAlertsContainer.appendChild(alertItem);
                    });
                    
                    const redContainer = radarSection.querySelector('.radar-alerts-red');
                    if (redContainer && redContainer.nextSibling) {
                        radarSection.insertBefore(orangeAlertsContainer, redContainer.nextSibling);
                    } else {
                        const titleElement = radarSection.querySelector('.section-title');
                        if (titleElement && titleElement.nextSibling) {
                            radarSection.insertBefore(orangeAlertsContainer, titleElement.nextSibling);
                        } else {
                            radarSection.appendChild(orangeAlertsContainer);
                        }
                    }
                }
            }
            
            // Add normal radar rows at the bottom
            radarRows.forEach(row => radarSection.appendChild(row));
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

        // Collect all hooks by bollard for charts (including red, orange, and white hooks)
        const allBollardsMap = new Map();
        
        // Add red hooks
        redHooks.forEach(hook => {
            const bollardName = hook.info.bollardName;
            if (!allBollardsMap.has(bollardName)) {
                allBollardsMap.set(bollardName, []);
            }
            allBollardsMap.get(bollardName).push(hook.info);
        });
        
        // Add orange hooks
        orangeHooks.forEach(hook => {
            const bollardName = hook.info.bollardName;
            if (!allBollardsMap.has(bollardName)) {
                allBollardsMap.set(bollardName, []);
            }
            allBollardsMap.get(bollardName).push(hook.info);
        });
        
        // Add white hooks
        whiteHooks.forEach(h => {
            const bollardName = h.bollard.name;
            if (!allBollardsMap.has(bollardName)) {
                allBollardsMap.set(bollardName, []);
            }
            allBollardsMap.get(bollardName).push(h.info);
        });

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

            const subsectionHeader = document.createElement('div');
            subsectionHeader.className = 'subsection-header';
            
            const bHeader = document.createElement('div');
            bHeader.className = 'subsection-title';
            bHeader.textContent = bollard.name;
            subsectionHeader.appendChild(bHeader);
            
            bDiv.appendChild(subsectionHeader);

            const subsectionContent = document.createElement('div');
            subsectionContent.className = 'subsection-content';

            const hooksContainer = document.createElement('div');
            hooksContainer.className = 'hooks-container';

            hooks.forEach(h => {
                const row = document.createElement('div');
                row.className = 'data-row';

                const label = document.createElement('span');
                label.className = 'data-label';
                label.textContent = `${h.hook.name} (${h.hook.attachedLine})`;
                row.appendChild(label);

                const valuesContainer = renderHistoryValues(hookHistory[h.info.key], h.info.key, h.info.previousValue);
                row.appendChild(valuesContainer);

                hooksContainer.appendChild(row);
            });

            subsectionContent.appendChild(hooksContainer);
            
            // Add chart if there are hooks for this bollard
            const allHooksForBollard = allBollardsMap.get(bollard.name) || [];
            if (allHooksForBollard.length > 0) {
                const chartId = `chart-${bollard.name.replace(/\s+/g, '-')}`;
                const preservedChart = existingCharts.get(bollard.name);
                
                if (preservedChart && preservedChart.element) {
                    // Use preserved chart container and update it
                    subsectionContent.appendChild(preservedChart.element);
                    // Update chart data after a short delay to ensure it's in DOM
                    setTimeout(() => {
                        updateBollardChart(chartId, allHooksForBollard);
                    }, 50);
                } else {
                    // Create new chart
                    const chart = createBollardChart(bollard.name, allHooksForBollard);
                    subsectionContent.appendChild(chart);
                    window.bollardChartsMap.set(bollard.name, { id: chartId, hooks: allHooksForBollard });
                }
            }
            
            bDiv.appendChild(subsectionContent);
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
        
        // Collect recommendations for status section
        const recommendations = [];
        
        // Add radar distance recommendations
        redRadarAlerts.forEach(alert => {
            const distance = alert.distance;
            let message = '';
            let percentage = 0;
            
            if (distance < DISTANCE_THRESHOLD_LOW) {
                const increaseNeeded = DISTANCE_THRESHOLD_LOW - distance;
                percentage = (increaseNeeded / distance) * 100;
                message = `Distance at radar ${alert.name} should be increased by ${formatValue(percentage)}%`;
            } else if (distance > DISTANCE_THRESHOLD_HIGH) {
                const decreaseNeeded = distance - DISTANCE_THRESHOLD_HIGH;
                percentage = (decreaseNeeded / distance) * 100;
                message = `Distance at radar ${alert.name} should be decreased by ${formatValue(percentage)}%`;
            }
            
            if (message) {
                recommendations.push(message);
            }
        });
        
        // Add hook tension recommendations
        redHooks.forEach(hook => {
            const tension = hook.info.tension;
            const redIssue = hook.issue;
            let message = '';
            let percentage = 0;
            
            if (tension > TENSION_THRESHOLD_HIGH) {
                const decreaseNeeded = tension - TENSION_THRESHOLD_HIGH;
                percentage = tension !== 0 ? (decreaseNeeded / tension) * 100 : 0;
                message = `Tension on ${hook.info.bollardName}'s ${hook.info.hookName} should be decreased by ${formatValue(percentage)}%`;
            } else if (tension < TENSION_THRESHOLD_LOW && tension !== null && tension !== undefined) {
                if (Math.abs(tension) < 0.001) {
                    message = `Tension on ${hook.info.bollardName}'s ${hook.info.hookName} should be increased to ${TENSION_THRESHOLD_LOW}`;
                } else {
                    const increaseNeeded = TENSION_THRESHOLD_LOW - tension;
                    percentage = (increaseNeeded / Math.abs(tension)) * 100;
                    message = `Tension on ${hook.info.bollardName}'s ${hook.info.hookName} should be increased by ${formatValue(percentage)}%`;
                }
            }
            
            if (message) {
                recommendations.push(message);
            }
        });
        
        // Render Status section at the top with recommendations
        const statusSection = createStatusSection(hasAnyIssues, recommendations);
        containers.berthDetailContainer.insertBefore(statusSection, containers.berthDetailContainer.firstChild);
        
        // Update displayed items for orange radar alerts (after delay if new items)
        setTimeout(() => {
            orangeRadarAlerts.forEach(alert => {
                const alertKey = `${berth.name}::RADAR::${alert.name}::ALERT`;
                displayedPriorityItems.add(alertKey);
            });
            
            // Clean up displayedPriorityItems for orange radar alerts
            const currentOrangeKeys = new Set();
            orangeRadarAlerts.forEach(alert => {
                currentOrangeKeys.add(`${berth.name}::RADAR::${alert.name}::ALERT`);
            });
            
            displayedPriorityItems.forEach(key => {
                if (key.includes('::RADAR::') && key.includes('::ALERT') && !currentOrangeKeys.has(key)) {
                    displayedPriorityItems.delete(key);
                }
            });
        }, orangeRadarAlerts.length > 0 ? 1300 : 0);
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
