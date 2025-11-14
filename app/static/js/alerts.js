// alerts.js - Handles the alerts/status page

(function() {
    'use strict';

    // Threshold constants (same as berth.js)
    const TENSION_THRESHOLD_HIGH = 7;
    const TENSION_THRESHOLD_LOW = -1;
    const CONSECUTIVE_CHANGES_THRESHOLD = 4;
    const DISTANCE_THRESHOLD_HIGH = 15;
    const DISTANCE_THRESHOLD_LOW = 0;

    const alertsContainer = document.getElementById('alerts-container');
    const locationNameContainer = document.getElementById('location-name');

    // Get SSE connection from main.js
    const evtSource = window.evtSource;

    if (!evtSource) {
        alertsContainer.innerHTML = '<div class="empty-state">Error: Could not connect to data stream.</div>';
        return;
    }

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

    function updateAlerts(payload) {
        const data = (payload && payload.data) || payload;
        const locationName = payload.location_name || data?.name || 'Unknown location';
        const berths = payload.berths || data?.berths || [];

        // Display location name
        if (locationNameContainer) {
            locationNameContainer.textContent = locationName;
            locationNameContainer.style.display = 'block';
        }

        // Collect all issues across all berths
        const allRecommendations = [];
        let hasAnyIssues = false;

        berths.forEach(berth => {
            if (!berth) return;

            // Check radars for distance threshold violations
            (berth.radars || []).forEach(r => {
                if (r && r.distanceStatus === 'ACTIVE') {
                    const shipDistance = r.shipDistance !== undefined ? r.shipDistance : (r.distanceChange !== undefined ? r.distanceChange : null);
                    if (shipDistance !== null && shipDistance !== undefined) {
                        if (shipDistance < DISTANCE_THRESHOLD_LOW || shipDistance > DISTANCE_THRESHOLD_HIGH) {
                            hasAnyIssues = true;
                            let message = '';
                            let percentage = 0;

                            if (shipDistance < DISTANCE_THRESHOLD_LOW) {
                                const increaseNeeded = DISTANCE_THRESHOLD_LOW - shipDistance;
                                percentage = Math.abs(shipDistance) > 0.001 ? (increaseNeeded / Math.abs(shipDistance)) * 100 : 0;
                                message = `Distance at radar ${r.name} should be increased by ${formatValue(percentage)}%`;
                            } else if (shipDistance > DISTANCE_THRESHOLD_HIGH) {
                                const decreaseNeeded = shipDistance - DISTANCE_THRESHOLD_HIGH;
                                percentage = (decreaseNeeded / shipDistance) * 100;
                                message = `Distance at radar ${r.name} should be decreased by ${formatValue(percentage)}%`;
                            }

                            if (message) {
                                allRecommendations.push(message);
                            }
                        }
                    }
                }
            });

            // Check hooks for tension threshold violations
            (berth.bollards || []).forEach(b => {
                (b.hooks || []).forEach(h => {
                    if (h && h.attachedLine !== null && h.attachedLine !== undefined) {
                        const tension = h.tension;
                        
                        if (tension !== null && tension !== undefined) {
                            let message = '';
                            let percentage = 0;

                            if (tension > TENSION_THRESHOLD_HIGH) {
                                hasAnyIssues = true;
                                const decreaseNeeded = tension - TENSION_THRESHOLD_HIGH;
                                percentage = tension !== 0 ? (decreaseNeeded / tension) * 100 : 0;
                                message = `Tension on ${b.name}'s ${h.name} should be decreased by ${formatValue(percentage)}%`;
                            } else if (tension < TENSION_THRESHOLD_LOW) {
                                hasAnyIssues = true;
                                if (Math.abs(tension) < 0.001) {
                                    message = `Tension on ${b.name}'s ${h.name} should be increased to ${TENSION_THRESHOLD_LOW}`;
                                } else {
                                    const increaseNeeded = TENSION_THRESHOLD_LOW - tension;
                                    percentage = (increaseNeeded / Math.abs(tension)) * 100;
                                    message = `Tension on ${b.name}'s ${h.name} should be increased by ${formatValue(percentage)}%`;
                                }
                            }

                            if (message) {
                                allRecommendations.push(message);
                            }
                        }
                    }
                });
            });
        });

        // Clear container
        alertsContainer.innerHTML = '';

        // Create and display status section
        const statusSection = createStatusSection(hasAnyIssues, allRecommendations);
        alertsContainer.appendChild(statusSection);
    }

    function createStatusSection(hasIssues, recommendations = []) {
        const statusSection = document.createElement('div');
        statusSection.className = 'status-section status-section-alerts';

        const audio = document.getElementById('alertSound');

        if (hasIssues) {
            statusSection.classList.add('status-red');
            
            // Play alert sound when issues are detected
            if (audio) {
                audio.pause();
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

})();

