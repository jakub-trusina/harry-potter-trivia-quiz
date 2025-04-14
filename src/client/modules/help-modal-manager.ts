import { GameStateManager } from './state-manager.js';

export function initializeHelpModal(state: GameStateManager): void {
    const helpModal = document.getElementById('help-modal');
    const helpButtons = document.querySelectorAll('.help-button');
    const closeHelpButton = document.querySelector('.close-help');
    
    if (!helpModal || !helpButtons.length || !closeHelpButton) {
        console.error('❌ Could not find help modal elements');
        return;
    }

    // Show modal when help button is clicked
    helpButtons.forEach(button => {
        button.addEventListener('click', () => {
            helpModal.classList.remove('hidden');
        });
    });
    
    // Hide modal when close button is clicked
    closeHelpButton.addEventListener('click', () => {
        helpModal.classList.add('hidden');
    });
    
    // Hide modal when clicking outside
    helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal) {
            helpModal.classList.add('hidden');
        }
    });

    // Add keyboard shortcut (Escape key)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !helpModal.classList.contains('hidden')) {
            helpModal.classList.add('hidden');
        }
    });
} 