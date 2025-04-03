import { getHouseFromName } from './utils/helpers.js';
// Wait for the DOM to be fully loaded before initializing
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 DOM loaded, initializing game...');
    // Game state variables
    let playerId = null;
    let playerName = '';
    let gameActive = false;
    let territoryData = {};
    let playerData = [];
    let gameState = {
        territories: {},
        players: [],
        currentTurn: null,
        gameActive: false
    };
    let socket;
    // Initialize DOM elements first
    const loginScreen = document.getElementById('login-screen');
    if (!loginScreen) {
        console.error('❌ Could not find login screen element');
        return;
    }
    const loginScreenEl = loginScreen;
    const lobbyScreen = document.getElementById('lobby-screen');
    if (!lobbyScreen) {
        console.error('❌ Could not find lobby screen element');
        return;
    }
    const lobbyScreenEl = lobbyScreen;
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) {
        console.error('❌ Could not find map container element');
        return;
    }
    const mapContainerEl = mapContainer;
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
    const playerNameInput = document.getElementById('player-name');
    if (!playerNameInput) {
        console.error('❌ Could not find player name input element');
        return;
    }
    const joinGameBtn = document.getElementById('join-game-btn');
    if (!joinGameBtn) {
        console.error('❌ Could not find join game button element');
        return;
    }
    const startGameBtn = document.getElementById('start-game-btn');
    if (!startGameBtn) {
        console.error('❌ Could not find start game button element');
        return;
    }
    const newGameBtn = document.getElementById('new-game-btn');
    if (!newGameBtn) {
        console.error('❌ Could not find new game button element');
        return;
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
    }
    catch (error) {
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
        }
        catch (error) {
            console.error('❌ Failed to join game:', error);
            alert('Failed to join game. Please try again.');
        }
    });
    startGameBtn.addEventListener('click', startGame);
    newGameBtn.addEventListener('click', () => {
        window.location.reload();
    });
    // Socket event handlers
    socket.on('player-list-update', (players) => {
        console.log('📋 Received player list update:', players);
        playerData = players;
        updatePlayerList();
        updateStartButton();
        if (gameActive) {
            updatePlayerStats();
        }
    });
    // Game functions
    function updatePlayerList() {
        console.log('🔄 Updating player list display');
        if (!playerList)
            return;
        playerList.innerHTML = '';
        playerData.forEach(player => {
            const li = document.createElement('li');
            li.textContent = player.name;
            if (player.id === playerId) {
                li.classList.add('current-player');
            }
            playerList.appendChild(li);
        });
    }
    function updateStartButton() {
        if (!startGameBtn)
            return;
        const canStart = playerData.length >= 2 && playerData.length <= 4;
        startGameBtn.disabled = !canStart;
        console.log(`�� Start button ${canStart ? 'enabled' : 'disabled'} (${playerData.length} players)`);
    }
    function updatePlayerStats() {
        if (!playerStats)
            return;
        playerStats.innerHTML = '';
        playerData.forEach(player => {
            const div = document.createElement('div');
            div.className = 'player-stat';
            const house = getHouseFromName(player.name);
            if (house) {
                div.classList.add(`house-${house}`);
            }
            div.innerHTML = `
                <span class="player-name">${player.name}</span>
                <span class="player-score">Score: ${player.score}</span>
                <span class="territory-count">Territories: ${player.territories.length}</span>
            `;
            playerStats.appendChild(div);
        });
    }
    function startGame() {
        console.log("📣 Emitting start-game event to server");
        socket.emit('start-game');
    }
    function createMap(territories) {
        console.log("Creating map with territories:", territories);
        territoryData = territories;
        // Create and update turn indicator
        const gameScreen = document.getElementById('game-screen');
        let turnIndicator = document.querySelector('.turn-indicator');
        if (!turnIndicator) {
            turnIndicator = document.createElement('div');
            turnIndicator.className = 'turn-indicator';
            gameScreen?.insertBefore(turnIndicator, gameScreen.firstChild);
        }
        const currentPlayer = playerData.find(p => p.id === gameState.currentTurn);
        turnIndicator.textContent = currentPlayer?.id === playerId ?
            "Your turn!" :
            `${currentPlayer?.name}'s turn`;
        // Clear and recreate map
        mapContainerEl.innerHTML = '';
        Object.values(territories).forEach(territory => {
            const territoryDiv = document.createElement('div');
            territoryDiv.className = 'territory';
            territoryDiv.dataset.id = territory.id;
            if (territory.isCapitol) {
                territoryDiv.classList.add('capitol');
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
                if (owner) {
                    const house = getHouseFromName(owner.name);
                    console.log(`Territory ${territory.id}:`, {
                        owner: owner.name,
                        house: house,
                        isMyTerritory: territory.owner === playerId,
                        playerName: playerName,
                        classes: territoryDiv.className
                    });
                    if (house) {
                        territoryDiv.classList.add(`house-${house.toLowerCase()}`);
                        console.log(`Added house class: house-${house.toLowerCase()}`);
                    }
                }
                // Add my-territory class if owned by current player
                if (territory.owner === playerId) {
                    territoryDiv.classList.add('my-territory');
                }
                // Only add attackable class if it's the player's turn
                if (gameState.currentTurn === playerId && canAttackTerritory(territory.id)) {
                    territoryDiv.classList.add('attackable');
                }
            }
            territoryDiv.addEventListener('click', () => handleTerritoryClick(territory.id));
            mapContainerEl.appendChild(territoryDiv);
            // Debug final classes
            console.log(`Final classes for territory ${territory.id}:`, territoryDiv.className);
        });
    }
    function handleTerritoryClick(territoryId) {
        if (!gameActive || !playerId)
            return;
        const territory = territoryData[territoryId];
        if (!territory)
            return;
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
        }
        else {
            if (logEntries) {
                const entry = document.createElement('div');
                entry.className = 'log-entry';
                entry.innerHTML = `
                    <span class="log-timestamp">${new Date().toLocaleTimeString()}</span>
                    <span>Cannot attack this territory - it must be adjacent to one of yours!</span>
                `;
                logEntries.insertBefore(entry, logEntries.firstChild);
            }
        }
    }
    function canAttackTerritory(territoryId) {
        const territory = territoryData[territoryId];
        if (!territory || !playerId)
            return false;
        // Can't attack if it's not your turn
        if (gameActive) {
            if (territory.owner === playerId)
                return false;
        }
        // Check if the territory is adjacent to any of the player's territories
        const [tx, ty] = territory.id.split('-').map(Number);
        return Object.values(territoryData).some(t => {
            if (t.owner !== playerId)
                return false;
            const [x, y] = t.id.split('-').map(Number);
            const dx = Math.abs(x - tx);
            const dy = Math.abs(y - ty);
            return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
        });
    }
    // Add game-start event handler
    socket.on('game-start', (data) => {
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
    function updateTurnIndicator() {
        const turnIndicator = document.getElementById('turn-indicator');
        if (!turnIndicator)
            return;
        const currentPlayer = playerData.find(p => p.id === playerId);
        if (currentPlayer && currentPlayer.territories.length === 0) {
            turnIndicator.textContent = "You've lost all regions, you are defeated.";
            turnIndicator.classList.add('defeated');
        }
        else if (gameState.currentTurn === playerId) {
            turnIndicator.textContent = "Your Turn";
            turnIndicator.classList.remove('defeated');
        }
        else {
            const currentTurnPlayer = playerData.find(p => p.id === gameState.currentTurn);
            turnIndicator.textContent = `${currentTurnPlayer?.name}'s Turn`;
            turnIndicator.classList.remove('defeated');
        }
    }
    // Update the game state update handler to call updateTurnIndicator
    socket.on('game-state-update', (data) => {
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
    document.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('territory') || target.closest('.territory')) {
            const territoryElement = target.classList.contains('territory') ?
                target : target.closest('.territory');
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
    function showQuestionDialog(question, role) {
        const dialog = document.createElement('div');
        dialog.className = 'question-dialog';
        const timer = document.createElement('div');
        timer.className = 'timer';
        dialog.appendChild(timer);
        const questionText = document.createElement('div');
        questionText.className = 'question';
        questionText.textContent = question.question;
        dialog.appendChild(questionText);
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
        function showAnswers() {
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
            function submitAnswer(answerIndex) {
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
    socket.on('question-start', (data) => {
        showQuestionDialog(data.question, data.role);
    });
    socket.on('duel-result', (result) => {
        const dialog = document.querySelector('.question-dialog');
        if (!dialog)
            return;
        const resultDiv = dialog.querySelector('.result');
        if (!resultDiv)
            return;
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
    socket.on('game-end', (data) => {
        const gameScreen = document.getElementById('game-screen');
        if (!gameScreen)
            return;
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
});
//# sourceMappingURL=game.js.map