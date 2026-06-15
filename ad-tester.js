class AdCashTester {
    constructor() {
        this.videoPlayer = document.getElementById('videoPlayer');
        this.logElement = document.getElementById('log');
        this.adInfo = document.getElementById('adInfo');
        this.adTimer = document.getElementById('adTimer');
        this.adStatus = document.getElementById('adStatus');
        this.loading = document.getElementById('loading');
        this.progressFill = document.getElementById('progressFill');

        this.adPlaying = false;
        this.videoPlaying = false;
        this.adInstance = null;
        this.adTimeout = null;
        this.videoHLS = null;

        this.initializeEventListeners();
        this.log('AdCash Tester Initialized');
    }

    initializeEventListeners() {
        // Ad Controls
        document.getElementById('loadAdBtn').addEventListener('click', () => this.loadAndPlayAd());
        document.getElementById('skipAdBtn').addEventListener('click', () => this.skipAd());

        // Video Controls
        document.getElementById('playBtn').addEventListener('click', () => this.playVideo());
        document.getElementById('pauseBtn').addEventListener('click', () => this.pauseVideo());
        document.getElementById('testSequenceBtn').addEventListener('click', () => this.testFullSequence());
        document.getElementById('resetBtn').addEventListener('click', () => this.resetAll());
        document.getElementById('clearLogBtn').addEventListener('click', () => this.clearLog());
        document.getElementById('volumeBtn').addEventListener('click', () => this.toggleMute());
        document.getElementById('fullscreenBtn').addEventListener('click', () => this.toggleFullscreen());

        // Video events
        this.videoPlayer.addEventListener('timeupdate', () => this.updateProgress());
        this.videoPlayer.addEventListener('ended', () => this.onVideoEnded());
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const typeIcon = {
            'info': 'ℹ️',
            'success': '✅',
            'error': '❌',
            'warning': '⚠️',
            'ad': '📺'
        }[type] || '📝';

        const logEntry = `[${timestamp}] ${typeIcon} ${message}\n`;
        this.logElement.innerHTML = logEntry + this.logElement.innerHTML;
        console.log(`[${type.toUpperCase()}] ${message}`);
    }

    clearLog() {
        this.logElement.innerHTML = '';
        this.log('Log cleared');
    }

    async loadAndPlayAd() {
        try {
            const zoneId = document.getElementById('zoneId').value;
            const adType = document.getElementById('adType').value;
            const vastUrl = document.getElementById('vastUrl').value;

            this.log(`Loading ${adType} ad for zone: ${zoneId}`, 'ad');

            // Clear any existing ad
            this.cleanupAd();

            // Show loading
            this.loading.classList.remove('hidden');
            this.adStatus.textContent = 'Loading Ad...';
            this.adStatus.className = 'status-indicator status-inactive';

            // Method 1: Direct VAST URL (simpler approach)
            if (vastUrl) {
                await this.playVASTAd(vastUrl);
            }
            // Method 2: Using AdCash SDK (if available)
            else if (typeof window.adj !== 'undefined') {
                await this.playAdCashSDKAd(zoneId, adType);
            }
            // Method 3: Fallback to direct request
            else {
                await this.playDirectAd(zoneId);
            }

        } catch (error) {
            this.log(`Global Ad Failure: ${error.message}`, 'error');
            // Show the specific error to the user
            this.showError(`Ad Failed: ${error.message}`);
            this.adStatus.textContent = 'Ad Failed';
            this.adStatus.className = 'status-indicator status-inactive';
            this.loading.classList.add('hidden');
        }
    }

    async playVASTAd(primaryVastUrl) {
        this.log(`Starting VAST waterfall for URL: ${primaryVastUrl}`, 'info');

        const vastWaterfall = [
            primaryVastUrl,
            `https://pubads.g.doubleclick.net/gampad/ads?sz=640x480&iu=/124319096/external/single_ad_samples&ciu_szs=300x250&impl=s&gdfp_req=1&env=vp&output=vast&unviewed_position_start=1&cust_params=deployment%3Ddevsite%26sample_ct%3Dlinear&correlator=${Date.now()}`
        ];

        let lastError = null;

        for (let i = 0; i < vastWaterfall.length; i++) {
            const vastUrl = vastWaterfall[i];
            this.log(`Attempt ${i + 1}/${vastWaterfall.length} - Trying URL: ${vastUrl}`, 'info');

            try {
                const mediaUrl = await this.resolveVASTChain(vastUrl);

                this.log(`✅ Success! Resolved ad media: ${mediaUrl}`, 'success');
                await this.playAdVideo(mediaUrl);
                return;

            } catch (error) {
                lastError = error;
                this.log(`❌ Attempt ${i + 1} Failed: ${error.message}`, 'error');
            }
        }

        this.log(`All VAST URLs in the waterfall failed. Last error: ${lastError?.message}`, 'error');
        throw lastError || new Error('All ad requests in the waterfall failed.');
    }

    async resolveVASTChain(url, depth = 0) {
        const MAX_REDIRECTS = 5;
        if (depth > MAX_REDIRECTS) {
            throw new Error(`Too many VAST redirects (limit: ${MAX_REDIRECTS})`);
        }

        // Add cache buster
        const fetchUrl = url.includes('?') ? `${url}&cb=${Date.now()}` : `${url}?cb=${Date.now()}`;

        this.log(`Fetching VAST (depth ${depth}): ${fetchUrl}`, 'info');

        const response = await fetch(fetchUrl, {
            cache: 'no-cache',
            credentials: 'omit' // Helps with some CORS issues
        });

        if (!response.ok) throw new Error(`HTTP ${response.status} fetching VAST: ${response.statusText}`);

        const xmlText = await response.text();

        // LOG THE RAW XML for the user to see
        this.log(`Raw VAST Response (${xmlText.length} chars): ${xmlText.substring(0, 300)}...`, 'warning');

        // Loose check for VAST to handle slight variations
        if (xmlText.length < 50 || !/VAST/i.test(xmlText)) {
            throw new Error('Response is not valid VAST XML (too short or missing VAST tag)');
        }

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

        const parseError = xmlDoc.querySelector('parsererror');
        if (parseError) {
            throw new Error(`XML Parse Error: ${parseError.textContent}`);
        }

        // Check for API errors
        const errorElement = xmlDoc.querySelector('Error');
        if (errorElement) {
            // Start by checking if there is any valid content
            const hasContent = xmlDoc.querySelector('Wrapper') || xmlDoc.querySelector('InLine');
            if (!hasContent) {
                throw new Error(`VAST returned Error: ${errorElement.textContent}`);
            }
        }

        // Check for Wrapper
        const wrapper = xmlDoc.querySelector('Wrapper');
        if (wrapper) {
            const tagUri = wrapper.querySelector('VASTAdTagURI');
            if (tagUri) {
                const nextUrl = tagUri.textContent.trim();
                this.log(`Found VAST Wrapper, redirecting to: ${nextUrl}`, 'info');
                return this.resolveVASTChain(nextUrl, depth + 1);
            } else {
                throw new Error('VAST Wrapper found but missing VASTAdTagURI');
            }
        }

        // Check for InLine (Actual Ad)
        const inline = xmlDoc.querySelector('InLine');
        if (inline) {
            const mediaFiles = xmlDoc.querySelectorAll('MediaFile');
            if (mediaFiles.length === 0) throw new Error('No MediaFiles found in VAST');

            return this.selectBestMedia(mediaFiles);
        }

        throw new Error('VAST response contained neither Wrapper nor InLine ad');
    }

    selectBestMedia(mediaFiles) {
        let bestUrl = null;
        let bestBitrate = 0;

        mediaFiles.forEach(file => {
            const url = file.textContent.trim();
            const type = (file.getAttribute('type') || '').toLowerCase();
            const bitrate = parseInt(file.getAttribute('bitrate') || '0');

            // Prefer MP4
            if (type.includes('mp4') || url.includes('.mp4')) {
                if (bitrate > bestBitrate) {
                    bestBitrate = bitrate;
                    bestUrl = url;
                }
            }
        });

        // Fallback: If no MP4, take the first available media file
        if (!bestUrl && mediaFiles.length > 0) {
            this.log('No MP4 found, falling back to first available format', 'warning');
            bestUrl = mediaFiles[0].textContent.trim();
        }

        if (!bestUrl) throw new Error('No valid media URL extraction possible');

        return bestUrl;
    }

    async playAdVideo(videoUrl) {
        return new Promise((resolve, reject) => {
            this.videoPlayer.src = videoUrl;
            this.videoPlayer.currentTime = 0;
            this.videoPlayer.muted = false; // Try unmuted first
            this.videoPlayer.volume = 1;

            // Setup ad tracking
            this.adPlaying = true;
            this.adInfo.textContent = '🎬 Ad Playing';
            this.adInfo.style.color = '#4CAF50';

            let adDuration = 0;
            let updateTimer;

            const cleanup = () => {
                clearInterval(updateTimer);
                this.videoPlayer.removeEventListener('loadedmetadata', onLoadedMetadata);
                this.videoPlayer.removeEventListener('ended', onEnded);
                this.videoPlayer.removeEventListener('error', onError);
            };

            const onLoadedMetadata = () => {
                adDuration = this.videoPlayer.duration;
                this.log(`Ad duration: ${adDuration.toFixed(2)} seconds`, 'info');

                // Start ad timer
                updateTimer = setInterval(() => {
                    const remaining = Math.max(0, adDuration - this.videoPlayer.currentTime);
                    this.adTimer.textContent = `Ad: ${remaining.toFixed(1)}s`;

                    // Update progress bar
                    const progress = (this.videoPlayer.currentTime / adDuration) * 100;
                    this.progressFill.style.width = `${progress}%`;
                }, 100);

                // Attempt to play
                const playPromise = this.videoPlayer.play();

                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        this.loading.classList.add('hidden');
                        this.adStatus.textContent = 'Ad Playing';
                        this.adStatus.className = 'status-indicator status-active';
                        this.log('Ad started playing (unmuted)', 'success');
                    }).catch(error => {
                        // Auto-play was prevented? Try muted.
                        this.log(`Autoplay blocked: ${error.message}. Retrying muted...`, 'warning');
                        this.videoPlayer.muted = true;
                        this.videoPlayer.play().then(() => {
                            this.loading.classList.add('hidden');
                            this.adStatus.textContent = 'Ad Playing (Muted)';
                            this.adStatus.className = 'status-indicator status-active';
                            this.log('Ad started playing (muted)', 'success');
                        }).catch(retryError => {
                            cleanup();
                            reject(new Error(`Playback failed: ${retryError.message}`));
                        });
                    });
                }
            };

            const onEnded = () => {
                cleanup();
                this.adPlaying = false;
                this.adInfo.textContent = '✓ Ad Completed';
                this.adTimer.textContent = '';
                this.progressFill.style.width = '0%';
                this.adStatus.textContent = 'Ad Completed';
                this.adStatus.className = 'status-indicator status-inactive';
                this.log('Ad completed successfully', 'success');
                resolve();
            };

            const onError = (error) => {
                cleanup();
                this.adPlaying = false;
                this.adInfo.textContent = '✗ Ad Error';
                this.adInfo.style.color = '#f44336';
                this.adTimer.textContent = '';
                this.progressFill.style.width = '0%';
                this.adStatus.textContent = 'Ad Error';
                this.adStatus.className = 'status-indicator status-inactive';
                // Get more specific error details if possible
                const code = this.videoPlayer.error ? this.videoPlayer.error.code : 'unknown';
                const message = this.videoPlayer.error ? this.videoPlayer.error.message : 'Video element error';
                reject(new Error(`Ad playback error (Code ${code}): ${message}`));
            };

            // Add one-time event listeners
            this.videoPlayer.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
            this.videoPlayer.addEventListener('ended', onEnded, { once: true });
            this.videoPlayer.addEventListener('error', onError, { once: true });

            // Load the video
            this.videoPlayer.load();
        });
    }

    skipAd() {
        if (this.adPlaying) {
            this.log('Ad skipped by user', 'warning');
            this.videoPlayer.pause();
            this.videoPlayer.currentTime = this.videoPlayer.duration || 0;
            this.videoPlayer.dispatchEvent(new Event('ended'));
            this.adPlaying = false;
            this.adInfo.textContent = '⏭️ Ad Skipped';
            this.adTimer.textContent = '';
            this.progressFill.style.width = '0%';
            this.adStatus.textContent = 'Ad Skipped';
            this.adStatus.className = 'status-indicator status-inactive';
        }
    }

    async playVideo() {
        const videoUrl = document.getElementById('videoSource').value;

        if (!videoUrl) {
            this.showError('Please enter a video URL');
            return;
        }

        try {
            this.log(`Loading video: ${videoUrl}`, 'info');

            // Clean up any existing ad
            this.cleanupAd();

            // Reset player
            this.videoPlayer.src = videoUrl;
            this.videoPlayer.currentTime = 0;
            this.adInfo.textContent = '📹 Main Video';
            this.adTimer.textContent = '';

            // Setup HLS if needed
            if (videoUrl.includes('.m3u8') && Hls.isSupported()) {
                if (this.videoHLS) {
                    this.videoHLS.destroy();
                }

                this.videoHLS = new Hls();
                this.videoHLS.loadSource(videoUrl);
                this.videoHLS.attachMedia(this.videoPlayer);

                this.videoHLS.on(Hls.Events.MANIFEST_PARSED, () => {
                    this.videoPlayer.play().then(() => {
                        this.log('Video started playing', 'success');
                        this.videoPlaying = true;
                    }).catch(error => {
                        this.log(`Video play failed: ${error.message}`, 'error');
                    });
                });

                this.videoHLS.on(Hls.Events.ERROR, (event, data) => {
                    if (data.fatal) {
                        this.log(`HLS Error: ${data.type}`, 'error');
                    }
                });
            } else {
                // Direct video playback
                this.videoPlayer.load();
                await this.videoPlayer.play();
                this.log('Video started playing', 'success');
                this.videoPlaying = true;
            }

        } catch (error) {
            this.log(`Failed to play video: ${error.message}`, 'error');
            this.showError(`Video playback error: ${error.message}`);
        }
    }

    pauseVideo() {
        if (!this.videoPlayer.paused) {
            this.videoPlayer.pause();
            this.log('Video paused', 'info');
        }
    }

    async testFullSequence() {
        this.log('=== STARTING FULL TEST SEQUENCE ===', 'info');

        try {
            // Step 1: Play pre-roll ad
            await this.loadAndPlayAd();

            // Step 2: Wait for ad to complete (or simulate skip)
            await new Promise(resolve => {
                if (this.adPlaying) {
                    this.videoPlayer.addEventListener('ended', resolve, { once: true });
                } else {
                    resolve();
                }
            });

            // Step 3: Play main video
            await this.playVideo();

            this.log('=== TEST SEQUENCE COMPLETED SUCCESSFULLY ===', 'success');

        } catch (error) {
            this.log(`Test sequence failed: ${error.message}`, 'error');
        }
    }

    onVideoEnded() {
        this.log('Video ended', 'info');
        this.videoPlaying = false;

        // Auto-play post-stream ad
        const adType = document.getElementById('adType').value;
        if (adType === 'poststream') {
            setTimeout(() => {
                this.log('Playing post-stream ad...', 'ad');
                this.loadAndPlayAd();
            }, 1000);
        }
    }

    updateProgress() {
        if (!this.adPlaying && this.videoPlaying) {
            const duration = this.videoPlayer.duration || 1;
            const currentTime = this.videoPlayer.currentTime;
            const progress = (currentTime / duration) * 100;
            this.progressFill.style.width = `${progress}%`;
        }
    }

    toggleMute() {
        this.videoPlayer.muted = !this.videoPlayer.muted;
        this.log(this.videoPlayer.muted ? 'Audio muted' : 'Audio unmuted', 'info');
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            this.videoPlayer.requestFullscreen().catch(err => {
                this.log(`Fullscreen failed: ${err.message}`, 'error');
            });
        } else {
            document.exitFullscreen();
        }
    }

    showError(message) {
        this.adInfo.textContent = `❌ ${message}`;
        this.adInfo.style.color = '#f44336';
        setTimeout(() => {
            this.adInfo.textContent = '';
        }, 5000);
    }

    cleanupAd() {
        if (this.adTimeout) {
            clearTimeout(this.adTimeout);
            this.adTimeout = null;
        }

        this.adPlaying = false;
        this.loading.classList.add('hidden');
        this.adTimer.textContent = '';
        this.progressFill.style.width = '0%';
    }

    resetAll() {
        this.cleanupAd();

        if (this.videoHLS) {
            this.videoHLS.destroy();
            this.videoHLS = null;
        }

        this.videoPlayer.pause();
        this.videoPlayer.src = '';
        this.videoPlayer.load();

        this.videoPlaying = false;
        this.adInfo.textContent = '';
        this.adStatus.textContent = 'Ad Not Loaded';
        this.adStatus.className = 'status-indicator status-inactive';

        this.log('All reset', 'info');
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.adTester = new AdCashTester();

    // Auto-test on load
    setTimeout(() => {
        window.adTester.log('Test environment ready!', 'success');
        window.adTester.log('1. Enter your AdCash Zone ID: 10717342', 'info');
        window.adTester.log('2. Click "Load & Play Ad" to test', 'info');
        window.adTester.log('3. Use "Test Full Sequence" for complete flow', 'info');
    }, 1000);
});
