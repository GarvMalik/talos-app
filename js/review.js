/* =========================================
   REVIEW LOGIC (Summary Generation & Modal)
   ========================================= */

// Pull the key from memory, or ask the user for it
let GROQ_API_KEY = localStorage.getItem('talosApiKey');

if (!GROQ_API_KEY) {
    const userInput = prompt("Welcome to the Talos Prototype! To power the AI, please paste your free Groq API Key here:");
    if (userInput) {
        localStorage.setItem('talosApiKey', userInput.trim());
        GROQ_API_KEY = userInput.trim();
    } else {
        alert("The AI requires an API key to function. Please refresh the page and try again.");
    }
}
let currentSummaryRecord = null; // Temporarily holds the summary

document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. Modal Event Listeners
    document.getElementById('btnShowDeleteModal').addEventListener('click', () => {
        document.getElementById('deleteModal').classList.remove('hidden');
        document.getElementById('modalStep1').classList.remove('hidden');
        document.getElementById('modalStep2').classList.add('hidden');
    });

    document.getElementById('btnCancelDelete').addEventListener('click', () => {
        document.getElementById('deleteModal').classList.add('hidden');
    });

    document.getElementById('btnConfirmDelete').addEventListener('click', () => {
        localStorage.removeItem('talosChatHistory');
        document.getElementById('modalStep1').classList.add('hidden');
        document.getElementById('modalStep2').classList.remove('hidden');
    });

    // 2. Submit Logic (Only saves when they click the green button)
    document.getElementById('btnSubmitSummary').addEventListener('click', () => {
        if (currentSummaryRecord) {
            // Save the held record to the Past Summaries list
            let pastSummaries = JSON.parse(localStorage.getItem('talosPastSummaries')) || [];
            pastSummaries.unshift(currentSummaryRecord); 
            localStorage.setItem('talosPastSummaries', JSON.stringify(pastSummaries));
            
            // Clear the active chat history so it cannot be resubmitted
            localStorage.removeItem('talosChatHistory');
        }
        
        // Trigger the transition to the success page
        if (typeof navigateTo === 'function') navigateTo('success.html');
    });

    // 3. Summary Generation Logic
    const summaryList = document.getElementById('summaryList'); 
    const newPatientId = "PT-" + Math.floor(1000 + Math.random() * 9000);
    document.getElementById('patientIdDisplay').innerText = newPatientId;

    const rawHistory = localStorage.getItem('talosChatHistory');
    if (!rawHistory) {
        summaryList.innerHTML = '<li>No chat history found. Please complete the screening first.</li>';
        return;
    }

    let transcript = "";
    JSON.parse(rawHistory).forEach(msg => {
        let role = msg.role === 'user' ? 'Patient' : 'Talos';
        let text = msg.content;
        if (text) {
            try { text = JSON.parse(text).message; } catch(e) {}
            transcript += `${role}: ${text}\n`;
        }
    });

    const systemPrompt = `You are an expert medical summarization AI.
    Read the following transcript between a patient and a pre-screening AI.
    1. Create a short, professional 2-4 word title summarizing the primary focus of this session (e.g., "Sleep & Stress Assessment", "General Checkup", "Anxiety Screening").
    2. Extract the key medical information and symptoms into 3 to 5 short, professional bullet points for the doctor.
    Format your response ONLY as a JSON object matching this exact structure:
    {
       "title": "Your Short Title Here",
       "summary": ["Bullet 1", "Bullet 2", "Bullet 3"]
    }`;

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant", 
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: transcript }],
                response_format: { type: "json_object" } 
            })
        });

        const data = await response.json();
        if (data.choices && data.choices.length > 0) {
            const aiReply = JSON.parse(data.choices[0].message.content);
            const chatTitle = aiReply.title || 'Clinical Intake Notes';
            const bullets = aiReply.summary;

            summaryList.innerHTML = ''; 
            bullets.forEach(b => { summaryList.innerHTML += `<li style="margin-bottom: 8px; line-height: 1.5;">${b}</li>`; });

            // Store the record in memory, but DO NOT save to localStorage yet!
            currentSummaryRecord = {
                id: newPatientId,
                date: new Date().toLocaleDateString(),
                title: chatTitle,
                notes: bullets
            };
        } else {
            summaryList.innerHTML = '<li>Error generating summary from data.</li>';
        }
    } catch (error) {
        console.error("API Error:", error);
        summaryList.innerHTML = '<li class="btn-red-text" style="list-style: none;">Connection error. Could not connect to AI.</li>';
    }
});