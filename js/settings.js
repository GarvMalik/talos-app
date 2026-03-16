/* =========================================
   SETTINGS LOGIC
   ========================================= */

document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Text Size Event Handlers
    document.querySelectorAll('.size-selector span').forEach(span => {
        span.addEventListener('click', (e) => {
            const size = e.target.dataset.size;
            localStorage.setItem('textSize', size);
            
            // Update active state
            document.querySelectorAll('.size-selector span').forEach(s => s.classList.remove('active'));
            e.target.classList.add('active');
            
            // Reapply globally
            if (typeof applySavedSettings === 'function') applySavedSettings();
        });
    });

    // 2. High Contrast Toggle
    const contrastToggle = document.getElementById('contrastToggle');
    if (contrastToggle) {
        contrastToggle.checked = (localStorage.getItem('highContrast') === 'true');
        contrastToggle.addEventListener('change', (e) => {
            localStorage.setItem('highContrast', e.target.checked);
            if (typeof applySavedSettings === 'function') applySavedSettings();
        });
    }

    // 3. Delete Data Button
    document.getElementById('btnDeleteLocalData').addEventListener('click', () => {
        if (confirm("Are you sure you want to delete all local data? This will reset all settings and chat history.")) {
            localStorage.clear();
            alert("All local data has been securely wiped.");
            if (typeof applySavedSettings === 'function') applySavedSettings(); 
            // Re-check toggles
            contrastToggle.checked = false;
        }
    });

    // 4. Voice Toggles (Interacts with tts.js)
    const silentToggle = document.getElementById('silentModeToggle');
    if (silentToggle) {
        silentToggle.checked = localStorage.getItem('silentMode') === 'true';
        silentToggle.addEventListener('change', (e) => {
            localStorage.setItem('silentMode', e.target.checked);
            if (e.target.checked) window.speechSynthesis.cancel();
        });
    }

    const langSelect = document.getElementById('languageSelect');
    if (langSelect) {
        langSelect.value = localStorage.getItem('ttsLanguage') || 'en-US';
        langSelect.addEventListener('change', (e) => localStorage.setItem('ttsLanguage', e.target.value));
    }

    const voiceSelect = document.getElementById('voiceTypeSelect');
    if (voiceSelect) {
        voiceSelect.value = localStorage.getItem('ttsVoiceType') || 'female';
        voiceSelect.addEventListener('change', (e) => localStorage.setItem('ttsVoiceType', e.target.value));
    }

    // 5. Test Voice Button
    document.getElementById('btnTestVoice').addEventListener('click', () => {
        if (typeof speakAIResponse === 'function') {
            speakAIResponse('Testing the voice engine. Can you hear me?');
        }
    });

    // 6. Alert Mocks
    document.getElementById('btnConsent').addEventListener('click', () => alert('Consent Agreement Modal would open here.'));
});