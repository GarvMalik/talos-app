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
   03. CORE AI LOGIC (JSON STATE MACHINE)
   ========================================= */

let conversationHistory = [];

// The strict instructions for the AI
const SYSTEM_PROMPT = `
You are Talos, a clinical intake assistant. 
Your job is to guide the user through a structured medical screening.
You MUST ALWAYS respond with valid JSON matching this exact format:
{
  "message": "The text you want to say to the patient",
  "options": ["Option 1", "Option 2", "Option 3"]
}

Rules:
1. Start by introducing yourself, explaining the process, and asking for their main concern.
2. Provide 2 to 4 logical options for them to click based on your question.
3. If you need them to type a specific custom answer, return an empty array for options: [].
4. Ask about symptoms, sleep, and stress. 
5. When you have enough info, set the message to "Thank you. I have all the information the doctor needs." and options to [].
`;

// Start the chat automatically when the page loads
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('chatHistory')) {
        // Send a hidden trigger to start the AI
        fetchGeminiResponse("START_SCREENING");
    }
});

// Handle when a user clicks a pill button
function sendOption(selectedText) {
    const chatHistory = document.getElementById('chatHistory');
    
    // Remove the buttons from the screen so they can't be clicked again
    const oldOptions = document.querySelector('.dynamic-options-container:last-of-type');
    if (oldOptions) oldOptions.remove();

    // Hide the text box if it was open
    document.getElementById('inputWrapper').style.display = 'none';

    // Show the user's choice
    chatHistory.innerHTML += `<div class="message user-message">${selectedText}</div>`;
    scrollToBottom();

    // Send it to the AI
    fetchGeminiResponse(selectedText);
}

// Handle when a user types a custom message
function sendTypedMessage() {
    const chatInput = document.getElementById('chatInput');
    const text = chatInput.value.trim();
    
    if (text !== '') {
        const chatHistory = document.getElementById('chatHistory');
        chatHistory.innerHTML += `<div class="message user-message">${text}</div>`;
        
        chatInput.value = '';
        chatInput.style.height = 'auto';
        document.getElementById('inputWrapper').style.display = 'none';
        
        scrollToBottom();
        fetchGeminiResponse(text);
    }
}

async function fetchGeminiResponse(userInput) {
    const chatHistory = document.getElementById('chatHistory');
    const apiKey = localStorage.getItem('geminiApiKey');

    if (!apiKey) {
        chatHistory.innerHTML += `<div class="message system-message">Please paste your API key in the settings.</div>`;
        return;
    }

    // Don't show the secret start command to the user
    if (userInput !== "START_SCREENING") {
        conversationHistory.push({ role: "user", parts: [{ text: userInput }] });
    }

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                contents: conversationHistory.length > 0 ? conversationHistory : [{ role: "user", parts: [{ text: "START_SCREENING" }] }],
                generationConfig: { responseMimeType: "application/json" } // FORCES JSON OUTPUT
            })
        });

        const data = await response.json();
        
        // Parse the JSON the AI sent back
        const aiResponseJSON = JSON.parse(data.candidates[0].content.parts[0].text);
        const aiMessage = aiResponseJSON.message;
        const aiOptions = aiResponseJSON.options;

        // Save AI reply to memory
        conversationHistory.push({ role: "model", parts: [{ text: JSON.stringify(aiResponseJSON) }] });

        // Print the AI message
        chatHistory.innerHTML += `
            <div class="ai-message-row" style="margin-top: 12px;">
                <div class="message ai-message" style="margin-top: 0;">${aiMessage}</div>
                <button class="btn-speaker" onclick="speakAIResponse('${aiMessage.replace(/'/g, "\\'")}')" title="Play Audio">
                    <span class="material-symbols-rounded">volume_up</span>
                </button>
            </div>
        `;

        // Check if the AI ended the screening
        if (aiMessage.includes("Thank you. I have all the information")) {
            document.getElementById('reviewButton').style.display = 'flex';
            speakAIResponse(aiMessage);
            scrollToBottom();
            return;
        }

        // Render the pill buttons or the text box
        if (aiOptions && aiOptions.length > 0) {
            let buttonsHTML = '<div class="dynamic-options-container">';
            aiOptions.forEach(option => {
                buttonsHTML += `<button class="btn-pill" onclick="sendOption('${option}')">${option}</button>`;
            });
            buttonsHTML += `<button class="btn-pill" onclick="showTextInput()">I'd rather type</button>`;
            buttonsHTML += '</div>';
            chatHistory.innerHTML += buttonsHTML;
        } else {
            // The AI sent an empty array, meaning it needs typed input
            document.getElementById('inputWrapper').style.display = 'block';
        }
        
        speakAIResponse(aiMessage);
        scrollToBottom();

    } catch (error) {
        console.error("API Error:", error);
        chatHistory.innerHTML += `<div class="message system-message" style="color: #BC4749;">Connection error. Please check your API key.</div>`;
    }
}

function showTextInput() {
    // Remove buttons and show the text box
    const oldOptions = document.querySelector('.dynamic-options-container:last-of-type');
    if (oldOptions) oldOptions.remove();
    document.getElementById('inputWrapper').style.display = 'block';
    scrollToBottom();
}

function scrollToBottom() {
    if (chatContainer) {
        setTimeout(() => {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }, 50);
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

/* =========================================
   03. CORE SEND LOGIC (REAL AI CONNECTED)
   ========================================= */

// Create a memory array so the AI remembers the conversation
let conversationHistory = [];

async function triggerEnding(userChoiceText) {
    const chatHistory = document.getElementById('chatHistory');
    const choiceButtons = document.getElementById('choiceButtons');
    const chatInput = document.getElementById('chatInput');
    
    // Hide the starting buttons if they are there
    if (choiceButtons) choiceButtons.style.display = 'none';
    
    // 1. Show the user's message on screen
    chatHistory.innerHTML += `<div class="message user-message">${userChoiceText}</div>`;
    if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;

    // 2. Add the user's message to our memory
    conversationHistory.push({
        role: "user",
        parts: [{ text: userChoiceText }]
    });

    // 3. Get the API key from settings
    const apiKey = localStorage.getItem('geminiApiKey');
    if (!apiKey) {
        const errorMsg = "Please paste your API key in the settings first.";
        chatHistory.innerHTML += `<div class="message system-message">${errorMsg}</div>`;
        speakAIResponse(errorMsg);
        return;
    }

    // Change placeholder so the user knows it is thinking
    if (chatInput) chatInput.placeholder = "Talos is thinking...";

    // 4. Send it to Google Gemini
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: {
                    parts: [{ text: "You are Talos, a compassionate and professional medical screening assistant. Ask one intake question at a time about symptoms, sleep quality, and stress levels. Keep your responses short and conversational. NEVER diagnose or give medical advice. Once you have asked 3 or 4 questions and gathered enough information, end the conversation by saying exactly: 'Thank you. I have all the information the doctor needs.'" }]
                },
                contents: conversationHistory
            })
        });

        const data = await response.json();
        
        // Grab the text the AI sent back
        const aiText = data.candidates[0].content.parts[0].text;

        // Save AI reply to memory
        conversationHistory.push({
            role: "model",
            parts: [{ text: aiText }]
        });

        // 5. Show the AI's message on screen
        chatHistory.innerHTML += `
            <div class="ai-message-row" style="margin-top: 12px;">
                <div class="message ai-message" style="margin-top: 0;">
                    ${aiText}
                </div>
                <button class="btn-speaker" onclick="speakAIResponse('${aiText.replace(/'/g, "\\'")}')" title="Play Audio">
                    <span class="material-symbols-rounded">volume_up</span>
                </button>
            </div>
        `;
        
        if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
        
        // Speak the reply out loud
        speakAIResponse(aiText);

        if (chatInput) chatInput.placeholder = "Type your answer...";

        // 6. Check if the AI decided the screening is over
        if (aiText.includes("Thank you. I have all the information")) {
            document.getElementById('activeInputArea').style.display = 'none';
            document.getElementById('reviewButton').style.display = 'flex';
        }

    } catch (error) {
        console.error("API Error:", error);
        chatHistory.innerHTML += `<div class="message system-message" style="color: #BC4749;">Connection error. Please try again.</div>`;
        if (chatInput) chatInput.placeholder = "Type your answer...";
    }
}
/* =========================================
   06. INITIAL GREETING VOICE
   ========================================= */
// When the chat page loads, wait 1 second and then read the intro
document.addEventListener('DOMContentLoaded', () => {
    // Make sure we are actually on the chat page before talking
    if (document.getElementById('chatHistory')) {
        setTimeout(() => {
            const introText = "Hello! Can we start with the screening?";
            speakAIResponse(introText);
        }, 1000); // 1000ms = 1 second delay feels natural
    }
});