/* =========================================
   SETTINGS.JS
   FIX: silentModeToggle is now ONLY managed by tts.js.
   settings.js no longer registers a second listener on it,
   which was causing the echo bug (two handlers → two speakAIResponse calls).
   ========================================= */

document.addEventListener('DOMContentLoaded', () => {

    // Text Size
    document.querySelectorAll('.size-selector span').forEach(span => {
        span.addEventListener('click', (e) => {
            const size = e.target.dataset.size;
            localStorage.setItem('textSize', size);
            document.querySelectorAll('.size-selector span').forEach(s => s.classList.remove('active'));
            e.target.classList.add('active');
            if (typeof applySavedSettings === 'function') applySavedSettings();
        });
    });

    // High Contrast
    const contrastToggle = document.getElementById('contrastToggle');
    if (contrastToggle) {
        contrastToggle.checked = localStorage.getItem('highContrast') === 'true';
        contrastToggle.addEventListener('change', (e) => {
            localStorage.setItem('highContrast', e.target.checked);
            if (typeof applySavedSettings === 'function') applySavedSettings();
        });
    }

    // NOTE: silentModeToggle, languageSelect, voiceTypeSelect, elevenLabsKeyInput
    // and btnTestVoice are ALL handled by tts.js to avoid duplicate listeners.

    // Delete Data
    document.getElementById('btnDeleteLocalData')?.addEventListener('click', () => {
        if (confirm("Delete all settings and chat history?")) {
            localStorage.clear();
            alert("Data cleared.");
            if (typeof applySavedSettings === 'function') applySavedSettings();
            if (contrastToggle) contrastToggle.checked = false;
        }
    });

    // Consent mock
    document.getElementById('btnConsent')?.addEventListener('click', () =>
        alert('Consent Agreement Modal would open here.')
    );
});
