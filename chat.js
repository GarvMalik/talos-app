// Auto-scroll and header shadow logic
const chatContainer = document.getElementById('chatContainer');
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

// The core interaction logic
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
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 50);
}

// Text Input Logic
const chatInput = document.getElementById('chatInput');
if (chatInput) {
    
    // Auto-grow the textarea as the user types
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto'; // Reset height
        this.style.height = (this.scrollHeight) + 'px'; // Set to new text height
    });

    // Listen specifically for the Enter key to send
    chatInput.addEventListener('keypress', function(event) {
        // If they press Enter (but not Shift+Enter), send the message
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault(); 
            sendTypedMessage();
        }
    });
}

function sendTypedMessage() {
    const text = chatInput.value.trim();
    if (text !== '') {
        triggerEnding(text);
        chatInput.value = ''; // Clear the box
        chatInput.style.height = 'auto'; // Shrink it back down to 1 line
    }
}

// Voice Recognition Logic
const micButton = document.getElementById('micButton');
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (micButton && SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.continuous = false; 
    recognition.interimResults = true; 

    micButton.addEventListener('click', function() {
        recognition.start();
    });

    recognition.onstart = function() {
        micButton.style.color = '#BC4749'; 
        chatInput.placeholder = "Listening...";
    };

    recognition.onresult = function(event) {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            currentTranscript += event.results[i][0].transcript;
        }
        chatInput.value = currentTranscript;
    };

    recognition.onend = function() {
        micButton.style.color = '#666'; 
        chatInput.placeholder = "Type your answer...";
        
        if (chatInput.value.trim() !== '') {
            setTimeout(sendTypedMessage, 500); 
        }
    };

    recognition.onerror = function(event) {
        console.error("Mic error:", event.error);
        micButton.style.color = '#666';
        chatInput.placeholder = "Type your answer...";
    };

} else if (micButton) {
    micButton.addEventListener('click', function() {
        alert("Voice recognition isn't supported in this browser. Try Chrome or Safari.");
    });
}