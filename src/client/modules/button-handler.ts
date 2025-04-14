import { GameStateManager } from './state-manager.js';
import { addLogEntry } from './log-manager.js';

export function initializeButtonHandlers(state: GameStateManager): void {
    if (!state.ui) {
        console.error('UI not initialized');
        return;
    }

    // Join Game button
    state.ui.joinGameBtn.addEventListener('click', () => {
        console.log('🎯 Join game button clicked');
        if (!state.socket?.connected) {
            console.error('❌ Socket not connected');
            alert('Not connected to server. Please refresh the page.');
            return;
        }
        
        if (!state.ui?.playerNameInput.value.trim()) {
            console.log('❌ No wizard name entered');
            alert('Please enter your wizard name');
            return;
        }
        
        state.playerName = state.ui.playerNameInput.value.trim();
        console.log(`🧙‍♂️ Attempting to join game as "${state.playerName}"`);
        
        try {
            state.socket.emit('join-game', state.playerName);
            state.ui.loginScreen.classList.add('hidden');
            state.ui.lobbyScreen.classList.remove('hidden');
            console.log('🔄 Switched to lobby screen');
            addLogEntry('Joined the game lobby');
        } catch (error) {
            console.error('❌ Failed to join game:', error);
            alert('Failed to join game. Please try again.');
        }
    });

    // Start Game button
    state.ui.startGameBtn.addEventListener('click', () => {
        console.log("📣 Emitting start-game event to server");
        state.socket.emit('start-game');
    });

    // Help Modal
    state.ui.helpButtons.forEach(button => {
        button.addEventListener('click', () => {
            console.log('📖 Opening help modal');
            state.ui?.helpModal.classList.remove('hidden');
        });
    });

    state.ui.closeHelpButton.addEventListener('click', () => {
        console.log('📖 Closing help modal');
        state.ui?.helpModal.classList.add('hidden');
    });

    // Close help modal when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === state.ui?.helpModal) {
            state.ui.helpModal.classList.add('hidden');
        }
    });
} 