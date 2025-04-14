import { GameStateManager } from './state-manager.js';
import { UIElements } from '../../types/ui.js';
import { addLogEntry } from './log-manager.js';
import { Territory, Player } from '../../types/game.js';
import { createMap } from './map-manager.js';

export interface GameStartData {
    territories: { [key: string]: Territory };
    players: Player[];
    currentTurn: string;
}

export function initializeGameState(state: GameStateManager, data: GameStartData): void {
    if (!state.ui) {
        console.error('UI elements not initialized');
        return;
    }

    state.territories = data.territories;
    state.players = data.players;
    state.currentTurn = data.currentTurn;
    state.gameActive = true;

    // Update UI elements
    state.ui.gameScreen.classList.remove('hidden');
    state.ui.loginScreen.classList.add('hidden');
    state.ui.lobbyScreen.classList.add('hidden');

    // Create the game map
    createMap(state);

    // Update player list and stats
    handleGameStateUpdate(state, data);

    addLogEntry('Game started!');
}

export function handleGameStateUpdate(state: GameStateManager, data: GameStartData): void {
    if (!state.ui) {
        console.error('UI elements not initialized');
        return;
    }

    state.territories = data.territories;
    state.players = data.players;

    // Update player list
    const playerList = state.ui.playerList;
    if (!playerList) {
        console.error('Player list element not found');
        return;
    }
    playerList.innerHTML = '';
    data.players.forEach(player => {
        const li = document.createElement('li');
        li.textContent = `${player.name} (${player.territories.length} territories)`;
        if (player.id === state.playerId) {
            li.classList.add('current-player');
        }
        playerList.appendChild(li);
    });

    // Update player stats
    const playerStats = state.ui.playerStats;
    if (!playerStats) {
        console.error('Player stats element not found');
        return;
    }
    const currentPlayer = data.players.find(p => p.id === state.playerId);
    if (currentPlayer) {
        playerStats.innerHTML = `
            <h3>Your Stats</h3>
            <p>Territories: ${currentPlayer.territories.length}</p>
            <p>Score: ${currentPlayer.score || 0}</p>
        `;
    }
}

export function handleGameEnd(state: GameStateManager): void {
    if (!state.ui) {
        console.error('UI elements not initialized');
        return;
    }

    state.gameActive = false;
    state.ui.gameScreen.classList.add('hidden');
    state.ui.loginScreen.classList.remove('hidden');
    addLogEntry('Game ended!');
}

export function initializeGameStateHandlers(state: GameStateManager): void {
    state.socket.on('game-start', (data: GameStartData) => initializeGameState(state, data));
    state.socket.on('game-state-update', (data: GameStartData) => handleGameStateUpdate(state, data));
    state.socket.on('game-end', () => handleGameEnd(state));
} 