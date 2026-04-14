/* =========================================
   CHAT.JS — AI BRAIN + VOICE-TO-VOICE ENGINE

   BUGS FIXED IN THIS VERSION:
   
   BUG 1 — Silent mode leaks after exiting voice chat.
   Root cause: fetchGroqResponse received `continueVoiceLoop` as its audio
   decision signal. When voice mode ended mid-flight (e.g. user exits while
   AI response was in-flight), continueVoiceLoop was still `true` inside
   that call, so it called speakAndWait() instead of the silent-mode-
   respecting speakAIResponse(). Fix: audio decisions now read _isVoiceMode
   at call-time, not from the captured closure argument.

   BUG 2 — Option pills disappear after switching back from voice mode.
   Root cause: Option rendering was guarded by `if (!continueVoiceLoop)`.
   After exiting voice mode, subsequent normal-chat calls still had
   continueVoiceLoop=false — so this wasn't the problem there. The real
   issue was that clearDynamicButtons() inside _transcribe() wiped any
   existing pill container BEFORE the new response arrived, and since the
   voice→text switch left _isVoiceMode=false but a stale continueVoiceLoop
   value persisted in the in-flight fetch closure. Fix: option rendering now
   checks _isVoiceMode at render-time, not the closure value.

   BUG 3 — Browser asks for mic permission on every utterance.
   Root cause: _startRecording() called getUserMedia() on every invocation
   and then called stream.getTracks().forEach(t => t.stop()) in onstop,
   fully releasing the stream. Each new recording required a fresh permission
   grant. Fix: stream is acquired once and cached in _cachedStream. Tracks
   are only stopped when voice mode is fully exited. MediaRecorder is
   re-created per utterance (required by the API) but reuses the live stream.
   ========================================= */

let GROQ_API_KEY = localStorage.getItem('talosApiKey');
if (!GROQ_API_KEY) {
    const userInput = prompt("Welcome to Talos! Please paste your free Groq API Key:");
    if (userInput) {
        localStorage.setItem('talosApiKey', userInput.trim());
        GROQ_API_KEY = userInput.trim();
    } else {
        alert("The AI requires an API key. Please refresh and try again.");
    }
}

let conversationHistory = [];

const SYSTEM_PROMPT = `You are Talos, a conversational AI designed for pre-clinical health pre-screening. 
Your primary role is to gather basic health information and symptoms before the patient meets with a human healthcare professional.
>>>>>>> f11da03 (new upadtes)
CRITICAL BEHAVIOR RULES:
1. Single Focus: Ask exactly ONE question at a time.
2. Zero Diagnosis: Do not label conditions. Focus on symptoms, feelings, and intensity.
3. Empathetic Tone: Use a supportive and non-judgmental tone.
4. Crisis Safety: If self-harm is mentioned, provide emergency contacts immediately, then continue.
5. Psychological Safety: Validate that it's okay to feel unsure or to skip sensitive topics.
6. Handling Refusals: If they skip, say "No problem, let's move on" and ask the next point.
7. Minimal Acknowledgement: Do NOT restate or summarise the user's response. Use only a short acknowledgement (e.g., "I understand.", "Thanks for sharing.").
8. Concise Responses: Keep the entire message short and direct.

9. First Message: Your very first response MUST be exactly: "Hi, welcome to this pre-screening. I’ll ask a few questions to better understand how you’re feeling. You can answer in your own words, choose an option, or skip anything you prefer. What brings you here today?" 

10. QUESTION LIMIT & DEPTH (IMPORTANT):
- You must ask between 15 and 20 main questions to gather in-depth information.
- Dig deeper into their answers (e.g., ask about specific triggers, how often it happens, how severe it feels, and what coping mechanisms they use).

11. STRICT NON-REPETITION:
- NEVER repeat a question. Once a user provides an answer, immediately move on to the next topic or a deeper follow-up.
- EXCEPTION: If the user says "I don't know" or shows confusion, you may rephrase the SAME question once.

12. DEFLECTING COMPLEX QUESTIONS:
- If the user asks you a complex psychological or medical question, DO NOT attempt to answer it. Deflect by saying: "That is a great question to discuss with your therapist. For now, I am just gathering some initial context."

13. MANDATORY TOPICS (MUST BE COVERED IN DEPTH):
- Sequentially cover:
  a) Main concern and its specific triggers.
  b) Severity and duration of symptoms.
  c) Daily life impact (work, relationships, hobbies).
  d) Sleep patterns and appetite.
  e) Coping mechanisms already tried.
  f) Current medications or substance use (specifically ask "Are you taking any medications or using substances like tobacco or alcohol?").

14. ALWAYS PROVIDE OPTIONS (CRITICAL):
- You MUST provide 2 to 4 contextually relevant, short options in the "options" array for EVERY question you ask, including the very first message. (e.g., for the first message, provide options like "Anxiety", "Feeling down", "Sleep issues", "Stress").

INTERACTION FLOW & CLOSING PROTOCOL (CRITICAL FOR UI):
To prevent the chat interface from closing prematurely, you MUST follow this two-step closing process:

- STEP 1 (The Open-Ended Check): Once all mandatory topics are covered deeply (around question 15-20), share a brief summary of what you have noted, and ask: "Is there anything else you would like to add or discuss before we finish?" Do NOT say "thank you" or "information" in this step.
- STEP 2 (The Final Trigger): Wait for the user to reply to Step 1. ONLY AFTER they reply (e.g., they say "No" or add a final thought), you MUST say exactly: "Thank you. I have all the information." (This exact phrase triggers the system UI to close).

STRICT OUTPUT FORMAT:
You must return your response ONLY as a valid JSON object. Do not include markdown formatting like \`\`\`json or \`\`\`. Output raw JSON only:
{"message": "Response here.", "options": ["Option 1", "Option 2"]}`;

// =========================================
// STATE
// =========================================
let _mediaRecorder   = null;
let _audioChunks     = [];
let _isRecording     = false;
let _isVoiceMode     = false;   // authoritative real-time flag
let _voiceLoopActive = false;
let _silenceTimer    = null;
let _vadCtx          = null;

// FIX 3: persistent stream cache — getUserMedia called ONCE per voice session
let _cachedStream    = null;
let _cachedMimeType  = null;

// Voice orb state machine
let _orbState = 'idle';

// =========================================
// DOM INIT
// =========================================
document.addEventListener('DOMContentLoaded', () => {
    const chatHistory  = document.getElementById('chatHistory');
    const chatInput    = document.getElementById('chatInput');
    const sendBtn      = document.getElementById('sendBtn');
    const micButton    = document.getElementById('micButton');
    const voiceModeBtn = document.getElementById('voiceModeBtn');

    if (chatInput) {
        chatInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = this.scrollHeight + 'px';
        });
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                _stopRecording();
                sendTypedMessage();
            }
        });
        chatInput.addEventListener('mousedown', () => {
            if (_isRecording) _stopRecording();
        });
    }

    if (sendBtn) {
        sendBtn.addEventListener('click', () => { _stopRecording(); sendTypedMessage(); });
    }

    // Event delegation for dynamic elements
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-pill')) sendOption(e.target.innerText);

        const qr = e.target.closest('[data-quick-reply]');
        if (qr) sendOption(qr.dataset.quickReply);

        const speaker = e.target.closest('.btn-speaker');
        if (speaker && typeof speakAIResponse === 'function') {
            // Text chat: always respects silent mode (forcePlay = false)
            speakAIResponse(speaker.dataset.text, speaker.id, false);
        }
    });

    // Mic button: single utterance (for inline mic in text chat)
    if (micButton) {
        micButton.addEventListener('click', async () => {
            if (_isRecording) {
                _stopRecording();
            } else {
                if (typeof stopSpeaking === 'function') stopSpeaking();
                await _startRecording(false);
            }
        });
    }

    // Voice mode toggle
    if (voiceModeBtn) {
        voiceModeBtn.addEventListener('click', async () => {
            _isVoiceMode ? _exitVoiceMode() : await _enterVoiceMode();
        });
    }

    // Auto-start screening
    if (chatHistory) {
        chatHistory.innerHTML = '';
        conversationHistory.push({ role: 'user', content: 'Hi, I am ready to start my screening.' });
        fetchGroqResponse();
    }
});

// =========================================
// MIC STREAM — acquired once, reused across utterances
// =========================================

/**
 * Ensures a live mic stream exists. Returns the cached stream if available,
 * otherwise calls getUserMedia() (triggers permission prompt only this once).
 */
async function _ensureStream() {
    // If we have a cached stream with live tracks, reuse it
    if (_cachedStream && _cachedStream.getTracks().every(t => t.readyState === 'live')) {
        return _cachedStream;
    }

    // First call, or stream was released — acquire a fresh one
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 16000
        }
    });

    _cachedStream = stream;

    // Detect the best supported mime type once and cache it
    _cachedMimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/ogg;codecs=opus';

    return stream;
}

/**
 * Fully releases the cached mic stream. Called only when exiting voice mode
 * entirely, not between utterances.
 */
function _releaseStream() {
    if (_cachedStream) {
        _cachedStream.getTracks().forEach(t => t.stop());
        _cachedStream = null;
    }
}

// =========================================
// RECORDING + VAD
// =========================================

async function _startRecording(looping = false) {
    if (_isRecording) return;

    try {
        // FIX 3: reuse cached stream — no new permission prompt
        const stream = await _ensureStream();

        _audioChunks = [];

        // MediaRecorder must be recreated per utterance (API requirement),
        // but the underlying stream is reused from cache
        _mediaRecorder = new MediaRecorder(stream, { mimeType: _cachedMimeType });

        _mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) _audioChunks.push(e.data);
        };

        _mediaRecorder.onstop = async () => {
            // FIX 3: do NOT stop stream tracks here — stream stays alive for next utterance
            _cleanupVAD();

            const blob = new Blob(_audioChunks, { type: _cachedMimeType });

            if (blob.size < 3000) {
                _setOrbState('idle');
                if (looping && _voiceLoopActive) _scheduleNextCapture();
                return;
            }

            _setOrbState('processing');
            await _transcribe(blob, looping);
        };

        _mediaRecorder.start(250);
        _isRecording = true;
        _setOrbState('listening');
        _startVAD(stream, looping);

    } catch (err) {
        console.error('Mic error:', err);
        _setOrbState('idle');
        // If permission denied, release any partial stream
        _releaseStream();
        if (looping && _voiceLoopActive) _scheduleNextCapture();
    }
}

function _startVAD(stream, looping) {
    _cleanupVAD();

    _vadCtx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = _vadCtx.createAnalyser();
    const source   = _vadCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 512;

    const data = new Uint8Array(analyser.frequencyBinCount);

    let speechDetected = false;
    let silenceSince   = null;

    const SPEECH_THRESHOLD = 12;
    const SILENCE_MS       = looping ? 1800 : 2000;
    const MAX_WAIT_MS      = 8000;
    const startTime        = Date.now();

    const tick = () => {
        if (!_isRecording) return;

        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const now = Date.now();

        if (!speechDetected && (now - startTime) > MAX_WAIT_MS) {
            _stopRecording();
            return;
        }

        if (avg >= SPEECH_THRESHOLD) {
            speechDetected = true;
            silenceSince   = null;
            if (_silenceTimer) { clearTimeout(_silenceTimer); _silenceTimer = null; }
        } else if (speechDetected) {
            if (!silenceSince) silenceSince = now;
            if ((now - silenceSince) >= SILENCE_MS && !_silenceTimer) {
                _silenceTimer = setTimeout(() => {
                    _silenceTimer = null;
                    _stopRecording();
                }, 100);
            }
        }

        requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
}

function _cleanupVAD() {
    if (_silenceTimer) { clearTimeout(_silenceTimer); _silenceTimer = null; }
    if (_vadCtx) {
        try { _vadCtx.close(); } catch(e) {}
        _vadCtx = null;
    }
}

function _stopRecording() {
    _cleanupVAD();
    if (_mediaRecorder && _isRecording) {
        _isRecording = false;
        try { _mediaRecorder.stop(); } catch(e) {}
    }
}

// =========================================
// WHISPER TRANSCRIPTION
// =========================================

async function _transcribe(blob, looping) {
    const formData = new FormData();
    const ext = blob.type.includes('webm') ? 'webm' : 'ogg';
    formData.append('file', blob, `audio.${ext}`);
    formData.append('model', 'whisper-large-v3');

    const lang     = localStorage.getItem('ttsLanguage') || 'en-US';
    const langCode = { 'en-US': 'en', 'fi-FI': 'fi', 'sv-SE': 'sv' }[lang] || 'en';
    formData.append('language', langCode);
    formData.append('response_format', 'json');

    try {
        const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
            body: formData
        });

        if (!res.ok) {
            console.error('Whisper error:', await res.text());
            _setOrbState('idle');
            if (looping && _voiceLoopActive) _scheduleNextCapture();
            return;
        }

        const { text } = await res.json();
        const transcript = (text || '').trim();

        if (!transcript) {
            _setOrbState('idle');
            if (looping && _voiceLoopActive) _scheduleNextCapture();
            return;
        }

        clearDynamicButtons();
        const chatHistory = document.getElementById('chatHistory');
        chatHistory.innerHTML += `<div class="message user-message">${transcript}</div>`;
        scrollToBottom();
        conversationHistory.push({ role: 'user', content: transcript });
        _setOrbTranscript(transcript);

        await fetchGroqResponse();

    } catch (err) {
        console.error('Transcription error:', err);
        _setOrbState('idle');
        if (looping && _voiceLoopActive) _scheduleNextCapture();
    }
}

// =========================================
// VOICE MODE
// =========================================

async function _enterVoiceMode() {
    _isVoiceMode     = true;
    _voiceLoopActive = true;

    document.getElementById('voiceModeBtn')?.classList.add('voice-mode-active');
    document.getElementById('activeInputArea').style.display = 'none';
    document.getElementById('voiceOrb')?.classList.remove('hidden');

    if (typeof stopSpeaking === 'function') stopSpeaking();
    _setOrbState('listening');
    await _startRecording(true);
}

function _exitVoiceMode() {
    _isVoiceMode     = false;
    _voiceLoopActive = false;

    if (_isRecording) _stopRecording();
    if (typeof stopSpeaking === 'function') stopSpeaking();

    // FIX 3: release the mic stream when leaving voice mode entirely
    _releaseStream();

    document.getElementById('voiceModeBtn')?.classList.remove('voice-mode-active');
    document.getElementById('activeInputArea').style.display = '';
    document.getElementById('voiceOrb')?.classList.add('hidden');
    _setOrbState('idle');
    _setOrbTranscript('');
    _setOrbResponse('');
}

function _scheduleNextCapture() {
    if (!_voiceLoopActive) return;
    setTimeout(async () => {
        if (!_voiceLoopActive) return;
        _setOrbState('listening');
        await _startRecording(true);
    }, 600);
}

// =========================================
// ORB STATE MACHINE
// =========================================

function _setOrbState(state) {
    _orbState = state;
    const orb   = document.getElementById('voiceOrb');
    const label = document.getElementById('orbStateLabel');
    if (!orb) return;
    orb.dataset.state = state;
    const labels = { idle: '', listening: 'Listening...', processing: 'Thinking...', speaking: 'Speaking...' };
    if (label) label.textContent = labels[state] || '';
}

function _setOrbTranscript(text) {
    const el = document.getElementById('orbTranscript');
    if (el) el.textContent = text;
}

function _setOrbResponse(text) {
    const el = document.getElementById('orbResponse');
    if (el) el.textContent = text;
}

// =========================================
// HELPERS
// =========================================

function scrollToBottom() {
    const c = document.getElementById('chatContainer');
    if (c) setTimeout(() => { c.scrollTop = c.scrollHeight; }, 50);
}

function setInputState(isLocked) {
    const chatInput = document.getElementById('chatInput');
    const sendBtn   = document.getElementById('sendBtn');
    const micButton = document.getElementById('micButton');
    if (chatInput) {
        chatInput.disabled = isLocked;
        chatInput.placeholder = isLocked ? 'Talos is typing...' : 'Type your answer...';
    }
    if (sendBtn)   sendBtn.disabled = isLocked;
    if (micButton) micButton.disabled = isLocked;
}

function clearDynamicButtons() {
    document.querySelectorAll('.dynamic-options-container').forEach(el => el.remove());
}

function sendOption(selectedText) {
    clearDynamicButtons();
    document.getElementById('chatHistory').innerHTML += `<div class="message user-message">${selectedText}</div>`;
    scrollToBottom();
    conversationHistory.push({ role: 'user', content: selectedText });
    fetchGroqResponse();
}

function sendTypedMessage() {
    const chatInput = document.getElementById('chatInput');
    const text = chatInput.value.trim();
    if (!text) return;
    clearDynamicButtons();
    document.getElementById('chatHistory').innerHTML += `<div class="message user-message">${text}</div>`;
    chatInput.value = '';
    chatInput.style.height = 'auto';
    scrollToBottom();
    conversationHistory.push({ role: 'user', content: text });
    fetchGroqResponse();
}

// =========================================
// GROQ LLM
// FIX 1 + FIX 2: All mode decisions now read _isVoiceMode at call-time
// rather than relying on the `continueVoiceLoop` closure argument.
// This prevents stale closure values from leaking audio or suppressing UI
// after the user has switched modes.
// =========================================

async function fetchGroqResponse() {
    const chatHistory = document.getElementById('chatHistory');

    // Snapshot voice mode state at the START of this response cycle.
    // This is the value we'll use consistently throughout this one call.
    const inVoiceMode = _isVoiceMode;

    setInputState(true);
    if (inVoiceMode) _setOrbState('processing');

    const typingId = 'typing-' + Date.now();
    if (!inVoiceMode) {
        chatHistory.innerHTML += `<div id="${typingId}" class="message system-message mt-10 italic-gray">Talos is thinking...</div>`;
        scrollToBottom();
    }

    const savedLang  = localStorage.getItem('ttsLanguage') || 'en-US';
    const langMap    = { 'en-US': 'English', 'fi-FI': 'Finnish', 'sv-SE': 'Swedish' };
    const targetLang = langMap[savedLang] || 'English';

    const prompt = SYSTEM_PROMPT +
        `\n\nCRITICAL LANGUAGE RULE: Respond entirely in ${targetLang}. ` +
        `When done, say "Thank you. I have all the information" in ${targetLang}.`;

    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [{ role: 'system', content: prompt }, ...conversationHistory],
                response_format: { type: 'json_object' }
            })
        });

        const data = await res.json();
        document.getElementById(typingId)?.remove();
        setInputState(false);

        // FIX 2: robust JSON parsing with fallback so options always render
        let aiMessage = '';
        let aiOptions = [];
        try {
            const raw    = data.choices[0].message.content;
            const parsed = JSON.parse(raw);
            aiMessage    = parsed.message  || '';
            aiOptions    = Array.isArray(parsed.options) ? parsed.options : [];
            conversationHistory.push({ role: 'assistant', content: raw });
            localStorage.setItem('talosChatHistory', JSON.stringify(conversationHistory));
        } catch (parseErr) {
            console.error('JSON parse error:', parseErr);
            aiMessage = data.choices?.[0]?.message?.content || 'Sorry, I encountered an error.';
            aiOptions = [];
        }

        // Update orb with AI's response text
        if (inVoiceMode) _setOrbResponse(aiMessage);

        // Render AI message bubble + speaker button
        const msgId = 'speaker-' + Date.now();
        chatHistory.innerHTML += `
            <div class="ai-message-row mt-10">
                <div class="message ai-message mb-0">${aiMessage}</div>
                <button id="${msgId}" class="btn-speaker" data-text="${aiMessage.replace(/"/g, '&quot;')}" title="Play Audio">
                    <span class="material-symbols-rounded">volume_up</span>
                </button>
            </div>`;

        // Completion detection
        const lower      = aiMessage.toLowerCase();
        const isComplete =
            (lower.includes('thank you') && lower.includes('information')) ||
            (lower.includes('kiitos') && (lower.includes('tiedo') || lower.includes('tiedot'))) ||
            (lower.includes('tack') && lower.includes('information'));

        if (isComplete) {
            if (_isVoiceMode) _exitVoiceMode();
            document.getElementById('reviewButton').classList.remove('hidden');
            document.getElementById('reviewButton').style.display = 'flex';
            document.getElementById('inputWrapper').classList.add('hidden');
            // Re-read _isVoiceMode — exitVoiceMode() may have just flipped it
            if (typeof speakAIResponse === 'function') speakAIResponse(aiMessage, msgId, _isVoiceMode);
            scrollToBottom();
            return;
        }

        // FIX 2: Option pills — render whenever NOT in voice mode.
        // Read _isVoiceMode now (live), not the inVoiceMode snapshot.
        // This covers the case where the user exited voice mode while the
        // response was in-flight: the snapshot said "voice", but now we're
        // in text mode and should show the pills.
        if (!_isVoiceMode && aiOptions.length > 0) {
            let html = '<div class="dynamic-options-container">';
            aiOptions.forEach(o => { html += `<button class="btn-pill">${o}</button>`; });
            html += '</div>';
            chatHistory.innerHTML += html;
        }

        scrollToBottom();

        // ---- Audio ----
        // FIX 1: read _isVoiceMode live here too, not inVoiceMode snapshot.
        // If user exited voice mode while fetch was in-flight, _isVoiceMode
        // is now false → we fall through to the silent-mode-respecting branch.
        if (_isVoiceMode && _voiceLoopActive) {
            _setOrbState('speaking');
            if (typeof speakAndWait === 'function') {
                await speakAndWait(aiMessage, msgId);
            }
            _setOrbState('idle');
            _scheduleNextCapture();
        } else {
            // FIX 1: normal text chat — always pass forcePlay=false so silent mode is respected
            if (typeof speakAIResponse === 'function') speakAIResponse(aiMessage, msgId, false);
        }

    } catch (err) {
        console.error('API Error:', err);
        setInputState(false);
        document.getElementById(typingId)?.remove();
        chatHistory.innerHTML += `<div class="message system-message" style="color:#BC4749;">Connection error. Check your API key.</div>`;
        if (_isVoiceMode) {
            _setOrbState('idle');
            if (_voiceLoopActive) _scheduleNextCapture();
        }
    }
}
