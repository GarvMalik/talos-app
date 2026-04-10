/* =========================================
   CHAT UI, AI BRAIN & VOICE INPUT
   ========================================= */

// Pull the key from memory, or ask the user for it
let GROQ_API_KEY = localStorage.getItem('talosApiKey');

if (!GROQ_API_KEY) {
    const userInput = prompt("Welcome to the Talos Prototype! To power the AI, please paste your free Groq API Key here:");
    if (userInput) {
        localStorage.setItem('talosApiKey', userInput.trim());
        GROQ_API_KEY = userInput.trim();
    } else {
        alert("The AI requires an API key to function. Please refresh the page and try again.");
    }
}
let conversationHistory = [];

const SYSTEM_PROMPT = `You are Talos, a specialised Mental Health Pre-screening assistant. 
Your goal is to gather initial context about a patient's emotional and psychological well-being before they speak with a therapist or counsellor.

CRITICAL BEHAVIOR RULES:
1. Single Focus: Ask exactly ONE question at a time.
2. Zero Diagnosis: Do not label conditions. Focus on symptoms and feelings.
3. Empathetic Tone: Use a supportive and non-judgmental.
4. Crisis Safety: If self-harm is mentioned, provide emergency contacts immediately, then continue.
5. Psychological Safety: Validate that it's okay to feel unsure or to skip sensitive topics.
6. Handling Refusals:  If they skip, say "No problem, let's move on" and ask the next point from the Checklist.

7. Minimal Acknowledgement (IMPORTANT):
- Do NOT rstate, summarise, or paraphrase the user's response.
- Use only a very short acknowledgement (e.g., "I understand.", "Thanks for sharing.", "Got it.").

8. Concise Responses: Keep the entire message short and direct.

9. First Message: Exactly "Hi, welcome to this pre-screening. I’ll ask a few short questions to better understand how you’re feeling. You can answer in your own words, choose an option, or skip anything you prefer. What brings you here today?"

10. Question Limit (IMPORTANT):
- Ask a maximum of 10 main questions in total.
- A "main question" is any new question that explores a different topic (e.g., mood, sleep, duration, daily impact, stressors).
- Once you reach this limit, stop asking new questions and move to a brief summary.

11. Rephrasing Rule (Not Counted):
- If the user says "I don't know", "I'm not sure", or shows confusion, you may rephrase the SAME question once.
- Rephrased questions do NOT count toward the 10-question limit.
- Do not ask more than one rephrase per question.

12. No Redundant Questions:
- Do not ask multiple questions about the same exact detail unless clarification is needed.
- Avoid repeating or slightly rewording questions unless triggered by uncertainty.

13. MANDATORY TOPICS (MUST BE COVERED):
- You MUST ensure the conversation covers: Main concern, Duration of symptoms, Daily life impact, Sleep patterns, and Current medications or substance use (specifically ask "Are you taking any medications or using substances like tobacco or alcohol?").

INTERACTION FLOW:
- Identify the main concern.
- Sequentially address the MANDATORY TOPICS listed in Rule 13.
- When the user says "I don't know" or "I don't understand", rephrase the question with a simple example.
- If they mention specific symptoms like "insomnia" or "medication", ask a brief follow-up (e.g., "How many hours of sleep do you get?" or "What is the name of the medicine?").
- Once the mandatory topics are covered, end by sharing a brief summary of what you've noted and ask if they'd like to add anything else.

STRICT OUTPUT FORMAT:
You must return your response ONLY as a valid JSON object:
{"message": "Response here.", "options": ["Option 1", "Option 2"]}`;

document.addEventListener('DOMContentLoaded', () => {
    const chatHistory = document.getElementById('chatHistory');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const micButton = document.getElementById('micButton');
    
    // Auto-expand textarea
    if (chatInput) {
        chatInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });

        // Handle Enter Key
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                cancelSilenceTimer();
                stopRecording();
                sendTypedMessage();
            }
        });

        chatInput.addEventListener('mousedown', () => {
            stopRecording();
            cancelSilenceTimer();
        });
    }

    // Handle Send Button Click
    if (sendBtn) {
        sendBtn.addEventListener('click', () => {
            stopRecording();
            cancelSilenceTimer();
            sendTypedMessage();
        });
    }

    // Handle Dynamic Option Clicks (Global Event Delegation)
    document.addEventListener('click', (e) => {
        // AI generated pill buttons
        if (e.target.classList.contains('btn-pill')) {
            sendOption(e.target.innerText);
        }
        
        // Static Quick Replies (Skip/Prefer not to answer)
        const quickReplyTarget = e.target.closest('[data-quick-reply]');
        if (quickReplyTarget) {
            sendOption(quickReplyTarget.dataset.quickReply);
        }
        
        // AI Speaker buttons
        const speakerBtn = e.target.closest('.btn-speaker');
        if (speakerBtn) {
            if (typeof speakAIResponse === "function") {
                speakAIResponse(speakerBtn.dataset.text, speakerBtn.id);
            }
        }
    });

    // =========================================
    // VOICE INPUT (MIC) LOGIC
    // =========================================
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
        if (chatInput) chatInput.placeholder = "Listening...";
        
        silenceTimer = setTimeout(() => {
            stopRecording();
            sendTypedMessage();
        }, 5000); 
    }

    function cancelSilenceTimer() {
        if (silenceTimer) clearTimeout(silenceTimer);
        if (chatInput) chatInput.placeholder = "Type your answer...";
    }

    function stopRecording() {
        if (recognition && isRecording) recognition.stop();
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
            if (chatInput) chatInput.placeholder = "Type your answer...";
        };
    } else if (micButton) {
        micButton.addEventListener('click', () => {
            alert("Voice recognition isn't supported in this browser.");
        });
    }

    // Auto-Start Chat
    if (chatHistory) {
        chatHistory.innerHTML = ''; 
        conversationHistory.push({ role: "user", content: "Hi, I am ready to start my screening." });
        fetchGroqResponse();
    }
});

// =========================================
// HELPER FUNCTIONS & API CALLS
// =========================================

function scrollToBottom() {
    const chatContainer = document.getElementById('chatContainer');
    if (chatContainer) setTimeout(() => { chatContainer.scrollTop = chatContainer.scrollHeight; }, 50);
}

function setInputState(isLocked) {
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const micButton = document.getElementById('micButton');
    
    if (chatInput) chatInput.disabled = isLocked;
    if (sendBtn) sendBtn.disabled = isLocked;
    if (micButton) micButton.disabled = isLocked;
    
    if (isLocked && chatInput) chatInput.placeholder = "Talos is typing...";
    else if (chatInput) chatInput.placeholder = "Type your answer...";
}

function clearDynamicButtons() {
    document.querySelectorAll('.dynamic-options-container').forEach(el => el.remove());
}

function sendOption(selectedText) {
    clearDynamicButtons();
    document.getElementById('chatHistory').innerHTML += `<div class="message user-message">${selectedText}</div>`;
    scrollToBottom();
    conversationHistory.push({ role: "user", content: selectedText });
    fetchGroqResponse();
}

function sendTypedMessage() {
    const chatInput = document.getElementById('chatInput');
    const text = chatInput.value.trim();
    if (text !== '') {
        clearDynamicButtons();
        document.getElementById('chatHistory').innerHTML += `<div class="message user-message">${text}</div>`;
        chatInput.value = '';
        chatInput.style.height = 'auto';
        scrollToBottom();
        conversationHistory.push({ role: "user", content: text });
        fetchGroqResponse();
    }
}

async function fetchGroqResponse() {
    const chatHistory = document.getElementById('chatHistory');
    setInputState(true);
    const typingId = "typing-" + Date.now();
    chatHistory.innerHTML += `<div id="${typingId}" class="message system-message mt-10 italic-gray">Talos is thinking...</div>`;
    scrollToBottom();

    // 1. Check which language the user saved in settings
    const savedLang = localStorage.getItem('ttsLanguage') || 'en-US';
    let targetLanguage = "English";
    if (savedLang === 'fi-FI') targetLanguage = "Finnish";
    if (savedLang === 'sv-SE') targetLanguage = "Swedish";

    // 2. Inject the language rule directly into the AI Prompt
    const dynamicSystemPrompt = SYSTEM_PROMPT + `\n\nCRITICAL LANGUAGE RULE: You MUST write your 'message' and all 'options' entirely in ${targetLanguage}. Do not use any other language. When you have enough context to end the screening, say "Thank you. I have all the information" translated naturally into ${targetLanguage}.`;

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [{ role: "system", content: dynamicSystemPrompt }, ...conversationHistory],
                response_format: { type: "json_object" }
            })
        });

        const data = await response.json();
        document.getElementById(typingId).remove();
        setInputState(false);

        const rawText = data.choices[0].message.content;
        const aiResponseJSON = JSON.parse(rawText);
        const aiMessage = aiResponseJSON.message;
        const aiOptions = aiResponseJSON.options;

        conversationHistory.push({ role: "assistant", content: rawText });
        localStorage.setItem('talosChatHistory', JSON.stringify(conversationHistory));

        const msgId = "speaker-" + Date.now();
        
        chatHistory.innerHTML += `
            <div class="ai-message-row mt-10">
                <div class="message ai-message mb-0">${aiMessage}</div>
                <button id="${msgId}" class="btn-speaker" data-text="${aiMessage.replace(/"/g, '&quot;')}" title="Play Audio">
                    <span class="material-symbols-rounded">volume_up</span>
                </button>
            </div>
        `;

        // 3. Check for completion in all three languages
        const lowerCaseMsg = aiMessage.toLowerCase();
        const isScreeningComplete = 
            (lowerCaseMsg.includes("thank you") && lowerCaseMsg.includes("information")) || // English
            (lowerCaseMsg.includes("kiitos") && lowerCaseMsg.includes("tiedo")) || // Finnish (tiedot/tietoa)
            (lowerCaseMsg.includes("tack") && lowerCaseMsg.includes("information")); // Swedish
            
        if (isScreeningComplete) {
            document.getElementById('reviewButton').classList.remove('hidden');
            document.getElementById('reviewButton').style.display = 'flex';
            if (typeof speakAIResponse === "function") speakAIResponse(aiMessage, msgId);
            scrollToBottom();
            document.getElementById('inputWrapper').classList.add('hidden');
            return;
        }

        if (aiOptions && aiOptions.length > 0) {
            let buttonsHTML = '<div class="dynamic-options-container">';
            aiOptions.forEach(option => { buttonsHTML += `<button class="btn-pill">${option}</button>`; });
            buttonsHTML += '</div>';
            chatHistory.innerHTML += buttonsHTML;
        }
        
        if (typeof speakAIResponse === "function") speakAIResponse(aiMessage, msgId);
        scrollToBottom();

    } catch (error) {
        console.error("API Error:", error);
        setInputState(false);
        const typingMsg = document.getElementById(typingId);
        if(typingMsg) typingMsg.remove();
        chatHistory.innerHTML += `<div class="message system-message" style="color: #BC4749;">System error. Check connection.</div>`;
    }
}
