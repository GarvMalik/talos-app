/* =========================================
   TEXT-TO-SPEECH (TTS) & VOICE SETTINGS
   ========================================= */

// 1. Handle Settings (Only runs on the Settings page)
document.addEventListener('DOMContentLoaded', () => {
    const silentToggle = document.getElementById('silentModeToggle');
    const langSelect = document.getElementById('languageSelect');
    const voiceSelect = document.getElementById('voiceTypeSelect');

    // Force the browser to load voices in the background immediately
    window.speechSynthesis.getVoices();

    if (silentToggle) {
        silentToggle.checked = localStorage.getItem('silentMode') === 'true';
        silentToggle.addEventListener('change', (e) => {
            localStorage.setItem('silentMode', e.target.checked);
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

// 2. Speak AI Response (With Smart Gender Mapping & Pitch Shifting)
function speakAIResponse(text, buttonId = null) {
    const isMuted = localStorage.getItem('silentMode') === 'true';
    if (isMuted) return; 

    const synth = window.speechSynthesis;
    synth.cancel(); // Stop any currently playing audio

    // Reset ALL speaker buttons back to grey just to be safe
    document.querySelectorAll('.active-speaker').forEach(btn => {
        btn.classList.remove('active-speaker');
    });

    const utterance = new SpeechSynthesisUtterance(text);
    const lang = localStorage.getItem('ttsLanguage') || 'en-US';
    utterance.lang = lang;
    utterance.volume = 1;
    utterance.rate = 1.0; 

    let voices = synth.getVoices();
    if (voices.length > 0) {
        const voicePreference = localStorage.getItem('ttsVoiceType') || 'female';
        let langVoices = voices.filter(v => v.lang.startsWith(lang.substring(0, 2)));
        
        if (langVoices.length > 0) {
            // Dictionary of common male/female voice names across Mac, Windows, and Android
            const maleNames = ['alex', 'daniel', 'fred', 'david', 'mark', 'arthur', 'oskar', 'onni', 'male'];
            const femaleNames = ['samantha', 'victoria', 'karen', 'tessa', 'zira', 'alva', 'klara', 'satu', 'female'];
            
            let selectedVoice = null;
            
            if (voicePreference === 'male') {
                // Try to find a known male name
                selectedVoice = langVoices.find(v => maleNames.some(name => v.name.toLowerCase().includes(name)));
                
                // Fallback: If no male voice is found, pick the last voice in the list and drop the pitch
                if (!selectedVoice && langVoices.length > 1) {
                    selectedVoice = langVoices[langVoices.length - 1]; 
                }
                utterance.pitch = 0.7; // Lower pitch sounds much more masculine
                
            } else if (voicePreference === 'female') {
                // Try to find a known female name
                selectedVoice = langVoices.find(v => femaleNames.some(name => v.name.toLowerCase().includes(name)));
                if (!selectedVoice) selectedVoice = langVoices[0]; // Usually the first voice is female
                utterance.pitch = 1.2; // Higher pitch sounds more feminine
                
            } else {
                // Neutral
                selectedVoice = langVoices[0];
                utterance.pitch = 1.0;
            }

            utterance.voice = selectedVoice || langVoices[0];
        }
    }

    // Link the green/grey colors to the audio timing
    if (buttonId) {
        utterance.onstart = () => {
            const btn = document.getElementById(buttonId);
            if (btn) btn.classList.add('active-speaker'); 
        };
        
        utterance.onend = () => {
            const btn = document.getElementById(buttonId);
            if (btn) btn.classList.remove('active-speaker'); 
        };

        utterance.onerror = () => {
            const btn = document.getElementById(buttonId);
            if (btn) btn.classList.remove('active-speaker'); 
        };
    }

    synth.speak(utterance);
}