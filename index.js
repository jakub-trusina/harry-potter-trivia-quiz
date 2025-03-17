const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game state
const gameState = {
  players: {},
  territories: {},
  currentTurn: null, // Track the current player's turn
  questions: [],
  activeGames: {},
  gameActive: true
};

// Load Harry Potter questions
const fs = require('fs');
try {
  const questionsData = fs.readFileSync(path.join(__dirname, 'data', 'questions.json'), 'utf8');
  gameState.questions = JSON.parse(questionsData);
} catch (err) {
  console.error('Error loading questions:', err);
  gameState.questions = [];
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);
  
  // Handle player joining
  socket.on('join-game', (playerName) => {
    gameState.players[socket.id] = {
      id: socket.id,
      name: playerName,
      score: 0,
      territories: [],
      capital: null,
      eliminated: false
    };
    
    io.emit('player-list-update', Object.values(gameState.players));
    console.log(`${playerName} joined the game`);
  });
  
  // Handle game start
  socket.on('start-game', () => {
    if (Object.keys(gameState.players).length >= 2) {
      initializeGame();
      io.emit('game-start', {
        territories: gameState.territories,
        players: Object.values(gameState.players),
        currentTurn: gameState.currentTurn
      });
    } else {
      socket.emit('error-message', 'Need at least 2 players to start');
    }
  });
  
  // Handle quiz answers
  socket.on('submit-answer', (data) => {
    const { questionId, answer, territoryId } = data;
    const question = gameState.questions.find(q => q.id === questionId);
    
    if (question && question.correctAnswer === answer) {
      // Correct answer - update territory ownership
      if (territoryId && gameState.territories[territoryId]) {
        // Check if territory has a previous owner and remove it from their list
        const previousOwner = gameState.territories[territoryId].owner;
        if (previousOwner && previousOwner !== socket.id && gameState.players[previousOwner]) {
          gameState.players[previousOwner].territories = gameState.players[previousOwner].territories.filter(
            id => id !== territoryId
          );
        }
        
        // Assign to the new owner
        gameState.territories[territoryId].owner = socket.id;
        
        // Make sure we don't duplicate territory IDs in the player's list
        if (!gameState.players[socket.id].territories.includes(territoryId)) {
          gameState.players[socket.id].territories.push(territoryId);
        }
        
        // Check for win condition
        checkWinCondition();
        
        io.emit('territory-update', gameState.territories);
        io.emit('player-list-update', Object.values(gameState.players));
      }
    }
    
    // Advance to the next player's turn regardless of answer correctness
    advanceToNextTurn();
    
    // Send turn update to all clients
    io.emit('turn-update', gameState.currentTurn);
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (gameState.players[socket.id]) {
      const playerName = gameState.players[socket.id].name;
      delete gameState.players[socket.id];
      io.emit('player-list-update', Object.values(gameState.players));
      console.log(`${playerName} left the game`);
    }
  });

  // Replace the attack-territory handler with this fixed version
  socket.on('attack-territory', (territoryId) => {
    console.log(`=======================================`);
    console.log(`DUEL INITIATION: ${gameState.players[socket.id].name} wants to attack territory ${territoryId}`);
    
    // Verify it's the player's turn
    if (gameState.currentTurn !== socket.id) {
      console.log(`TURN ERROR: Not ${gameState.players[socket.id].name}'s turn to attack! Current turn: ${gameState.players[gameState.currentTurn].name}`);
      return socket.emit('error-message', 'It\'s not your turn');
    }

    // Verify the territory exists
    if (!gameState.territories[territoryId]) {
      return socket.emit('error-message', 'Territory does not exist');
    }
    
    // Check if player has territories
    if (!gameState.players[socket.id] || !gameState.players[socket.id].territories.length) {
      return socket.emit('error-message', 'You don\'t have any territories');
    }
    
    // Verify the territory is not already owned by the player
    if (gameState.territories[territoryId].owner === socket.id) {
      return socket.emit('error-message', 'You already own this territory');
    }
    
    // Check if the territory is adjacent to any of player's territories
    const playerTerritories = gameState.players[socket.id].territories;
    const targetTerritory = gameState.territories[territoryId];
    
    const canAttack = playerTerritories.some(playerTerritoryId => {
      const playerTerritory = gameState.territories[playerTerritoryId];
      const dx = Math.abs(playerTerritory.x - targetTerritory.x);
      const dy = Math.abs(playerTerritory.y - targetTerritory.y);
      return (dx <= 1 && dy <= 1) && !(dx === 0 && dy === 0);
    });
    
    if (!canAttack) {
      return socket.emit('error-message', 'You can only attack adjacent territories');
    }
    
    // IMPORTANT: Check if there's already an active duel for this territory
    if (gameState.activeGames[territoryId]) {
      return socket.emit('error-message', 'This territory is already being contested');
    }
    
    // Get random question for the duel
    const question = getRandomQuestion();
    if (!question) {
      console.log(`ERROR: No questions available for duel`);
      return socket.emit('error-message', 'No questions available');
    }
    
    console.log(`DUEL QUESTION SELECTED: ${question.question}`);
    
    // Store the active duel in game state
    const defenderId = gameState.territories[territoryId].owner;
    
    console.log(`DUEL CREATED: ${gameState.players[socket.id].name} attacking territory ${territoryId}${defenderId ? ` owned by ${gameState.players[defenderId].name}` : ' (unowned)'}`);
    console.log(`QUESTION BEING SENT: ${question.question}`);
    
    gameState.activeGames[territoryId] = {
      attackerId: socket.id,
      defenderId: defenderId,
      question: question,
      startTime: Date.now(),
      answers: {},
      observers: []
    };
    
    // Send question challenge to attacker
    socket.emit('question-challenge', {
      question,
      territoryId,
      isDuel: true,
      role: 'attacker'
    });
    
    // If there's a defender, send them the question too
    if (defenderId) {
      const defenderSocket = io.sockets.sockets.get(defenderId);
      if (defenderSocket) {
        defenderSocket.emit('question-challenge', {
          question,
          territoryId,
          isDuel: true,
          role: 'defender'
        });
        
        console.log(`DUEL: Challenge sent to defender ${gameState.players[defenderId].name}`);
      } else {
        console.log(`ERROR: Defender socket not found for ${defenderId}`);
        // No defender found, mark as undefended
        gameState.activeGames[territoryId].noDefender = true;
      }
    } else {
      // No defender - just check if attacker gets it right
      gameState.activeGames[territoryId].noDefender = true;
      console.log(`DUEL: No defender for territory ${territoryId}`);
    }
    
    // Now send to all other active players as observers
    sendQuestionToObservers(territoryId, question, gameState.activeGames[territoryId]);
  });

  // Fix duel-answer handler to properly manage territory ownership
  socket.on('duel-answer', (data) => {
    const { territoryId, answer, responseTime, isObserver } = data;
    
    // Observer handling
    if (isObserver) {
      console.log(`OBSERVER ANSWER: Observer ${socket.id} answered for territory ${territoryId}`);
      
      // Make sure the duel and player exist
      if (!gameState.activeGames[territoryId] || !gameState.players[socket.id]) {
        return;
      }
      
      const duel = gameState.activeGames[territoryId];
      
      // Initialize observer answers object if needed
      if (!duel.observerAnswers) {
        duel.observerAnswers = {};
      }
      
      // Record observer's answer
      duel.observerAnswers[socket.id] = {
        answer,
        responseTime,
        timestamp: Date.now()
      };
      
      // Calculate points for observer
      const isCorrect = answer === duel.question.correctAnswer;
      const territoryValue = gameState.territories[territoryId].value || 1;
      
      // Award or deduct points
      if (isCorrect) {
        gameState.players[socket.id].score += territoryValue;
        socket.emit('info-message', `Correct! +${territoryValue} points`);
      } else {
        gameState.players[socket.id].score = Math.max(0, gameState.players[socket.id].score - 1);
        socket.emit('info-message', `Incorrect! -1 point`);
      }
      
      // Notify all clients of the updated score
      io.emit('player-list-update', Object.values(gameState.players));
      
      // Check if this completes all answers
      checkAndProcessDuelResult(territoryId);
      
      return;
    }
    
    console.log(`DUEL ANSWER: Answer received from ${socket.id} for territory ${territoryId}`);
    
    // Check for missing player
    if (!gameState.players[socket.id]) {
      console.error(`ERROR: Player ${socket.id} not found in game state!`);
      return socket.emit('error-message', 'Player not found in game state');
    }
    
    // Verify the duel exists
    if (!gameState.activeGames[territoryId]) {
      console.error(`ERROR: No active duel found for territory ${territoryId}`);
      return socket.emit('error-message', 'This territory isn\'t being contested');
    }
    
    const duel = gameState.activeGames[territoryId];
    
    // Verify this player is in the duel
    if (socket.id !== duel.attackerId && socket.id !== duel.defenderId) {
      return socket.emit('error-message', 'You are not part of this duel');
    }
    
    // Prevent duplicate answers
    if (duel.answers[socket.id]) {
      return socket.emit('error-message', 'You\'ve already answered this question');
    }
    
    // Record this player's answer
    duel.answers[socket.id] = {
      answer,
      responseTime,
      timestamp: Date.now()
    };
    
    // Check if all answers are received
    checkAndProcessDuelResult(territoryId);
  });
});

// Add this helper function outside the connection handler
function getRandomQuestion() {
  if (gameState.questions.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * gameState.questions.length);
  return gameState.questions[randomIndex];
}

// Update the initializeGame function to always use a 6x6 grid
function initializeGame() {
  console.log("=== GAME INITIALIZATION STARTED ===");
  console.log("Players:", gameState.players);
  
  const playerIds = Object.keys(gameState.players);
  const playerCount = playerIds.length;
  
  // Always use a 6x6 grid regardless of player count
  const gridWidth = 6;
  const gridHeight = 6;
  
  console.log(`Creating a ${gridWidth}x${gridHeight} game board for ${playerCount} players`);
  
  // Clear any existing territories
  gameState.territories = {};
  
  // Create territories in a grid
  for (let x = 0; x < gridWidth; x++) {
    for (let y = 0; y < gridHeight; y++) {
      const id = `t-${x}-${y}`;
      const value = Math.floor(Math.random() * 3) + 1; // Territory values 1-3
      
      gameState.territories[id] = {
        id,
        x,
        y,
        value,
        owner: null,
        isCapital: false  // Explicitly initialize as not a capital
      };
    }
  }
  
  // Log the initial territories
  console.log(`Created ${Object.keys(gameState.territories).length} territories`);
  
  // Place capitals based on player count
  const capitalPositions = getCapitalPositions(playerCount, gridWidth, gridHeight);
  console.log("Capital positions:", capitalPositions);
  
  // Assign capitals to players
  playerIds.forEach((playerId, index) => {
    if (index < capitalPositions.length) {
      const position = capitalPositions[index];
      const territoryId = `t-${position.x}-${position.y}`;
      
      // Check if territory exists
      if (!gameState.territories[territoryId]) {
        console.error(`ERROR: Territory ${territoryId} not found for capital assignment!`);
        return;
      }
      
      // Set as capital
      gameState.territories[territoryId].owner = playerId;
      gameState.territories[territoryId].isCapital = true;
      gameState.players[playerId].capital = territoryId;
      gameState.players[playerId].territories = [territoryId];
      
      console.log(`Player ${gameState.players[playerId].name} capital at (${position.x},${position.y})`);
    }
  });
  
  // Calculate territories per player (excluding capitals)
  const totalTerritories = gridWidth * gridHeight;
  const remainingTerritories = totalTerritories - playerCount;
  const territoriesPerPlayer = Math.floor(remainingTerritories / playerCount);
  
  console.log(`Each player will get approximately ${territoriesPerPlayer} additional territories`);
  
  // Assign additional territories around each capital
  playerIds.forEach((playerId, index) => {
    const capitalId = gameState.players[playerId].capital;
    if (!capitalId) {
      console.error(`ERROR: No capital found for player ${playerId}`);
      return;
    }
    
    const capital = gameState.territories[capitalId];
    if (!capital) {
      console.error(`ERROR: Territory not found for capital ID ${capitalId}`);
      return;
    }
    
    // How many additional territories this player gets
    let additionalCount = territoriesPerPlayer;
    
    // Distribute any remainder to early players
    if (index < remainingTerritories % playerCount) {
      additionalCount++;
    }
    
    console.log(`Assigning ${additionalCount} additional territories to ${gameState.players[playerId].name}`);
    
    // Set of territories already assigned
    const assignedTerritories = new Set(playerIds.map(id => gameState.players[id].capital));
    
    // Assign territories using proximity from capital
    assignTerritoriesToPlayer(playerId, capital, additionalCount, assignedTerritories);
  });
  
  // Set first player's turn
  gameState.currentTurn = playerIds[0];
  
  console.log("=== GAME INITIALIZATION COMPLETE ===");
  console.log("Final territory state:", gameState.territories);
  console.log("Final player state:", gameState.players);
  
  // Send territory update to clients
  io.emit('territory-update', gameState.territories);
  io.emit('player-list-update', Object.values(gameState.players));
  io.emit('turn-update', gameState.currentTurn);
}

// Update the getCapitalPositions function for more balanced starting positions
function getCapitalPositions(playerCount, gridWidth, gridHeight) {
  // Defensive positioning - array of coordinates [x, y]
  switch(playerCount) {
    case 1:
      return [{x: 0, y: 0}]; // Single player in top-left
      
    case 2:
      return [
        {x: 0, y: 0},           // Player 1: top-left
        {x: gridWidth-1, y: gridHeight-1}  // Player 2: bottom-right (maximum distance)
      ];
      
    case 3:
      // Triangle formation with buffer zones
      return [
        {x: 0, y: 0},              // Player 1: top-left
        {x: gridWidth-1, y: 0},    // Player 2: top-right
        {x: Math.floor(gridWidth/2), y: gridHeight-1}  // Player 3: bottom-middle
      ];
      
    case 4:
      // Modified corners with slight buffer
      return [
        {x: 0, y: 0},                    // Player 1: top-left
        {x: gridWidth-1, y: 0},          // Player 2: top-right
        {x: 0, y: gridHeight-1},         // Player 3: bottom-left
        {x: gridWidth-1, y: gridHeight-1}  // Player 4: bottom-right
      ];
      
    default:
      // For more than 4 players or fallback
      const positions = [];
      for (let i = 0; i < playerCount; i++) {
        // Distribute evenly around the perimeter
        const angle = (i / playerCount) * 2 * Math.PI;
        const radius = Math.min(gridWidth, gridHeight) / 2 - 1; // Buffer from edge
        const centerX = gridWidth / 2;
        const centerY = gridHeight / 2;
        
        const x = Math.floor(centerX + radius * Math.cos(angle));
        const y = Math.floor(centerY + radius * Math.sin(angle));
        
        // Ensure within grid bounds
        const boundedX = Math.max(1, Math.min(gridWidth - 2, x));
        const boundedY = Math.max(1, Math.min(gridHeight - 2, y));
        
        positions.push({x: boundedX, y: boundedY});
      }
      return positions;
  }
}

// Helper function to assign territories to a player using BFS
function assignTerritoriesToPlayer(playerId, startTerritory, count, assignedTerritories) {
  if (count <= 0) return;
  
  // Use a priority queue approach to prefer territories closer to the capital
  // We'll simulate this with an array and sort by distance
  const candidates = [];
  const startX = startTerritory.x;
  const startY = startTerritory.y;
  
  // Find all valid territory candidates and sort by distance to capital (prioritize clustering)
  Object.values(gameState.territories).forEach(territory => {
    // Skip already assigned territories
    if (territory.owner !== null || assignedTerritories.has(territory.id)) {
      return;
    }
    
    // Calculate Manhattan distance to capital
    const distanceToCapital = Math.abs(territory.x - startX) + Math.abs(territory.y - startY);
    
    candidates.push({
      id: territory.id,
      x: territory.x,
      y: territory.y,
      distance: distanceToCapital
    });
  });
  
  // Sort by distance (closest first)
  candidates.sort((a, b) => a.distance - b.distance);
  
  // Take the closest territories up to the count
  const territoriesToAssign = candidates.slice(0, count);
  
  // Assign territories to the player
  territoriesToAssign.forEach(candidate => {
    const territoryId = candidate.id;
    
    // Assign to player
    gameState.territories[territoryId].owner = playerId;
    gameState.players[playerId].territories.push(territoryId);
    
    // Mark as assigned
    assignedTerritories.add(territoryId);
  });
  
  console.log(`Assigned ${territoriesToAssign.length} territories to player ${playerId} near (${startX}, ${startY})`);
}

// Modify the checkWinCondition function to check for both types of winners
function checkWinCondition() {
  // Check for traditional winner (last player with a capital)
  const playersWithCapitals = Object.keys(gameState.players).filter(id => {
    // Player has a capital that they still own
    return gameState.players[id].capital && 
           gameState.territories[gameState.players[id].capital] &&
           gameState.territories[gameState.players[id].capital].owner === id;
  });
  
  // Check for points leader
  let highestScore = -1;
  let pointsLeader = null;
  
  Object.keys(gameState.players).forEach(id => {
    if (gameState.players[id].score > highestScore) {
      highestScore = gameState.players[id].score;
      pointsLeader = id;
    }
  });
  
  // Traditional win condition
  if (playersWithCapitals.length === 1) {
    const traditionalWinnerId = playersWithCapitals[0];
    const pointsWinnerId = pointsLeader;
    
    // Prepare the winners announcement
    let winMessage = `Game over! ${gameState.players[traditionalWinnerId].name} is the last wizard standing!`;
    
    // If points winner is different, announce both
    if (pointsWinnerId !== traditionalWinnerId) {
      winMessage += ` However, ${gameState.players[pointsWinnerId].name} earned the most points (${gameState.players[pointsWinnerId].score})!`;
    } else {
      winMessage += ` They also earned the most points (${gameState.players[pointsWinnerId].score})!`;
    }
    
    io.emit('game-over', {
      traditionalWinner: gameState.players[traditionalWinnerId],
      pointsWinner: gameState.players[pointsWinnerId],
      message: winMessage
    });
    
    console.log(`Game over! Traditional winner: ${gameState.players[traditionalWinnerId].name}, Points winner: ${gameState.players[pointsWinnerId].name}`);
    
    // Reset game state
    gameState.gameActive = false;
    gameState.currentTurn = null;
    
    return true;
  }
  
  return false;
}

// Update the advanceToNextTurn function to properly handle eliminated players
function advanceToNextTurn() {
    const playerIds = Object.keys(gameState.players);
    if (playerIds.length === 0) return;
    
    console.log("Advancing turn...");
    console.log("Current players:", playerIds.map(id => `${id}: ${gameState.players[id].name} (${gameState.players[id].eliminated ? 'eliminated' : 'active'})`));
    
    // Get current player index
    const currentIndex = playerIds.indexOf(gameState.currentTurn);
    console.log(`Current turn: ${gameState.currentTurn} (index ${currentIndex})`);
    
    // Track if we've gone through a full cycle without finding a valid player
    let checkedCount = 0;
    let nextIndex = currentIndex;
    
    // Keep looking until we find a non-eliminated player with territories, or we've checked everyone
    while (checkedCount < playerIds.length) {
        // Move to next player (with wraparound)
        nextIndex = (nextIndex + 1) % playerIds.length;
        const nextPlayerId = playerIds[nextIndex];
        
        console.log(`Checking player ${nextPlayerId} (${gameState.players[nextPlayerId].name})`);
        
        // Skip already eliminated players
        if (gameState.players[nextPlayerId].eliminated) {
            console.log(`Player ${nextPlayerId} is already eliminated, skipping`);
            checkedCount++;
            continue;
        }
        
        // Check if player has territories
        const hasTerritory = Object.values(gameState.territories).some(t => t.owner === nextPlayerId);
        
        if (hasTerritory) {
            // Found a valid player
            gameState.currentTurn = nextPlayerId;
            const nextPlayerName = gameState.players[gameState.currentTurn].name;
            console.log(`Turn advanced to player: ${nextPlayerName}`);
            
            io.emit('turn-update', gameState.currentTurn);
            return;
        } else {
            // Player has no territories, mark them as eliminated
            gameState.players[nextPlayerId].eliminated = true;
            io.emit('player-eliminated', {
                playerId: nextPlayerId,
                playerName: gameState.players[nextPlayerId].name
            });
            io.emit('game-log', `${gameState.players[nextPlayerId].name} has been eliminated from the game!`);
            
            console.log(`Player ${nextPlayerId} has no territories, marking as eliminated`);
        }
        
        checkedCount++;
    }
    
    // If we get here, all players are eliminated or have no territories
    console.log("No valid players found to advance turn to");
    
    // Check if there's a winner (one player with territories)
    const remainingPlayers = playerIds.filter(id => 
        !gameState.players[id].eliminated && 
        Object.values(gameState.territories).some(t => t.owner === id)
    );
    
    if (remainingPlayers.length === 1) {
        io.emit('game-over', {
            winner: gameState.players[remainingPlayers[0]],
            reason: 'Last wizard standing!'
        });
        console.log(`Game over! Winner: ${gameState.players[remainingPlayers[0]].name}`);
    } else if (remainingPlayers.length === 0) {
        // Edge case: No one has territories
        io.emit('game-over', {
            winner: null,
            reason: 'No wizards remain!'
        });
        console.log("Game over! No players with territories remain");
    } else {
        // This shouldn't happen but just in case - pick the first remaining player
        gameState.currentTurn = remainingPlayers[0];
        console.log(`ABNORMAL TURN ADVANCE: Setting turn to ${gameState.players[gameState.currentTurn].name}`);
        io.emit('turn-update', gameState.currentTurn);
    }
}

// Add this function to send questions to non-duel players
function sendQuestionToObservers(territoryId, question, duelData) {
  // Get all player IDs
  const playerIds = Object.keys(gameState.players);
  
  // Get players who are not part of the duel
  const observerIds = playerIds.filter(id => 
    id !== duelData.attackerId && 
    id !== duelData.defenderId &&
    !gameState.players[id].eliminated
  );
  
  console.log(`Sending question to ${observerIds.length} observers for duel on ${territoryId}`);
  
  // Send question to all observers
  observerIds.forEach(playerId => {
    const socket = io.sockets.sockets.get(playerId);
    if (socket) {
      socket.emit('question-challenge', {
        question,
        territoryId,
        isDuel: false,
        role: 'observer', // New role for non-duel participants
        observing: true,  // Flag to indicate they're just observing
        territoryValue: gameState.territories[territoryId].value || 1
      });
      
      // Record that this player is observing
      if (!duelData.observers) {
        duelData.observers = [];
      }
      
      duelData.observers.push(playerId);
    }
  });
}

// Fix 3: Add a new helper function to check and process duel results
function checkAndProcessDuelResult(territoryId) {
  const duel = gameState.activeGames[territoryId];
  if (!duel) return false;
  
  // Check attacker and defender
  const hasAttackerAnswer = !!duel.answers[duel.attackerId];
  const hasDefenderAnswer = duel.defenderId ? !!duel.answers[duel.defenderId] : true;
  
  // Check observers - only count active observers
  let pendingObservers = [];
  if (duel.observers && duel.observers.length > 0) {
    pendingObservers = duel.observers.filter(observerId => {
      // Skip eliminated players
      if (gameState.players[observerId]?.eliminated) return false;
      
      // Check if this observer has answered
      return !duel.observerAnswers || !duel.observerAnswers[observerId];
    });
  }
  
  console.log(`DUEL CHECK: Attacker: ${hasAttackerAnswer}, Defender: ${hasDefenderAnswer}, Pending observers: ${pendingObservers.length}`);
  
  // Only process if attacker and defender have answered
  // For observers, we'll allow the duel to complete if most have answered after a timeout
  if (!hasAttackerAnswer || !hasDefenderAnswer) {
    return false;
  }
  
  // If there are still some observers pending but critical players have answered
  if (pendingObservers.length > 0) {
    // If this is the first time we're checking (no timeout set yet)
    if (!duel.resultTimeoutSet) {
      console.log(`DUEL: Critical players answered, waiting max 5 seconds for ${pendingObservers.length} observers`);
      
      duel.resultTimeoutSet = true;
      
      // Set a timeout to process the result anyway after 5 seconds
      setTimeout(() => {
        console.log(`DUEL: Observer wait timeout expired for territory ${territoryId}`);
        processDuelResult(territoryId);
      }, 5000);
      
      return false;
    }
    
    // Otherwise wait for the timeout to expire
    return false;
  }
  
  // All answers received, process immediately
  return processDuelResult(territoryId);
}

// Fix 4: Separate the duel result processing logic
function processDuelResult(territoryId) {
  console.log(`DUEL: Processing final result for territory ${territoryId}`);
  
  const duel = gameState.activeGames[territoryId];
  if (!duel) {
    console.log(`DUEL: No active duel found for territory ${territoryId}`);
    return false;
  }
  
  // Copy the existing duel resolution logic here
  // Determine the winner
  const attackerAnswer = duel.answers[duel.attackerId];
  if (!attackerAnswer) {
    console.error(`ERROR: Attacker answer not found in duel data for ${territoryId}`);
    return false;
  }
  
  const attackerCorrect = attackerAnswer.answer === duel.question.correctAnswer;
  
  let winnerId = null;
  let winReason = '';
  
  // Winner determination logic...
  // Copy the existing logic from the duel-answer setTimeout handler
  
  // Logic to determine the winner
  if (!duel.defenderId) {
    // Undefended territory
    if (attackerCorrect) {
      winnerId = duel.attackerId;
      winReason = 'Attacker answered correctly and claimed undefended territory';
    } else {
      winnerId = null;
      winReason = 'Attacker answered incorrectly, territory remains unclaimed';
    }
  } else {
    // Contested territory
    const defenderAnswer = duel.answers[duel.defenderId];
    if (!defenderAnswer) {
      console.error(`ERROR: Defender answer not found in duel data for ${territoryId}`);
      return false;
    }
    
    const defenderCorrect = defenderAnswer.answer === duel.question.correctAnswer;
    
    if (attackerCorrect && defenderCorrect) {
      // Both correct - speed decides
      if (attackerAnswer.responseTime < defenderAnswer.responseTime) {
        winnerId = duel.attackerId;
        winReason = 'Both answered correctly, but attacker was faster';
      } else {
        winnerId = duel.defenderId;
        winReason = 'Both answered correctly, but defender was faster';
      }
    } else if (attackerCorrect) {
      winnerId = duel.attackerId;
      winReason = 'Attacker answered correctly, defender answered incorrectly';
    } else if (defenderCorrect) {
      winnerId = duel.defenderId;
      winReason = 'Defender answered correctly, attacker answered incorrectly';
    } else {
      // Both incorrect, defender keeps territory
      winnerId = duel.defenderId;
      winReason = 'Both answered incorrectly, defender keeps territory';
    }
  }
  
  // Award points for duel participants
  const territoryValue = gameState.territories[territoryId].value || 1;
  
  // Attacker points
  if (attackerCorrect) {
    gameState.players[duel.attackerId].score += territoryValue;
    io.to(duel.attackerId).emit('info-message', `Correct! +${territoryValue} points`);
  }
  
  // Defender points
  if (duel.defenderId && duel.answers[duel.defenderId]?.answer === duel.question.correctAnswer) {
    gameState.players[duel.defenderId].score += territoryValue;
    io.to(duel.defenderId).emit('info-message', `Correct! +${territoryValue} points`);
  }
  
  // Rest of duel processing (territory ownership changes, etc.)
  // Copy and adapt from the existing code
  
  // Update territory if attacker wins
  if (winnerId === duel.attackerId) {
    const territory = gameState.territories[territoryId];
    const isCapital = territory.isCapital;
    
    // For capitals: special handling - one attack per turn
    if (isCapital) {
      // Decrease capital value
      if (territory.value > 0) {
        territory.value--;
        io.emit('game-log', `${gameState.players[duel.attackerId].name} damages the capital! Defense reduced to ${territory.value}.`);
        
        // If capital is destroyed (value === 0), transfer ownership
        if (territory.value === 0) {
          // Transfer ownership
          const previousOwner = territory.owner;
          territory.owner = duel.attackerId;
          
          // Add to attacker territories
          if (!gameState.players[duel.attackerId].territories.includes(territoryId)) {
            gameState.players[duel.attackerId].territories.push(territoryId);
          }
          
          // Remove from previous owner
          if (previousOwner) {
            gameState.players[previousOwner].territories = 
              gameState.players[previousOwner].territories.filter(id => id !== territoryId);
          }
          
          io.emit('game-log', `${gameState.players[duel.attackerId].name} has captured the capital of ${gameState.players[previousOwner].name}!`);
          
          // Check if the player has been eliminated
          if (previousOwner) {
            // Mark player as eliminated
            gameState.players[previousOwner].eliminated = true;
            io.emit('player-eliminated', {
              playerId: previousOwner,
              playerName: gameState.players[previousOwner].name,
              eliminatedBy: gameState.players[duel.attackerId].name
            });
          }
        }
      }
    } else {
      // For regular territories: multi-round system
      if (territory.value > 1) {
        // Decrease value
        territory.value--;
        io.emit('game-log', `${gameState.players[duel.attackerId].name} weakens the territory's defense to ${territory.value}!`);
        
        // Send update to all clients
        io.emit('territory-update', gameState.territories);
        
        // Notify of defense reduction
        io.emit('duel-result', {
          territoryId,
          winner: 'attacker',
          reason: `Attacker weakened territory defense to level ${territory.value}`,
          attackerId: duel.attackerId,
          defenderId: duel.defenderId,
          attackerAnswer: attackerAnswer.answer,
          defenderAnswer: duel.defenderId ? duel.answers[duel.defenderId].answer : null,
          attackerCorrect,
          defenderCorrect: duel.defenderId && 
                          duel.answers[duel.defenderId].answer === duel.question.correctAnswer,
          attackerTime: attackerAnswer.responseTime,
          defenderTime: duel.defenderId ? duel.answers[duel.defenderId].responseTime : null,
          correctAnswer: duel.question.correctAnswer,
          question: duel.question.question,
          answerText: duel.question.answers[duel.question.correctAnswer],
          defenseLevel: territory.value,
          defenseReduced: true,
          continuingAttack: true
        });
        
        // Clean up this game
        delete gameState.activeGames[territoryId];
        
        // IMPORTANT: Notify clients that next round is being prepared
        io.emit('preparing-next-round', {
          territoryId,
          attackerId: duel.attackerId,
          defenderId: duel.defenderId,
          round: (duel.round || 1) + 1
        });
        
        // IMPORTANT: Continue with the next attack round
        setTimeout(() => {
          // Get a new question for the next round
          const question = getRandomQuestion();
          
          if (!question) {
            console.log(`ERROR: No questions available for continued attack`);
            advanceToNextTurn();
            return;
          }
          
          // Create new duel data for the same territory
          gameState.activeGames[territoryId] = {
            attackerId: duel.attackerId,
            defenderId: duel.defenderId,
            question: question,
            startTime: Date.now(),
            answers: {},
            round: (duel.round || 1) + 1,
            continuing: true
          };
          
          // Log the continued attack
          io.emit('game-log', `${gameState.players[duel.attackerId].name} continues attacking territory (Round ${gameState.activeGames[territoryId].round})`);
          
          // Send question to attacker with additional context
          io.to(duel.attackerId).emit('question-challenge', {
            question,
            territoryId,
            isDuel: true,
            role: 'attacker',
            round: gameState.activeGames[territoryId].round,
            continuing: true,
            forceShow: true
          });
          
          // Send question to defender if there is one
          if (duel.defenderId) {
            const defenderSocket = io.sockets.sockets.get(duel.defenderId);
            if (defenderSocket) {
              defenderSocket.emit('question-challenge', {
                question,
                territoryId,
                isDuel: true,
                role: 'defender',
                round: gameState.activeGames[territoryId].round,
                continuing: true
              });
            }
          }
          
          // Send to observers
          sendQuestionToObservers(territoryId, question, gameState.activeGames[territoryId]);
        }, 3000);
        
        return true;
      } else {
        // Territory captured (value = 0/1), transfer ownership
        const previousOwner = territory.owner;
        territory.owner = duel.attackerId;
        
        // Update territory lists
        if (previousOwner) {
          gameState.players[previousOwner].territories = 
            gameState.players[previousOwner].territories.filter(id => id !== territoryId);
        }
        
        // Add to attacker list if not already there
        if (!gameState.players[duel.attackerId].territories.includes(territoryId)) {
          gameState.players[duel.attackerId].territories.push(territoryId);
        }
        
        io.emit('game-log', `${gameState.players[duel.attackerId].name} captured territory ${territoryId}!`);
      }
    }
  }
  
  // Send the result to all clients
  io.emit('duel-result', {
    territoryId,
    winner: winnerId === duel.attackerId ? 'attacker' : 
            winnerId === duel.defenderId ? 'defender' : 'none',
    reason: winReason,
    attackerId: duel.attackerId,
    defenderId: duel.defenderId,
    attackerAnswer: attackerAnswer.answer,
    defenderAnswer: duel.defenderId ? duel.answers[duel.defenderId].answer : null,
    attackerCorrect,
    defenderCorrect: duel.defenderId && 
                    duel.answers[duel.defenderId].answer === duel.question.correctAnswer,
    attackerTime: attackerAnswer.responseTime,
    defenderTime: duel.defenderId ? duel.answers[duel.defenderId].responseTime : null,
    correctAnswer: duel.question.correctAnswer,
    question: duel.question.question,
    answerText: duel.question.answers[duel.question.correctAnswer]
  });
  
  // Clean up this game
  delete gameState.activeGames[territoryId];
  
  // If we're not continuing (i.e., territory was captured or attack failed), advance turn
  if (territory.value <= 1 || winnerId !== duel.attackerId) {
    advanceToNextTurn();
  }
  
  // Notify players of updated scores
  io.emit('player-list-update', Object.values(gameState.players));
  
  return true;
}

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 