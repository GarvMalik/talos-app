/* =========================================
   TTS.JS — ELEVENLABS + BROWSER TTS ENGINE
   
   KEY FIX: speakAIResponse now accepts a `forcePlay` flag.
   When forcePlay=true (voice mode), audio plays regardless of silentMode.
   Silent mode ONLY silences the text chat speaker buttons.
   ========================================= */

const ELEVENLABS_VOICES = {
    female:  'EXAVITQu4vr4xnSDxMaL', // Sarah
    male:    'TX3LPaxmHKxFdv7VOQHJ', // Liam
    neutral: 'pqHfZKP75CvOlQylNhV4'  // Bill
};

let _currentAudioSource = null;
let _audioCtx = null;
let _isSpeaking = false;
let _activeSpeakerBtnId = null;

// ---- Public API ----

/**
 * @param {string} text
 * @param {string|null} buttonId
 * @param {boolean} forcePlay — if true, bypasses silentMode (used in voice mode)
 */
async function speakAIResponse(text, buttonId = null, forcePlay = false) {
    // Silent mode check: only block if NOT forced (i.e. text chat context)
    if (!forcePlay && localStorage.getItem('silentMode') !== 'false') return;

    stopSpeaking();
    _activeSpeakerBtnId = buttonId;
    _setButtonState(buttonId, true);

    const elKey = localStorage.getItem('talosElevenLabsKey');
    if (elKey) {
        await _speakWithElevenLabs(text, elKey, buttonId);
    } else {
        _speakWithBrowser(text, buttonId);
    }
}

/**
 * Returns a Promise that resolves when speech finishes.
 * Used by voice loop to chain: speak → listen.
 */
async function speakAndWait(text, buttonId = null) {
    return new Promise(async (resolve) => {
        stopSpeaking();
        _activeSpeakerBtnId = buttonId;
        _setButtonState(buttonId, true);

        const elKey = localStorage.getItem('talosElevenLabsKey');
        if (elKey) {
            await _speakWithElevenLabsPromise(text, elKey, buttonId, resolve);
        } else {
            _speakWithBrowserPromise(text, buttonId, resolve);
        }
    });
}

function stopSpeaking() {
    if (_currentAudioSource) {
        try { _currentAudioSource.stop(); } catch(e) {}
        _currentAudioSource = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (_activeSpeakerBtnId) _setButtonState(_activeSpeakerBtnId, false);
    _isSpeaking = false;
}

function isSpeaking() { return _isSpeaking; }

// ---- ElevenLabs (fire-and-forget) ----

async function _speakWithElevenLabs(text, apiKey, buttonId) {
    try {
        _isSpeaking = true;
        const voicePref = localStorage.getItem('ttsVoiceType') || 'female';
        const voiceId   = ELEVENLABS_VOICES[voicePref] || ELEVENLABS_VOICES.female;

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
            body: JSON.stringify({
                text: _preprocessText(text),
                model_id: 'eleven_multilingual_v2',
                voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true }
            })
        });

        if (!response.ok) {
            _isSpeaking = false;
            _speakWithBrowser(text, buttonId);
            return;
        }

        const audioBuffer = await _decodeResponse(response);
        _playBuffer(audioBuffer, buttonId, () => {});
    } catch (e) {
        console.error('ElevenLabs error:', e);
        _isSpeaking = false;
        _setButtonState(buttonId, false);
        _speakWithBrowser(text, buttonId);
    }
}

// ---- ElevenLabs (promise, used by voice loop) ----

async function _speakWithElevenLabsPromise(text, apiKey, buttonId, onEnd) {
    try {
        _isSpeaking = true;
        const voicePref = localStorage.getItem('ttsVoiceType') || 'female';
        const voiceId   = ELEVENLABS_VOICES[voicePref] || ELEVENLABS_VOICES.female;

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
            body: JSON.stringify({
                text: _preprocessText(text),
                model_id: 'eleven_multilingual_v2',
                voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true }
            })
        });

        if (!response.ok) {
            _isSpeaking = false;
            _speakWithBrowserPromise(text, buttonId, onEnd);
            return;
        }

        const audioBuffer = await _decodeResponse(response);
        _playBuffer(audioBuffer, buttonId, onEnd);
    } catch (e) {
        console.error('ElevenLabs error:', e);
        _isSpeaking = false;
        _setButtonState(buttonId, false);
        onEnd();
    }
}

async function _decodeResponse(response) {
    const arrayBuffer = await response.arrayBuffer();
    if (!_audioCtx || _audioCtx.state === 'closed') {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_audioCtx.state === 'suspended') await _audioCtx.resume();
    return await _audioCtx.decodeAudioData(arrayBuffer);
}

function _playBuffer(audioBuffer, buttonId, onEnd) {
    const source = _audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(_audioCtx.destination);
    _currentAudioSource = source;
    _isSpeaking = true;

    source.onended = () => {
        _isSpeaking = false;
        _setButtonState(buttonId, false);
        _currentAudioSource = null;
        onEnd();
    };
    source.start(0);
}

// ---- Browser TTS (fire-and-forget) ----

function _speakWithBrowser(text, buttonId) {
    const synth = window.speechSynthesis;
    synth.cancel();
    const _do = () => {
        const utt = _buildUtterance(text);
        _isSpeaking = true;
        utt.onstart = () => _setButtonState(buttonId, true);
        utt.onend   = () => { _isSpeaking = false; _setButtonState(buttonId, false); };
        utt.onerror = () => { _isSpeaking = false; _setButtonState(buttonId, false); };
        synth.speak(utt);
    };
    synth.getVoices().length === 0
        ? synth.addEventListener('voiceschanged', _do, { once: true })
        : _do();
}

// ---- Browser TTS (promise) ----

function _speakWithBrowserPromise(text, buttonId, onEnd) {
    const synth = window.speechSynthesis;
    synth.cancel();
    const _do = () => {
        const utt = _buildUtterance(text);
        _isSpeaking = true;
        utt.onstart = () => _setButtonState(buttonId, true);
        utt.onend   = () => { _isSpeaking = false; _setButtonState(buttonId, false); onEnd(); };
        utt.onerror = () => { _isSpeaking = false; _setButtonState(buttonId, false); onEnd(); };
        synth.speak(utt);
    };
    synth.getVoices().length === 0
        ? synth.addEventListener('voiceschanged', _do, { once: true })
        : _do();
}

function _buildUtterance(text) {
    const voices    = window.speechSynthesis.getVoices();
    const utt       = new SpeechSynthesisUtterance(_preprocessText(text));
    const lang      = localStorage.getItem('ttsLanguage') || 'en-US';
    const voicePref = localStorage.getItem('ttsVoiceType') || 'female';
    utt.lang   = lang;
    utt.volume = 1;
    utt.rate   = 0.95;
    utt.pitch  = voicePref === 'male' ? 0.85 : voicePref === 'neutral' ? 1.0 : 1.15;

    const preferred = {
        female:  ['Samantha', 'Victoria', 'Karen', 'Moira', 'Tessa', 'Zira', 'Satu'],
        male:    ['Alex', 'Daniel', 'Fred', 'Gordon', 'Arthur', 'David', 'Mark'],
        neutral: ['Rishi', 'Fiona', 'Damayanti']
    }[voicePref] || [];

    const langVoices = voices.filter(v => v.lang.startsWith(lang.substring(0, 2)));
    let selected = null;
    for (const name of preferred) {
        selected = langVoices.find(v => v.name.toLowerCase().includes(name.toLowerCase()));
        if (selected) break;
    }
    if (!selected && langVoices.length > 0) selected = langVoices[0];
    if (selected) utt.voice = selected;
    return utt;
}

// ---- Helpers ----

function _preprocessText(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1').replace(/#{1,6}\s/g, '')
        .replace(/Dr\./g, 'Doctor').replace(/\betc\.\b/g, 'et cetera')
        .replace(/\be\.g\.\b/g, 'for example').replace(/\bi\.e\.\b/g, 'that is')
        .replace(/\s+/g, ' ').trim();
}

function _setButtonState(buttonId, isActive) {
    document.querySelectorAll('.btn-speaker').forEach(btn => btn.classList.remove('active-speaker'));
    if (buttonId && isActive) {
        const btn = document.getElementById(buttonId);
        if (btn) btn.classList.add('active-speaker');
    }
}

// ---- Settings Page Init ----
// FIX: tts.js and settings.js both registered listeners on silentModeToggle,
// causing the echo bug. Now ONLY tts.js owns the silentMode toggle.
// settings.js no longer touches it.

document.addEventListener('DOMContentLoaded', () => {
    if (window.speechSynthesis) window.speechSynthesis.getVoices();

    const silentToggle = document.getElementById('silentModeToggle');
    if (silentToggle) {
        if (localStorage.getItem('silentMode') === null) localStorage.setItem('silentMode', 'true');
        silentToggle.checked = localStorage.getItem('silentMode') !== 'false';
        silentToggle.addEventListener('change', (e) => {
            localStorage.setItem('silentMode', e.target.checked ? 'true' : 'false');
            if (e.target.checked) stopSpeaking();
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

    const elKeyInput = document.getElementById('elevenLabsKeyInput');
    if (elKeyInput) {
        elKeyInput.value = localStorage.getItem('talosElevenLabsKey') || '';
        elKeyInput.addEventListener('change', (e) => {
            const val = e.target.value.trim();
            if (val) localStorage.setItem('talosElevenLabsKey', val);
            else localStorage.removeItem('talosElevenLabsKey');
        });
    }

    // FIX: Test button — single listener, single play, no double-trigger
    const testBtn = document.getElementById('btnTestVoice');
    if (testBtn) {
        testBtn.addEventListener('click', () => {
            // Force play ignoring silent mode, using the forcePlay flag
            const elKey = localStorage.getItem('talosElevenLabsKey');
            if (elKey) {
                _speakWithElevenLabs('Hello! This is the current voice. I hope it sounds clear and natural.', elKey, null);
            } else {
                _speakWithBrowser('Hello! This is the current voice. I hope it sounds clear and natural.', null);
            }
        });
    }
});
