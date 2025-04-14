import { GameStateManager } from './state-manager.js';

interface GameEndData {
    winner: string;
    winnerName: string;
    reason: string;
    finalScores: Array<{ name: string; score: number }>;
}

export function initializeGameEndHandler(socket: any, state: any) {
    socket.on('close-all-modals', () => {
        // Close all modals
        if (state.ui?.duelModal) {
            state.ui.duelModal.style.display = 'none';
        }
        if (state.ui?.observerModal) {
            state.ui.observerModal.style.display = 'none';
        }
        if (state.ui?.resultModal) {
            state.ui.resultModal.style.display = 'none';
        }
        // Hide the game board
        const gameBoard = document.querySelector('.game-board');
        if (gameBoard) {
            gameBoard.classList.add('hidden');
        }
    });

    socket.on('game-end', (data: any) => {
        handleGameEnd(data, state);
    });
}

function handleGameEnd(data: any, state: any) {
    const gameEndModal = document.getElementById('game-over-modal');
    if (!gameEndModal) return;

    // Create the final scores table with spacing
    let tableContent = `
        <tr>
            <th style="padding-right: ${data.columnSpacing?.player || 20}px">PLAYER</th>
            <th style="padding-right: ${data.columnSpacing?.score || 15}px">SCORE</th>
            <th style="padding-right: ${data.columnSpacing?.territories || 15}px">TERRITORIES</th>
            <th style="padding-right: ${data.columnSpacing?.capitol || 15}px">CAPITOL</th>
        </tr>
    `;

    data.finalScores.forEach((score: any) => {
        const hasCapitol = score.hasCapitol ? '✅' : '❌';
        tableContent += `
            <tr>
                <td style="padding-right: ${data.columnSpacing?.player || 20}px">${score.name}</td>
                <td style="padding-right: ${data.columnSpacing?.score || 15}px">${score.score}</td>
                <td style="padding-right: ${data.columnSpacing?.territories || 15}px">${score.territories}</td>
                <td style="padding-right: ${data.columnSpacing?.capitol || 15}px">${hasCapitol}</td>
            </tr>
        `;
    });

    // Update the content
    const finalScoresTable = gameEndModal.querySelector('.final-scores-table');
    if (finalScoresTable) {
        finalScoresTable.innerHTML = tableContent;
    }

    // Show winner messages
    let winnerMessages = '';
    if (data.conquestWinner) {
        winnerMessages += `🏰 ${data.conquestWinner.name} HAS WON BY CONQUEST!<br>`;
    }
    if (data.scoreWinner) {
        winnerMessages += `🏆 ${data.scoreWinner.name} HAS WON BY POINTS WITH ${data.scoreWinner.score} POINTS!`;
    }

    const winnerDisplay = gameEndModal.querySelector('.winner-display');
    if (winnerDisplay) {
        winnerDisplay.innerHTML = winnerMessages;
    }

    // Show the game over modal
    gameEndModal.style.display = 'block';
} 