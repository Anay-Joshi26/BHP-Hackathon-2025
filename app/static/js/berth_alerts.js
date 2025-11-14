// berth_alerts.js - Handles the alerts/status page for a specific berth

(function() {
    'use strict';

    // Threshold constants (EXACT SAME AS berth.js)
    const TENSION_THRESHOLD_HIGH = 7;
    const TENSION_THRESHOLD_LOW = -1;
    const CONSECUTIVE_CHANGES_THRESHOLD = 5;
    const DISTANCE_THRESHOLD_HIGH = 15;  // MUST MATCH berth.js
    const DISTANCE_THRESHOLD_LOW = 0;    // MUST MATCH berth.js

    // Get berth name from URL - this is the ONLY berth we care about
    const pathParts = window.location.pathname.split('/').filter(p => p);
    let berthName = '';
    if (pathParts.length >= 2 && pathParts[pathParts.length - 1] === 'alerts') {
        berthName = decodeURIComponent(pathParts[pathParts.length - 2]);
    }

    // Log for debugging
    console.log('Berth Alerts Page - Berth Name:', berthName);

    const alertsContainer = document.getElementById('alerts-container');
    const locationNameContainer = document.getElementById('location-name');
    const shipNameContainer = document.getElementById('ship-name');

    // Track previous alert state to only vibrate on state change
    let previousHasIssues = false;
    
    // History tracking - scoped to THIS berth only
    const MAX_HISTORY = 5;
    const radarHistory = {};
    const hookHistory = {};
    const previousValues = {};

    // Get SSE connection from main.js
    const evtSource = window.evtSource;

    if (!evtSource) {
        alertsContainer.innerHTML = '<div class="empty-state">Error: Could not connect to data stream.</div>';
        return;
    }

    // Ensure audio context is initialized on user interaction (required for mobile)
    let audioContextInitialized = false;
    function initializeAudioContext() {
        if (!audioContextInitialized) {
            audioContextInitialized = true;
            // Pre-load audio for mobile
            const audio = document.getElementById('alertSound');
            if (audio) {
                audio.load();
            }
        }
    }
    
    // Initialize on any user interaction
    document.addEventListener('click', initializeAudioContext, { once: true });
    document.addEventListener('touchstart', initializeAudioContext, { once: true });
    document.addEventListener('keydown', initializeAudioContext, { once: true });

    // Listen for SSE messages
    evtSource.onmessage = function(event) {
        const payload = JSON.parse(event.data);
        updateAlerts(payload);
    };

    evtSource.onerror = function(err) {
        console.error('SSE connection error:', err);
    };

    function formatValue(value, decimals = 2) {
        if (value === null || value === undefined) return '—';
        return Number(value).toFixed(decimals);
    }

    function addToHistory(historyMap, key, value) {
        // EXACT SAME LOGIC AS berth.js
        if (value === null || value === undefined) return;
        if (!historyMap[key]) {
            historyMap[key] = [];
        }
        historyMap[key].push(value);
        if (historyMap[key].length > MAX_HISTORY) {
            historyMap[key].shift();
        }
    }

    function getTrend(current, previous) {
        // EXACT SAME LOGIC AS berth.js
        if (previous === null || previous === undefined) return 'neutral';
        if (current > previous) return 'up';
        if (current < previous) return 'down';
        return 'neutral';
    }

    function updateConsecutiveChanges(key, history) {
        // Need at least CONSECUTIVE_CHANGES_THRESHOLD + 1 values to detect CONSECUTIVE_CHANGES_THRESHOLD consecutive changes
        if (!history || history.length < CONSECUTIVE_CHANGES_THRESHOLD + 1) {
            return { direction: 'neutral', count: 0 };
        }

        // Count consecutive changes from the most recent
        let consecutiveCount = 0;
        let direction = 'neutral';

        // Start from the most recent value and work backwards
        for (let i = history.length - 1; i > 0; i--) {
            const current = history[i];
            const previous = history[i - 1];

            // Skip null/undefined values
            if (current === null || current === undefined || previous === null || previous === undefined) {
                break;
            }

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

    function checkPriority(key, value, consecutiveData) {
        const issues = [];
        
        // Check for threshold violations (red)
        if (value !== null && value !== undefined) {
            if (typeof value === 'number') {
                if (key.includes('RADAR')) {
                    if (value < DISTANCE_THRESHOLD_LOW || value > DISTANCE_THRESHOLD_HIGH) {
                        issues.push({ color: 'red', type: 'threshold' });
                    }
                } else if (key.includes('HOOK')) {
                    if (value > TENSION_THRESHOLD_HIGH || value < TENSION_THRESHOLD_LOW) {
                        issues.push({ color: 'red', type: 'threshold' });
                    }
                }
            }
        }
        
        // Check for consecutive changes (orange) - only if no red issue
        if (issues.length === 0 && consecutiveData.count >= CONSECUTIVE_CHANGES_THRESHOLD) {
            issues.push({ color: 'orange', type: 'consecutive' });
        }
        
        return issues;
    }

    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               (navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /MacIntel/.test(navigator.platform));
    }

    function vibratePhone() {
        // Only vibrate on mobile devices
        if (isMobileDevice() && navigator.vibrate) {
            try {
                // Vibration pattern: vibrate for 200ms, pause 100ms, vibrate 200ms, pause 100ms, vibrate 200ms
                navigator.vibrate([200, 100, 200, 100, 200]);
                console.log('Vibration triggered for berth:', berthName);
            } catch (err) {
                console.log("Vibration failed:", err);
            }
        }
    }

    function updateAlerts(payload) {
        const data = (payload && payload.data) || payload;
        const locationName = payload.location_name || data?.name || 'Unknown location';
        const allBerths = payload.berths || data?.berths || [];

        // Display location name
        if (locationNameContainer) {
            locationNameContainer.textContent = locationName;
            locationNameContainer.style.display = 'block';
        }

        // Find ONLY the specific berth we care about - filter out all others
        const berth = allBerths.find(b => b && b.name === berthName);

        if (!berth) {
            alertsContainer.innerHTML = '<div class="empty-state">Berth not found or no data available.</div>';
            if (shipNameContainer) {
                shipNameContainer.style.display = 'none';
            }
            previousHasIssues = false;
            return;
        }

        // Double-check we have the right berth
        if (berth.name !== berthName) {
            console.error('CRITICAL: Berth name mismatch! Expected:', berthName, 'Got:', berth.name);
            return;
        }

        console.log('Processing alerts for berth:', berthName, 'Only this berth will be processed.');

        // Display ship name
        if (shipNameContainer) {
            const shipName = (berth.ship && berth.ship.name) ? berth.ship.name : 'No Ship';
            shipNameContainer.textContent = shipName;
            shipNameContainer.style.display = 'block';
        }

        // Collect issues ONLY for THIS SPECIFIC BERTH
        const allRecommendations = [];
        let hasAnyIssues = false;
        
        // Arrays to store issues for THIS berth only
        const redRadarAlerts = [];
        const redHooks = [];

        // Process ONLY this berth's radars (EXACT SAME LOGIC AS berth.js)
        if (berth.radars && Array.isArray(berth.radars)) {
            berth.radars.forEach(r => {
                if (!r || r.distanceStatus !== 'ACTIVE') return;
                
                // Ensure key includes berth name for scoping (same format as berth.js)
                const key = `${berth.name}::RADAR::${r.name}`;
                
                // Use shipDistance instead of distanceChange (same as berth.js)
                const shipDistance = r.shipDistance !== undefined ? r.shipDistance : r.distanceChange;
                const previousValue = previousValues[key] || null;
                
                // Add to history (same as berth.js)
                addToHistory(radarHistory, key, shipDistance);
                previousValues[key] = shipDistance;

                // Check for consecutive changes (same as berth.js - even though we only use red alerts)
                const history = radarHistory[key];
                const consecutiveData = updateConsecutiveChanges(key, history);
                
                // Check for threshold violations (EXACT SAME LOGIC AS berth.js)
                const isThresholdViolation = shipDistance !== null && shipDistance !== undefined && 
                    (shipDistance < DISTANCE_THRESHOLD_LOW || shipDistance > DISTANCE_THRESHOLD_HIGH);
                
                // Add to redRadarAlerts if threshold violation (EXACT SAME AS berth.js)
                if (isThresholdViolation) {
                    hasAnyIssues = true;
                    redRadarAlerts.push({
                        name: r.name,
                        distance: shipDistance
                    });
                }
            });
        }

        // Process ONLY this berth's hooks (EXACT SAME LOGIC AS berth.js)
        if (berth.bollards && Array.isArray(berth.bollards)) {
            berth.bollards.forEach(b => {
                if (!b || !b.hooks || !Array.isArray(b.hooks)) return;
                
                b.hooks.forEach(h => {
                    if (!h) return;

                    const isInUse = h.attachedLine !== null && h.attachedLine !== undefined;
                    
                    if (!isInUse) return;
                    
                    // Key format must match berth.js exactly
                    const key = `${berth.name}::BOLLARD::${b.name}::HOOK::${h.name}`;
                    const tension = h.tension;
                    const previousValue = previousValues[key] || null;
                    
                    // Add to history (same as berth.js)
                    addToHistory(hookHistory, key, tension);
                    previousValues[key] = tension;

                    // Check for priority issues (EXACT SAME LOGIC AS berth.js)
                    const history = hookHistory[key];
                    const consecutiveData = updateConsecutiveChanges(key, history);
                    const issues = checkPriority(key, tension, consecutiveData);

                    // Check for red threshold issues (EXACT SAME AS berth.js)
                    const redIssue = issues.find(i => i.color === 'red');
                    if (redIssue) {
                        hasAnyIssues = true;
                        redHooks.push({
                            bollardName: b.name,
                            hookName: h.name,
                            tension: tension
                        });
                    }
                });
            });
        }

        // Generate recommendations ONLY from THIS berth's issues
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
                allRecommendations.push(message);
            }
        });
        
        // Add hook tension recommendations (EXACT SAME LOGIC AS berth.js)
        redHooks.forEach(hook => {
            const tension = hook.tension;
            let message = '';
            let percentage = 0;
            
            if (tension > TENSION_THRESHOLD_HIGH) {
                const decreaseNeeded = tension - TENSION_THRESHOLD_HIGH;
                percentage = tension !== 0 ? (decreaseNeeded / tension) * 100 : 0;
                message = `Tension on ${hook.bollardName}'s ${hook.hookName} should be decreased by ${formatValue(percentage)}%`;
            } else if (tension < TENSION_THRESHOLD_LOW && tension !== null && tension !== undefined) {
                if (Math.abs(tension) < 0.001) {
                    message = `Tension on ${hook.bollardName}'s ${hook.hookName} should be increased to ${TENSION_THRESHOLD_LOW}`;
                } else {
                    const increaseNeeded = TENSION_THRESHOLD_LOW - tension;
                    percentage = (increaseNeeded / Math.abs(tension)) * 100;
                    message = `Tension on ${hook.bollardName}'s ${hook.hookName} should be increased by ${formatValue(percentage)}%`;
                }
            }
            
            if (message) {
                allRecommendations.push(message);
            }
        });

        // Clear container
        alertsContainer.innerHTML = '';

        // Check if alert state changed from normal to issues (for vibration)
        const alertJustTriggered = hasAnyIssues && !previousHasIssues;
        previousHasIssues = hasAnyIssues;

        console.log('Berth:', berthName, 'Has Issues:', hasAnyIssues, 'Recommendations:', allRecommendations.length);

        // Create and display status section
        const statusSection = createStatusSection(hasAnyIssues, allRecommendations, alertJustTriggered);
        alertsContainer.appendChild(statusSection);
    }

    function createStatusSection(hasIssues, recommendations = [], alertJustTriggered = false) {
        const statusSection = document.createElement('div');
        statusSection.className = 'status-section status-section-alerts';

        const audio = document.getElementById('alertSound');

        if (hasIssues) {
            statusSection.classList.add('status-red');
            
            // Play alert sound when issues are detected
            if (audio) {
                // For mobile, ensure we try to play
                audio.volume = 1.0;
                const playPromise = audio.play();
                
                if (playPromise !== undefined) {
                    playPromise
                        .then(() => {
                            console.log('Audio played successfully for berth:', berthName);
                        })
                        .catch(err => {
                            console.log("Audio playback failed (browser restriction):", err);
                            
                            // Try to play again after user interaction
                            const tryPlayAgain = () => {
                                audio.play().catch(e => {
                                    console.log("Retry audio playback failed:", e);
                                });
                            };
                            
                            // Try again after user interaction
                            const events = ['click', 'touchstart', 'keydown'];
                            events.forEach(eventType => {
                                document.addEventListener(eventType, tryPlayAgain, { once: true });
                            });
                        });
                }
            }
            
            // Vibrate phone if on mobile device and alert was just triggered
            if (alertJustTriggered) {
                vibratePhone();
            }
        } else {
            statusSection.classList.add('status-green');
            // Stop audio when system returns to normal
            if (audio) {
                audio.pause();
                audio.currentTime = 0;
            }
            // Cancel any ongoing vibration
            if (navigator.vibrate) {
                navigator.vibrate(0);
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

})();
