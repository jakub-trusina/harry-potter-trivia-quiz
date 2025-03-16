document.addEventListener('DOMContentLoaded', () => {
    // Connect to Socket.io server
    const socket = io();
    
    // Game state variables
    let playerId = null;
    let playerName = '';
    let gameActive = false;
    let currentQuestion = null;
    let selectedTerritory = null;
    let territoryData = {};
    let playerData = [];
    let currentTurn = null;
    
    // Updates to support competitive questions
    let isDuelActive = false;
    let duelStartTime = 0;
    let duelRole = null;
    
    // DOM elements
    const loginScreen = document.getElementById('login-screen');
    const lobbyScreen = document.getElementById('lobby-screen');
    const gameScreen = document.getElementById('game-screen');
    const quizModal = document.getElementById('quiz-modal');
    const gameOverModal = document.getElementById('game-over-modal');
    
    const playerNameInput = document.getElementById('player-name');
    const joinGameBtn = document.getElementById('join-game-btn');
    const startGameBtn = document.getElementById('start-game-btn');
    const playerList = document.getElementById('player-list');
    const mapContainer = document.getElementById('map-container');
    const playerStats = document.getElementById('player-stats');
    const logEntries = document.getElementById('log-entries');
    const questionText = document.getElementById('question-text');
    const answersContainer = document.getElementById('answers-container');
    const timerElement = document.getElementById('timer');
    const winnerText = document.getElementById('winner-text');
    const newGameBtn = document.getElementById('new-game-btn');
    
    // Event listeners
    joinGameBtn.addEventListener('click', joinGame);
    startGameBtn.addEventListener('click', startGame);
    newGameBtn.addEventListener('click', resetGame);
    
    // Socket event handlers
    socket.on('connect', () => {
        playerId = socket.id;
        console.log('Connected to server with ID:', playerId);
    });
    
    socket.on('player-list-update', (players) => {
        // Store the updated player data
        playerData = players;
        
        updatePlayerList(players);
        updateStartButton(players);
        
        if (gameActive) {
            // Force territory value calculations to use the latest data
            updatePlayerStats(players);
        }
    });
    
    socket.on('game-started', (data) => {
        console.log("Game started with territories:", data.territories);
        // Log the total value of all territories to check if they have values
        const totalGameValue = Object.values(data.territories).reduce((sum, t) => sum + t.value, 0);
        console.log("Total game territory value:", totalGameValue);
        
        territoryData = data.territories;
        playerData = data.players;
        currentTurn = data.currentTurn;
        
        // Start the game session
        startGameSession();
        
        // Clearly announce whose turn it is
        if (currentTurn === playerId) {
            addLogEntry("Game started! It's your turn first.");
        } else {
            const player = playerData.find(p => p.id === currentTurn);
            addLogEntry(`Game started! ${player ? player.name : 'Another player'} goes first.`);
        }
    });
    
    socket.on('territory-update', (territories) => {
        console.log("Received territory update:", territories);
        
        // Store old values to detect changes
        const oldTerritories = {...territoryData};
        
        // IMPORTANT: Fully replace the territory data with server data
        territoryData = territories;
        
        // Log any ownership changes for debugging
        Object.entries(territories).forEach(([id, territory]) => {
            const oldOwner = oldTerritories[id]?.owner;
            if (oldOwner !== territory.owner) {
                console.log(`Territory ${id} ownership changed from ${oldOwner || 'none'} to ${territory.owner || 'none'}`);
            }
        });
        
        // Update the map
        updateMap();
        updatePlayerStats(playerData);
        
        // IMPORTANT: Reset click handlers to ensure they work with the new territory state
        setupTerritoryClickHandlers();
        
        // Add animation to any territory values that changed
        Object.values(territories).forEach(territory => {
            const territoryElement = document.querySelector(`.territory[data-id="${territory.id}"]`);
            if (territoryElement) {
                const valueElement = territoryElement.querySelector('.territory-value');
                if (valueElement) {
                    // Always ensure the text content is correct
                    valueElement.textContent = territory.value;
                    
                    // Add animation if ownership changed
                    if (oldTerritories[territory.id] && 
                        oldTerritories[territory.id].owner !== territory.owner) {
                        valueElement.classList.remove('territory-value-updated');
                        // Force DOM reflow to restart animation
                        void valueElement.offsetWidth;
                        valueElement.classList.add('territory-value-updated');
                    }
                }
            }
        });
    });
    
    socket.on('question-challenge', (data) => {
        debugDuel(`Received question challenge: ${data.isDuel ? 'DUEL' : 'REGULAR'} as ${data.role || 'N/A'}`);
        debugDuel(`Question: ${data.question.question}`);
        
        currentQuestion = data.question;
        selectedTerritory = data.territoryId;
        isDuelActive = data.isDuel === true;
        duelRole = data.role;
        
        showQuizModal();
    });
    
    socket.on('game-over', (data) => {
        console.log("Game over event received:", data);
        
        // Only show game over modal if the game was active
        if (gameActive) {
            gameActive = false;
            showGameOver(data);
        } else {
            console.log("Ignored game-over event because game is not active");
        }
    });
    
    socket.on('error-message', (message) => {
        alert(message);
    });
    
    socket.on('turn-update', (playerId) => {
        currentTurn = playerId;
        updatePlayerStats(playerData);
        updateMap();
        
        if (playerId === socket.id) {
            addLogEntry("It's your turn! Attack a territory.");
        } else {
            const player = playerData.find(p => p.id === playerId);
            addLogEntry(`It's ${player ? player.name : 'another player'}'s turn.`);
        }
    });
    
    // Add handler for duel-result events
    socket.on('duel-result', (result) => {
        const attackerName = playerData.find(p => p.id === result.attackerId)?.name || 'Attacker';
        const defenderName = result.defenderId ? 
                            (playerData.find(p => p.id === result.defenderId)?.name || 'Defender') : 
                            'Unclaimed Territory';
        
        let message = '';
        
        // Clear explanation based on reason
        if (result.reason) {
            message = `${result.reason}. `;
        } else {
            // Fallback to previous logic
            if (result.winner === 'attacker') {
                message = `${attackerName} captured a territory from ${defenderName}! `;
            } else if (result.winner === 'defender') {
                message = `${defenderName} successfully defended their territory! `;
            } else {
                message = `No winner. Territory remains with ${defenderName}. `;
            }
        }
        
        // Format the response times as seconds with 2 decimal places
        const attackerTimeFormatted = formatResponseTime(result.attackerTime);
        const defenderTimeFormatted = result.defenderTime ? formatResponseTime(result.defenderTime) : null;
        
        // Add details about correctness and speed with formatted times
        if (result.attackerCorrect && result.defenderCorrect) {
            message += `Both answered correctly. `;
            message += `${attackerName}: ${attackerTimeFormatted}, ${defenderName}: ${defenderTimeFormatted}. `;
            message += `${result.winner === 'attacker' ? attackerName : defenderName} was faster!`;
        } else {
            if (result.attackerCorrect) {
                message += `${attackerName} answered correctly in ${attackerTimeFormatted}. `;
            } else {
                message += `${attackerName} answered incorrectly. `;
            }
            
            if (result.defenderCorrect) {
                message += `${defenderName} answered correctly in ${defenderTimeFormatted}. `;
            } else if (result.defenderId) {
                message += `${defenderName} answered incorrectly. `;
            }
        }
        
        addLogEntry(message);
        
        // Update the quiz modal with the results if it's still open
        const duelStatusEl = document.getElementById('duel-status');
        
        if (duelStatusEl && !quizModal.classList.contains('hidden')) {
            // Clear any previous result elements
            const previousResults = duelStatusEl.querySelector('.duel-result-summary');
            if (previousResults) {
                previousResults.remove();
            }
            
            // Create animated result display with formatted times
            const resultSummary = document.createElement('div');
            resultSummary.classList.add('duel-result-summary');
            resultSummary.innerHTML = `
                <h3>Duel Complete!</h3>
                <p class="result-reason">${result.reason}</p>
                <div class="result-detail">
                    <div class="player-result attacker ${result.attackerCorrect ? 'correct' : 'incorrect'}">
                        <strong>${attackerName} (Attacker)</strong>: 
                        <span class="answer-status">${result.attackerCorrect ? 'Correct' : 'Incorrect'}</span>
                        <span class="response-time">${attackerTimeFormatted}</span>
                    </div>
                    ${result.defenderId ? `
                    <div class="player-result defender ${result.defenderCorrect ? 'correct' : 'incorrect'}">
                        <strong>${defenderName} (Defender)</strong>: 
                        <span class="answer-status">${result.defenderCorrect ? 'Correct' : 'Incorrect'}</span>
                        <span class="response-time">${defenderTimeFormatted}</span>
                    </div>` : ''}
                </div>
                <p class="correct-answer">Correct answer: ${result.answerText}</p>
                <div class="result-winner">
                    <strong>Winner: ${result.winner === 'attacker' ? attackerName : 
                                  result.winner === 'defender' ? defenderName : 'None'}</strong>
                </div>
            `;
            
            duelStatusEl.appendChild(resultSummary);
            
            // Now we highlight the correct answer AFTER players have responded
            const answerButtons = answersContainer.querySelectorAll('.answer-btn');
            answerButtons.forEach((btn, index) => {
                // Clear previous classes
                btn.classList.remove('correct-answer-btn', 'incorrect-answer-btn', 'attacker-answer', 'defender-answer');
                
                // Mark correct answer
                if (index === result.correctAnswer) {
                    btn.classList.add('correct-answer-btn');
                    
                    // Add correct answer label (only now, after responses)
                    const revealLabel = document.createElement('div');
                    revealLabel.classList.add('answer-reveal-label');
                    revealLabel.textContent = 'Correct Answer';
                    btn.appendChild(revealLabel);
                } else {
                    btn.classList.add('incorrect-answer-btn');
                }
                
                // Mark attacker's answer if this is that button
                if (result.attackerId === playerId && btn.dataset.index == result.attackerAnswer) {
                    btn.classList.add('attacker-answer');
                }
                
                // Mark defender's answer if this is that button
                if (result.defenderId === playerId && btn.dataset.index == result.defenderAnswer) {
                    btn.classList.add('defender-answer');
                }
            });
            
            // Close the modal after 5 seconds
            setTimeout(() => {
                hideQuizModal();
            }, 5000);
        }
        
        // Update the map
        updateMap();
    });
    
    // Add this event handler for duel status updates
    socket.on('duel-status-update', (data) => {
        const isCurrentPlayer = data.playerId === playerId;
        const message = isCurrentPlayer ? 
                       `You answered in ${formatResponseTime(data.responseTime)}s. Waiting for opponent...` :
                       `${data.playerName} (${data.role}) answered in ${formatResponseTime(data.responseTime)}s`;
        
        addLogEntry(message);
        
        // Update UI to show who has answered
        const duelStatusEl = document.getElementById('duel-status');
        if (duelStatusEl && isDuelActive) {
            duelStatusEl.innerHTML += `<div>${data.playerName} (${data.role}) has answered!</div>`;
        }
    });

    // Add info message handler
    socket.on('info-message', (message) => {
        addLogEntry(message);
    });
    
    // Update the duel-complete handler to not immediately hide the modal
    socket.on('duel-complete', (data) => {
        // Don't hide the modal here, just show a waiting message
        const duelStatusEl = document.getElementById('duel-status');
        if (duelStatusEl) {
            duelStatusEl.innerHTML += `
                <div class="duel-waiting-result">
                    <p>Both players have answered. Determining the result...</p>
                </div>
            `;
        }
        
        // Disable any remaining timer
        if (quizModal.dataset.timerId) {
            clearInterval(parseInt(quizModal.dataset.timerId));
            quizModal.dataset.timerId = null;
        }
        
        addLogEntry(`Duel complete! Evaluating results...`);
    });
    
    // Game functions
    function joinGame() {
        if (!playerNameInput.value.trim()) {
            alert('Please enter your wizard name');
            return;
        }
        
        playerName = playerNameInput.value.trim();
        socket.emit('join-game', playerName);
        
        loginScreen.classList.add('hidden');
        lobbyScreen.classList.remove('hidden');
        
        // Move modals to body after joining
        moveModalsToBody();
    }
    
    function startGame() {
        socket.emit('start-game');
    }
    
    function startGameSession() {
        gameActive = true;
        lobbyScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        document.getElementById('map-legend').classList.remove('hidden');
        
        // Step 1: Create the map
        createMap();
        
        // Step 2: Update the map with current territory state (colors, values)
        updateMap();
        
        // Step 3: Add click handlers to territories
        setupTerritoryClickHandlers();
        
        // Step 4: Update player stats display
        updatePlayerStats(playerData);
        
        // Add log entries for turn information
        if (currentTurn === playerId) {
            addLogEntry("It's your turn! Attack a territory.");
        } else {
            const player = playerData.find(p => p.id === currentTurn);
            addLogEntry(`It's ${player ? player.name : 'another player'}'s turn.`);
        }
        
        addLogEntry('The territory conquest has begun! Answer questions to capture territories.');
    }
    
    function createMap() {
        console.log("Creating map with territories:", territoryData);
        
        // Verify data before proceeding
        if (!verifyTerritoryData()) return;
        
        mapContainer.innerHTML = '';
        
        const territories = Object.values(territoryData);
        if (territories.length === 0) {
            console.error("No territories found!");
            return;
        }
        
        // Find grid dimensions
        const maxX = Math.max(...territories.map(t => t.x)) + 1;
        const maxY = Math.max(...territories.map(t => t.y)) + 1;
        
        // Set board dimensions
        mapContainer.style.gridTemplateColumns = `repeat(${maxX}, 1fr)`;
        mapContainer.style.gridTemplateRows = `repeat(${maxY}, 1fr)`;
        
        // Calculate cell size based on board dimensions
        const boardWidth = mapContainer.clientWidth;
        const boardHeight = mapContainer.clientHeight;
        const cellWidth = boardWidth / maxX;
        const cellHeight = boardHeight / maxY;
        
        // Create each territory
        territories.forEach(territory => {
            const territoryElement = document.createElement('div');
            territoryElement.classList.add('territory');
            territoryElement.setAttribute('data-id', territory.id);
            
            // Set dimensions and position
            territoryElement.style.width = `${cellWidth}px`;
            territoryElement.style.height = `${cellHeight}px`;
            territoryElement.style.left = `${territory.x * cellWidth}px`;
            territoryElement.style.top = `${territory.y * cellHeight}px`;
            
            // Add value indicator
            const valueElement = document.createElement('span');
            valueElement.classList.add('territory-value');
            valueElement.textContent = territory.value || '1';
            territoryElement.appendChild(valueElement);
            
            // Add to board
            mapContainer.appendChild(territoryElement);
        });
        
        // Update the map with current ownership data
        updateMap();
        
        // Setup click handlers
        setupTerritoryClickHandlers();
        
        console.log("Map created successfully");
    }
    
    function verifyTerritoryData() {
        console.log("Verifying territory data:", territoryData);
        if (!territoryData || Object.keys(territoryData).length === 0) {
            console.error("ERROR: Territory data is empty or undefined!");
            addLogEntry("ERROR: Territory data not loaded properly. Please refresh the game.");
            return false;
        }
        return true;
    }
    
    function canAttackTerritory(territoryId) {
        // Make sure the game is active and it's the player's turn
        if (!gameActive || currentTurn !== playerId) {
            return false;
        }
        
        // Make sure the territory exists
        if (!territoryData[territoryId]) {
            return false;
        }
        
        // Players can't attack their own territories
        if (territoryData[territoryId].owner === playerId) {
            return false;
        }
        
        // Make sure the player has territories
        if (!playerData.find(p => p.id === playerId)?.territories.length) {
            return false;
        }
        
        // Check if the territory is adjacent to any of the player's territories
        // that are connected to the capital
        const playerTerritories = playerData.find(p => p.id === playerId).territories;
        const capital = playerData.find(p => p.id === playerId).capital;
        const targetTerritory = territoryData[territoryId];
        
        // First, find territories connected to the capital
        const connectedTerritories = getTerritoriesConnectedToCapital(capital);
        
        // Then check if any of these connected territories are adjacent to the target
        return playerTerritories.some(playerTerritoryId => {
            // Skip territories not connected to the capital
            if (!connectedTerritories.has(playerTerritoryId)) {
                return false;
            }
            
            const playerTerritory = territoryData[playerTerritoryId];
            const dx = Math.abs(playerTerritory.x - targetTerritory.x);
            const dy = Math.abs(playerTerritory.y - targetTerritory.y);
            
            // Check adjacency (including diagonals)
            return (dx <= 1 && dy <= 1) && !(dx === 0 && dy === 0);
        });
    }
    
    // Add a function to find territories connected to the capital using BFS
    function getTerritoriesConnectedToCapital(capitalId) {
        // Set to store connected territories
        const connectedTerritories = new Set();
        
        // Queue for BFS
        const queue = [capitalId];
        
        // Set to track visited territories
        const visited = new Set([capitalId]);
        
        // Add capital to connected territories
        connectedTerritories.add(capitalId);
        
        // Define adjacency check
        function areAdjacent(t1, t2) {
            const dx = Math.abs(t1.x - t2.x);
            const dy = Math.abs(t1.y - t2.y);
            return (dx <= 1 && dy <= 1) && !(dx === 0 && dy === 0);
        }
        
        // BFS to find all territories connected to capital
        while (queue.length > 0) {
            const currentId = queue.shift();
            const currentTerritory = territoryData[currentId];
            
            // Skip if this territory doesn't exist or is not owned by the player
            if (!currentTerritory || currentTerritory.owner !== playerId) {
                continue;
            }
            
            // Check all player-owned territories for adjacency
            const playerTerritories = playerData.find(p => p.id === playerId).territories;
            
            playerTerritories.forEach(territoryId => {
                // Skip already visited territories
                if (visited.has(territoryId)) {
                    return;
                }
                
                const territory = territoryData[territoryId];
                
                // Skip territories not owned by the player
                if (territory.owner !== playerId) {
                    return;
                }
                
                // Check if adjacent to current territory
                if (areAdjacent(currentTerritory, territory)) {
                    // Mark as visited
                    visited.add(territoryId);
                    
                    // Add to connected territories
                    connectedTerritories.add(territoryId);
                    
                    // Add to queue for further exploration
                    queue.push(territoryId);
                }
            });
        }
        
        return connectedTerritories;
    }
    
    function showQuizModal() {
        if (!currentQuestion) {
            console.error("Tried to show quiz modal but no question is available!");
            return;
        }
        
        console.log("Showing quiz modal", {
            question: currentQuestion.question,
            isDuelActive,
            duelRole,
            selectedTerritory
        });
        
        // Show the modal immediately to ensure it's visible
        quizModal.classList.remove('hidden');
        
        // Clear previous state
        questionText.textContent = currentQuestion.question;
        answersContainer.innerHTML = '';
        
        const modalTitle = quizModal.querySelector('h2');
        const duelStatusEl = document.getElementById('duel-status');
        
        if (isDuelActive) {
            modalTitle.textContent = `Wizard Duel - ${duelRole === 'attacker' ? 'Attack' : 'Defend'}!`;
            quizModal.classList.add('wizard-duel');
            quizModal.classList.add(`duel-${duelRole}`);
            
            if (duelStatusEl) {
                duelStatusEl.innerHTML = `<div>You are the ${duelRole}! Prepare for the duel...</div>`;
            }
            
            // Force a log entry to make the duel obvious
            addLogEntry(`⚔️ WIZARD DUEL! You are the ${duelRole} for territory ${selectedTerritory}! ⚔️`);
        } else {
            modalTitle.textContent = 'Harry Potter Quiz Challenge';
            quizModal.classList.remove('wizard-duel', 'duel-attacker', 'duel-defender');
            
            if (duelStatusEl) {
                duelStatusEl.innerHTML = '';
            }
        }
        
        // Record the start time for duels (adjusted for the delayed start)
        duelStartTime = null; // Will be set when answers are revealed
        
        // Create a message showing "Reading question..."
        const readingMsg = document.createElement('div');
        readingMsg.classList.add('reading-message');
        readingMsg.textContent = 'Reading question...';
        answersContainer.appendChild(readingMsg);
        
        // PHASE 1: Show only the question for 3 seconds
        // After 3 seconds, reveal the answer options
        setTimeout(() => {
            // Remove the reading message
            answersContainer.innerHTML = '';
            
            // Update the status message
            if (duelStatusEl && isDuelActive) {
                duelStatusEl.innerHTML = `<div>You are the ${duelRole}! Answer quickly!</div>`;
            }
            
            // Create answer buttons
            currentQuestion.answers.forEach((answer, index) => {
                const button = document.createElement('button');
                button.classList.add('answer-btn', 'hp-button', 'answer-reveal-animation');
                button.textContent = answer;
                button.dataset.index = index;
                button.addEventListener('click', () => submitAnswer(index));
                answersContainer.appendChild(button);
            });
            
            // Now set the duel start time when answers are shown
            duelStartTime = Date.now();
            
            // Set up the quiz timer - started only AFTER answers are shown
            let timeLeft = 30;
            timerElement.textContent = timeLeft;
            
            // Clear any existing timer
            if (quizModal.dataset.timerId) {
                clearInterval(parseInt(quizModal.dataset.timerId));
            }
            
            const timerId = setInterval(() => {
                timeLeft--;
                timerElement.textContent = timeLeft;
                
                // Add urgent class when time is running low
                if (timeLeft <= 10) {
                    timerElement.classList.add('urgent');
                }
                
                if (timeLeft <= 0) {
                    clearInterval(timerId);
                    timerElement.classList.remove('urgent');
                    // Auto-submit wrong answer if time runs out
                    submitAnswer(-1); // Invalid answer for both duel and non-duel
                }
            }, 1000);
            
            // Store timer ID to clear it later
            quizModal.dataset.timerId = timerId;
        }, 3000);
    }
    
    function hideQuizModal() {
        // Clear the main quiz timer
        if (quizModal.dataset.timerId) {
            clearInterval(parseInt(quizModal.dataset.timerId));
            quizModal.dataset.timerId = null;
        }
        
        // Clear the answer reveal timer
        if (quizModal.dataset.answerRevealTimerId) {
            clearTimeout(parseInt(quizModal.dataset.answerRevealTimerId));
            quizModal.dataset.answerRevealTimerId = null;
        }
        
        quizModal.classList.add('hidden');
        currentQuestion = null;
        selectedTerritory = null;
    }
    
    function submitAnswer(answerIndex) {
        if (!currentQuestion) {
            console.log("Submit answer called but no current question!");
            return;
        }
        
        console.log(`Submitting answer: ${answerIndex} for ${isDuelActive ? 'DUEL' : 'regular question'}`);
        
        // Always use duel-answer for duel scenarios
        if (isDuelActive) {
            const responseTime = Date.now() - duelStartTime;
            const formattedTime = formatResponseTime(responseTime);
            
            console.log(`Sending duel answer with response time: ${formattedTime}`);
            
            socket.emit('duel-answer', {
                territoryId: selectedTerritory,
                answer: answerIndex,
                responseTime: responseTime
            });
            
            // Update the UI to show waiting state
            const duelStatusEl = document.getElementById('duel-status');
            if (duelStatusEl) {
                duelStatusEl.innerHTML += `<div class="waiting-state">
                    <strong>Answer submitted! Waiting for opponent...</strong>
                </div>`;
            }
            
            // Color code and disable all answer buttons
            const answerButtons = answersContainer.querySelectorAll('.answer-btn');
            answerButtons.forEach((btn, index) => {
                btn.disabled = true;
                btn.classList.add('answered');
                
                // Add special highlight for the selected answer
                if (parseInt(btn.dataset.index) === answerIndex) {
                    btn.classList.add(duelRole === 'attacker' ? 'attacker-answer' : 'defender-answer');
                }
            });
            
            // Don't hide modal yet - wait for opponent
            addLogEntry(`You answered in ${formattedTime}. Waiting for opponent...`);
        } else {
            // For non-duel questions, proceed as before
            socket.emit('submit-answer', {
                questionId: currentQuestion.id,
                answer: answerIndex,
                territoryId: selectedTerritory
            });
            
            hideQuizModal();
        }
    }
    
    function showGameOver(data) {
        winnerText.textContent = `${data.winner.name} has won by ${data.reason}!`;
        gameOverModal.classList.remove('hidden');
    }
    
    function resetGame() {
        gameActive = false;
        gameOverModal.classList.add('hidden');
        gameScreen.classList.add('hidden');
        lobbyScreen.classList.remove('hidden');
        
        // Clear data
        territoryData = {};
        playerData = [];
        
        // Add log entry
        addLogEntry('Starting a new game session...');
    }
    
    function updatePlayerList(players) {
        playerList.innerHTML = '';
        players.forEach(player => {
            const item = document.createElement('li');
            item.textContent = player.name;
            if (player.id === playerId) {
                item.textContent += ' (You)';
                item.style.fontWeight = 'bold';
            }
            playerList.appendChild(item);
        });
    }
    
    function updateStartButton(players) {
        if (players.length >= 2) {
            startGameBtn.disabled = false;
            document.querySelector('.waiting-text').textContent = 'Ready to start the game!';
        } else {
            startGameBtn.disabled = true;
            document.querySelector('.waiting-text').textContent = 'Waiting for players (2-3 needed)';
        }
    }
    
    function updatePlayerStats(players) {
        playerStats.innerHTML = '';
        
        // Create a map of territory ownership for quick lookup
        const territoryOwnership = {};
        Object.entries(territoryData).forEach(([id, territory]) => {
            territoryOwnership[id] = {
                owner: territory.owner,
                value: territory.value
            };
        });
        
        players.forEach(player => {
            const playerDiv = document.createElement('div');
            playerDiv.classList.add('player-stat');
            
            const playerIndex = players.findIndex(p => p.id === player.id);
            const houses = ['Gryffindor', 'Slytherin', 'Ravenclaw'];
            const house = houses[playerIndex % houses.length];
            
            // Calculate total value using the territory ownership map
            // AND verify with player's territory list
            let totalValue = 0;
            let ownedTerritories = 0;
            
            // Count only territories that both:
            // 1. Are in the player's territory list, AND
            // 2. Have the player as the owner in territoryData
            Object.entries(territoryData).forEach(([id, territory]) => {
                if (territory.owner === player.id) {
                    totalValue += territory.value;
                    ownedTerritories++;
                }
            });
            
            // Add debug logging with clear separation
            console.log('------- Player Stats Update -------');
            console.log(`Player: ${player.name}`);
            console.log(`Verified territory count: ${ownedTerritories}`);
            console.log(`Verified total value: ${totalValue}`);
            console.log('----------------------------------');
            
            if (player.id === currentTurn) {
                playerDiv.classList.add('current-turn');
            }
            
            playerDiv.innerHTML = `
                <strong>${player.name}</strong> (${house})<br>
                Territories: ${ownedTerritories} (Total Value: ${totalValue})<br>
                ${player.id === currentTurn ? '<span class="current-turn-indicator">CURRENT TURN</span>' : ''}
            `;
            
            playerStats.appendChild(playerDiv);
        });
    }
    
    function addLogEntry(message) {
        const entry = document.createElement('div');
        entry.classList.add('log-entry');
        
        const now = new Date();
        const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        
        entry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> ${message}`;
        logEntries.appendChild(entry);
        
        // Fix scroll issue by using setTimeout to make sure the DOM is updated
        setTimeout(() => {
            logEntries.scrollTop = logEntries.scrollHeight;
        }, 10);
    }

    // Add event listener after the other event listeners
    document.getElementById('toggle-legend').addEventListener('click', function() {
        const legendContent = document.querySelector('.legend-content');
        if (legendContent.style.display === 'block') {
            legendContent.style.display = 'none';
        } else {
            legendContent.style.display = 'block';
        }
    });

    // Update the updateMap function to properly handle capital status changes
    function updateMap() {
        console.log('Updating map with territory data', territoryData);
        
        if (!territoryData || Object.keys(territoryData).length === 0) {
            console.error("ERROR: No territory data available!");
            return;
        }
        
        // Process all territories
        document.querySelectorAll('.territory').forEach(territoryEl => {
            const id = territoryEl.dataset.id;
            if (!territoryData[id]) return;
            
            const territory = territoryData[id];
            
            // Reset all styling classes
            territoryEl.className = 'territory';
            
            // Remove any existing labels
            territoryEl.querySelectorAll('.territory-label').forEach(el => el.remove());
            
            // Set value
            const valueEl = territoryEl.querySelector('.territory-value');
            if (valueEl) valueEl.textContent = territory.value || '1';
            
            // Add player styling if owned
            if (territory.owner) {
                // Determine house/color based on player index
                const playerIndex = playerData.findIndex(p => p.id === territory.owner);
                const houses = ['gryffindor', 'slytherin', 'ravenclaw', 'hufflepuff'];
                const houseClass = houses[playerIndex % houses.length];
                
                territoryEl.classList.add(houseClass);
                
                // Add owner label
                const ownerName = playerData.find(p => p.id === territory.owner)?.name || '?';
                const label = document.createElement('div');
                label.classList.add('territory-label');
                label.textContent = ownerName.charAt(0).toUpperCase();
                territoryEl.appendChild(label);
            }
            
            // Add capital styling if applicable
            if (territory.isCapital) {
                territoryEl.classList.add('capital');
            }
            
            // Add attackable styling if applicable
            if (currentTurn === playerId && canAttackTerritory(id)) {
                territoryEl.classList.add('attackable');
            }
        });
        
        console.log('Map update complete');
    }

    // Add this function to your client-side code
    function debugDuel(message) {
        console.log(`DUEL DEBUG: ${message}`);
        // Also add to the game log so it's visible
        addLogEntry(`DEBUG: ${message}`);
    }

    // Move the modal movement to a specific function instead of doing it immediately
    function moveModalsToBody() {
        // Make sure modals are hidden before moving them
        if (quizModal) {
            quizModal.classList.add('hidden');
            // Only move if not already a child of body
            if (quizModal.parentElement !== document.body) {
                document.body.appendChild(quizModal);
            }
        }
        
        if (gameOverModal) {
            gameOverModal.classList.add('hidden');
            // Only move if not already a child of body
            if (gameOverModal.parentElement !== document.body) {
                document.body.appendChild(gameOverModal);
            }
        }
    }

    // Add this event handler to debug territory ownership
    document.addEventListener('click', (e) => {
        // Check if a territory was clicked
        if (e.target.classList.contains('territory') || e.target.closest('.territory')) {
            const territoryElement = e.target.classList.contains('territory') ? 
                                    e.target : e.target.closest('.territory');
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
                
                // If the territory should be attackable but isn't or vice versa, log a warning
                const hasAttackClass = territoryElement.classList.contains('attackable');
                if (hasAttackClass !== canAttackTerritory(territoryId)) {
                    console.warn('Mismatch between attackable class and canAttackTerritory function!');
                }
            }
        }
    });

    // Create a new function to setup territory click handlers properly
    function setupTerritoryClickHandlers() {
        console.log('Setting up territory click handlers');
        
        // First, remove any existing click handlers to prevent duplicates
        document.querySelectorAll('.territory').forEach(territory => {
            territory.replaceWith(territory.cloneNode(true));
        });
        
        // Now attach fresh click handlers
        document.querySelectorAll('.territory').forEach(territory => {
            territory.addEventListener('click', () => {
                const territoryId = territory.dataset.id;
                
                console.log(`Territory clicked: ${territoryId}`);
                
                if (!gameActive) {
                    console.log('Game not active, ignoring click');
                    return;
                }
                
                // First check if it's the player's turn
                if (currentTurn !== playerId) {
                    addLogEntry("It's not your turn");
                    return;
                }
                
                // Then check if it's attackable or already owned
                if (canAttackTerritory(territoryId)) {
                    console.log(`Attacking territory ${territoryId}`);
                    socket.emit('attack-territory', territoryId);
                    addLogEntry(`You attacked territory ${territoryId}`);
                } else if (territoryData[territoryId] && territoryData[territoryId].owner === playerId) {
                    addLogEntry('You already own this territory');
                } else {
                    addLogEntry('You can only attack adjacent territories');
                }
            });
        });
    }

    // Add this helper function to format milliseconds as seconds
    function formatResponseTime(ms) {
        return (ms / 1000).toFixed(2) + 's';
    }
}); 