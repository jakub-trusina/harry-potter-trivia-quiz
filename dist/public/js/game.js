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
    let currentModalState = {
        isOpen: false,
        questionId: null,
        timer: null
    };
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
        const playerList = document.getElementById('player-list');
        if (!playerList)
            return;
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
    function updateStartButton() {
        if (!startGameBtn)
            return;
        const canStart = playerData.length >= 2 && playerData.length <= 4;
        startGameBtn.disabled = !canStart;
        console.log(`🔄 Start button ${canStart ? 'enabled' : 'disabled'} (${playerData.length} players)`);
    }
    function updatePlayerStats() {
        if (!playerStats)
            return;
        playerStats.innerHTML = '';
        playerData.forEach(player => {
            const div = document.createElement('div');
            div.className = 'player-stat';
            if (player.house) { // Only add house class if house is assigned
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
        // Update turn indicator based on player status
        const currentPlayer = playerData.find(p => p.id === playerId);
        if (currentPlayer && currentPlayer.territories.length === 0) {
            turnIndicator.textContent = "You've lost all regions, you are defeated.";
            turnIndicator.classList.add('defeated');
        }
        else {
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
                if (owner?.house) { // Only add house class if house is assigned
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
    function handleTerritoryClick(territoryId) {
        if (!gameActive || !playerId)
            return;
        const territory = territoryData[territoryId];
        if (!territory)
            return;
        const logEntries = document.getElementById('log-entries');
        const currentPlayer = playerData.find(p => p.id === playerId);
        // Check if player clicked on their own territory
        if (territory.owner === playerId) {
            if (territory.isCapitol) {
                // If it's a capitol, show shield information
                const shields = territory.shields || 0;
                addLogEntry(`This is your capitol! It has ${shields} shield${shields !== 1 ? 's' : ''}.`);
                return;
            }
            else {
                // For regular territories, calculate and show distance from capitol
                const capitolTerritory = Object.values(territoryData).find(t => t.owner === playerId && t.isCapitol);
                if (capitolTerritory) {
                    const [tx, ty] = territory.id.split('-').map(Number);
                    const [cx, cy] = capitolTerritory.id.split('-').map(Number);
                    const distance = Math.abs(tx - cx) + Math.abs(ty - cy); // Manhattan distance (L1)
                    addLogEntry(`This is your territory at [${tx}, ${ty}]. Distance from capitol: ${distance}.`);
                    return;
                }
            }
        }
        // Check if player is defeated (has no territories)
        if (currentPlayer && currentPlayer.territories.length === 0) {
            if (logEntries) {
                const entry = document.createElement('div');
                entry.className = 'log-entry';
                entry.innerHTML = `
                    <span class="log-timestamp">${new Date().toLocaleTimeString()}</span>
                    <span>You were defeated. You can't attack since you don't have any region.</span>
                `;
                logEntries.appendChild(entry);
                logEntries.scrollTop = logEntries.scrollHeight;
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
                logEntries.appendChild(entry);
                logEntries.scrollTop = logEntries.scrollHeight;
            }
            return;
        }
        // Check if the territory is adjacent to any connected territory
        const [tx, ty] = territory.id.split('-').map(Number);
        const hasAdjacentConnectedTerritory = Object.values(territoryData).some(t => {
            if (t.owner !== playerId)
                return false;
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
                logEntries.appendChild(entry);
                logEntries.scrollTop = logEntries.scrollHeight;
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
                logEntries.appendChild(entry);
                logEntries.scrollTop = logEntries.scrollHeight;
            }
            socket.emit('attack-territory', territoryId);
        }
        else {
            if (logEntries) {
                const entry = document.createElement('div');
                entry.className = 'log-entry';
                entry.innerHTML = `
                    <span class="log-timestamp">${new Date().toLocaleTimeString()}</span>
                    <span>Cannot attack this territory - it must be adjacent to one of your connected territories!</span>
                `;
                logEntries.appendChild(entry);
                logEntries.scrollTop = logEntries.scrollHeight;
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
        // Check if the territory is adjacent to any of the player's territories with supply lines
        const [tx, ty] = territory.id.split('-').map(Number);
        // Find adjacent territories owned by the player
        const adjacentTerritories = Object.values(territoryData).filter(t => {
            if (t.owner !== playerId)
                return false;
            const [x, y] = t.id.split('-').map(Number);
            const dx = Math.abs(x - tx);
            const dy = Math.abs(y - ty);
            return ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) && t.hasSupplyLine;
        });
        // If any adjacent territory has a supply line, we can attack
        return adjacentTerritories.length > 0;
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
    // Add handler for attack errors
    socket.on('attack-error', (errorMessage) => {
        console.log(`❌ Attack error: ${errorMessage}`);
        addLogEntry(errorMessage);
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
        // Check if the turn has changed
        const previousTurn = gameState.currentTurn;
        const newTurn = data.currentTurn;
        // Update local game state
        territoryData = data.territories;
        playerData = data.players;
        gameActive = true;
        gameState.currentTurn = newTurn;
        // Log turn change
        if (previousTurn !== newTurn) {
            const currentTurnPlayer = playerData.find(p => p.id === newTurn);
            if (currentTurnPlayer) {
                if (currentTurnPlayer.id === playerId) {
                    addLogEntry("It's your turn now!");
                }
                else {
                    addLogEntry(`${currentTurnPlayer.name}'s turn has begun.`);
                }
            }
        }
        createMap(data.territories);
        updatePlayerStats();
        updateTurnIndicator();
        cleanupDialogs(); // Clean up any open dialogs when turn changes
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
    function cleanupModalState() {
        const modal = document.getElementById('quiz-modal');
        const duelResult = document.getElementById('duel-result');
        const observerResponses = document.getElementById('observer-responses');
        const observerAnswers = document.getElementById('observer-answers-container');
        if (!modal || !duelResult || !observerResponses || !observerAnswers) {
            console.error('❌ Required modal elements not found');
            return;
        }
        // Clear any existing timer
        if (currentModalState.timer) {
            clearInterval(currentModalState.timer);
            currentModalState.timer = null;
        }
        // Reset modal state
        currentModalState.isOpen = false;
        currentModalState.questionId = null;
        // Hide all modal sections
        modal.classList.add('hidden');
        duelResult.classList.add('hidden');
        observerResponses.classList.add('hidden');
        // Clear observer answers
        observerAnswers.innerHTML = '';
    }
    socket.on('duel-result', (result) => {
        try {
            const modal = document.getElementById('quiz-modal');
            const duelResult = document.getElementById('duel-result');
            const observerResponses = document.getElementById('observer-responses');
            const observerAnswers = document.getElementById('observer-answers-container');
            if (!modal || !duelResult || !observerResponses || !observerAnswers) {
                console.error('❌ Required modal elements not found for duel result');
                return;
            }
            // Clean up any existing modal state
            cleanupModalState();
            // Show duel result
            duelResult.classList.remove('hidden');
            // Get player names
            const attacker = playerData.find(p => p.id === result.attackerId);
            const defender = result.defenderId ? playerData.find(p => p.id === result.defenderId) : null;
            if (!attacker) {
                console.error('❌ Attacker not found in player data:', result.attackerId);
                return;
            }
            // Show who won and the correct answer
            let resultHTML = `
                <div class="result">
                    <div class="correct-answer">Correct answer: ${result.answerText}</div>
                    <div class="player-result ${result.attackerCorrect ? 'correct' : 'incorrect'}">
                        ${attacker.name}: ${result.attackerCorrect ? 'Correct' : 'Incorrect'}
                    </div>
            `;
            if (result.defenderCorrect !== undefined && defender) {
                resultHTML += `
                    <div class="player-result ${result.defenderCorrect ? 'correct' : 'incorrect'}">
                        ${defender.name}: ${result.defenderCorrect ? 'Correct' : 'Incorrect'}
                    </div>
                `;
            }
            // Add observer results if any
            if (result.observerResults && result.observerResults.length > 0) {
                resultHTML += '<div class="observer-results">';
                result.observerResults.forEach(observerResult => {
                    const observer = playerData.find(p => p.id === observerResult.playerId);
                    if (observer) {
                        resultHTML += `
                            <div class="observer-result ${observerResult.correct ? 'correct' : 'incorrect'}">
                                ${observer.name}: ${observerResult.correct ? 'Correct' : 'Incorrect'}
                                ${observerResult.scoreGained ? `(+${observerResult.scoreGained} points)` : ''}
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
            // Show the modal
            modal.classList.remove('hidden');
            // Auto-hide after 5 seconds
            setTimeout(() => {
                cleanupModalState();
            }, 5000);
        }
        catch (error) {
            console.error('❌ Error handling duel result:', error);
            cleanupModalState();
        }
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
    function addLogEntry(message) {
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
    socket.on('observer-answered', (data) => {
        const observerResponses = document.getElementById('observer-responses');
        const observerAnswers = document.getElementById('observer-answers-container');
        if (!observerResponses || !observerAnswers)
            return;
        // Show observer responses section if not already visible
        observerResponses.classList.remove('hidden');
        // Add the new observer response
        const player = playerData.find(p => p.id === data.playerId);
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
    });
    // Add cleanup function for when turn changes
    function cleanupDialogs() {
        const modal = document.getElementById('quiz-modal');
        const duelResult = document.getElementById('duel-result');
        const observerResponses = document.getElementById('observer-responses');
        const observerAnswers = document.getElementById('observer-answers-container');
        if (modal)
            modal.classList.add('hidden');
        if (duelResult)
            duelResult.classList.add('hidden');
        if (observerResponses)
            observerResponses.classList.add('hidden');
        // Clear any selected answers
        document.querySelectorAll('.answer-btn').forEach(btn => {
            btn.classList.remove('selected');
            btn.disabled = false;
        });
        // Remove any existing question dialogs
        document.querySelectorAll('.question-dialog').forEach(dialog => dialog.remove());
        // Clear any existing result content
        if (duelResult) {
            duelResult.innerHTML = '';
        }
        if (observerAnswers) {
            observerAnswers.innerHTML = '';
        }
    }
    // Add cleanup on page unload
    window.addEventListener('beforeunload', () => {
        cleanupModalState();
    });
    function showQuestionDialog(question, answers, role) {
        const modal = document.getElementById('quiz-modal');
        const questionText = document.getElementById('question-text');
        const answersContainer = document.getElementById('answers-container');
        const timer = document.getElementById('timer');
        const duelStatus = document.getElementById('duel-status');
        if (!modal || !questionText || !answersContainer || !timer || !duelStatus) {
            console.error('❌ Required modal elements not found');
            return;
        }
        // Clean up any existing modal state
        cleanupModalState();
        // Set new modal state
        currentModalState.isOpen = true;
        currentModalState.questionId = Date.now().toString();
        // Show modal and set role-specific styling
        modal.classList.remove('hidden');
        duelStatus.innerHTML = `<div class="duel-player ${role}">${role.toUpperCase()}</div>`;
        // Set question text
        questionText.textContent = question;
        // Start timer
        let timeLeft = 20;
        timer.textContent = timeLeft.toString();
        const timerInterval = setInterval(() => {
            timeLeft--;
            timer.textContent = timeLeft.toString();
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                socket.emit('submit-answer', '');
                cleanupModalState();
            }
        }, 1000);
        currentModalState.timer = timerInterval;
        // Create answer buttons
        answersContainer.innerHTML = '';
        answers.forEach((answer, index) => {
            const button = document.createElement('button');
            button.className = 'answer-btn';
            button.textContent = answer;
            button.addEventListener('click', () => {
                clearInterval(timerInterval);
                socket.emit('submit-answer', answer);
                cleanupModalState();
            });
            answersContainer.appendChild(button);
        });
    }
});
export {};
//# sourceMappingURL=game.js.map