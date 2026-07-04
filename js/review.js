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

    // 2. Confirm Logic (Only saves when they click the green button)
    document.getElementById('btnSubmitSummary').addEventListener('click', () => {
        if (currentSummaryRecord) {
            // Save the held record to the Past Summaries list
            let pastSummaries = JSON.parse(localStorage.getItem('talosPastSummaries')) || [];
            pastSummaries.unshift(currentSummaryRecord);
            localStorage.setItem('talosPastSummaries', JSON.stringify(pastSummaries));

            // Clear the active chat history so it cannot be resubmitted
            localStorage.removeItem('talosChatHistory');
        }

        // Hand off to the share hub (QR / share sheet / PDF)
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

    // Prepend intake form data so it lands in the clinical summary
    const intakeData = JSON.parse(localStorage.getItem('talosIntake') || '{}');
    if (intakeData.medications || intakeData.allergies || intakeData.age) {
        transcript += "INTAKE FORM (collected before chat):\n";
        if (intakeData.age)         transcript += `Age: ${intakeData.age}\n`;
        if (intakeData.medications) transcript += `Current medications: ${intakeData.medications}\n`;
        if (intakeData.allergies)   transcript += `Allergies: ${intakeData.allergies}\n`;
        transcript += "\nCHAT TRANSCRIPT:\n";
    }

    JSON.parse(rawHistory).forEach(msg => {
        let role = msg.role === 'user' ? 'Patient' : 'Talos';
        let text = msg.content;
        if (text) {
            try { text = JSON.parse(text).message; } catch(e) {}
            transcript += `${role}: ${text}\n`;
        }
    });

    const systemPrompt = `You are a senior clinical documentation specialist preparing a pre-screening intake summary for a licensed healthcare professional.

    Your task is to read the transcript between a patient and a pre-screening AI called Talos, then produce a concise, clinically precise summary.

    TITLE RULES:
    - Write a 3-6 word clinical title that captures the PRIMARY presenting concern (e.g., "Chronic Anxiety with Sleep Disruption", "Depressive Episode & Social Withdrawal", "Stress-Related Physical Symptoms").
    - Do NOT use vague titles like "General Checkup" unless truly nothing specific was mentioned.

    SUMMARY RULES — produce exactly 4 to 6 bullet points, each covering a distinct clinical dimension:
    1. PRIMARY CONCERN: State the main reason the patient sought help, including onset and duration if mentioned.
    2. SYMPTOM PROFILE: List key symptoms with severity descriptors (e.g., mild, moderate, severe) and frequency (daily, occasional) as reported by the patient.
    3. FUNCTIONAL IMPACT: Describe how symptoms affect the patient's daily life — work, relationships, sleep, appetite, hobbies.
    4. COPING & HISTORY: Note any coping strategies, past treatments, therapy history, or relevant medical background shared.
    5. SUBSTANCE & MEDICATION USE: State medications, supplements, alcohol, tobacco, or substance use — or explicitly note "None reported" if not mentioned.
    6. RISK FLAGS (include ONLY if relevant): Note any mention of self-harm, crisis indicators, or urgent concerns. Omit this bullet entirely if none were raised.

    WRITING STYLE:
    - Use clinical third-person language (e.g., "Patient reports...", "Patient describes...", "No mention of...").
    - Be specific — avoid vague phrases like "some stress" or "felt bad". Use the patient's own words where clinically useful.
    - Each bullet must be a complete, standalone sentence of 15-30 words.
    - Do NOT include any pleasantries, filler, or meta-commentary.

    Format your response ONLY as a JSON object with no markdown or extra text:
    {
       "title": "Your Clinical Title Here",
       "summary": ["Bullet 1", "Bullet 2", "Bullet 3", "Bullet 4", "Bullet 5"]
    }

    LANGUAGE RULE: Write the title and all summary bullets in ${getTalosLanguage().llm}. The patient must be able to review this summary in their own language.`;

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
           body: JSON.stringify({
    model: "meta-llama/llama-4-scout-17b-16e-instruct", // <-- New Llama 4 Scout model
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
                notes: bullets,
                patientName: intakeData.patientName || null,
                age:         intakeData.age         || null,
                medications: intakeData.medications || null,
                allergies:   intakeData.allergies   || null
            };
        } else {
            summaryList.innerHTML = '<li>Error generating summary from data.</li>';
        }
    } catch (error) {
        console.error("API Error:", error);
        summaryList.innerHTML = '<li class="btn-red-text" style="list-style: none;">Connection error. Could not connect to AI.</li>';
    }
});
// When user clicks "Download PDF"
document.getElementById('btnDownloadPDF')?.addEventListener('click', async () => {
    const summaryRecord = {
        id: document.getElementById('patientIdDisplay').textContent,
        date: new Date().toLocaleDateString(),
        title: 'Clinical Intake Notes', // or extracted from page
        notes: Array.from(document.querySelectorAll('.intake-list li'))
            .map(li => li.textContent)
    };

    const filename = await talosPDFGenerator.generatePDF(
        summaryRecord,
        'Patient Name' // optional
    );

    if (filename) {
        console.log('PDF generated:', filename);
        // Show success message
        talosErrorHandler?.showErrorBanner('✅ PDF Generated', `Saved as ${filename}`);
    }
});