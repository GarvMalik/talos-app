/* =========================================
   01. UI & LAYOUT LOGIC
   ========================================= */
const chatContainer = document.getElementById('chatContainer');
const chatInput = document.getElementById('chatInput');
const micButton = document.getElementById('micButton');
const sendBtn = document.querySelector('.btn-send');

if (chatContainer) {
    chatContainer.scrollTop = chatContainer.scrollHeight;

    chatContainer.addEventListener('scroll', function() {
        const header = document.querySelector('.app-header');
        if (chatContainer.scrollTop > 10) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });

    chatContainer.dispatchEvent(new Event('scroll'));
}

/* =========================================
   02. STATE VARIABLES & SETUP
   ========================================= */
let isRecording = false;
let silenceTimer = null; 
let isSecondInputSession = false; 
let previousText = "";
let recognition = null;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    // CHANGED: This stops the mic from cutting out when you take a breath
    recognition.continuous = true; 
    recognition.interimResults = true;
}

/* =========================================
   03. CORE SEND LOGIC
   ========================================= */
function triggerEnding(userChoiceText) {
    const chatHistory = document.getElementById('chatHistory');
    
    document.getElementById('choiceButtons').style.display = 'none';
    chatHistory.innerHTML += `<div class="message user-message">${userChoiceText}</div>`;
    
    chatHistory.innerHTML += `
        <div class="message system-message" style="margin-top: 12px;">
            <strong>Thank you.</strong> I have all the information the doctor needs.
        </div>
    `;

    document.getElementById('activeInputArea').style.display = 'none';
    document.getElementById('reviewButton').style.display = 'flex';

    setTimeout(() => {
        if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 50);
}

function sendTypedMessage() {
    if (!chatInput) return;
    const text = chatInput.value.trim();
    
    if (text !== '') {
        triggerEnding(text);
        chatInput.value = '';
        chatInput.style.height = 'auto';
        isSecondInputSession = false; 
        chatInput.placeholder = "Type your answer...";
    }
}

/* =========================================
   04. TIMERS & EVENT HANDLERS
   ========================================= */
function resetSilenceTimer() {
    // Clear the old timer
    if (silenceTimer) clearTimeout(silenceTimer);

    // Only start the 5s countdown if this is the first automatic session
    if (!isSecondInputSession) {
        if (chatInput) chatInput.placeholder = "Listening... (Will send after 5s of silence)";
        silenceTimer = setTimeout(() => {
            // 5 full seconds of silence reached! Stop mic and send.
            stopRecording();
            sendTypedMessage();
        }, 5000); 
    } else {
        if (chatInput && isRecording) chatInput.placeholder = "Listening... (Manual send required)";
    }
}

function cancelSilenceTimer() {
    if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
    }
    isSecondInputSession = true; 
    if (chatInput && !isRecording) {
        chatInput.placeholder = "Editing... (Manual send required)";
    }
}

function stopRecording() {
    if (recognition && isRecording) {
        recognition.stop();
    }
}

/* =========================================
   05. USER INTERACTIONS
   ========================================= */

// Text Area Events
if (chatInput) {
    chatInput.addEventListener('mousedown', () => {
        stopRecording();
        cancelSilenceTimer();
    });

    chatInput.addEventListener('input', function() {
        cancelSilenceTimer();
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            cancelSilenceTimer();
            stopRecording();
            sendTypedMessage();
        }
    });
}

// Send Button Override
if (sendBtn) {
    sendBtn.addEventListener('click', () => {
        stopRecording();
        cancelSilenceTimer();
        sendTypedMessage();
    });
}

// Voice Recognition Events
if (micButton && recognition) {
    micButton.addEventListener('click', () => {
        if (!isRecording) {
            navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
                window.localStream = stream;
                previousText = chatInput.value.trim();
                
                if (previousText !== "") isSecondInputSession = true;
                
                recognition.start();
            }).catch(err => console.error("Mic access denied:", err));
        } else {
            // User manually clicked the mic to stop it early
            stopRecording();
            cancelSilenceTimer(); 
        }
    });

    recognition.onstart = () => {
        isRecording = true;
        micButton.classList.add('recording');
        resetSilenceTimer(); // Start the first 5s countdown
    };

    recognition.onresult = (event) => {
        let fullTranscript = '';
        
        // Combine all the continuous words together
        for (let i = 0; i < event.results.length; ++i) {
            fullTranscript += event.results[i][0].transcript;
        }
        
        chatInput.value = previousText + (previousText ? " " : "") + fullTranscript;
        chatInput.style.height = 'auto';
        chatInput.style.height = (chatInput.scrollHeight) + 'px';

        // Word detected! Reset the 5s silence countdown.
        resetSilenceTimer(); 
    };

    recognition.onend = () => {
        isRecording = false;
        micButton.classList.remove('recording');
        
        // Turn off the hardware mic light
        if (window.localStream) {
            window.localStream.getTracks().forEach(t => t.stop());
        }
        
        // Update placeholder text based on mode
        if (!isSecondInputSession && chatInput.value.trim() === '') {
            chatInput.placeholder = "Type your answer...";
        } else if (isSecondInputSession) {
            chatInput.placeholder = "Finished. Press send when ready.";
        }
    };
} else if (micButton) {
    micButton.addEventListener('click', () => {
        alert("Voice recognition isn't supported in this browser. Try Chrome or Safari.");
    });
}