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
  activeGames: {}
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
      capital: null
    };
    
    io.emit('player-list-update', Object.values(gameState.players));
    console.log(`${playerName} joined the game`);
  });
  
  // Handle game start
  socket.on('start-game', () => {
    if (Object.keys(gameState.players).length >= 2) {
      initializeGame();
      io.emit('game-started', {
        territories: gameState.territories,
        players: Object.values(gameState.players),
        currentTurn: gameState.currentTurn // Send initial turn info
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
      answers: {}
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
  });

  // Fix duel-answer handler to properly manage territory ownership
  socket.on('duel-answer', (data) => {
    const { territoryId, answer, responseTime } = data;
    
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
    
    // Let everyone know this player has answered
    const playerName = gameState.players[socket.id].name;
    const role = socket.id === duel.attackerId ? 'Attacker' : 'Defender';
    
    console.log(`DUEL: ${playerName} (${role}) answered in ${responseTime}ms`);
    
    // Notify all clients that a player has answered
    io.emit('duel-status-update', {
      territoryId,
      playerId: socket.id,
      playerName,
      role,
      responseTime
    });
    
    // Check if we have both answers
    const hasAttackerAnswer = !!duel.answers[duel.attackerId];
    const hasDefenderAnswer = duel.defenderId ? !!duel.answers[duel.defenderId] : true;
    const allAnswersReceived = hasAttackerAnswer && hasDefenderAnswer;
    
    console.log(`DUEL: Status - Attacker answered: ${hasAttackerAnswer}, Defender answered: ${hasDefenderAnswer}`);
    
    if (!allAnswersReceived) {
      // Still waiting for the other player
      const waitingFor = !hasAttackerAnswer ? gameState.players[duel.attackerId].name : 
                         !hasDefenderAnswer ? gameState.players[duel.defenderId].name : 'nobody';
      
      console.log(`DUEL: Waiting for ${waitingFor} to answer`);
      socket.emit('info-message', `Your answer has been submitted. Waiting for ${waitingFor} to answer.`);
      return;
    }
    
    // If we get here, all answers are received
    
    console.log(`DUEL: All answers received for territory ${territoryId}, resolving duel...`);
    
    // Signal to clients to close quiz modals
    io.to(duel.attackerId).emit('duel-complete', { territoryId });
    if (duel.defenderId) {
      io.to(duel.defenderId).emit('duel-complete', { territoryId });
    }
    
    // IMPORTANT: Create a stable copy of the duel data for evaluation
    const duelData = { ...duel };
    
    // Wait for modals to close, then process the result
    setTimeout(() => {
      // Ensure the duel hasn't been processed already
      if (!gameState.activeGames[territoryId]) {
        console.log(`DUEL: Duel ${territoryId} already processed, skipping`);
        return;
      }
      
      console.log(`DUEL: Evaluating duel result for territory ${territoryId}`);
      
      // Determine the winner
      const attackerAnswer = duelData.answers[duelData.attackerId];
      const attackerCorrect = attackerAnswer.answer === duelData.question.correctAnswer;
      
      let winnerId = null;
      let winReason = '';
      
      // Logic to determine the winner
      if (!duelData.defenderId) {
        // Undefended territory
        if (attackerCorrect) {
          winnerId = duelData.attackerId;
          winReason = 'Attacker answered correctly and claimed undefended territory';
        } else {
          winnerId = null;
          winReason = 'Attacker answered incorrectly, territory remains unclaimed';
        }
      } else {
        // Contested territory
        const defenderAnswer = duelData.answers[duelData.defenderId];
        const defenderCorrect = defenderAnswer.answer === duelData.question.correctAnswer;
        
        if (attackerCorrect && defenderCorrect) {
          // Both correct - speed decides
          if (attackerAnswer.responseTime < defenderAnswer.responseTime) {
            winnerId = duelData.attackerId;
            winReason = 'Both answered correctly, but attacker was faster';
          } else {
            winnerId = duelData.defenderId;
            winReason = 'Both answered correctly, but defender was faster';
          }
        } else if (attackerCorrect) {
          winnerId = duelData.attackerId;
          winReason = 'Attacker answered correctly, defender did not';
        } else if (defenderCorrect) {
          winnerId = duelData.defenderId;
          winReason = 'Defender answered correctly, attacker did not';
        } else {
          // Both wrong, defender keeps territory
          winnerId = duelData.defenderId;
          winReason = 'Neither answered correctly, territory stays with defender';
        }
      }
      
      console.log(`DUEL RESULT: ${winReason}`);
      
      // Update territory ownership if attacker wins
      if (winnerId === duelData.attackerId) {
        // Check if this was a capital
        const wasCapital = gameState.territories[territoryId].isCapital;
        let originalOwner = null;
        
        if (wasCapital) {
          // Find the original owner
          originalOwner = Object.keys(gameState.players).find(id => 
            gameState.players[id].capital === territoryId
          );
        }
        
        // Remove from previous owner if there was one (CRITICAL - THIS WAS MISSING)
        if (duelData.defenderId) {
          gameState.players[duelData.defenderId].territories = 
            gameState.players[duelData.defenderId].territories.filter(id => id !== territoryId);
        }
        
        // Update ownership in the territory object
        gameState.territories[territoryId].owner = duelData.attackerId;
        
        // Add to attacker's territory list
        if (!gameState.players[duelData.attackerId].territories.includes(territoryId)) {
          gameState.players[duelData.attackerId].territories.push(territoryId);
        }
        
        // If it was a capital, handle capital capture properly
        if (wasCapital) {
          // Set isCapital to false since it's been captured
          gameState.territories[territoryId].isCapital = false;
          
          // Log the capital capture
          if (originalOwner && originalOwner !== duelData.attackerId) {
            io.emit('game-log', `${gameState.players[duelData.attackerId].name} has captured ${gameState.players[originalOwner].name}'s capital!`);
          }
        }
        
        // Check win condition
        checkWinCondition();
      }
      
      // Send the result to all clients
      io.emit('duel-result', {
        territoryId,
        winner: winnerId === duelData.attackerId ? 'attacker' : 
                winnerId === duelData.defenderId ? 'defender' : 'none',
        reason: winReason,
        attackerId: duelData.attackerId,
        defenderId: duelData.defenderId,
        attackerAnswer: attackerAnswer.answer,
        defenderAnswer: duelData.defenderId ? duelData.answers[duelData.defenderId].answer : null,
        attackerCorrect,
        defenderCorrect: duelData.defenderId && 
                        duelData.answers[duelData.defenderId].answer === duelData.question.correctAnswer,
        attackerTime: attackerAnswer.responseTime,
        defenderTime: duelData.defenderId ? duelData.answers[duelData.defenderId].responseTime : null,
        correctAnswer: duelData.question.correctAnswer,
        question: duelData.question.question,
        answerText: duelData.question.answers[duelData.question.correctAnswer]
      });
      
      // Update clients with territory and player data
      io.emit('territory-update', gameState.territories);
      io.emit('player-list-update', Object.values(gameState.players));
      
      // CRITICAL: Delete the active game BEFORE advancing turn
      delete gameState.activeGames[territoryId];
      
      // Log the turn before advancing
      const currentPlayerName = gameState.players[gameState.currentTurn].name;
      console.log(`TURNS: Current turn before advancing: ${currentPlayerName}`);
      
      // Advance to the next player
      advanceToNextTurn();
      
      const nextPlayerName = gameState.players[gameState.currentTurn].name;
      console.log(`TURNS: Advanced turn to: ${nextPlayerName}`);
      
      // Notify clients of the turn change
      io.emit('turn-update', gameState.currentTurn);
      
      // Add a log entry about the turn change
      io.emit('game-log', `It's now ${nextPlayerName}'s turn.`);
      
    }, 1000); // Delay to allow UI updates
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

// Helper function to determine capital positions based on player count
function getCapitalPositions(playerCount, gridWidth, gridHeight) {
  const positions = [];
  
  if (playerCount === 2) {
    // 2 players: opposite diagonal corners
    positions.push({x: 0, y: 0});
    positions.push({x: gridWidth-1, y: gridHeight-1});
  } 
  else if (playerCount === 3) {
    // 3 players: two neighboring corners and one in the middle of opposite side
    positions.push({x: 0, y: 0});                   // Top-left corner
    positions.push({x: 0, y: gridHeight-1});        // Bottom-left corner
    positions.push({x: gridWidth-1, y: Math.floor(gridHeight/2)}); // Middle of right side
  } 
  else if (playerCount === 4) {
    // 4 players: each in a corner
    positions.push({x: 0, y: 0});                   // Top-left
    positions.push({x: gridWidth-1, y: 0});         // Top-right
    positions.push({x: 0, y: gridHeight-1});        // Bottom-left
    positions.push({x: gridWidth-1, y: gridHeight-1}); // Bottom-right
  }
  else {
    // Fallback for other player counts (shouldn't happen)
    for (let i = 0; i < playerCount; i++) {
      positions.push({
        x: Math.floor(i * gridWidth / playerCount),
        y: Math.floor(i * gridHeight / playerCount)
      });
    }
  }
  
  return positions;
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

// Update the checkWinCondition function to handle player elimination
function checkWinCondition() {
  const playerIds = Object.keys(gameState.players);
  
  // Check if any player has lost their capital
  playerIds.forEach(playerId => {
    const player = gameState.players[playerId];
    const capital = player.capital;
    
    // Skip players who have already been marked as eliminated
    if (player.eliminated) return;
    
    // Check if this player's capital is owned by someone else
    if (gameState.territories[capital] && gameState.territories[capital].owner !== playerId) {
      // Player has lost their capital - mark as eliminated
      player.eliminated = true;
      
      // Capture message
      const capturingPlayerId = gameState.territories[capital].owner;
      const capturingPlayerName = gameState.players[capturingPlayerId].name || 'Unknown';
      
      // Announce elimination
      io.emit('player-eliminated', {
        playerId: playerId,
        playerName: player.name,
        eliminatedBy: capturingPlayerName
      });
      
      io.emit('game-log', `${player.name}'s capital has been captured by ${capturingPlayerName}!`);
      
      // Convert their territories to neutral (except the capital which stays with the capturer)
      convertTerritoriesToNeutral(playerId, capital);
    }
  });
  
  // Check if only one player remains (final win condition)
  const activePlayers = playerIds.filter(id => !gameState.players[id].eliminated);
  
  if (activePlayers.length === 1) {
    const winner = gameState.players[activePlayers[0]];
    io.emit('game-over', {
      winner: winner,
      reason: 'Last wizard standing!'
    });
  }
}

// Update the convertTerritoriesToNeutral function to handle capital styling
function convertTerritoriesToNeutral(playerId, exceptTerritoryId) {
  console.log(`Converting ${playerId}'s territories to neutral (except ${exceptTerritoryId})`);
  
  // Go through all territories
  Object.values(gameState.territories).forEach(territory => {
    // If owned by the eliminated player and not the excepted territory
    if (territory.owner === playerId && territory.id !== exceptTerritoryId) {
      // Convert to neutral
      territory.owner = null;
      
      // If it was a capital, it's no longer a capital
      if (territory.isCapital) {
        territory.isCapital = false;
      }
    }
  });
  
  // The capital that was captured should no longer be a capital for the defeated player
  // but remains owned by the capturing player
  const capturedCapital = gameState.territories[exceptTerritoryId];
  if (capturedCapital) {
    capturedCapital.isCapital = false;
    console.log(`Removing capital status from captured territory ${exceptTerritoryId}`);
  }
  
  // Update the player's territory list to be empty
  gameState.players[playerId].territories = [];
  
  // Send territory update to all clients
  io.emit('territory-update', gameState.territories);
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

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 