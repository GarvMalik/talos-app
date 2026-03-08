/* =========================================
   TEXT-TO-SPEECH (TTS) & VOICE SETTINGS
   ========================================= */

// 1. Handle Settings (Only runs on the Settings page)
document.addEventListener('DOMContentLoaded', () => {
    const silentToggle = document.getElementById('silentModeToggle');
    const langSelect = document.getElementById('languageSelect');
    const voiceSelect = document.getElementById('voiceTypeSelect');

    // Load saved preferences or set defaults
    if (silentToggle) {
        silentToggle.checked = localStorage.getItem('silentMode') === 'true';
        silentToggle.addEventListener('change', (e) => {
            localStorage.setItem('silentMode', e.target.checked);
            // Instantly stop talking if the user hits mute
            if (e.target.checked) window.speechSynthesis.cancel();
        });
    }

    if (langSelect) {
        langSelect.value = localStorage.getItem('ttsLanguage') || 'en-US';
        langSelect.addEventListener('change', (e) => {
            localStorage.setItem('ttsLanguage', e.target.value);
        });
    }

    if (voiceSelect) {
        voiceSelect.value = localStorage.getItem('ttsVoiceType') || 'female';
        voiceSelect.addEventListener('change', (e) => {
            localStorage.setItem('ttsVoiceType', e.target.value);
        });
    }
});

// 2. Speak AI Response (Called from the Chat page)
function speakAIResponse(text) {
    // Stop immediately if silent mode is on
    if (localStorage.getItem('silentMode') === 'true') {
        return; 
    }

    const synth = window.speechSynthesis;
    synth.cancel(); // Clear any existing speech

    const utterance = new SpeechSynthesisUtterance(text);

    // Pull user settings
    const lang = localStorage.getItem('ttsLanguage') || 'en-US';
    const voicePreference = localStorage.getItem('ttsVoiceType') || 'female';

    // Set a calm, slow pace
    utterance.lang = lang;
    utterance.rate = 0.85; 
    utterance.pitch = 0.95; 

    // Find the right voice match
    let voices = synth.getVoices();
    if (voices.length > 0) {
        let langVoices = voices.filter(v => v.lang.startsWith(lang.substring(0, 2)));
        let selectedVoice = langVoices.find(v => v.name.toLowerCase().includes(voicePreference));

        if (!selectedVoice && langVoices.length > 0) {
            selectedVoice = langVoices[0]; // Fallback to the first voice in that language
        }
        
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }
    }

    synth.speak(utterance);
}

// Pre-load browser voices in the background
window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();

// 3. Stop Audio Manually
function stopSpeaking() {
    window.speechSynthesis.cancel();
}