/* =========================================
   GLOBAL LOGIC (Navigation, Theme, Setup)
   UPDATED: Silent mode now defaults to ON for new users
   ========================================= */

// 0. Supported languages — single source of truth.
// whisper: ISO-639-1 code sent to Whisper transcription.
// llm: English name injected into the LLM language rule.
const TALOS_LANGUAGES = {
    'en-US': { whisper: 'en', llm: 'English',    label: 'English'    },
    'fi-FI': { whisper: 'fi', llm: 'Finnish',    label: 'Suomi'      },
    'sv-SE': { whisper: 'sv', llm: 'Swedish',    label: 'Svenska'    },
    'es-ES': { whisper: 'es', llm: 'Spanish',    label: 'Español'    },
    'fr-FR': { whisper: 'fr', llm: 'French',     label: 'Français'   },
    'de-DE': { whisper: 'de', llm: 'German',     label: 'Deutsch'    },
    'pt-PT': { whisper: 'pt', llm: 'Portuguese', label: 'Português'  },
    'hi-IN': { whisper: 'hi', llm: 'Hindi',      label: 'हिन्दी'       },
    'ar-SA': { whisper: 'ar', llm: 'Arabic',     label: 'العربية'     },
    'zh-CN': { whisper: 'zh', llm: 'Chinese',    label: '中文'        },
};

function getTalosLanguage() {
    const saved = localStorage.getItem('ttsLanguage') || 'en-US';
    return TALOS_LANGUAGES[saved] || TALOS_LANGUAGES['en-US'];
}

// 1. Navigation System
function navigateTo(url) {
    document.body.classList.add('fade-out');
    setTimeout(() => { window.location.href = url; }, 300);
}

document.addEventListener('click', (e) => {
    const navTarget = e.target.closest('[data-navigate]');
    if (navTarget) navigateTo(navTarget.dataset.navigate);
});

// 2. Global Accessibility Settings
function applySavedSettings() {
    const isHighContrast = (localStorage.getItem('highContrast') === 'true');
    if (isHighContrast) document.body.classList.add('high-contrast');
    else document.body.classList.remove('high-contrast');

    const textSize = localStorage.getItem('textSize') || 'M';
    document.body.classList.remove('text-size-S', 'text-size-M', 'text-size-L');
    document.body.classList.add('text-size-' + textSize);
}

// 3. Dynamic Greeting
function updateGreeting() {
    const hour = new Date().getHours();
    const greetingElement = document.getElementById('greetingText');
    if (greetingElement) {
        if (hour < 12) greetingElement.innerText = 'Good Morning!';
        else if (hour < 18) greetingElement.innerText = 'Good Afternoon!';
        else greetingElement.innerText = 'Good Evening!';
    }
}

// 4. Sticky Header
window.addEventListener('scroll', function() {
    const header = document.querySelector('.app-header');
    if (header) {
        if (window.scrollY > 10) header.classList.add('scrolled');
        else header.classList.remove('scrolled');
    }
});

// 5. Set silent mode ON for first-time users (new default)
function initDefaultSettings() {
    if (localStorage.getItem('silentMode') === null) {
        localStorage.setItem('silentMode', 'true');
    }
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    initDefaultSettings();
    applySavedSettings();
    updateGreeting();
    window.dispatchEvent(new Event('scroll'));
});
