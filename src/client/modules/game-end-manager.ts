import { GameStateManager } from './state-manager.js';

interface GameEndData {
    winner: string;
    winnerName: string;
    reason: string;
    finalScores: Array<{ name: string; score: number }>;
}

export function initializeGameEndHandler(state: GameStateManager): void {
    if (!state.socket) return;

    state.socket.on('game-end', (data: GameEndData) => {
        handleGameEnd(data);
    });
}

function handleGameEnd(data: GameEndData): void {
    const gameScreen = document.getElementById('game-screen');
    if (!gameScreen) return;

    // Find the highest score
    const highestScore = Math.max(...data.finalScores.map(p => p.score));
    const highestScorePlayers = data.finalScores.filter(p => p.score === highestScore);

    // Create the game end message
    const message = document.createElement('div');
    message.className = 'game-end-message';
    message.innerHTML = `
        <h2>Game Over!</h2>
        <div class="winners">
            <div class="winner-section">
                <h3>Last Man Standing</h3>
                <p>${data.winnerName}</p>
            </div>
            <div class="winner-section">
                <h3>Highest Score</h3>
                <p>${highestScorePlayers.map(p => p.name).join(', ')} (${highestScore} points)</p>
            </div>
        </div>
        <div class="final-scores">
            <h3>Final Scores</h3>
            <ul>
                ${data.finalScores.map(p => `
                    <li>${p.name}: ${p.score} points</li>
                `).join('')}
            </ul>
        </div>
        <button onclick="location.reload()">Play Again</button>
    `;

    // Add the message to the game screen
    gameScreen.appendChild(message);
} 