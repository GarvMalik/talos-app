/* =========================================
   GLOBAL LOGIC (Navigation, Theme, Setup)
   UPDATED: Silent mode now defaults to ON for new users
   ========================================= */

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
