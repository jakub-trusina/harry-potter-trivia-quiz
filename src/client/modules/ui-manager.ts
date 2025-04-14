import { GameState } from '../../types/game.js';
import { UIElements } from '../../types/ui.js';
import { GameStateManager } from './state-manager.js';

export function initializeUI(state: GameStateManager): void {
    const elements: UIElements = {
        // Help system
        helpButtons: Array.from(document.getElementsByClassName('help-button')) as HTMLButtonElement[],
        helpModal: document.getElementById('help-modal') as HTMLDivElement,
        closeHelpButton: document.querySelector('.close-help') as HTMLButtonElement,
        
        // Login and lobby screens
        loginScreen: document.getElementById('login-screen') as HTMLDivElement,
        lobbyScreen: document.getElementById('lobby-screen') as HTMLDivElement,
        playerNameInput: document.getElementById('player-name') as HTMLInputElement,
        joinGameBtn: document.getElementById('join-game-btn') as HTMLButtonElement,
        startGameBtn: document.getElementById('start-game-btn') as HTMLButtonElement,
        playerList: document.getElementById('player-list') as HTMLUListElement,
        
        // Game screen elements
        gameScreen: document.getElementById('game-screen') as HTMLDivElement,
        mapContainer: document.getElementById('map-container') as HTMLDivElement,
        playerStats: document.getElementById('player-stats') as HTMLDivElement,
        logEntries: document.getElementById('log-entries') as HTMLDivElement,
        
        // Modals
        quizModal: document.getElementById('quiz-modal') as HTMLDivElement,
        gameOverModal: document.getElementById('game-over-modal') as HTMLDivElement,
        
        // Quiz elements
        questionContainer: document.getElementById('question-container') as HTMLDivElement,
        answersContainer: document.getElementById('answers-container') as HTMLDivElement,
        duelStatus: document.getElementById('duel-status') as HTMLDivElement,
        duelResult: document.getElementById('duel-result') as HTMLDivElement,
        timer: document.getElementById('timer') as HTMLDivElement
    };

    // Validate that all elements exist
    for (const [key, element] of Object.entries(elements)) {
        if (!element || (Array.isArray(element) && element.length === 0)) {
            console.error(`Required UI element not found: ${key}`);
            return;
        }
    }

    state.ui = elements;
}

export function initializeUIElements(): UIElements | null {
    const elements: UIElements = {
        // Help system
        helpButtons: Array.from(document.getElementsByClassName('help-button')) as HTMLButtonElement[],
        helpModal: document.getElementById('help-modal') as HTMLDivElement,
        closeHelpButton: document.querySelector('.close-help') as HTMLButtonElement,
        
        // Login and lobby screens
        loginScreen: document.getElementById('login-screen') as HTMLDivElement,
        lobbyScreen: document.getElementById('lobby-screen') as HTMLDivElement,
        playerNameInput: document.getElementById('player-name') as HTMLInputElement,
        joinGameBtn: document.getElementById('join-game-btn') as HTMLButtonElement,
        startGameBtn: document.getElementById('start-game-btn') as HTMLButtonElement,
        playerList: document.getElementById('player-list') as HTMLUListElement,
        
        // Game screen elements
        gameScreen: document.getElementById('game-screen') as HTMLDivElement,
        mapContainer: document.getElementById('map-container') as HTMLDivElement,
        playerStats: document.getElementById('player-stats') as HTMLDivElement,
        logEntries: document.getElementById('log-entries') as HTMLDivElement,
        
        // Modals
        quizModal: document.getElementById('quiz-modal') as HTMLDivElement,
        gameOverModal: document.getElementById('game-over-modal') as HTMLDivElement,
        
        // Quiz elements
        questionContainer: document.getElementById('question-container') as HTMLDivElement,
        answersContainer: document.getElementById('answers-container') as HTMLDivElement,
        duelStatus: document.getElementById('duel-status') as HTMLDivElement,
        duelResult: document.getElementById('duel-result') as HTMLDivElement,
        timer: document.getElementById('timer') as HTMLDivElement
    };

    // Validate that all elements exist
    for (const [key, element] of Object.entries(elements)) {
        if (!element) {
            console.error(`Failed to initialize UI element: ${key}`);
            return null;
        }
    }

    return elements;
}

export function setupHelpModal(ui: UIElements): void {
    if (!ui.helpButtons || !ui.helpModal || !ui.closeHelpButton) return;

    ui.helpButtons.forEach(button => {
        button.addEventListener('click', () => {
            ui.helpModal.classList.remove('hidden');
        });
    });

    ui.closeHelpButton.addEventListener('click', () => {
        ui.helpModal.classList.add('hidden');
    });

    window.addEventListener('click', (event) => {
        if (event.target === ui.helpModal) {
            ui.helpModal.classList.add('hidden');
        }
    });
}

export function updatePlayerList(state: GameStateManager): void {
    if (!state.ui?.playerList) return;

    const playerList = state.ui.playerList;
    playerList.innerHTML = '';

    state.players.forEach(player => {
        const li = document.createElement('li');
        li.textContent = player.name;
        if (player.id === state.playerId) {
            li.classList.add('current-player');
        }
        playerList.appendChild(li);
    });
}

export function updateStartButton(state: GameStateManager): void {
    if (!state.ui?.startGameBtn) return;
    
    const canStart = state.players.length >= 2 && state.players.length <= 4;
    state.ui.startGameBtn.disabled = !canStart;
}

export function updatePlayerStats(state: GameStateManager): void {
    if (!state.ui?.playerStats) return;

    const playerStats = state.ui.playerStats;
    const currentPlayer = state.players.find(p => p.id === state.playerId);
    
    if (currentPlayer) {
        playerStats.innerHTML = `
            <h3>Your Stats</h3>
            <p>Territories: ${currentPlayer.territories.length}</p>
            <p>Score: ${currentPlayer.score || 0}</p>
        `;
    }
} 