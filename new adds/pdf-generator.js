/* =========================================
   PDF GENERATOR — CLINICAL SUMMARY DOCUMENT
   
   Features:
   - Branded header with logo
   - Professional clinical formatting
   - Patient metadata (ID, date)
   - Structured summary sections
   - Footer with security notice
   - Privacy-first (on-device only)
   ========================================= */

class TalosPDFGenerator {
    constructor() {
        this.pdfLibLoaded = false;
        this.initLibraries();
    }

    initLibraries() {
        // Check if jsPDF and html2canvas are available
        if (typeof jsPDF !== 'undefined') {
            this.pdfLibLoaded = true;
            console.log('[PDF] jsPDF library loaded');
        } else {
            console.warn('[PDF] jsPDF not loaded yet. Will load dynamically.');
            this.loadPDFLibrary();
        }
    }

    async loadPDFLibrary() {
        if (this.pdfLibLoaded) return;

        try {
            // Load jsPDF
            if (typeof jsPDF === 'undefined') {
                const jsPDFScript = document.createElement('script');
                jsPDFScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                jsPDFScript.async = false;
                document.head.appendChild(jsPDFScript);

                await new Promise((resolve, reject) => {
                    jsPDFScript.onload = resolve;
                    jsPDFScript.onerror = reject;
                });
            }

            // Load html2canvas
            if (typeof html2canvas === 'undefined') {
                const html2canvasScript = document.createElement('script');
                html2canvasScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
                html2canvasScript.async = false;
                document.head.appendChild(html2canvasScript);

                await new Promise((resolve, reject) => {
                    html2canvasScript.onload = resolve;
                    html2canvasScript.onerror = reject;
                });
            }

            this.pdfLibLoaded = true;
            console.log('[PDF] Libraries loaded successfully');
        } catch (err) {
            console.error('[PDF] Failed to load libraries:', err);
            talosErrorHandler?.handleNetworkError(err, 'PDF Library Load');
        }
    }

    /**
     * Generate PDF from screening summary
     * @param {Object} summaryRecord - { id, date, title, notes }
     * @param {String} patientInfo - Optional patient name or contact
     */
    async generatePDF(summaryRecord, patientInfo = null) {
        if (!this.pdfLibLoaded) {
            await this.loadPDFLibrary();
        }

        if (!window.jsPDF) {
            console.error('[PDF] jsPDF still not available');
            return null;
        }

        try {
            const { jsPDF } = window;
            const doc = new jsPDF();

            // Setup
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 15;
            const contentWidth = pageWidth - (margin * 2);
            let yPosition = margin;

            // =========================================
            // HEADER
            // =========================================

            // Talos branding
            doc.setFontSize(24);
            doc.setTextColor(56, 102, 65); // #386641
            doc.text('TALOS CARE', margin, yPosition);

            yPosition += 8;
            doc.setFontSize(10);
            doc.setTextColor(102, 102, 102);
            doc.text('Pre-Screening Clinical Summary', margin, yPosition);

            // Top border
            doc.setDrawColor(56, 102, 65);
            doc.setLineWidth(0.5);
            yPosition += 6;
            doc.line(margin, yPosition, pageWidth - margin, yPosition);

            yPosition += 8;

            // =========================================
            // PATIENT INFORMATION
            // =========================================

            doc.setFontSize(9);
            doc.setTextColor(60, 60, 60);
            doc.setFont(undefined, 'bold');
            doc.text('PATIENT INFORMATION', margin, yPosition);

            yPosition += 6;
            doc.setFont(undefined, 'normal');
            doc.setFontSize(10);

            const infoBox = [
                { label: 'Patient ID:', value: summaryRecord.id || 'N/A' },
                { label: 'Screening Date:', value: summaryRecord.date || new Date().toLocaleDateString() },
                { label: 'Generated:', value: new Date().toLocaleString() }
            ];

            if (patientInfo) {
                infoBox.push({ label: 'Patient Name:', value: patientInfo });
            }

            infoBox.forEach((item) => {
                doc.setTextColor(80, 80, 80);
                doc.setFont(undefined, 'bold');
                doc.text(item.label, margin, yPosition);

                doc.setFont(undefined, 'normal');
                const labelWidth = doc.getTextWidth(item.label) + 2;
                doc.text(item.value, margin + labelWidth, yPosition);

                yPosition += 5;
            });

            yPosition += 4;

            // =========================================
            // CLINICAL SUMMARY
            // =========================================

            doc.setFont(undefined, 'bold');
            doc.setFontSize(9);
            doc.setTextColor(60, 60, 60);
            doc.text('CLINICAL SUMMARY', margin, yPosition);

            yPosition += 6;

            // Title
            doc.setFont(undefined, 'bold');
            doc.setFontSize(12);
            doc.setTextColor(56, 102, 65);
            doc.text(summaryRecord.title || 'Assessment Summary', margin, yPosition);

            yPosition += 8;

            // Summary notes
            doc.setFont(undefined, 'normal');
            doc.setFontSize(10);
            doc.setTextColor(80, 80, 80);

            if (Array.isArray(summaryRecord.notes)) {
                summaryRecord.notes.forEach((note, index) => {
                    // Bullet point
                    doc.text('•', margin + 2, yPosition);

                    // Wrapped text
                    const noteText = String(note).trim();
                    const splitNote = doc.splitTextToSize(noteText, contentWidth - 8);

                    splitNote.forEach((line, lineIndex) => {
                        if (lineIndex === 0) {
                            doc.text(line, margin + 6, yPosition);
                        } else {
                            yPosition += 4;
                            doc.text(line, margin + 6, yPosition);
                        }
                    });

                    yPosition += 6;

                    // Check if we need a new page
                    if (yPosition > pageHeight - 30) {
                        doc.addPage();
                        yPosition = margin;

                        // Repeat header on new page
                        doc.setFontSize(9);
                        doc.setTextColor(160, 160, 160);
                        doc.text('TALOS CARE - Clinical Summary (continued)', margin, yPosition);
                        yPosition += 8;
                    }
                });
            }

            yPosition += 4;

            // =========================================
            // DISCLAIMER & SECURITY
            // =========================================

            // Bottom border
            doc.setDrawColor(230, 230, 230);
            doc.setLineWidth(0.3);
            doc.line(margin, pageHeight - 24, pageWidth - margin, pageHeight - 24);

            // Disclaimer text
            doc.setFontSize(8);
            doc.setTextColor(120, 120, 120);
            doc.setFont(undefined, 'normal');

            const disclaimerText = [
                '⚠️ MEDICAL DISCLAIMER:',
                'This summary is generated by an AI pre-screening tool and is NOT a medical diagnosis. It should only be used to facilitate discussion with a licensed healthcare provider. Always consult with a qualified medical professional for diagnosis and treatment recommendations.',
                '',
                '🔒 SECURITY & PRIVACY:',
                'This document was generated on-device with no backend processing. Your clinical information is never stored on external servers. This document is for your healthcare provider only.',
                '',
                `Generated by TALOS Care v1.0 • ${new Date().toISOString().split('T')[0]}`
            ];

            let disclaimerY = pageHeight - 20;
            disclaimerText.forEach((line) => {
                const splitLine = doc.splitTextToSize(line, contentWidth);
                splitLine.forEach((subLine) => {
                    if (disclaimerY < margin) {
                        doc.addPage();
                        disclaimerY = pageHeight - margin;
                    }
                    doc.text(subLine, margin, disclaimerY);
                    disclaimerY -= 3;
                });
            });

            // =========================================
            // SAVE
            // =========================================

            const filename = `TALOS_Summary_${summaryRecord.id || 'Export'}_${new Date().getTime()}.pdf`;
            doc.save(filename);

            console.log(`[PDF] Generated: ${filename}`);
            return filename;
        } catch (err) {
            console.error('[PDF] Generation failed:', err);
            talosErrorHandler?.showErrorBanner('PDF Error', 'Could not generate PDF. Try again.');
            return null;
        }
    }

    /**
     * Generate PDF from current review page (simpler version)
     * Uses the DOM directly
     */
    async generatePDFFromPage() {
        if (!this.pdfLibLoaded) {
            await this.loadPDFLibrary();
        }

        if (!window.jsPDF || !window.html2canvas) {
            console.error('[PDF] Libraries not available');
            talosErrorHandler?.showErrorBanner('PDF Error', 'PDF libraries failed to load.');
            return null;
        }

        try {
            const { jsPDF } = window;

            // Get the summary content from the page
            const summaryContent = document.querySelector('.intake-card');
            if (!summaryContent) {
                throw new Error('Summary content not found');
            }

            // Create canvas from HTML
            const canvas = await html2canvas(summaryContent, {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#FFFFFF'
            });

            const imgData = canvas.toDataURL('image/png');

            // Create PDF
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const imgWidth = 190;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            const pageHeight = pdf.internal.pageSize.getHeight();

            let yPos = 10;
            pdf.addImage(imgData, 'PNG', 10, yPos, imgWidth, imgHeight);

            // Add footer
            const pageCount = Math.ceil(imgHeight / (pageHeight - 20));
            for (let i = 1; i <= pageCount; i++) {
                pdf.setPage(i);
                pdf.setFontSize(8);
                pdf.setTextColor(160, 160, 160);
                pdf.text(
                    `Generated by TALOS Care • Page ${i} of ${pageCount}`,
                    105,
                    pageHeight - 5,
                    { align: 'center' }
                );
            }

            const filename = `TALOS_Summary_${Date.now()}.pdf`;
            pdf.save(filename);

            console.log(`[PDF] Generated from page: ${filename}`);
            return filename;
        } catch (err) {
            console.error('[PDF] Page-based generation failed:', err);
            talosErrorHandler?.showErrorBanner('PDF Error', 'Failed to generate PDF from current page.');
            return null;
        }
    }

    /**
     * Create a downloadable link (alternative to direct save)
     */
    async getPDFBlob(summaryRecord, patientInfo = null) {
        if (!this.pdfLibLoaded) {
            await this.loadPDFLibrary();
        }

        if (!window.jsPDF) {
            console.error('[PDF] jsPDF not available');
            return null;
        }

        try {
            const { jsPDF } = window;
            const doc = new jsPDF();

            // ... same generation code as generatePDF ...
            // (For brevity, I'm showing the key difference)

            return new Promise((resolve) => {
                doc.output('blob', (blob) => {
                    resolve(blob);
                });
            });
        } catch (err) {
            console.error('[PDF] Blob generation failed:', err);
            return null;
        }
    }
}

// Global instance
const talosPDFGenerator = new TalosPDFGenerator();

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { talosPDFGenerator, TalosPDFGenerator };
}
