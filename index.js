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

  // Fix duel-answer handler to properly handle duels and turn progression
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
        // Remove from previous owner if there was one
        if (duelData.defenderId) {
          gameState.players[duelData.defenderId].territories = 
            gameState.players[duelData.defenderId].territories.filter(id => id !== territoryId);
        }
        
        // Add to attacker
        gameState.territories[territoryId].owner = duelData.attackerId;
        if (!gameState.players[duelData.attackerId].territories.includes(territoryId)) {
          gameState.players[duelData.attackerId].territories.push(territoryId);
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

// Modified initializeGame function to distribute territories evenly
function initializeGame() {
  const gridWidth = 8;
  const gridHeight = 8;
  
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
        owner: null
      };
    }
  }
  
  // Get list of all territories
  const allTerritories = Object.keys(gameState.territories);
  
  // Get all players
  const playerIds = Object.keys(gameState.players);
  const playerCount = playerIds.length;
  
  // Calculate territories per player - divide evenly
  const totalTerritories = allTerritories.length;
  const territoriesPerPlayer = Math.floor(totalTerritories / playerCount);
  
  // Assign territories as evenly as possible
  playerIds.forEach((playerId, playerIndex) => {
    // Determine how many territories this player gets
    let playerTerritoryCount = territoriesPerPlayer;
    
    // If there are leftover territories, distribute them
    if (playerIndex < totalTerritories % playerCount) {
      playerTerritoryCount++;
    }
    
    // Find a starting point for this player's territory cluster
    const startX = Math.floor((gridWidth / playerCount) * playerIndex + (gridWidth / playerCount / 2));
    const startY = Math.floor(gridHeight / 2);
    const startId = `t-${startX}-${startY}`;
    
    // Start with the closest territory to the calculated starting point
    let startingTerritory = findClosestTerritory(startX, startY, allTerritories, gameState.territories);
    
    // Assign it as a capital
    gameState.territories[startingTerritory].owner = playerId;
    gameState.territories[startingTerritory].isCapital = true;
    gameState.players[playerId].capital = startingTerritory;
    gameState.players[playerId].territories = [startingTerritory];
    
    // Exclude this territory from further assignment
    const usedTerritories = new Set([startingTerritory]);
    
    // Assign remaining territories using BFS
    assignAdjacentTerritories(playerId, startingTerritory, playerTerritoryCount - 1, usedTerritories);
  });
  
  // Set first player's turn
  gameState.currentTurn = playerIds[0];
  
  console.log("Game initialized with even territory distribution");
}

// Helper function to find closest territory to a point
function findClosestTerritory(x, y, availableTerritories, territoriesData) {
  let closestId = availableTerritories[0];
  let minDistance = Infinity;
  
  availableTerritories.forEach(id => {
    if (territoriesData[id].owner === null) {
      const territory = territoriesData[id];
      const distance = Math.sqrt(Math.pow(territory.x - x, 2) + Math.pow(territory.y - y, 2));
      if (distance < minDistance) {
        minDistance = distance;
        closestId = id;
      }
    }
  });
  
  return closestId;
}

// Helper function to assign adjacent territories using BFS
function assignAdjacentTerritories(playerId, startId, count, usedTerritories) {
  if (count <= 0) return;
  
  const queue = [startId];
  const directions = [
    {dx: -1, dy: 0}, {dx: 1, dy: 0}, 
    {dx: 0, dy: -1}, {dx: 0, dy: 1},
    {dx: -1, dy: -1}, {dx: 1, dy: 1},
    {dx: -1, dy: 1}, {dx: 1, dy: -1}
  ];
  
  while (queue.length > 0 && count > 0) {
    const currentId = queue.shift();
    const current = gameState.territories[currentId];
    
    // Use a regular for loop instead of forEach to allow breaking
    for (let i = 0; i < directions.length; i++) {
      if (count <= 0) break; // Now this break is legal
      
      const dir = directions[i];
      const newX = current.x + dir.dx;
      const newY = current.y + dir.dy;
      
      // Check if coordinates are valid
      if (newX >= 0 && newX < 8 && newY >= 0 && newY < 8) {
        const newId = `t-${newX}-${newY}`;
        
        // If territory hasn't been assigned yet
        if (!usedTerritories.has(newId) && !gameState.territories[newId].owner) {
          // Assign to player
          gameState.territories[newId].owner = playerId;
          gameState.players[playerId].territories.push(newId);
          
          // Mark as used
          usedTerritories.add(newId);
          queue.push(newId);
          
          // Decrement counter
          count--;
        }
      }
    }
  }
}

// Check if someone has won the game
function checkWinCondition() {
  const playerIds = Object.keys(gameState.players);
  
  // Check if any player has captured all capitals
  for (const playerId of playerIds) {
    const player = gameState.players[playerId];
    const capturedAllCapitals = playerIds.every(id => {
      return id === playerId || player.territories.includes(gameState.players[id].capital);
    });
    
    if (capturedAllCapitals) {
      io.emit('game-over', {
        winner: player,
        reason: 'All capitals captured'
      });
      return;
    }
  }
}

// Add a function to advance to the next player's turn
function advanceToNextTurn() {
  const playerIds = Object.keys(gameState.players);
  if (playerIds.length === 0) return;
  
  // Get current player index
  const currentIndex = playerIds.indexOf(gameState.currentTurn);
  
  // Find next player that has territories
  let nextIndex = currentIndex;
  let playerFound = false;
  
  // Check up to one full cycle of players
  for (let i = 0; i < playerIds.length; i++) {
    // Move to next player (with wraparound)
    nextIndex = (nextIndex + 1) % playerIds.length;
    const nextPlayerId = playerIds[nextIndex];
    
    // Check if player has territories or a capital
    const hasTerritory = Object.values(gameState.territories).some(t => t.owner === nextPlayerId);
    
    if (hasTerritory) {
      playerFound = true;
      break;
    } else {
      // If player has no territories, mark them as eliminated
      if (!gameState.players[nextPlayerId].eliminated) {
        gameState.players[nextPlayerId].eliminated = true;
        io.emit('player-eliminated', {
          playerId: nextPlayerId,
          playerName: gameState.players[nextPlayerId].name
        });
        io.emit('game-log', `${gameState.players[nextPlayerId].name} has been eliminated from the game!`);
      }
    }
  }
  
  // If all players are eliminated except one, that player wins
  const remainingPlayers = playerIds.filter(id => 
    !gameState.players[id].eliminated && 
    Object.values(gameState.territories).some(t => t.owner === id)
  );
  
  if (remainingPlayers.length === 1) {
    io.emit('game-over', {
      winner: gameState.players[remainingPlayers[0]],
      reason: 'Last wizard standing!'
    });
    return;
  }
  
  // Set the turn to the next player with territories
  if (playerFound) {
    gameState.currentTurn = playerIds[nextIndex];
    const nextPlayerName = gameState.players[gameState.currentTurn].name;
    console.log(`Turn advanced to player: ${nextPlayerName}`);
  }
  
  io.emit('turn-update', gameState.currentTurn);
}

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 