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

// 2. Speak AI Response (With Dynamic Button States)
function speakAIResponse(text, buttonId = null) {
    const isMuted = localStorage.getItem('silentMode') === 'true';
    if (isMuted) {
        return; 
    }

    const synth = window.speechSynthesis;
    synth.cancel(); // Stop any currently playing audio

    // Reset ALL speaker buttons back to grey just to be safe
    document.querySelectorAll('.active-speaker').forEach(btn => {
        btn.classList.remove('active-speaker');
    });

    const utterance = new SpeechSynthesisUtterance(text);
    
    utterance.volume = 1;
    utterance.rate = 1.0; 
    utterance.pitch = 1.0; 

    const lang = localStorage.getItem('ttsLanguage') || 'en-US';
    utterance.lang = lang;

    let voices = synth.getVoices();
    if (voices.length > 0) {
        const voicePreference = localStorage.getItem('ttsVoiceType') || 'female';
        let langVoices = voices.filter(v => v.lang.startsWith(lang.substring(0, 2)));
        let selectedVoice = langVoices.find(v => v.name.toLowerCase().includes(voicePreference));

        if (selectedVoice) {
            utterance.voice = selectedVoice;
        } else if (langVoices.length > 0) {
            utterance.voice = langVoices[0]; 
        }
    }

    // If we passed a button ID, link the green/grey colors to the audio timing
    if (buttonId) {
        utterance.onstart = () => {
            const btn = document.getElementById(buttonId);
            if (btn) btn.classList.add('active-speaker'); // Turn Green
        };
        
        utterance.onend = () => {
            const btn = document.getElementById(buttonId);
            if (btn) btn.classList.remove('active-speaker'); // Fade to Grey
        };

        utterance.onerror = (event) => {
            const btn = document.getElementById(buttonId);
            if (btn) btn.classList.remove('active-speaker'); // Fade to Grey on error
        };
    }

    synth.speak(utterance);
}