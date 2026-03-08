// Function to check the time and update the text
function updateGreeting() {
    const hour = new Date().getHours();
    const greetingElement = document.getElementById('greetingText');
    
    if (greetingElement) {
        if (hour < 12) {
            greetingElement.innerText = 'Good Morning!';
        } else if (hour < 18) {
            greetingElement.innerText = 'Good Afternoon!';
        } else {
            greetingElement.innerText = 'Good Evening!';
        }
    }
}

updateGreeting();

// ==========================================
// STICKY HEADER SCROLL EFFECT
// ==========================================
window.addEventListener('scroll', function() {
    const header = document.querySelector('.app-header');
    
    if (header) {
        if (window.scrollY > 10) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    }
});

// Function to handle smooth page transitions
function navigateTo(url) {
    document.body.classList.add('fade-out');
    setTimeout(function() {
        window.location.href = url;
    }, 300);
}

// ==========================================
// USER PREFERENCES & SETTINGS LOGIC
// ==========================================
function applySavedSettings() {
    const isHighContrast = (localStorage.getItem('highContrast') === 'true');
    
    if (isHighContrast) {
        document.body.classList.add('high-contrast');
    } else {
        document.body.classList.remove('high-contrast');
    }

    const textSize = localStorage.getItem('textSize') || 'M';
    document.body.classList.remove('text-size-S', 'text-size-M', 'text-size-L');
    document.body.classList.add('text-size-' + textSize);

    const contrastToggle = document.getElementById('contrastToggle');
    if (contrastToggle) {
        contrastToggle.checked = isHighContrast;
    }

    const silentToggle = document.getElementById('silentToggle');
    if (silentToggle) {
        silentToggle.checked = (localStorage.getItem('silentMode') === 'true');
    }

    if (document.getElementById('textSize' + textSize)) {
        document.getElementById('textSizeS').classList.remove('active');
        document.getElementById('textSizeM').classList.remove('active');
        document.getElementById('textSizeL').classList.remove('active');
        document.getElementById('textSize' + textSize).classList.add('active');
    }
}

function toggleContrast(isChecked) {
    localStorage.setItem('highContrast', isChecked);
    applySavedSettings(); 
}

function changeTextSize(size) {
    localStorage.setItem('textSize', size);
    applySavedSettings();
}

function toggleSilentMode(isChecked) {
    localStorage.setItem('silentMode', isChecked);
}

function deleteLocalData() {
    if (confirm("Are you sure you want to delete all local data? This will reset all your settings and delete chat history.")) {
        localStorage.clear();
        alert("All local data has been securely wiped.");
        applySavedSettings(); 
    }
}

document.addEventListener('DOMContentLoaded', applySavedSettings);

// ==========================================
// PAST SUMMARIES ACCORDION LOGIC
// ==========================================
function toggleSummary(headerElement) {
    const card = headerElement.closest('.summary-card');
    const icon = headerElement.querySelector('.expand-icon');
    const isExpanded = card.classList.contains('expanded');
    
    if (isExpanded) {
        card.classList.remove('expanded');
        icon.innerText = 'expand_more'; 
    } else {
        card.classList.add('expanded');
        icon.innerText = 'expand_less'; 
    }
}