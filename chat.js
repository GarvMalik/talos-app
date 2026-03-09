/* =========================================
   01. APP CONFIGURATION
   ========================================= */
// Paste your Gemini API key right here inside the quotes
const GEMINI_API_KEY = "PASTE_YOUR_API_KEY_HERE";

/* =========================================
   02. UI & LAYOUT LOGIC
   ========================================= */
const chatContainer = document.getElementById('chatContainer');
const chatInput = document.getElementById('chatInput');
const micButton = document.getElementById('micButton');
const sendBtn = document.querySelector('.btn-send');

if (chatContainer) {
    chatContainer.addEventListener('scroll', function() {
        const header = document.querySelector('.app-header');
        if (chatContainer.scrollTop > 10) header.classList.add('scrolled');
        else header.classList.remove('scrolled');
    });
}

if (chatInput) {
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });
}

function scrollToBottom() {
    if (chatContainer) {
        setTimeout(() => { chatContainer.scrollTop = chatContainer.scrollHeight; }, 50);
    }
}

/* =========================================
   03. PROMPT ENGINEERING & MEMORY
   ========================================= */
let conversationHistory = [];

const SYSTEM_PROMPT = `
You are Talos, a clinical intake assistant. 
Your job is to guide the patient through a structured medical screening.
You MUST ALWAYS respond with valid JSON matching this exact format:
{
  "message": "The text you want to say to the patient",
  "options": ["Option 1", "Option 2", "Option 3"]
}

Rules:
1. Provide 2 to 4 short, logical options for them to click.
2. If you need them to type a custom answer, return an empty array for options: [].
3. Ask one question at a time about symptoms, sleep quality, or stress. 
4. When you have asked 3 or 4 questions and gathered enough info, set the message to EXACTLY: "Thank you. I have all the information the doctor needs." and options to [].
`;

/* =========================================
   04. AUTO-START CHAT LOGIC
   ========================================= */
document.addEventListener('DOMContentLoaded', () => {
    const chatHistory = document.getElementById('chatHistory');
    if (chatHistory) {
        chatHistory.innerHTML = ''; 
        conversationHistory.push({ role: "user", parts: [{ text: "Hi, I am ready to start my screening." }] });
        fetchGeminiResponse();
    }
});

/* =========================================
   05. USER ACTIONS (CLICKS & TYPING)
   ========================================= */
function sendOption(selectedText) {
    const chatHistory = document.getElementById('chatHistory');
    const oldOptions = document.querySelector('.dynamic-options-container:last-of-type');
    if (oldOptions) oldOptions.remove();

    chatHistory.innerHTML += `<div class="message user-message">${selectedText}</div>`;
    scrollToBottom();
    
    conversationHistory.push({ role: "user", parts: [{ text: selectedText }] });
    fetchGeminiResponse();
}

function sendTypedMessage() {
    const text = chatInput.value.trim();
    if (text !== '') {
        const chatHistory = document.getElementById('chatHistory');
        const oldOptions = document.querySelector('.dynamic-options-container:last-of-type');
        if (oldOptions) oldOptions.remove(); // Clear pill buttons if they type instead

        chatHistory.innerHTML += `<div class="message user-message">${text}</div>`;
        
        chatInput.value = '';
        chatInput.style.height = 'auto';
        
        scrollToBottom();
        conversationHistory.push({ role: "user", parts: [{ text: text }] });
        fetchGeminiResponse();
    }
}

/* =========================================
   06. API NETWORK REQUEST (GEMINI JSON)
   ========================================= */
async function fetchGeminiResponse() {
    const chatHistory = document.getElementById('chatHistory');

    if (!GEMINI_API_KEY || GEMINI_API_KEY === "PASTE_YOUR_API_KEY_HERE") {
        chatHistory.innerHTML += `<div class="message system-message">Developer: Please add your API key to the top of chat.js</div>`;
        return;
    }

    const typingId = "typing-" + Date.now();
    chatHistory.innerHTML += `<div id="${typingId}" class="message system-message" style="margin-top: 12px; font-style: italic;">Talos is thinking...</div>`;
    scrollToBottom();

   try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                contents: conversationHistory,
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        const data = await response.json();
        document.getElementById(typingId).remove();

        if (data.error) {
            chatHistory.innerHTML += `<div class="message system-message" style="color: #BC4749;">API Error: ${data.error.message}</div>`;
            return;
        }

        const rawText = data.candidates[0].content.parts[0].text;
        const aiResponseJSON = JSON.parse(rawText);
        const aiMessage = aiResponseJSON.message;
        const aiOptions = aiResponseJSON.options;

        conversationHistory.push({ role: "model", parts: [{ text: rawText }] });
        localStorage.setItem('talosChatHistory', JSON.stringify(conversationHistory));

        // Create a completely unique ID for this specific message's speaker icon
        const msgId = "speaker-" + Date.now();

        chatHistory.innerHTML += `
            <div class="ai-message-row" style="margin-top: 12px;">
                <div class="message ai-message" style="margin-top: 0;">${aiMessage}</div>
                <button id="${msgId}" class="btn-speaker" onclick="speakAIResponse('${aiMessage.replace(/'/g, "\\'")}', '${msgId}')" title="Play Audio">
                    <span class="material-symbols-rounded">volume_up</span>
                </button>
            </div>
        `;

        if (aiMessage.includes("Thank you. I have all the information")) {
            document.getElementById('reviewButton').style.display = 'flex';
            speakAIResponse(aiMessage, msgId);
            scrollToBottom();
            return;
        }

        if (aiOptions && aiOptions.length > 0) {
            let buttonsHTML = '<div class="dynamic-options-container">';
            aiOptions.forEach(option => {
                const safeOption = option.replace(/'/g, "\\'");
                buttonsHTML += `<button class="btn-pill" onclick="sendOption('${safeOption}')">${option}</button>`;
            });
            buttonsHTML += '</div>';
            chatHistory.innerHTML += buttonsHTML;
        }
        
        // Pass the message AND the unique button ID to the voice engine
        speakAIResponse(aiMessage, msgId);
        scrollToBottom();

    } catch (error) {
        console.error("API Error:", error);
        const typingMsg = document.getElementById(typingId);
        if(typingMsg) typingMsg.remove();
        chatHistory.innerHTML += `<div class="message system-message" style="color: #BC4749;">System error. Check your API key.</div>`;
    }
}

/* =========================================
   07. VOICE INPUT (MIC) LOGIC
   ========================================= */
let isRecording = false;
let silenceTimer = null; 
let previousText = "";
let recognition = null;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true; 
    recognition.interimResults = true;
}

function resetSilenceTimer() {
    if (silenceTimer) clearTimeout(silenceTimer);
    
    // Keep the text simple and human
    if (chatInput) chatInput.placeholder = "Listening...";
    
    silenceTimer = setTimeout(() => {
        stopRecording();
        sendTypedMessage();
    }, 5000); 
}

function cancelSilenceTimer() {
    if (silenceTimer) clearTimeout(silenceTimer);
    
    // Revert to the standard typing prompt
    if (chatInput) chatInput.placeholder = "Type your answer...";
}

function stopRecording() {
    if (recognition && isRecording) recognition.stop();
}

if (chatInput) {
    chatInput.addEventListener('mousedown', () => {
        stopRecording();
        cancelSilenceTimer();
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

if (sendBtn) {
    sendBtn.addEventListener('click', () => {
        stopRecording();
        cancelSilenceTimer();
        sendTypedMessage();
    });
}

if (micButton && recognition) {
    micButton.addEventListener('click', () => {
        if (!isRecording) {
            navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
                window.localStream = stream;
                previousText = chatInput.value.trim();
                recognition.start();
            }).catch(err => console.error("Mic access denied:", err));
        } else {
            stopRecording();
            cancelSilenceTimer(); 
        }
    });

    recognition.onstart = () => {
        isRecording = true;
        micButton.classList.add('recording');
        resetSilenceTimer(); 
    };

    recognition.onresult = (event) => {
        let fullTranscript = '';
        for (let i = 0; i < event.results.length; ++i) {
            fullTranscript += event.results[i][0].transcript;
        }
        chatInput.value = previousText + (previousText ? " " : "") + fullTranscript;
        chatInput.style.height = 'auto';
        chatInput.style.height = (chatInput.scrollHeight) + 'px';
        resetSilenceTimer(); 
    };

    recognition.onend = () => {
        isRecording = false;
        micButton.classList.remove('recording');
        if (window.localStream) {
            window.localStream.getTracks().forEach(t => t.stop());
        }
        // Always go back to the default text when the mic turns off
        if (chatInput) chatInput.placeholder = "Type your answer...";
    };
} else if (micButton) {
    micButton.addEventListener('click', () => {
        alert("Voice recognition isn't supported in this browser.");
    });
}