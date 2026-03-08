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

// 2. Speak AI Response (Bulletproof Version)
function speakAIResponse(text) {
    const isMuted = localStorage.getItem('silentMode') === 'true';
    if (isMuted) {
        console.log("TTS blocked: Silent Mode is ON.");
        return; 
    }

    const synth = window.speechSynthesis;
    synth.cancel(); 

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Force max volume
    utterance.volume = 1;
    utterance.rate = 0.85; 
    utterance.pitch = 0.95; 

    const lang = localStorage.getItem('ttsLanguage') || 'en-US';
    utterance.lang = lang;

    // Try to attach a specific voice, but don't fail if we can't find one
    let voices = synth.getVoices();
    if (voices.length > 0) {
        const voicePreference = localStorage.getItem('ttsVoiceType') || 'female';
        let langVoices = voices.filter(v => v.lang.startsWith(lang.substring(0, 2)));
        let selectedVoice = langVoices.find(v => v.name.toLowerCase().includes(voicePreference));

        if (selectedVoice) {
            utterance.voice = selectedVoice;
        } else if (langVoices.length > 0) {
            utterance.voice = langVoices[0]; // Just grab the first available language voice
        }
    }

    // If the browser blocks it, tell us why!
    utterance.onerror = function(event) {
        console.error("Voice Error:", event);
        alert("Voice failed to play. Error: " + event.error);
    };

    synth.speak(utterance);
}