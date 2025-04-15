import { GameStateManager } from './state-manager.js';
import { GameEndData } from '../../types/game.js';
import { Socket } from 'socket.io-client';

export function initializeGameEndHandler(socket: Socket, state: GameStateManager): void {
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

    socket.on('game-end', (data: GameEndData) => {
        handleGameEnd(data, state);
    });
}

function handleGameEnd(data: GameEndData, state: GameStateManager): void {
    const gameEndModal = document.getElementById('game-over-modal');
    if (!gameEndModal) return;

    // Create the final scores table with spacing
    let tableContent = `
        <tr>
            <th style="padding-right: 20px">PLAYER</th>
            <th style="padding-right: 15px">SCORE</th>
            <th style="padding-right: 15px">TERRITORIES</th>
            <th style="padding-right: 15px">CAPITOL</th>
        </tr>
    `;

    data.scores.forEach(score => {
        const hasCapitol = score.hasCapitol ? '✅' : '❌';
        tableContent += `
            <tr>
                <td style="padding-right: 20px">${score.name}</td>
                <td style="padding-right: 15px">${score.score}</td>
                <td style="padding-right: 15px">${score.territories}</td>
                <td style="padding-right: 15px">${hasCapitol}</td>
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