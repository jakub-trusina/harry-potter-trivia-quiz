import { GameStateManager } from './state-manager.js';
import { updateModalState } from './state-manager.js';
import { addLogEntry } from './log-manager.js';

interface DuelResult {
    type: string;
    attackerCorrect: boolean;
    defenderCorrect?: boolean;
    attackerId: string;
    defenderId?: string;
    territoryId: string;
    correctAnswer?: string;
    observerResults?: any[];
    winner?: string | null;
    isCapitolRound?: boolean;
    roundNumber?: number;
    roundsRequired?: number;
    attackerResponseTime?: number;
    defenderResponseTime?: number;
}

interface DuelQuestion {
    question: string;
    answers: string[];
    role: string;
}

export function initializeDuelHandlers(state: GameStateManager): void {
    if (!state.socket) return;

    state.socket.on('duel-started', (data: { role: string }) => {
        console.log('🎭 Duel started, your role:', data.role);
        addLogEntry(`You've entered a magical duel as the ${data.role.toUpperCase()}`);
    });

    state.socket.on('question', (data: DuelQuestion) => {
        console.log('📝 Question data:', data);
        showQuestionDialog(data, state);
    });

    state.socket.on('duel-result', (result: DuelResult) => {
        handleDuelResult(result, state);
    });

    state.socket.on('observer-answered', (data: { playerId: string, answer: string }) => {
        handleObserverAnswer(data, state);
    });
}

function showQuestionDialog(data: DuelQuestion, state: GameStateManager): void {
    if (!state.ui) return;

    const modal = document.getElementById('quiz-modal');
    const questionText = document.getElementById('question-text');
    const answersContainer = document.getElementById('answers-container');
    const timer = document.getElementById('timer');
    const duelStatus = document.getElementById('duel-status');
    const questionContainer = document.getElementById('question-container');
    const duelResult = document.getElementById('duel-result');

    if (!modal || !questionText || !answersContainer || !timer || !duelStatus || !questionContainer || !duelResult) {
        console.error('❌ Required modal elements not found');
        return;
    }

    // Reset modal state
    updateModalState(state, {
        isOpen: true,
        questionId: Date.now().toString(),
        timer: null
    });

    // Show modal and question container
    modal.classList.remove('hidden');
    questionContainer.classList.remove('hidden');
    questionContainer.style.display = 'block';

    // Set role indicator
    duelStatus.innerHTML = `<div class="duel-player ${data.role}">${data.role.toUpperCase()}</div>`;

    // Set question text
    questionText.textContent = data.question;
    questionText.style.display = 'block';
    questionText.style.visibility = 'visible';

    // Start timer
    let timeLeft = 20;
    timer.textContent = timeLeft.toString();
    const timerInterval = setInterval(() => {
        timeLeft--;
        timer.textContent = timeLeft.toString();
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            if (state.socket) {
                state.socket.emit('submit-answer', '');
            }
            cleanupModalState(state);
        }
    }, 1000);

    // Update timer in state
    updateModalState(state, { timer: timerInterval });

    // Create answer buttons
    answersContainer.innerHTML = '';
    data.answers.forEach(answer => {
        const button = document.createElement('button');
        button.className = 'answer-btn';
        button.textContent = answer;
        button.addEventListener('click', () => {
            clearInterval(timerInterval);
            if (state.socket) {
                state.socket.emit('submit-answer', answer);
            }

            // Disable all buttons after selection
            document.querySelectorAll('.answer-btn').forEach(btn => {
                (btn as HTMLButtonElement).disabled = true;
            });

            // Show waiting message
            const waitingMsg = document.createElement('div');
            waitingMsg.className = 'waiting-message';
            waitingMsg.textContent = 'Waiting for other players...';
            answersContainer.appendChild(waitingMsg);
        });
        answersContainer.appendChild(button);
    });
}

export function cleanupModalState(state: GameStateManager): void {
    if (!state.currentModalState?.timer) return;

    clearInterval(state.currentModalState.timer);
    updateModalState(state, {
        isOpen: false,
        questionId: null,
        timer: null
    });

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
        const observerResponses = document.getElementById('observer-responses');
        const observerAnswers = document.getElementById('observer-answers-container');
        
        if (!modal || !duelResult || !observerResponses || !observerAnswers || !questionContainer) {
            console.error('❌ Required modal elements not found for duel result');
            return;
        }
        
        // Clean up any existing modal state
        cleanupModalState(state);
        
        // Hide question container and show duel result
        questionContainer.classList.add('hidden');
        duelResult.classList.remove('hidden');
        
        // Get player names
        const attacker = state.players.find(p => p.id === result.attackerId);
        const defender = result.defenderId ? state.players.find(p => p.id === result.defenderId) : null;
        
        if (!attacker) {
            console.error('❌ Attacker not found in player data:', result.attackerId);
            return;
        }
        
        // Build result HTML
        let resultHTML = `
            <div class="result">
                <div class="correct-answer">Correct answer: ${result.correctAnswer || 'N/A'}</div>
        `;
        
        // For capitol territories, show round information
        if (result.isCapitolRound) {
            resultHTML += `
                <div class="capitol-round-info">
                    Round ${result.roundNumber || 1} of ${result.roundsRequired || 2} completed.
                    ${result.winner === 'attacker' ? 'Attacker won this round!' : 'Defender protected the territory this round!'}
                    ${(result.roundNumber || 1) < (result.roundsRequired || 2) ? 'Next round starting soon...' : ''}
                </div>
            `;
        }

        // Show attacker and defender results with response times
        resultHTML += `
            <div class="player-result ${result.attackerCorrect ? 'correct' : 'incorrect'}">
                ${attacker.name}: ${result.attackerCorrect ? 'Correct' : 'Incorrect'}
                ${result.attackerResponseTime !== undefined ? ` (${result.attackerResponseTime})` : ''}
            </div>
        `;

        if (result.defenderCorrect !== undefined && defender) {
            resultHTML += `
                <div class="player-result ${result.defenderCorrect ? 'correct' : 'incorrect'}">
                    ${defender.name}: ${result.defenderCorrect ? 'Correct' : 'Incorrect'}
                    ${result.defenderResponseTime !== undefined ? ` (${result.defenderResponseTime})` : ''}
                </div>
            `;
        }

        // Add observer results if any
        if (result.observerResults && result.observerResults.length > 0) {
            resultHTML += '<div class="observer-results">';
            result.observerResults.forEach(observerResult => {
                const observer = state.players.find(p => p.id === observerResult.playerId);
                if (observer) {
                    resultHTML += `
                        <div class="observer-result ${observerResult.correct ? 'correct' : 'incorrect'}">
                            ${observer.name}: ${observerResult.correct ? 'Correct' : 'Incorrect'}
                            ${observerResult.responseTime !== undefined ? ` (${observerResult.responseTime})` : ''}
                            ${observerResult.scoreGained ? ` (+${observerResult.scoreGained} points)` : ''}
                        </div>
                    `;
                }
            });
            resultHTML += '</div>';
        }

        // Add winner announcement
        if (result.winner) {
            const winner = result.winner === 'attacker' ? attacker : defender;
            if (winner) {
                resultHTML += `
                    <div class="winner-result">
                        ${winner.name} wins the duel!
                    </div>
                `;
            }
        }

        resultHTML += '</div>';
        duelResult.innerHTML = resultHTML;

        // Show the modal with results
        modal.classList.remove('hidden');
        duelResult.classList.remove('hidden');

        // Auto-hide after 5 seconds
        setTimeout(() => {
            modal.classList.add('hidden');
            duelResult.classList.add('hidden');
            cleanupModalState(state);
        }, 5000);
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