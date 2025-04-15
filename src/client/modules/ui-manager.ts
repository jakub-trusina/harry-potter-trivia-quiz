import { GameState, Player } from '../../types/game.js';
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

    // Add optional modal elements if they exist
    const duelModal = document.getElementById('duel-modal');
    if (duelModal) {
        elements.duelModal = duelModal as HTMLDivElement;
    }

    const observerModal = document.getElementById('observer-modal');
    if (observerModal) {
        elements.observerModal = observerModal as HTMLDivElement;
    }

    const resultModal = document.getElementById('result-modal');
    if (resultModal) {
        elements.resultModal = resultModal as HTMLDivElement;
    }

    // Validate that all required elements exist
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

    // Add optional modal elements if they exist
    const duelModal = document.getElementById('duel-modal');
    if (duelModal) {
        elements.duelModal = duelModal as HTMLDivElement;
    }

    const observerModal = document.getElementById('observer-modal');
    if (observerModal) {
        elements.observerModal = observerModal as HTMLDivElement;
    }

    const resultModal = document.getElementById('result-modal');
    if (resultModal) {
        elements.resultModal = resultModal as HTMLDivElement;
    }

    // Validate that all required elements exist
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
        const playerName = document.createElement('div');
        playerName.className = 'player-name';
        playerName.textContent = player.name + (player.isHost ? ' (Host)' : '');
        li.appendChild(playerName);

        const territories = document.createElement('div');
        territories.className = 'territory-count';
        territories.textContent = `${player.territories.length} territories`;
        li.appendChild(territories);

        if (player.id === state.playerId) {
            li.classList.add('current-player');
        }
        
        playerList.appendChild(li);
    });
}

export function updateStartButton(state: GameStateManager): void {
    if (!state.ui?.startGameBtn) return;
    
    // Get the current player
    const currentPlayer = state.players.find(p => p.id === state.playerId);
    
    // Count non-disconnected players
    const activePlayers = state.players.filter(p => !p.disconnected).length;
    
    // Enable the button only if:
    // 1. Current player is the host
    // 2. There are 2-4 active players
    // 3. Game is not already active
    const canStart = currentPlayer?.isHost === true && 
                    activePlayers >= 2 && 
                    activePlayers <= 4 && 
                    !state.gameActive;
    
    console.log('Start button state:', {
        currentPlayerId: state.playerId,
        currentPlayer,
        isHost: currentPlayer?.isHost,
        activePlayers,
        gameActive: state.gameActive,
        canStart
    });
                    
    state.ui.startGameBtn.disabled = !canStart;
    
    // Update the waiting text
    const waitingText = document.querySelector('.waiting-text');
    if (waitingText) {
        if (activePlayers < 2) {
            waitingText.textContent = 'Waiting for more players (2-4 needed)';
        } else if (activePlayers > 4) {
            waitingText.textContent = 'Too many players (maximum 4)';
        } else if (!currentPlayer?.isHost) {
            waitingText.textContent = 'Waiting for host to start the game';
        } else if (state.gameActive) {
            waitingText.textContent = 'Game in progress';
        } else {
            waitingText.textContent = 'Ready to start!';
        }
    }
}

export function updatePlayerStats(state: GameStateManager): void {
    if (!state.ui?.playerStats) return;

    const playerStats = state.ui.playerStats;
    const turnIndicator = document.getElementById('turn-indicator');

    // Update turn indicator
    if (turnIndicator) {
        if (state.currentTurn === state.playerId) {
            turnIndicator.textContent = 'Your Turn';
            turnIndicator.classList.add('your-turn');
        } else {
            const currentPlayer = state.players.find(p => p.id === state.currentTurn);
            turnIndicator.textContent = `${currentPlayer?.name || 'Unknown Player'}'s Turn`;
            turnIndicator.classList.remove('your-turn');
        }
    }

    // Update player stats grid
    playerStats.className = `player-stats-grid players-${state.players.length}`;
    playerStats.innerHTML = '';

    // Sort players so current player is first
    const sortedPlayers = [...state.players].sort((a, b) => {
        if (a.id === state.playerId) return -1;
        if (b.id === state.playerId) return 1;
        return 0;
    });

    sortedPlayers.forEach(player => {
        const playerCard = document.createElement('div');
        playerCard.className = `player-stat-card${player.id === state.playerId ? ' current-player' : ''}`;
        
        playerCard.innerHTML = `
            <div class="player-name">${player.name}</div>
            <div class="stat-row">Territories: ${player.territories.length}</div>
            <div class="stat-row">Score: ${player.points || 0}</div>
        `;
        
        playerStats.appendChild(playerCard);
    });
} 