/* =========================================
   PAST SUMMARIES LOGIC (Dynamic Rendering & Deletion)
   ========================================= */

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('summaryListContainer');

    // 1. Function to draw the cards on the screen
    function renderSummaries() {
        // Pull the saved array from the browser's memory
        const pastSummaries = JSON.parse(localStorage.getItem('talosPastSummaries')) || [];
        
        // Check if there are no summaries saved yet
        if (pastSummaries.length === 0) {
            container.innerHTML = `
                <div class="support-card" style="text-align: center; padding: 40px 20px;">
                    <span class="material-symbols-rounded" style="font-size: 48px; color: #aaa; margin-bottom: 12px;">inbox</span>
                    <p style="margin: 0;">No past summaries found.</p>
                    <p style="font-size: 16px; margin-top: 8px;">Complete a screening to see your history here.</p>
                </div>
            `;
            return;
        }

        // Clear the container before drawing
        container.innerHTML = ''; 

       // Loop through each saved summary and build a card for it
        pastSummaries.forEach((summary, index) => {
            const id = summary.id || 'Unknown ID';
            const date = summary.date || 'Unknown Date';
            // Pull the title, but fallback to "Clinical Intake Notes" for any older saved chats
            const title = summary.title || 'Clinical Intake Notes'; 
            const notes = summary.notes || [];

            // Convert the array of bullet points into HTML paragraphs
            let notesHTML = '';
            notes.forEach(note => {
                notesHTML += `<p>• ${note}</p>`;
            });

            // Build the HTML for the card, injecting the dynamic title
            const cardHTML = `
                <div class="summary-card" data-index="${index}">
                    <div class="summary-header">
                        <div class="summary-meta">
                            <span class="tag-green">${id}</span>
                            <span class="summary-date">${date}</span>
                        </div>
                        <div class="summary-title-row">
                            <h3>${title}</h3>
                            <span class="material-symbols-rounded expand-icon">expand_more</span>
                        </div>
                    </div>
                    <div class="summary-content">
                        ${notesHTML}
                        <button class="btn-outline-danger btn-delete-record" data-index="${index}">Delete this record from device</button>
                    </div>
                </div>
            `;
            
            // Inject the card into the page
            container.innerHTML += cardHTML;
        });
    }

    // Call the function immediately to draw the page
    renderSummaries();

    // 2. Event Listener for clicking inside the container (Event Delegation)
    container.addEventListener('click', (e) => {
        
        // Handle Accordion Expand/Collapse
        const header = e.target.closest('.summary-header');
        if (header) {
            const card = header.closest('.summary-card');
            const icon = header.querySelector('.expand-icon');
            const isExpanded = card.classList.contains('expanded');
            
            if (isExpanded) {
                card.classList.remove('expanded');
                icon.innerText = 'expand_more'; 
            } else {
                card.classList.add('expanded');
                icon.innerText = 'expand_less'; 
            }
        }

        // Handle Deleting a Record
        const deleteBtn = e.target.closest('.btn-delete-record');
        if (deleteBtn) {
            e.stopPropagation(); // Stops the accordion from accidentally toggling when you click delete
            
            const indexToRemove = deleteBtn.getAttribute('data-index');
            
            if (confirm('Are you sure you want to delete this specific record? This cannot be undone.')) {
                // Pull the current list, slice out the specific record, and save it back
                let pastSummaries = JSON.parse(localStorage.getItem('talosPastSummaries')) || [];
                pastSummaries.splice(indexToRemove, 1); 
                localStorage.setItem('talosPastSummaries', JSON.stringify(pastSummaries));
                
                // Re-draw the screen to show the updated list
                renderSummaries(); 
            }
        }
    });
});