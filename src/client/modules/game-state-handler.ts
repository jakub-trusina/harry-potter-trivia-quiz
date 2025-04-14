import { GameStateManager } from './state-manager.js';
import { UIElements } from '../../types/ui.js';
import { addLogEntry } from './log-manager.js';
import { Territory, Player } from '../../types/game.js';
import { createMap, updateMap } from './map-manager.js';
import { updatePlayerStats } from './ui-manager.js';

export interface GameStartData {
    territories: { [key: string]: Territory };
    players: Player[];
    currentTurn: string;
}

interface GameEndData {
    scores: {
        name: string;
        id: string;
        score: number;
        territories: number;
        hasCapitol: boolean;
    }[];
    conquestWinner: {
        name: string;
        id: string;
    } | null;
    scoreWinner: {
        name: string;
        id: string;
        score: number;
    };
}

export function initializeGameStateHandlers(state: GameStateManager): void {
    if (!state.socket) return;

    state.socket.on('game-start', (data: GameStartData) => initializeGameState(state, data));
    state.socket.on('game-state-update', (data: GameStartData) => handleGameStateUpdate(state, data));
    state.socket.on('game-end', (data: GameEndData) => handleGameEnd(state, data));
}

function initializeGameState(state: GameStateManager, data: GameStartData): void {
    if (!state.ui) {
        console.error('UI elements not initialized');
        return;
    }

    state.territories = data.territories;
    state.players = data.players;
    state.currentTurn = data.currentTurn;
    state.gameActive = true;

    // Create initial map
    createMap(state);
    updatePlayerStats(state);

    // Hide lobby screen and show game screen
    const lobbyScreen = document.getElementById('lobby-screen');
    const gameScreen = document.getElementById('game-screen');
    if (lobbyScreen) lobbyScreen.classList.add('hidden');
    if (gameScreen) gameScreen.classList.remove('hidden');

    addLogEntry('Game started!');
}

function handleGameStateUpdate(state: GameStateManager, data: GameStartData): void {
    if (!state.ui) {
        console.error('UI elements not initialized');
        return;
    }

    state.territories = data.territories;
    state.players = data.players;
    state.currentTurn = data.currentTurn;

    // Update UI
    updateMap(state);
    updatePlayerStats(state);

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

function handleGameEnd(state: GameStateManager, data: GameEndData): void {
    if (!state.ui) {
        console.error('UI elements not initialized');
        return;
    }

    state.gameActive = false;

    // Create game over modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content game-over">
            <h2>Game Over!</h2>
            ${data.conquestWinner ? 
                `<p class="winner-announcement">🏰 ${data.conquestWinner.name} has won by conquest!</p>` : 
                ''}
            ${data.scoreWinner ? 
                `<p class="winner-announcement">🏆 ${data.scoreWinner.name} has won by points with ${data.scoreWinner.score} points!</p>` : 
                ''}
            <div class="final-scores">
                <h3>Final Scores</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Player</th>
                            <th>Score</th>
                            <th>Territories</th>
                            <th>Capitol</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.scores.map(player => `
                            <tr>
                                <td>${player.name}</td>
                                <td>${player.score}</td>
                                <td>${player.territories}</td>
                                <td>${player.hasCapitol ? '✅' : '❌'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <button onclick="location.reload()">Play Again</button>
        </div>
    `;

    document.body.appendChild(modal);

    // Hide game screen
    state.ui.gameScreen.classList.add('hidden');
    
    addLogEntry('Game Over! Check the final scores.');
} 