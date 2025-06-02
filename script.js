class GPSGame {
    constructor() {
        // Target GPS location - will be set from form
        this.targetLat = null;
        this.targetLng = null;
        
        // Current position
        this.currentLat = null;
        this.currentLng = null;
        this.previousDistance = null;
        this.watchId = null; // Store the watch ID for cleanup
        this.lastUpdateTime = null;
        this.isWaitingForUpdate = false;
        
        // Timer
        this.timerCount = 15;
        this.timerInterval = null;
        this.updateInterval = null;
          // DOM elements
        this.setupScreen = document.getElementById('setup-screen');
        this.gameScreen = document.getElementById('game-screen');
        this.timerElement = document.getElementById('timer');
        this.statusMessageElement = document.getElementById('status-message');
        this.distanceElement = document.getElementById('distance');
        this.loadingSpinner = document.getElementById('loading-spinner');
        this.mapsLinkInput = document.getElementById('maps-link');
        this.latitudeInput = document.getElementById('latitude');
        this.longitudeInput = document.getElementById('longitude');
        this.startButton = document.getElementById('start-game');
        
        this.init();
    }
    
    init() {
        console.log('GPS Game initialized');
        this.setupEventListeners();
        // Set default background
        document.body.classList.add('default');
    }
      setupEventListeners() {
        this.startButton.addEventListener('click', () => {
            this.startGame();
        });
        
        // Allow starting game with Enter key
        this.longitudeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.startGame();
            }
        });
        
        // Parse Google Maps link when pasted
        this.mapsLinkInput.addEventListener('input', () => {
            this.parseGoogleMapsLink();
        });
        
        this.mapsLinkInput.addEventListener('paste', () => {
            // Small delay to allow paste to complete
            setTimeout(() => {
                this.parseGoogleMapsLink();
            }, 10);
        });
    }
    
    parseGoogleMapsLink() {
        const link = this.mapsLinkInput.value.trim();
        if (!link) return;
        
        try {
            // Extract coordinates from Google Maps URL
            // Pattern 1: /@lat,lng,zoom format
            let match = link.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*),/);
            
            if (!match) {
                // Pattern 2: !3d and !4d parameters
                const latMatch = link.match(/!3d(-?\d+\.?\d*)/);
                const lngMatch = link.match(/!4d(-?\d+\.?\d*)/);
                if (latMatch && lngMatch) {
                    match = [null, latMatch[1], lngMatch[1]];
                }
            }
            
            if (!match) {
                // Pattern 3: ll= parameter
                match = link.match(/ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
            }
            
            if (match && match[1] && match[2]) {
                const lat = parseFloat(match[1]);
                const lng = parseFloat(match[2]);
                
                // Validate coordinates
                if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                    this.latitudeInput.value = lat;
                    this.longitudeInput.value = lng;
                    console.log(`Extracted coordinates: ${lat}, ${lng}`);
                } else {
                    console.warn('Invalid coordinates found in URL');
                }
            } else {
                console.warn('Could not extract coordinates from Google Maps link');
            }
        } catch (error) {
            console.error('Error parsing Google Maps link:', error);
        }
    }
    
    startGame() {
        // Get coordinates from form
        const lat = parseFloat(this.latitudeInput.value);
        const lng = parseFloat(this.longitudeInput.value);
        
        // Validate coordinates
        if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            alert('Please enter valid coordinates (Latitude: -90 to 90, Longitude: -180 to 180)');
            return;
        }
        
        this.targetLat = lat;
        this.targetLng = lng;
        
        // Hide setup screen and show game screen
        this.setupScreen.style.display = 'none';
        this.gameScreen.style.display = 'flex';
        
        // Start the game
        this.requestLocationPermission();
        this.startTimer();
    }
      requestLocationPermission() {
        if ('geolocation' in navigator) {
            console.log('Geolocation is supported');
            this.startWatchingPosition();        } else {
            console.log('Geolocation is not supported');
            this.statusMessageElement.textContent = 'no gps';
            this.distanceElement.textContent = 'unavailable';
        }
    }
    
    startWatchingPosition() {
        // Use watchPosition instead of getCurrentPosition to avoid repeated permission prompts
        this.watchId = navigator.geolocation.watchPosition(
            (position) => {
                console.log('Location obtained:', position.coords);
                this.updatePosition(position.coords.latitude, position.coords.longitude);
            },
            (error) => {
                console.error('Error getting location:', error);
                this.handleLocationError(error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 30000 // Cache position for 30 seconds
            }
        );
    }    updatePosition(lat, lng) {
        const currentTime = Date.now();
        
        // Only process updates if 15 seconds have passed since last update
        if (this.lastUpdateTime && (currentTime - this.lastUpdateTime) < 15000) {
            // Update the timer to show time remaining until next actual update
            const timeElapsed = currentTime - this.lastUpdateTime;
            const timeRemaining = Math.ceil((15000 - timeElapsed) / 1000);
            this.timerElement.textContent = timeRemaining;
            return;
        }

        // Hide loading spinner and show timer
        this.hideLoadingSpinner();
        this.isWaitingForUpdate = false;

        this.currentLat = lat;
        this.currentLng = lng;
        this.lastUpdateTime = currentTime;
        
        // Calculate distance to target
        const distance = this.calculateDistance(lat, lng, this.targetLat, this.targetLng);
        
        // Update distance display
        if (distance >= 1000) {
            this.distanceElement.textContent = `${(distance / 1000).toFixed(2)} km`;
        } else {
            this.distanceElement.textContent = `${distance.toFixed(0)} m`;
        }
        
        // Compare with previous distance if available
        if (this.previousDistance !== null) {
            if (distance < this.previousDistance) {
                this.setStatus('closer');
            } else if (distance > this.previousDistance) {
                this.setStatus('farther');
            } else {
                this.setStatus('same');
            }
        } else {
            this.setStatus('initial');
        }
        
        this.previousDistance = distance;
        console.log(`Distance: ${distance.toFixed(2)}m, Previous: ${this.previousDistance ? this.previousDistance.toFixed(2) : 'N/A'}m`);
        
        // Reset timer to 15 seconds - this will be the actual update moment
        this.timerCount = 15;
        this.timerElement.textContent = this.timerCount;
    }
    
    calculateDistance(lat1, lng1, lat2, lng2) {
        // Using Haversine formula to calculate distance between two points
        const R = 6371000; // Earth's radius in meters
        const dLat = this.toRadians(lat2 - lat1);
        const dLng = this.toRadians(lng2 - lng1);
        
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        
        return distance;
    }
    
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
    
    setStatus(status) {
        const body = document.body;
        
        // Remove all status classes
        body.classList.remove('closer', 'farther', 'default');
          switch (status) {
            case 'closer':
                body.classList.add('closer');
                this.statusMessageElement.textContent = 'warmer';
                console.log('Status: WARMER');
                break;
            case 'farther':
                body.classList.add('farther');
                this.statusMessageElement.textContent = 'colder';
                console.log('Status: COLDER');
                break;
            case 'same':
                body.classList.add('default');
                this.statusMessageElement.textContent = 'steady';
                console.log('Status: STEADY');
                break;
            case 'initial':
                body.classList.add('default');
                this.statusMessageElement.textContent = 'seeking';
                console.log('Status: SEEKING');
                break;
            default:
                body.classList.add('default');
                this.statusMessageElement.textContent = 'loading';
        }
    }    startTimer() {
        this.timerInterval = setInterval(() => {
            // Only decrement if we have a last update time (GPS is working)
            if (this.lastUpdateTime) {
                const currentTime = Date.now();
                const timeElapsed = currentTime - this.lastUpdateTime;
                const timeRemaining = Math.ceil((15000 - timeElapsed) / 1000);
                
                if (timeRemaining > 0) {
                    this.timerElement.textContent = timeRemaining;
                } else {
                    // Timer hit zero, show loading spinner
                    if (!this.isWaitingForUpdate) {
                        this.showLoadingSpinner();
                        this.isWaitingForUpdate = true;
                    }
                    this.timerElement.textContent = 0;
                }
            } else {
                // Fallback to simple countdown if no GPS updates yet
                this.timerCount--;
                this.timerElement.textContent = this.timerCount;
                
                if (this.timerCount <= 0) {
                    this.timerCount = 15;
                }
            }
        }, 1000);
    }
      showLoadingSpinner() {
        this.timerElement.style.opacity = '0';
        this.loadingSpinner.style.display = 'flex';
    }
    
    hideLoadingSpinner() {
        this.timerElement.style.opacity = '0.8';
        this.loadingSpinner.style.display = 'none';
    }
    
    // Remove the startLocationUpdates method as watchPosition handles continuous updates
    
    handleLocationError(error) {
        let errorMessage = '';
        switch (error.code) {
            case error.PERMISSION_DENIED:
                errorMessage = 'Location access denied by user';
                break;
            case error.POSITION_UNAVAILABLE:
                errorMessage = 'Location information unavailable';
                break;
            case error.TIMEOUT:
                errorMessage = 'Location request timed out';
                break;
            default:
                errorMessage = 'Unknown location error';
                break;
        }        console.error('Location error:', errorMessage);
        this.statusMessageElement.textContent = 'no signal';
        this.distanceElement.textContent = 'unknown';
    }
      // Cleanup method
    destroy() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        if (this.watchId) {
            navigator.geolocation.clearWatch(this.watchId);
        }
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, starting GPS Game');
    const game = new GPSGame();
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        game.destroy();
    });
});

// Handle visibility change to pause/resume when tab is not active
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('Page hidden, GPS tracking continues in background');
    } else {
        console.log('Page visible, GPS tracking active');
    }
});
