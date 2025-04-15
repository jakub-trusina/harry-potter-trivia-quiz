import { ModalState } from '../types.js';
import { DuelQuestion, DuelResult, CurrentDuel } from '../../types/game.js';
import { DuelStartData } from '../../server/types.js';
import { updateModalState, GameStateManager } from './state-manager.js';
import { addLogEntry } from './log-manager.js';

export function initializeDuelHandlers(state: GameStateManager): void {
    if (!state.socket) return;

    state.socket.on('duel-started', (data: DuelStartData) => {
        try {
            if (!data.duelId || !data.role) {
                console.error('Invalid duel data received');
                return;
            }

            console.log('🎭 Duel started, your role:', data.role, 'Capitol round:', data.isCapitolRound);
            
            let message = `You've entered a magical duel as the ${data.role.toUpperCase()}`;
            if (data.isCapitolRound) {
                message += ` - Capitol Battle Round ${data.round}/${data.totalRounds} (${data.shieldsRemaining} shields remaining)`;
            }
            addLogEntry(message);
            
            // Clean up any existing modal state before starting new round
            cleanupModalState(state);
            
            // Store current duel info
            state.currentDuel = {
                id: data.duelId,
                role: data.role,
                question: data.question,
                isCapitolRound: data.isCapitolRound,
                round: data.round,
                totalRounds: data.totalRounds,
                shieldsRemaining: data.shieldsRemaining,
                selectedAnswer: null
            };

            const answersContainer = document.getElementById('answers-container');
            if (answersContainer) {
                // Show waiting message
                const waitingMsg = document.createElement('div');
                waitingMsg.className = 'waiting-message';
                waitingMsg.textContent = 'Waiting for other players...';
                answersContainer.appendChild(waitingMsg);
            }
        } catch (error) {
            console.error('Error handling duel start:', error);
        }
    });

    state.socket.on('question', (data: DuelQuestion) => {
        try {
            console.log('📝 Question data:', data);
            showQuestionDialog(data, state);
        } catch (error) {
            console.error('Error showing question dialog:', error);
            cleanupModalState(state);
        }
    });

    state.socket.on('duel-result', (result: DuelResult) => {
        try {
            handleDuelResult(result, state);
            // Only clear current duel if not continuing to next round
            if (!result.continueToNextRound) {
                state.currentDuel = null;
            }
        } catch (error) {
            console.error('Error handling duel result:', error);
            cleanupModalState(state);
        }
    });

    state.socket.on('observer-answered', (data: { playerId: string, answer: string }) => {
        try {
            handleObserverAnswer(data, state);
        } catch (error) {
            console.error('Error handling observer answer:', error);
        }
    });

    state.socket.on('game-end', (data: any) => {
        try {
            handleGameEnd(data, state);
        } catch (error) {
            console.error('Error handling game end:', error);
            cleanupModalState(state);
        }
    });
}

function showQuestionDialog(duelQuestion: DuelQuestion, state: GameStateManager): void {
    try {
        const modalElement = document.getElementById('quiz-modal');
        const questionElement = document.getElementById('question-text');
        const answersContainer = document.getElementById('answers-container');
        const timerElement = document.getElementById('timer');
        const duelStatus = document.getElementById('duel-status');
        const questionContainer = document.getElementById('question-container');
        const duelResult = document.getElementById('duel-result');

        if (!modalElement || !questionElement || !answersContainer || !timerElement || !duelStatus || !questionContainer || !duelResult) {
            console.error('Required modal elements not found');
            return;
        }

        // Clear any existing timer and event listeners
        if (state.currentModalState?.cleanup) {
            state.currentModalState.cleanup();
        }

        // Set up new timer
        let timeLeft = 20;
        timerElement.textContent = timeLeft.toString();
        let timerIntervalId: NodeJS.Timeout | null = null;

        const handleTimerEnd = () => {
            if (timerIntervalId) {
                clearInterval(timerIntervalId);
                timerIntervalId = null;
            }
            if (!state.currentModalState?.selectedAnswer && state.socket) {
                state.socket.emit('duel-answer', { answer: null });
            }
            state.updateModalState({
                isOpen: false,
                questionId: null,
                selectedAnswer: null,
                timer: null
            });
        };

        timerIntervalId = setInterval(() => {
            timeLeft--;
            if (timerElement) {
                timerElement.textContent = timeLeft.toString();
            }
            if (timeLeft <= 0) {
                handleTimerEnd();
            }
        }, 1000);

        // Set up answer buttons
        answersContainer.innerHTML = '';
        const answerButtonCleanups: Array<() => void> = [];

        duelQuestion.answers.forEach((answer, index) => {
            const button = document.createElement('button');
            button.textContent = answer;
            button.className = 'answer-button';
            
            const handleClick = () => {
                if (timerIntervalId) {
                    clearInterval(timerIntervalId);
                    timerIntervalId = null;
                }
                
                if (state.socket) {
                    state.socket.emit('duel-answer', { answer });
                }
                state.updateModalState({
                    selectedAnswer: answer,
                    timer: null
                });
                button.classList.add('selected');
                
                // Disable all buttons after selection
                document.querySelectorAll('.answer-button').forEach(btn => {
                    (btn as HTMLButtonElement).disabled = true;
                });
                
                // Show waiting message
                const waitingMsg = document.createElement('div');
                waitingMsg.className = 'waiting-message';
                waitingMsg.textContent = 'Waiting for other players...';
                answersContainer.appendChild(waitingMsg);
            };

            button.addEventListener('click', handleClick);
            answerButtonCleanups.push(() => button.removeEventListener('click', handleClick));
            answersContainer.appendChild(button);
        });

        // Update question text
        const questionText = duelQuestion.questionData?.question || duelQuestion.question;
        questionElement.textContent = questionText;

        // Update modal state with cleanup function
        state.updateModalState({
            isOpen: true,
            questionId: duelQuestion.questionData?.id,
            timer: timerIntervalId,
            cleanup: () => {
                if (timerIntervalId) {
                    clearInterval(timerIntervalId);
                    timerIntervalId = null;
                }
                answerButtonCleanups.forEach(cleanup => cleanup());
            }
        });

        // Update current duel state
        if (duelQuestion.role === 'attacker' || duelQuestion.role === 'defender') {
            state.updateCurrentDuel({
                role: duelQuestion.role,
                id: duelQuestion.questionData?.id || '',
                question: duelQuestion.questionData || { 
                    id: '',
                    text: duelQuestion.question,
                    answers: duelQuestion.answers,
                    correctAnswer: '',
                    difficulty: 'medium'
                },
                isCapitolRound: duelQuestion.isCapitolRound,
                round: duelQuestion.round,
                totalRounds: duelQuestion.totalRounds,
                shieldsRemaining: duelQuestion.shieldsRemaining,
                selectedAnswer: null
            });
        }

        // Set role indicator with round info for capitol battles
        let statusHTML = `<div class="duel-player ${duelQuestion.role}">${duelQuestion.role.toUpperCase()}</div>`;
        if (duelQuestion.isCapitolRound) {
            statusHTML += `
                <div class="capitol-battle-info">
                    Capitol Battle - Round ${duelQuestion.round}/${duelQuestion.totalRounds}
                </div>
            `;
        }
        duelStatus.innerHTML = statusHTML;

        // Show modal and question container
        modalElement.classList.remove('hidden');
        questionContainer.classList.remove('hidden');
        questionContainer.style.display = 'block';
    } catch (error) {
        console.error('Error showing question dialog:', error);
        cleanupModalState(state);
    }
}

export function cleanupModalState(state: GameStateManager): void {
    if (state.currentModalState?.timer) {
        clearInterval(state.currentModalState.timer);
    }

    if (state.currentModalState) {
        state.updateModalState({
            isOpen: false,
            questionId: null,
            timer: null
        });
    }

    const modal = document.getElementById('quiz-modal');
    const questionContainer = document.getElementById('question-container');
    const duelResult = document.getElementById('duel-result');
    const observerResponses = document.getElementById('observer-responses');
    const observerAnswers = document.getElementById('observer-answers-container');

    if (modal) modal.classList.add('hidden');
    if (questionContainer) questionContainer.classList.add('hidden');
    if (duelResult) duelResult.classList.add('hidden');
    if (observerResponses) observerResponses.classList.add('hidden');
    if (observerAnswers) observerAnswers.innerHTML = '';
}

function handleDuelResult(result: DuelResult, state: GameStateManager): void {
    try {
        const modal = document.getElementById('quiz-modal');
        const questionContainer = document.getElementById('question-container');
        const duelResult = document.getElementById('duel-result');
        const waitingMessage = document.querySelector('.waiting-message');
        const answersContainer = document.getElementById('answers-container');
        
        if (!modal || !duelResult || !questionContainer || !answersContainer) {
            console.error('❌ Required modal elements not found for duel result');
            return;
        }

        // Remove waiting message if it exists
        if (waitingMessage) {
            waitingMessage.remove();
        }

        // Get the player's role and whether they answered correctly
        const isAttacker = state.currentDuel?.role === 'attacker';
        const playerCorrect = isAttacker ? result.attackerCorrect : result.defenderCorrect;
        
        // Find the selected button and the correct answer button
        const buttons = answersContainer.querySelectorAll('.answer-btn');
        buttons.forEach(button => {
            const buttonText = button.textContent;
            if (!buttonText) return;

            // Remove the yellow highlight from the selected answer
            button.classList.remove('selected');

            // If this was the player's selected answer
            if (buttonText === state.currentModalState?.selectedAnswer) {
                // Add red highlight if incorrect, keep yellow if correct
                button.classList.add(playerCorrect ? 'correct' : 'incorrect');
            }

            // If this is the correct answer, make it flash green
            const correctAnswer = state.currentDuel?.question?.correctAnswer?.toString();
            if (correctAnswer && buttonText === correctAnswer) {
                button.classList.add('correct', 'flashing');
                // Also add flashing to the selected answer if it was correct
                if (buttonText === state.currentModalState?.selectedAnswer && playerCorrect) {
                    button.classList.add('flashing');
                }
            }
        });

        // Add CSS to the document if it doesn't exist
        if (!document.getElementById('duel-answer-styles')) {
            const style = document.createElement('style');
            style.id = 'duel-answer-styles';
            style.textContent = `
                .answer-btn.selected {
                    background-color: #ffd700 !important;
                    border-color: #ffd700 !important;
                }
                .answer-btn.correct {
                    background-color: #4CAF50 !important;
                    border-color: #4CAF50 !important;
                }
                .answer-btn.incorrect {
                    background-color: #f44336 !important;
                    border-color: #f44336 !important;
                }
                .answer-btn.flashing {
                    animation: flash 1s infinite;
                }
                @keyframes flash {
                    0% { opacity: 1; }
                    50% { opacity: 0.5; }
                    100% { opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }

        // Show the results after a short delay to allow the visual feedback to be seen
        setTimeout(() => {
            // Continue with the original result display logic
            cleanupModalState(state);
            
            // Hide question container and show duel result
            questionContainer.classList.add('hidden');
            duelResult.classList.remove('hidden');
            
            // Get player names
            const attacker = state.players.find(p => p.id === result.attacker);
            const defender = state.players.find(p => p.id === result.defender);
            
            if (!attacker || !defender) {
                console.error('❌ Players not found in player data');
                return;
            }

            // Build result HTML with more detailed outcome
            let resultHTML = '<div class="duel-outcome">';
            
            // Add capitol battle info if applicable
            if (result.isCapitolRound) {
                resultHTML += `
                    <div class="capitol-battle-status">
                        <h3>⚔️ Capitol Battle - Round ${result.round}/${result.totalRounds}</h3>
                        ${result.shieldsRemaining !== undefined ? 
                            `<p>Shields remaining: ${result.shieldsRemaining}</p>` : ''}
                    </div>
                `;
            }

            // Show both players' results with clear visual indicators
            resultHTML += `
                <div class="player-result ${result.attackerCorrect ? 'correct' : 'incorrect'}">
                    <div class="player-name">${attacker.name} (Attacker)</div>
                    <div class="answer-status">
                        ${result.attackerCorrect ? '✅ Correct' : '❌ Incorrect'}
                        ${result.attackerResponseTime ? `<span class="response-time">(${result.attackerResponseTime})</span>` : ''}
                    </div>
                </div>
                <div class="player-result ${result.defenderCorrect ? 'correct' : 'incorrect'}">
                    <div class="player-name">${defender.name} (Defender)</div>
                    <div class="answer-status">
                        ${result.defenderCorrect ? '✅ Correct' : '❌ Incorrect'}
                        ${result.defenderResponseTime ? `<span class="response-time">(${result.defenderResponseTime})</span>` : ''}
                    </div>
                </div>
            `;

            // Add round outcome
            if (result.winner) {
                const winner = state.players.find(p => p.id === result.winner);
                if (winner) {
                    resultHTML += `
                        <div class="duel-winner">
                            <h3>🏆 ${winner.name} wins ${result.isCapitolRound ? 'this round' : 'the duel'}!</h3>
                            <p class="outcome-reason">
                                ${result.attackerCorrect && result.defenderCorrect ? 
                                    'Won by faster response time!' :
                                    result.attackerCorrect ? 
                                        'Won by answering correctly while defender was incorrect!' :
                                        result.defenderCorrect ?
                                            'Won by answering correctly while attacker was incorrect!' :
                                            'Both players answered incorrectly - defender maintains position!'
                                }
                            </p>
                        </div>
                    `;

                    if (result.isCapitolRound) {
                        if (result.winner === result.attacker) {
                            if (result.shieldsRemaining === 0) {
                                resultHTML += `
                                    <div class="capitol-captured">
                                        <h3>🏰 Capitol Captured!</h3>
                                        <p>All shields broken - ${attacker.name} has captured the capitol!</p>
                                    </div>
                                `;
                            } else {
                                resultHTML += `
                                    <div class="shield-broken">
                                        <p>Shield broken! ${result.shieldsRemaining} remaining</p>
                                        <p>Preparing for next round...</p>
                                    </div>
                                `;
                            }
                        } else {
                            resultHTML += `
                                <div class="capitol-defended">
                                    <p>Capitol defense holds! Attack repelled.</p>
                                </div>
                            `;
                        }
                    }
                }
            } else {
                resultHTML += `
                    <div class="duel-draw">
                        <h3>🤝 Round Draw</h3>
                        <p class="outcome-reason">Both players answered incorrectly - defender maintains position!</p>
                    </div>
                `;
            }

            if (result.territoryTransferred) {
                resultHTML += `
                    <div class="territory-transfer">
                        <p>🏰 Territory captured by ${attacker.name}!</p>
                    </div>
                `;
            }

            resultHTML += '</div>';
            duelResult.innerHTML = resultHTML;

            // Show the modal with results
            modal.classList.remove('hidden');
            duelResult.classList.remove('hidden');

            // Update current duel state with shield information if it's a capitol battle
            if (result.isCapitolRound && state.currentDuel && result.shieldsRemaining !== undefined) {
                state.currentDuel.shieldsRemaining = result.shieldsRemaining;
            }

            // Auto-hide after delay, longer for capitol battles
            const hideDelay = result.continueToNextRound ? 5000 : 3000;
            setTimeout(() => {
                modal.classList.add('hidden');
                duelResult.classList.add('hidden');
                
                if (!result.continueToNextRound) {
                    cleanupModalState(state);
                }
                // Remove the setTimeout for the next question - let the duel-started event handle it
            }, hideDelay);
        }, 1000);
    } catch (error) {
        console.error('❌ Error handling duel result:', error);
        cleanupModalState(state);
    }
}

function handleObserverAnswer(data: { playerId: string, answer: string }, state: GameStateManager): void {
    const observerResponses = document.getElementById('observer-responses');
    const observerAnswers = document.getElementById('observer-answers-container');
    
    if (!observerResponses || !observerAnswers) return;
    
    // Show observer responses section
    observerResponses.classList.remove('hidden');
    
    // Add the new observer response
    const player = state.players.find(p => p.id === data.playerId);
    const responseDiv = document.createElement('div');
    responseDiv.className = 'observer-response';
    responseDiv.innerHTML = `
        <span class="observer-name">${player?.name || 'Unknown'}</span>
        <div>
            <span class="observer-answer">
                ${data.answer}
            </span>
        </div>
    `;
    observerAnswers.appendChild(responseDiv);
}

function handleGameEnd(data: any, state: GameStateManager): void {
    const modal = document.getElementById('quiz-modal');
    const gameEndContainer = document.getElementById('game-end-container');
    
    if (!modal || !gameEndContainer) return;

    // Clean up any existing state
    cleanupModalState(state);

    let html = '<div class="game-end">';
    
    // Show conquest winner if exists
    if (data.conquestWinner) {
        html += `
            <div class="conquest-winner">
                <h2>🏆 Victory by Conquest!</h2>
                <p>${data.conquestWinner.name} has captured all opposing capitols!</p>
            </div>
        `;
    }

    // Show final scores
    html += '<div class="final-scores"><h3>Final Scores</h3><table>';
    html += '<tr><th>Player</th><th>Score</th><th>Territories</th><th>Capitol</th></tr>';
    
    data.finalScores.forEach((score: any) => {
        html += `
            <tr>
                <td>${score.name}</td>
                <td>${score.score}</td>
                <td>${score.territories}</td>
                <td>${score.hasCapitol ? '✅' : '❌'}</td>
            </tr>
        `;
    });
    
    html += '</table></div></div>';
    
    gameEndContainer.innerHTML = html;
    modal.classList.remove('hidden');
    gameEndContainer.classList.remove('hidden');
} 