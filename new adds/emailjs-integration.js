/* =========================================
   EMAILJS INTEGRATION — AUTOMATED SUBMISSION
   
   Features:
   - Zero-backend email routing
   - Secure physician inbox delivery
   - Consent & HIPAA compliance
   - Fallback options (download, print)
   - Offline queueing
   ========================================= */

class TalosEmailSubmission {
    constructor() {
        this.isInitialized = false;
        this.serviceID = null;
        this.templateID = null;
        this.publicKey = null;
        this.submissionQueue = [];
        this.initEmailJS();
    }

    /**
     * Initialize EmailJS
     * Must be called with valid credentials before sending
     */
    initEmailJS(serviceID, templateID, publicKey) {
        // If called without params, try to load from localStorage (user-configured)
        if (!serviceID) {
            serviceID = localStorage.getItem('emailjs_service_id');
            templateID = localStorage.getItem('emailjs_template_id');
            publicKey = localStorage.getItem('emailjs_public_key');
        }

        if (!serviceID || !templateID || !publicKey) {
            console.warn('[EmailJS] Credentials not configured. User will need to set up in settings.');
            return false;
        }

        this.serviceID = serviceID;
        this.templateID = templateID;
        this.publicKey = publicKey;

        // Load EmailJS library
        this.loadEmailJSLibrary();
        this.isInitialized = true;

        console.log('[EmailJS] Initialized with service:', serviceID);
        return true;
    }

    loadEmailJSLibrary() {
        if (typeof emailjs !== 'undefined') {
            emailjs.init(this.publicKey);
            console.log('[EmailJS] Library already loaded');
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/index.min.js';
        script.async = true;

        script.onload = () => {
            if (typeof emailjs !== 'undefined') {
                emailjs.init(this.publicKey);
                console.log('[EmailJS] Library loaded and initialized');
            }
        };

        script.onerror = () => {
            console.error('[EmailJS] Failed to load library');
        };

        document.head.appendChild(script);
    }

    /**
     * Main submission flow
     * @param {Object} summaryRecord - { id, date, title, notes }
     * @param {String} physicianEmail - Recipient email
     * @param {String} patientName - Patient name (optional)
     * @param {String} patientEmail - Patient email for confirmation (optional)
     */
    async submitToPhysician(summaryRecord, physicianEmail, patientName = null, patientEmail = null) {
        // Validate inputs
        if (!physicianEmail || !this.isValidEmail(physicianEmail)) {
            talosErrorHandler?.showErrorBanner('Invalid Email', 'Please enter a valid physician email address.');
            return false;
        }

        if (!this.isInitialized) {
            console.warn('[EmailJS] Not initialized. Showing offline options...');
            return this.showOfflineOptions(summaryRecord);
        }

        // Show confirmation dialog
        const confirmed = await this.showSubmissionConfirm(physicianEmail);
        if (!confirmed) {
            console.log('[EmailJS] Submission cancelled by user');
            return false;
        }

        // Prepare email content
        const emailPayload = this.prepareEmailPayload(summaryRecord, physicianEmail, patientName, patientEmail);

        try {
            const response = await emailjs.send(
                this.serviceID,
                this.templateID,
                emailPayload,
                this.publicKey
            );

            console.log('[EmailJS] Submission successful:', response.status);
            this.showSuccessBanner(physicianEmail);
            return true;
        } catch (error) {
            console.error('[EmailJS] Submission failed:', error);

            if (error.status === 429) {
                // Rate limit - queue for retry
                console.log('[EmailJS] Rate limited. Queuing for retry...');
                this.queueSubmission(summaryRecord, physicianEmail, patientName, patientEmail);
                talosErrorHandler?.handleRateLimit({ status: 429, headers: { get: () => '60' } });
                return false;
            }

            // Network error - queue for retry
            if (error.status === 0 || !error.status) {
                console.log('[EmailJS] Network error. Queueing for retry...');
                this.queueSubmission(summaryRecord, physicianEmail, patientName, patientEmail);
                this.showQueuedBanner(physicianEmail);
                return false;
            }

            talosErrorHandler?.handleAPIError({ status: error.status, statusText: error.text }, 'EmailJS Submission');
            return false;
        }
    }

    /**
     * Prepare email payload
     */
    prepareEmailPayload(summaryRecord, physicianEmail, patientName, patientEmail) {
        const summaryText = Array.isArray(summaryRecord.notes)
            ? summaryRecord.notes.map((note, i) => `${i + 1}. ${note}`).join('\n')
            : summaryRecord.notes || '';

        return {
            to_email: physicianEmail,
            patient_email: patientEmail || 'Not provided',
            patient_name: patientName || 'Patient',
            patient_id: summaryRecord.id || 'N/A',
            screening_date: summaryRecord.date || new Date().toLocaleDateString(),
            screening_title: summaryRecord.title || 'Clinical Screening Summary',
            summary_content: summaryText,
            submission_timestamp: new Date().toISOString(),
            hipaa_notice: 'This message contains protected health information (PHI). If you are not the intended recipient, please delete immediately and notify the sender.'
        };
    }

    /**
     * Queue submission for retry (offline fallback)
     */
    queueSubmission(summaryRecord, physicianEmail, patientName, patientEmail) {
        const submission = {
            id: `submission_${Date.now()}`,
            summaryRecord,
            physicianEmail,
            patientName,
            patientEmail,
            timestamp: Date.now(),
            retries: 0
        };

        this.submissionQueue.push(submission);
        localStorage.setItem('talos_submission_queue', JSON.stringify(this.submissionQueue));
        console.log('[EmailJS] Submission queued. Total queued:', this.submissionQueue.length);
    }

    /**
     * Retry all queued submissions (called when back online)
     */
    async retryQueuedSubmissions() {
        if (this.submissionQueue.length === 0) {
            console.log('[EmailJS] No queued submissions to retry');
            return;
        }

        console.log('[EmailJS] Retrying', this.submissionQueue.length, 'queued submissions...');

        const failed = [];

        for (const submission of this.submissionQueue) {
            try {
                const result = await this.submitToPhysician(
                    submission.summaryRecord,
                    submission.physicianEmail,
                    submission.patientName,
                    submission.patientEmail
                );

                if (result) {
                    // Remove from queue
                    this.submissionQueue = this.submissionQueue.filter(s => s.id !== submission.id);
                } else {
                    failed.push(submission.id);
                    submission.retries++;
                }
            } catch (err) {
                console.error('[EmailJS] Retry failed for', submission.id, err);
                failed.push(submission.id);
                submission.retries++;
            }
        }

        // Save updated queue
        localStorage.setItem('talos_submission_queue', JSON.stringify(this.submissionQueue));

        if (failed.length === 0) {
            console.log('[EmailJS] All queued submissions processed successfully');
            talosErrorHandler?.updateRetryBanner(null, this.submissionQueue.length, []);
        } else {
            console.warn('[EmailJS] Some submissions still failed:', failed.length);
        }
    }

    /**
     * Load queued submissions from localStorage
     */
    loadQueue() {
        const stored = localStorage.getItem('talos_submission_queue');
        if (stored) {
            try {
                this.submissionQueue = JSON.parse(stored);
                console.log('[EmailJS] Loaded', this.submissionQueue.length, 'queued submissions');
            } catch (err) {
                console.error('[EmailJS] Failed to load queue:', err);
                this.submissionQueue = [];
            }
        }
    }

    /**
     * Offline fallback options
     */
    showOfflineOptions(summaryRecord) {
        const modal = document.createElement('div');
        modal.className = 'submission-modal-overlay';
        modal.innerHTML = `
            <div class="submission-modal">
                <h2>Submission Options</h2>
                <p>EmailJS is not configured. Choose an alternative way to share your summary:</p>
                
                <div class="offline-options">
                    <button class="offline-option-btn" id="btn-download-pdf">
                        <span class="option-icon">📥</span>
                        <span class="option-title">Download PDF</span>
                        <span class="option-desc">Save as file to your device</span>
                    </button>
                    
                    <button class="offline-option-btn" id="btn-copy-text">
                        <span class="option-icon">📋</span>
                        <span class="option-title">Copy Summary</span>
                        <span class="option-desc">Copy to clipboard to paste elsewhere</span>
                    </button>
                    
                    <button class="offline-option-btn" id="btn-print">
                        <span class="option-icon">🖨️</span>
                        <span class="option-title">Print</span>
                        <span class="option-desc">Print directly to paper or PDF</span>
                    </button>
                </div>
                
                <button class="btn-close" onclick="this.closest('.submission-modal-overlay').remove()">Close</button>
            </div>
        `;

        document.body.appendChild(modal);

        // Event listeners
        document.getElementById('btn-download-pdf')?.addEventListener('click', () => {
            talosPDFGenerator.generatePDF(summaryRecord);
            modal.remove();
        });

        document.getElementById('btn-copy-text')?.addEventListener('click', () => {
            this.copySummaryToClipboard(summaryRecord);
            modal.remove();
        });

        document.getElementById('btn-print')?.addEventListener('click', () => {
            this.printSummary(summaryRecord);
            modal.remove();
        });

        return false;
    }

    /**
     * Show submission confirmation dialog
     */
    async showSubmissionConfirm(physicianEmail) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'submission-modal-overlay';
            modal.innerHTML = `
                <div class="submission-modal">
                    <h2>Confirm Submission</h2>
                    <p>Your clinical summary will be sent to:</p>
                    <div class="recipient-box">
                        <strong>${this.escapeHtml(physicianEmail)}</strong>
                    </div>
                    
                    <div class="hipaa-notice">
                        <strong>🔒 Security & Consent:</strong>
                        <ul>
                            <li>This message contains protected health information (PHI)</li>
                            <li>It will be transmitted via EmailJS (encrypted in transit)</li>
                            <li>Only the intended recipient should access this message</li>
                            <li>You consent to this secure transmission</li>
                        </ul>
                    </div>
                    
                    <div class="modal-actions">
                        <button class="btn-secondary" id="btn-cancel-submit">Cancel</button>
                        <button class="btn-primary" id="btn-confirm-submit">Send to Physician</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            document.getElementById('btn-cancel-submit').addEventListener('click', () => {
                modal.remove();
                resolve(false);
            });

            document.getElementById('btn-confirm-submit').addEventListener('click', () => {
                modal.remove();
                resolve(true);
            });

            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.remove();
                    resolve(false);
                }
            });
        });
    }

    /**
     * Show success banner
     */
    showSuccessBanner(physicianEmail) {
        const banner = document.createElement('div');
        banner.className = 'talos-error-banner talos-success';
        banner.innerHTML = `
            <div class="error-banner-content">
                <div class="error-banner-icon">✅</div>
                <div class="error-banner-text">
                    <div class="error-title">Summary Submitted</div>
                    <div class="error-message">Your clinical summary has been securely sent to ${this.escapeHtml(physicianEmail)}</div>
                </div>
                <button class="error-close-btn" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;

        document.body.insertBefore(banner, document.body.firstChild);
        setTimeout(() => {
            banner.classList.add('fade-out');
            setTimeout(() => banner.remove(), 300);
        }, 5000);
    }

    /**
     * Show queued banner
     */
    showQueuedBanner(physicianEmail) {
        const banner = document.createElement('div');
        banner.className = 'talos-error-banner talos-queued';
        banner.innerHTML = `
            <div class="error-banner-content">
                <div class="error-banner-icon">📤</div>
                <div class="error-banner-text">
                    <div class="error-title">Queued for Delivery</div>
                    <div class="error-message">Your summary will be sent to ${this.escapeHtml(physicianEmail)} when you're back online</div>
                </div>
                <button class="error-close-btn" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;

        document.body.insertBefore(banner, document.body.firstChild);
        setTimeout(() => {
            banner.classList.add('fade-out');
            setTimeout(() => banner.remove(), 300);
        }, 6000);
    }

    /**
     * Copy summary to clipboard
     */
    copySummaryToClipboard(summaryRecord) {
        const text = `
TALOS CARE - CLINICAL SUMMARY
================================

Patient ID: ${summaryRecord.id}
Date: ${summaryRecord.date}
Title: ${summaryRecord.title}

SUMMARY:
${Array.isArray(summaryRecord.notes) ? summaryRecord.notes.map((n, i) => `${i + 1}. ${n}`).join('\n') : summaryRecord.notes}

---
Generated by TALOS Care
This is an AI-generated pre-screening summary and should not be used as a medical diagnosis.
        `.trim();

        navigator.clipboard.writeText(text).then(() => {
            console.log('[EmailJS] Summary copied to clipboard');
            talosErrorHandler?.showErrorBanner('Copied', 'Summary copied to clipboard');
        }).catch((err) => {
            console.error('[EmailJS] Copy failed:', err);
        });
    }

    /**
     * Print summary
     */
    printSummary(summaryRecord) {
        const printWindow = window.open('', '', 'width=800,height=600');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>TALOS Care Summary</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
                    h1 { color: #386641; }
                    .info { margin: 10px 0; }
                    .notes { margin-top: 20px; }
                    .note { margin: 10px 0; padding: 10px; background: #f9f9f9; border-left: 3px solid #386641; }
                </style>
            </head>
            <body>
                <h1>TALOS CARE - Clinical Summary</h1>
                <div class="info"><strong>Patient ID:</strong> ${summaryRecord.id}</div>
                <div class="info"><strong>Date:</strong> ${summaryRecord.date}</div>
                <div class="info"><strong>Title:</strong> ${summaryRecord.title}</div>
                <div class="notes">
                    <h2>Summary:</h2>
                    ${Array.isArray(summaryRecord.notes) ? summaryRecord.notes.map((n, i) => `<div class="note">${i + 1}. ${n}</div>`).join('') : `<div class="note">${summaryRecord.notes}</div>`}
                </div>
                <p style="margin-top: 30px; font-size: 12px; color: #999;">
                    This is an AI-generated pre-screening summary and should not be used as a medical diagnosis.
                    Consult with a healthcare provider for proper diagnosis and treatment.
                </p>
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    }

    /**
     * Utility: Validate email format
     */
    isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    /**
     * Utility: Escape HTML
     */
    escapeHtml(text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}

// Global instance
const talosEmailSubmission = new TalosEmailSubmission();

// Auto-load queued submissions on app load
document.addEventListener('DOMContentLoaded', () => {
    talosEmailSubmission.loadQueue();
    
    // Auto-retry when coming back online
    window.addEventListener('online', () => {
        console.log('[EmailJS] Back online. Retrying queued submissions...');
        talosEmailSubmission.retryQueuedSubmissions();
    });
});

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { talosEmailSubmission, TalosEmailSubmission };
}
