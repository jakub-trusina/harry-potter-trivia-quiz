import { GameStateManager } from './state-manager.js';
import { updatePlayerName } from './state-manager.js';

export function initializeLobbyHandlers(state: GameStateManager): void {
    if (!state.ui) return;

    const { joinGameBtn, playerNameInput, loginScreen, lobbyScreen, startGameBtn } = state.ui;
    
    // Join game button handler
    joinGameBtn.addEventListener('click', () => {
        console.log('🎯 Join game button clicked');
        if (!state.socket?.connected) {
            console.error('❌ Socket not connected');
            alert('Not connected to server. Please refresh the page.');
            return;
        }
        
        const playerName = playerNameInput.value.trim();
        if (!playerName) {
            console.log('❌ No wizard name entered');
            alert('Please enter your wizard name');
            return;
        }
        
        console.log(`🧙‍♂️ Attempting to join game as "${playerName}"`);
        console.log('🔍 Socket connection state before emit:', state.socket.connected);
        
        try {
            updatePlayerName(state, playerName);
            state.socket.emit('join-game', playerName);
            loginScreen.classList.add('hidden');
            lobbyScreen.classList.remove('hidden');
            console.log('🔄 Switched to lobby screen');
        } catch (error) {
            console.error('❌ Failed to join game:', error);
            alert('Failed to join game. Please try again.');
        }
    });

    // Start game button handler
    startGameBtn.addEventListener('click', () => {
        if (!state.socket) return;
        console.log("📣 Emitting start-game event to server");
        state.socket.emit('start-game');
    });

    // New game button handler (if exists)
    const newGameBtn = document.getElementById('new-game-btn');
    if (newGameBtn) {
        newGameBtn.addEventListener('click', () => {
            window.location.reload();
        });
    }
} 