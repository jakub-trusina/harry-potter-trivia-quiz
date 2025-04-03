// Types for Socket.IO client
declare const io: any;

import { Territory, Player, Question, DuelResult, GameState } from './types/game.js';
import { getHouseFromName, moveModalsToBody } from './utils/helpers.js';

// Wait for the DOM to be fully loaded before initializing
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 DOM loaded, initializing game...');
    
    // Game state variables
    let playerId: string | null = null;
    let playerName: string = '';
    let gameActive: boolean = false;
    let territoryData: { [key: string]: Territory } = {};
    let playerData: Player[] = [];
    let gameState: GameState = {
        territories: {},
        players: [],
        currentTurn: null,
        gameActive: false
    };
    let socket: any;
    
    // Initialize DOM elements first
    const loginScreen = document.getElementById('login-screen');
    if (!loginScreen) {
        console.error('❌ Could not find login screen element');
        return;
    }
    const loginScreenEl = loginScreen as HTMLElement;
    
    const lobbyScreen = document.getElementById('lobby-screen');
    if (!lobbyScreen) {
        console.error('❌ Could not find lobby screen element');
        return;
    }
    const lobbyScreenEl = lobbyScreen as HTMLElement;
    
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) {
        console.error('❌ Could not find map container element');
        return;
    }
    const mapContainerEl = mapContainer as HTMLElement;
    
    const playerList = document.getElementById('player-list');
    if (!playerList) {
        console.error('❌ Could not find player list element');
        return;
    }
    
    const playerStats = document.getElementById('player-stats');
    if (!playerStats) {
        console.error('❌ Could not find player stats element');
        return;
    }
    
    const playerNameInput = document.getElementById('player-name') as HTMLInputElement;
    if (!playerNameInput) {
        console.error('❌ Could not find player name input element');
        return;
    }
    
    const joinGameBtn = document.getElementById('join-game-btn') as HTMLButtonElement;
    if (!joinGameBtn) {
        console.error('❌ Could not find join game button element');
        return;
    }
    
    const startGameBtn = document.getElementById('start-game-btn') as HTMLButtonElement;
    if (!startGameBtn) {
        console.error('❌ Could not find start game button element');
        return;
    }
    
    const newGameBtn = document.getElementById('new-game-btn') as HTMLButtonElement;
    if (!newGameBtn) {
        console.error('❌ Could not find new game button element');
        return;
    }

    // Help modal functionality
    const helpModal = document.getElementById('help-modal');
    const helpButtons = document.querySelectorAll('.help-button');
    const closeHelpButton = document.querySelector('.close-help');
    
    if (helpModal && helpButtons && closeHelpButton) {
        helpButtons.forEach(button => {
            button.addEventListener('click', () => {
                helpModal.classList.remove('hidden');
            });
        });
        
        closeHelpButton.addEventListener('click', () => {
            helpModal.classList.add('hidden');
        });
        
        // Close modal when clicking outside
        helpModal.addEventListener('click', (e) => {
            if (e.target === helpModal) {
                helpModal.classList.add('hidden');
            }
        });
    }

    // Initialize Socket.IO after DOM elements are verified
    try {
        console.log('🔌 Initializing Socket.IO connection...');
        socket = io();
        
        socket.on('connect', () => {
            playerId = socket.id || null;
            console.log('🔌 Connected to server with ID:', playerId);
            console.log('🔍 Socket connection state:', socket.connected);
            joinGameBtn.disabled = false;
        });

        socket.on('connect_error', (error) => {
            console.error('❌ Socket connection error:', error);
            joinGameBtn.disabled = true;
            alert('Failed to connect to server. Please refresh the page.');
        });

        socket.on('connect_timeout', () => {
            console.error('❌ Socket connection timeout');
            joinGameBtn.disabled = true;
            alert('Connection timeout. Please refresh the page.');
        });

        socket.on('error', (error) => {
            console.error('❌ Socket error:', error);
            alert('An error occurred. Please refresh the page.');
        });

        socket.on('disconnect', () => {
            console.log('🔌 Disconnected from server');
            joinGameBtn.disabled = true;
            alert('Disconnected from server. Please refresh the page.');
        });
    } catch (error) {
        console.error('❌ Failed to initialize Socket.IO:', error);
        alert('Failed to initialize game. Please refresh the page.');
        return;
    }

    // Event listeners
    joinGameBtn.addEventListener('click', () => {
        console.log('🎯 Join game button clicked');
        if (!socket?.connected) {
            console.error('❌ Socket not connected');
            alert('Not connected to server. Please refresh the page.');
            return;
        }
        
        if (!playerNameInput.value.trim()) {
            console.log('❌ No wizard name entered');
            alert('Please enter your wizard name');
            return;
        }
        
        playerName = playerNameInput.value.trim();
        console.log(`🧙‍♂️ Attempting to join game as "${playerName}"`);
        console.log('🔍 Socket connection state before emit:', socket.connected);
        
        try {
            socket.emit('join-game', playerName);
            loginScreenEl.classList.add('hidden');
            lobbyScreenEl.classList.remove('hidden');
            console.log('🔄 Switched to lobby screen');
        } catch (error) {
            console.error('❌ Failed to join game:', error);
            alert('Failed to join game. Please try again.');
        }
    });

    startGameBtn.addEventListener('click', startGame);
    newGameBtn.addEventListener('click', () => {
        window.location.reload();
    });

    // Socket event handlers
    socket.on('player-list-update', (players: Player[]) => {
        console.log('📋 Received player list update:', players);
        playerData = players;
        updatePlayerList();
        updateStartButton();
        
        if (gameActive) {
            updatePlayerStats();
        }
    });

    // Game functions
    function updatePlayerList(): void {
        console.log('🔄 Updating player list display');
        const playerList = document.getElementById('player-list');
        if (!playerList) return;

        playerList.innerHTML = '';
        playerData.forEach(player => {
            const li = document.createElement('li');
            li.className = player.id === gameState.currentTurn ? 'current-player' : '';
            li.innerHTML = `
                <span class="player-name">${player.name}</span>
                ${gameActive ? `<span class="player-house">${player.house}</span>` : ''}
                <span class="player-score">Score: ${player.score}</span>
                <span class="territory-count">Territories: ${player.territories.length}</span>
            `;
            playerList.appendChild(li);
        });
    }

    function updateStartButton(): void {
        if (!startGameBtn) return;
        const canStart = playerData.length >= 2 && playerData.length <= 4;
        startGameBtn.disabled = !canStart;
        console.log(`🔄 Start button ${canStart ? 'enabled' : 'disabled'} (${playerData.length} players)`);
    }

    function updatePlayerStats(): void {
        if (!playerStats) return;
        playerStats.innerHTML = '';
        playerData.forEach(player => {
            const div = document.createElement('div');
            div.className = 'player-stat';
            if (player.house) {  // Only add house class if house is assigned
                div.classList.add(`house-${player.house.toLowerCase()}`);
            }
            div.innerHTML = `
                <span class="player-name">${player.name}</span>
                <span class="player-score">Score: ${player.score}</span>
                <span class="territory-count">Territories: ${player.territories.length}</span>
            `;
            playerStats.appendChild(div);
        });
    }

    function startGame(): void {
        console.log("📣 Emitting start-game event to server");
        socket.emit('start-game');
    }

    function createMap(territories: { [key: string]: Territory }): void {
        console.log("Creating map with territories:", territories);
        territoryData = territories;
        
        // Create and update turn indicator
        const gameScreen = document.getElementById('game-screen');
        let turnIndicator = document.querySelector('.turn-indicator') as HTMLElement;
        
        if (!turnIndicator) {
            turnIndicator = document.createElement('div');
            turnIndicator.className = 'turn-indicator';
            gameScreen?.insertBefore(turnIndicator, gameScreen.firstChild);
        }
        
        // Update turn indicator based on player status
        const currentPlayer = playerData.find(p => p.id === playerId);
        if (currentPlayer && currentPlayer.territories.length === 0) {
            turnIndicator.textContent = "You've lost all regions, you are defeated.";
            turnIndicator.classList.add('defeated');
        } else {
            const currentTurnPlayer = playerData.find(p => p.id === gameState.currentTurn);
            turnIndicator.textContent = currentTurnPlayer?.id === playerId ? 
                "Your turn!" : 
                `${currentTurnPlayer?.name}'s turn`;
            turnIndicator.classList.remove('defeated');
        }
        
        // Clear and recreate map
        mapContainerEl.innerHTML = '';
        
        Object.values(territories).forEach(territory => {
            const territoryDiv = document.createElement('div');
            territoryDiv.className = 'territory player-territory';
            territoryDiv.dataset.id = territory.id;
            
            if (territory.isCapitol) {
                territoryDiv.classList.add('capitol');
                territoryDiv.dataset.shields = territory.shields?.toString() || '0';
            }
            
            // Add supply line status
            if (territory.owner === playerId) {
                if (!territory.hasSupplyLine) {
                    territoryDiv.classList.add('disconnected');
                    territoryDiv.title = 'This territory is disconnected from your capitol. You cannot attack from here.';
                }
            }
            
            const valueElement = document.createElement('div');
            valueElement.className = 'territory-value';
            valueElement.textContent = territory.value.toString();
            territoryDiv.appendChild(valueElement);
            
            territoryDiv.style.gridColumn = (territory.x + 1).toString();
            territoryDiv.style.gridRow = (territory.y + 1).toString();
            
            // Apply territory ownership styling
            if (territory.owner) {
                const owner = playerData.find(p => p.id === territory.owner);
                if (owner?.house) {  // Only add house class if house is assigned
                    territoryDiv.classList.add(`house-${owner.house.toLowerCase()}`);
                    console.log(`Added house class: house-${owner.house.toLowerCase()}`);
                }
                // Add my-territory class if owned by current player
                if (territory.owner === playerId) {
                    territoryDiv.classList.add('my-territory');
                }
            }
            
            // Add attackable class if it's the player's turn and they can attack this territory
            if (gameState.currentTurn === playerId && canAttackTerritory(territory.id)) {
                territoryDiv.classList.add('attackable');
            }
            
            territoryDiv.addEventListener('click', () => handleTerritoryClick(territory.id));
            mapContainerEl.appendChild(territoryDiv);
            // Debug final classes
            console.log(`Final classes for territory ${territory.id}:`, territoryDiv.className);
        });
    }

    function handleTerritoryClick(territoryId: string): void {
        if (!gameActive || !playerId) return;
        
        const territory = territoryData[territoryId];
        if (!territory) return;

        const logEntries = document.getElementById('log-entries');
        const currentPlayer = playerData.find(p => p.id === playerId);
        
        // Check if player is defeated (has no territories)
        if (currentPlayer && currentPlayer.territories.length === 0) {
            if (logEntries) {
                const entry = document.createElement('div');
                entry.className = 'log-entry';
                entry.innerHTML = `
                    <span class="log-timestamp">${new Date().toLocaleTimeString()}</span>
                    <span>You were defeated. You can't attack since you don't have any region.</span>
                `;
                logEntries.insertBefore(entry, logEntries.firstChild);
            }
            return;
        }

        if (gameState.currentTurn !== playerId) {
            if (logEntries) {
                const entry = document.createElement('div');
                entry.className = 'log-entry';
                entry.innerHTML = `
                    <span class="log-timestamp">${new Date().toLocaleTimeString()}</span>
                    <span>Wait for your turn to attack!</span>
                `;
                logEntries.insertBefore(entry, logEntries.firstChild);
            }
            return;
        }

        // Check if the territory is adjacent to any connected territory
        const [tx, ty] = territory.id.split('-').map(Number);
        const hasAdjacentConnectedTerritory = Object.values(territoryData).some(t => {
            if (t.owner !== playerId) return false;
            const [x, y] = t.id.split('-').map(Number);
            const dx = Math.abs(x - tx);
            const dy = Math.abs(y - ty);
            return ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) && t.hasSupplyLine;
        });

        if (!hasAdjacentConnectedTerritory) {
            if (logEntries) {
                const entry = document.createElement('div');
                entry.className = 'log-entry';
                entry.innerHTML = `
                    <span class="log-timestamp">${new Date().toLocaleTimeString()}</span>
                    <span>You need to connect this territory to your capitol before attacking from here!</span>
                `;
                logEntries.insertBefore(entry, logEntries.firstChild);
            }
            return;
        }

        if (canAttackTerritory(territoryId)) {
            console.log(`🗡️ Attacking territory ${territoryId}`);
            if (logEntries) {
                const entry = document.createElement('div');
                entry.className = 'log-entry';
                const defender = playerData.find(p => p.id === territory.owner);
                entry.innerHTML = `
                    <span class="log-timestamp">${new Date().toLocaleTimeString()}</span>
                    <span>Attacking ${defender?.name}'s territory at [${territory.x}, ${territory.y}]</span>
                `;
                logEntries.insertBefore(entry, logEntries.firstChild);
            }
            socket.emit('attack-territory', territoryId);
        } else {
            if (logEntries) {
                const entry = document.createElement('div');
                entry.className = 'log-entry';
                entry.innerHTML = `
                    <span class="log-timestamp">${new Date().toLocaleTimeString()}</span>
                    <span>Cannot attack this territory - it must be adjacent to one of your connected territories!</span>
                `;
                logEntries.insertBefore(entry, logEntries.firstChild);
            }
        }
    }

    function canAttackTerritory(territoryId: string): boolean {
        const territory = territoryData[territoryId];
        if (!territory || !playerId) return false;

        // Can't attack if it's not your turn
        if (gameActive) {
            if (territory.owner === playerId) return false;
        }

        // Check if the territory is adjacent to any of the player's territories with supply lines
        const [tx, ty] = territory.id.split('-').map(Number);
        
        // Find adjacent territories owned by the player
        const adjacentTerritories = Object.values(territoryData).filter(t => {
            if (t.owner !== playerId) return false;
            const [x, y] = t.id.split('-').map(Number);
            const dx = Math.abs(x - tx);
            const dy = Math.abs(y - ty);
            return ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) && t.hasSupplyLine;
        });

        // If any adjacent territory has a supply line, we can attack
        return adjacentTerritories.length > 0;
    }

    // Add game-start event handler
    socket.on('game-start', (data: { territories: { [key: string]: Territory }; players: Player[]; currentTurn: string }) => {
        gameActive = true;
        territoryData = data.territories;
        playerData = data.players;
        gameState.currentTurn = data.currentTurn;
        createMap(data.territories);
        updatePlayerStats();
        
        lobbyScreenEl.classList.add('hidden');
        document.getElementById('game-screen')?.classList.remove('hidden');
    });

    // Add function to update turn indicator
    function updateTurnIndicator(): void {
        const turnIndicator = document.getElementById('turn-indicator');
        if (!turnIndicator) return;

        const currentPlayer = playerData.find(p => p.id === playerId);
        if (currentPlayer && currentPlayer.territories.length === 0) {
            turnIndicator.textContent = "You've lost all regions, you are defeated.";
            turnIndicator.classList.add('defeated');
        } else if (gameState.currentTurn === playerId) {
            turnIndicator.textContent = "Your Turn";
            turnIndicator.classList.remove('defeated');
        } else {
            const currentTurnPlayer = playerData.find(p => p.id === gameState.currentTurn);
            turnIndicator.textContent = `${currentTurnPlayer?.name}'s Turn`;
            turnIndicator.classList.remove('defeated');
        }
    }

    // Update the game state update handler to call updateTurnIndicator
    socket.on('game-state-update', (data: { territories: { [key: string]: Territory }; players: Player[]; currentTurn: string }) => {
        console.log('🔄 Received game state update:', data);
        territoryData = data.territories;
        playerData = data.players;
        gameActive = true;
        gameState.currentTurn = data.currentTurn;
        createMap(data.territories);
        updatePlayerStats();
        updateTurnIndicator();
    });

    // Add the event listener for territory debugging
    document.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('territory') || target.closest('.territory')) {
            const territoryElement = target.classList.contains('territory') ? 
                                    target : target.closest('.territory') as HTMLElement;
            const territoryId = territoryElement.dataset.id;
            
            if (territoryId && territoryData[territoryId]) {
                const territory = territoryData[territoryId];
                const ownerInfo = territory.owner ? 
                                `Owned by: ${playerData.find(p => p.id === territory.owner)?.name || 'Unknown player'}` : 
                                'Unowned';
                
                console.log(`Territory ${territoryId}:`, {
                    x: territory.x,
                    y: territory.y,
                    value: territory.value,
                    owner: territory.owner,
                    ownerInfo,
                    isAttackable: canAttackTerritory(territoryId)
                });
                
                const hasAttackClass = territoryElement.classList.contains('attackable');
                if (hasAttackClass !== canAttackTerritory(territoryId)) {
                    console.warn('Mismatch between attackable class and canAttackTerritory function!');
                }
            }
        }
    });

    function showQuestionDialog(question: Question, role: 'attacker' | 'defender', round: number = 0): void {
        const dialog = document.createElement('div');
        dialog.className = 'question-dialog';
        
        const timer = document.createElement('div');
        timer.className = 'timer';
        dialog.appendChild(timer);

        const questionText = document.createElement('div');
        questionText.className = 'question';
        questionText.textContent = question.question;
        dialog.appendChild(questionText);

        // Add round indicator for capitol attacks
        if (round > 0) {
            const roundIndicator = document.createElement('div');
            roundIndicator.className = 'round-indicator';
            roundIndicator.textContent = `Shield Round ${round}/3`;
            dialog.appendChild(roundIndicator);
        }

        const answersDiv = document.createElement('div');
        answersDiv.className = 'answers';
        dialog.appendChild(answersDiv);

        const resultDiv = document.createElement('div');
        resultDiv.className = 'result';
        dialog.appendChild(resultDiv);

        document.body.appendChild(dialog);

        // First timer for reading the question (3 seconds)
        let timeLeft = 4;
        timer.textContent = timeLeft.toString();
        
        const readingInterval = setInterval(() => {
            timeLeft--;
            timer.textContent = timeLeft.toString();
            
            if (timeLeft <= 0) {
                clearInterval(readingInterval);
                showAnswers();
            }
        }, 1000);

        function showAnswers(): void {
            // Show answer buttons
            question.answers.forEach((answer, index) => {
                const button = document.createElement('button');
                button.className = 'answer-button';
                button.textContent = answer;
                button.onclick = () => {
                    // Highlight selected answer
                    document.querySelectorAll('.answer-button').forEach(btn => {
                        btn.classList.remove('selected');
                    });
                    button.classList.add('selected');
                    submitAnswer(index);
                };
                answersDiv.appendChild(button);
            });

            // Start 15-second timer for answering
            timeLeft = 15;
            timer.textContent = timeLeft.toString();
            
            const answerInterval = setInterval(() => {
                timeLeft--;
                timer.textContent = timeLeft.toString();
                
                if (timeLeft <= 0) {
                    clearInterval(answerInterval);
                    submitAnswer(-1); // No answer selected
                }
            }, 1000);

            function submitAnswer(answerIndex: number): void {
                clearInterval(answerInterval);
                const buttons = answersDiv.getElementsByTagName('button');
                
                // Highlight correct answer in green
                if (buttons[question.correctAnswer]) {
                    buttons[question.correctAnswer].classList.add('correct');
                }
                
                // If selected answer is wrong, highlight it in red
                if (answerIndex !== question.correctAnswer && answerIndex !== -1 && buttons[answerIndex]) {
                    buttons[answerIndex].classList.add('incorrect');
                }

                for (let i = 0; i < buttons.length; i++) {
                    buttons[i].disabled = true;
                }

                socket.emit('submit-answer', {
                    answer: answerIndex,
                    responseTime: 15 - timeLeft
                });
            }
        }
    }

    // Add socket event handlers for the quiz system
    socket.on('question-start', (data: { question: Question; role: 'attacker' | 'defender' }) => {
        showQuestionDialog(data.question, data.role);
    });

    socket.on('duel-result', (result: DuelResult) => {
        const dialog = document.querySelector('.question-dialog');
        if (!dialog) return;

        const resultDiv = dialog.querySelector('.result');
        if (!resultDiv) return;

        // Get player names
        const attacker = playerData.find(p => p.id === result.attackerId);
        const defender = playerData.find(p => p.id === result.defenderId);

        // Show who won and the correct answer
        resultDiv.innerHTML = `
            <div>Correct answer: ${result.answerText}</div>
            <div class="${result.attackerCorrect ? 'correct' : 'incorrect'}">
                ${attacker?.name}: ${result.attackerCorrect ? 'Correct' : 'Incorrect'}
            </div>
            ${result.defenderCorrect !== undefined ? `
                <div class="${result.defenderCorrect ? 'correct' : 'incorrect'}">
                    ${defender?.name}: ${result.defenderCorrect ? 'Correct' : 'Incorrect'}
                </div>
            ` : ''}
            <div>Winner: ${result.winner === 'attacker' ? attacker?.name : 
                                   result.winner === 'defender' ? defender?.name : 'No one'}</div>
        `;

        // Remove the dialog after 4 seconds
        setTimeout(() => {
            dialog.remove();
        }, 4000);
    });

    socket.on('game-end', (data: { 
        winner: string;
        winnerName: string;
        reason: string;
        finalScores: Array<{ name: string; score: number }>;
    }) => {
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
    });

    function addLogEntry(message: string): void {
        const logEntries = document.getElementById('log-entries');
        if (logEntries) {
            const entry = document.createElement('div');
            entry.className = 'log-entry';
            entry.innerHTML = `
                <span class="log-timestamp">${new Date().toLocaleTimeString()}</span>
                <span>${message}</span>
            `;
            logEntries.appendChild(entry);
            // Scroll to bottom
            logEntries.scrollTop = logEntries.scrollHeight;
        }
    }
}); 