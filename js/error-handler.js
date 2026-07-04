/* =========================================
   ERROR HANDLER — HTTP 429 & API FAILURES
   
   Handles:
   - Rate limit detection (HTTP 429)
   - Countdown timer with auto-retry
   - Visual error banners
   - Fallback responses
   - User notifications
   ========================================= */

class TalosErrorHandler {
    constructor() {
        this.rateLimitBanner = null;
        this.countdownInterval = null;
        this.retryQueue = [];
        this.isRateLimited = false;
        this.rateLimitResetTime = null;
        this.init();
    }

    init() {
        // Inject error banner styles if not already present
        if (!document.getElementById('talos-error-styles')) {
            const style = document.createElement('style');
            style.id = 'talos-error-styles';
            style.textContent = this.getErrorStyles();
            document.head.appendChild(style);
        }

        // Listen for visibility changes to resume retries
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.retryQueue.length > 0) {
                this.processRetryQueue();
            }
        });
    }

    // =========================================
    // RATE LIMIT DETECTION & HANDLING
    // =========================================

    handleRateLimit(response) {
        this.isRateLimited = true;

        // Extract retry-after header (seconds)
        const retryAfter = response.headers.get('Retry-After') || '60';
        const resetSeconds = parseInt(retryAfter, 10) || 60;
        this.rateLimitResetTime = Date.now() + (resetSeconds * 1000);

        console.warn(`[TalosError] Rate limited. Retry in ${resetSeconds}s`);

        this.showRateLimitBanner(resetSeconds);
        return this.createRateLimitResponse(resetSeconds);
    }

    showRateLimitBanner(resetSeconds) {
        // Remove existing banner if present
        if (this.rateLimitBanner) {
            this.rateLimitBanner.remove();
        }

        const banner = document.createElement('div');
        banner.setAttribute('role', 'alert');
        banner.id = 'talos-rate-limit-banner';
        banner.className = 'talos-error-banner talos-rate-limit';
        banner.innerHTML = `
            <div class="error-banner-content">
                <div class="error-banner-icon">⚙️</div>
                <div class="error-banner-text">
                    <div class="error-title">Server Busy</div>
                    <div class="error-message">We're getting a lot of requests. Retrying automatically...</div>
                </div>
                <div class="error-countdown">
                    <div class="countdown-timer" id="talos-countdown">${resetSeconds}s</div>
                    <div class="countdown-label">Retry in</div>
                </div>
                <button class="error-close-btn" onclick="talosErrorHandler.dismissBanner()">
                    <span>×</span>
                </button>
            </div>
            <div class="error-banner-progress">
                <div class="progress-bar" id="talos-progress-bar" style="animation: progress ${resetSeconds}s linear forwards;"></div>
            </div>
        `;

        document.body.insertBefore(banner, document.body.firstChild);
        this.rateLimitBanner = banner;

        // Countdown timer
        let remaining = resetSeconds;
        this.countdownInterval = setInterval(() => {
            remaining--;
            const countdownEl = document.getElementById('talos-countdown');
            if (countdownEl) {
                countdownEl.textContent = `${remaining}s`;
            }

            if (remaining <= 0) {
                clearInterval(this.countdownInterval);
                this.isRateLimited = false;
                this.dismissBanner();
                this.processRetryQueue();
            }
        }, 1000);
    }

    dismissBanner() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
        }
        if (this.rateLimitBanner) {
            this.rateLimitBanner.classList.add('fade-out');
            setTimeout(() => {
                if (this.rateLimitBanner && this.rateLimitBanner.parentNode) {
                    this.rateLimitBanner.remove();
                }
                this.rateLimitBanner = null;
            }, 300);
        }
    }

    // =========================================
    // RETRY QUEUE MANAGEMENT
    // =========================================

    queueForRetry(fn, description = 'Request') {
        this.retryQueue.push({ fn, description, timestamp: Date.now() });
        console.log(`[TalosError] Queued for retry: ${description}`);
        return this.createQueuedResponse(description);
    }

    async processRetryQueue() {
        if (this.isRateLimited) {
            console.log('[TalosError] Still rate limited, will retry when ready');
            return;
        }

        if (this.retryQueue.length === 0) {
            console.log('[TalosError] Retry queue is empty');
            return;
        }

        console.log(`[TalosError] Processing ${this.retryQueue.length} queued requests`);

        // Show retry banner
        const retryBanner = this.showRetryingBanner(this.retryQueue.length);

        let successful = 0;
        const failed = [];

        for (const item of this.retryQueue) {
            try {
                const result = await item.fn();
                if (result && result.ok !== false) {
                    successful++;
                    console.log(`[TalosError] Retry succeeded: ${item.description}`);
                } else {
                    failed.push(item.description);
                }
            } catch (err) {
                console.error(`[TalosError] Retry failed: ${item.description}`, err);
                failed.push(item.description);
            }
        }

        // Clear the queue
        this.retryQueue = [];

        // Update banner with results
        if (retryBanner) {
            this.updateRetryBanner(retryBanner, successful, failed);
        }
    }

    // =========================================
    // NETWORK ERROR HANDLING
    // =========================================

    handleNetworkError(error, context = '') {
        console.error(`[TalosError] Network error: ${context}`, error);

        const banner = document.createElement('div');
        banner.className = 'talos-error-banner talos-network-error';
        banner.innerHTML = `
            <div class="error-banner-content">
                <div class="error-banner-icon">📡</div>
                <div class="error-banner-text">
                    <div class="error-title">Connection Error</div>
                    <div class="error-message">Check your internet connection and try again</div>
                </div>
                <button class="error-close-btn" onclick="this.parentElement.parentElement.remove()">
                    <span>×</span>
                </button>
            </div>
        `;

        document.body.insertBefore(banner, document.body.firstChild);
        setTimeout(() => {
            banner.classList.add('fade-out');
            setTimeout(() => banner.remove(), 300);
        }, 5000);

        return this.createErrorResponse('Network Error', 'Check your internet connection');
    }

    handleAPIError(response, context = '') {
        const status = response.status;
        const statusText = response.statusText;

        console.error(`[TalosError] API Error ${status}: ${context}`);

        let title = 'Server Error';
        let message = 'Something went wrong. Please try again.';

        if (status === 400) {
            title = 'Invalid Request';
            message = 'The request was invalid. Please check your input.';
        } else if (status === 401) {
            title = 'Authentication Failed';
            message = 'Your API key may be invalid. Check settings.';
        } else if (status === 403) {
            title = 'Access Denied';
            message = 'You don\'t have permission for this action.';
        } else if (status === 404) {
            title = 'Not Found';
            message = 'The resource could not be found.';
        } else if (status === 429) {
            return this.handleRateLimit(response);
        } else if (status === 500) {
            title = 'Server Error';
            message = 'The server encountered an error. Retrying...';
        } else if (status === 503) {
            title = 'Service Unavailable';
            message = 'The service is temporarily down. We\'re working on it.';
        }

        this.showErrorBanner(title, message, status);
        return this.createErrorResponse(title, message);
    }

    showErrorBanner(title, message, status = null) {
        const banner = document.createElement('div');
        banner.setAttribute('role', 'alert');
        banner.className = 'talos-error-banner talos-api-error';
        banner.innerHTML = `
            <div class="error-banner-content">
                <div class="error-banner-icon">⚠️</div>
                <div class="error-banner-text">
                    <div class="error-title">${title}</div>
                    <div class="error-message">${message}</div>
                    ${status ? `<div class="error-code">Error ${status}</div>` : ''}
                </div>
                <button class="error-close-btn" onclick="this.parentElement.parentElement.remove()">
                    <span>×</span>
                </button>
            </div>
        `;

        document.body.insertBefore(banner, document.body.firstChild);

        // Auto-dismiss after 6 seconds
        setTimeout(() => {
            banner.classList.add('fade-out');
            setTimeout(() => banner.remove(), 300);
        }, 6000);
    }

    // =========================================
    // RESPONSE CREATORS (for fallback)
    // =========================================

    createRateLimitResponse(resetSeconds) {
        return {
            ok: false,
            status: 429,
            statusText: 'Too Many Requests',
            json: async () => ({
                error: 'Rate limited',
                retryAfter: resetSeconds,
                message: `Server is busy. Please retry in ${resetSeconds} seconds.`
            })
        };
    }

    createQueuedResponse(description) {
        return {
            ok: false,
            status: 503,
            statusText: 'Queued for Retry',
            json: async () => ({
                error: 'Queued',
                message: `${description} has been queued and will retry when the server is available.`
            })
        };
    }

    createErrorResponse(title, message) {
        return {
            ok: false,
            status: 500,
            statusText: title,
            json: async () => ({
                error: title,
                message: message
            })
        };
    }

    showRetryingBanner(count) {
        const banner = document.createElement('div');
        banner.className = 'talos-error-banner talos-retrying';
        banner.innerHTML = `
            <div class="error-banner-content">
                <div class="error-banner-icon animate-spin">🔄</div>
                <div class="error-banner-text">
                    <div class="error-title">Retrying Requests</div>
                    <div class="error-message">Processing ${count} request${count !== 1 ? 's' : ''}...</div>
                </div>
            </div>
            <div class="error-banner-progress">
                <div class="progress-bar" style="animation: progress 2s linear forwards;"></div>
            </div>
        `;

        document.body.insertBefore(banner, document.body.firstChild);
        return banner;
    }

    updateRetryBanner(banner, successful, failed) {
        if (!banner || !banner.parentNode) return;

        const title = failed.length === 0 ? '✅ Requests Sent' : `⚠️ Partial Success`;
        const message = failed.length === 0
            ? `${successful} request${successful !== 1 ? 's' : ''} processed successfully`
            : `${successful} succeeded, ${failed.length} failed`;

        banner.innerHTML = `
            <div class="error-banner-content">
                <div class="error-banner-icon">${failed.length === 0 ? '✅' : '⚠️'}</div>
                <div class="error-banner-text">
                    <div class="error-title">${title}</div>
                    <div class="error-message">${message}</div>
                </div>
                <button class="error-close-btn" onclick="this.parentElement.parentElement.remove()">
                    <span>×</span>
                </button>
            </div>
        `;

        // Auto-dismiss
        setTimeout(() => {
            banner.classList.add('fade-out');
            setTimeout(() => banner.remove(), 300);
        }, 4000);
    }

    // =========================================
    // CSS STYLES
    // =========================================

    getErrorStyles() {
        return `
            .talos-error-banner {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                z-index: 9999;
                background: white;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                animation: slideDown 0.3s ease-out;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }

            .talos-error-banner.fade-out {
                animation: slideUp 0.3s ease-out forwards;
            }

            @keyframes slideDown {
                from {
                    transform: translateY(-100%);
                    opacity: 0;
                }
                to {
                    transform: translateY(0);
                    opacity: 1;
                }
            }

            @keyframes slideUp {
                from {
                    transform: translateY(0);
                    opacity: 1;
                }
                to {
                    transform: translateY(-100%);
                    opacity: 0;
                }
            }

            .error-banner-content {
                display: flex;
                align-items: center;
                gap: 16px;
                padding: 16px 20px;
                justify-content: space-between;
            }

            .error-banner-icon {
                font-size: 24px;
                flex-shrink: 0;
            }

            .error-banner-icon.animate-spin {
                animation: spin 1s linear infinite;
            }

            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }

            .error-banner-text {
                flex: 1;
                min-width: 0;
            }

            .error-title {
                font-weight: 600;
                color: #333;
                margin-bottom: 4px;
                font-size: 15px;
            }

            .error-message {
                font-size: 13px;
                color: #666;
                line-height: 1.4;
            }

            .error-code {
                font-size: 12px;
                color: #999;
                margin-top: 4px;
                font-family: 'Courier New', monospace;
            }

            .error-countdown {
                text-align: center;
                flex-shrink: 0;
            }

            .countdown-timer {
                font-size: 20px;
                font-weight: bold;
                color: #BC4749;
                min-width: 50px;
            }

            .countdown-label {
                font-size: 11px;
                color: #999;
                margin-top: 2px;
            }

            .error-close-btn {
                background: none;
                border: none;
                font-size: 24px;
                color: #999;
                cursor: pointer;
                padding: 0;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                transition: background 0.2s;
                flex-shrink: 0;
            }

            .error-close-btn:hover {
                background: rgba(0,0,0,0.05);
                color: #333;
            }

            .error-banner-progress {
                height: 3px;
                background: #E8E8E8;
                overflow: hidden;
            }

            .progress-bar {
                height: 100%;
                background: linear-gradient(90deg, #386641, #5B9B43);
                width: 100%;
            }

            @keyframes progress {
                from { transform: scaleX(0); transform-origin: left; }
                to { transform: scaleX(1); transform-origin: left; }
            }

            /* Rate limit specific styles */
            .talos-rate-limit .error-banner-icon { color: #F59E0B; }
            .talos-rate-limit .error-title { color: #D97706; }

            /* Network error specific styles */
            .talos-network-error .error-banner-icon { color: #EF4444; }
            .talos-network-error .error-title { color: #DC2626; }

            /* API error specific styles */
            .talos-api-error .error-banner-icon { color: #BC4749; }
            .talos-api-error .error-title { color: #8B3335; }

            /* Retrying specific styles */
            .talos-retrying .error-banner-icon { color: #3B82F6; }
            .talos-retrying .error-title { color: #1D4ED8; }

            @media (max-width: 600px) {
                .error-banner-content {
                    flex-wrap: wrap;
                    gap: 12px;
                }

                .error-countdown {
                    order: 3;
                    width: 100%;
                }

                .error-close-btn {
                    order: 2;
                }
            }
        `;
    }
}

// =========================================
// GLOBAL INSTANCE
// =========================================
const talosErrorHandler = new TalosErrorHandler();

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { talosErrorHandler, TalosErrorHandler };
}
