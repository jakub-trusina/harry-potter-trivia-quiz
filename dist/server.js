import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { readFileSync } from 'fs';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
// Serve static files from the public directory
app.use(express.static(path.join(projectRoot, 'dist', 'public')));
// Serve compiled client-side JavaScript
app.use('/js', express.static(path.join(projectRoot, 'dist', 'public', 'js')));
// Serve index.html for all routes to support client-side routing
app.get('*', (_req, res) => {
    res.sendFile(path.join(projectRoot, 'dist', 'public', 'index.html'));
});
// Game state
const gameState = {
    territories: {},
    players: [],
    currentTurn: null,
    gameActive: false
};
// Load questions from JSON file
const questions = JSON.parse(readFileSync(path.join(projectRoot, 'src', 'data', 'questions.json'), 'utf-8'));
// Active duels map: territoryId -> { attackerId, defenderId, question, answers, round }
const activeQuestions = new Map();
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
function getRandomQuestion(territoryValue) {
    // Filter questions based on territory value
    const difficulty = territoryValue === 3 ? 'hard' :
        territoryValue === 2 ? 'medium' : 'easy';
    const filteredQuestions = questions.filter(q => q.difficulty === difficulty);
    // If no questions found for the difficulty, fall back to any question
    if (filteredQuestions.length === 0) {
        console.warn(`No questions found for difficulty ${difficulty}, falling back to any question`);
        return questions[Math.floor(Math.random() * questions.length)];
    }
    return filteredQuestions[Math.floor(Math.random() * filteredQuestions.length)];
}
// Helper function to check if a territory is connected to a capitol
function checkSupplyLine(territoryId, playerId) {
    const territory = gameState.territories[territoryId];
    if (!territory || territory.owner !== playerId)
        return false;
    // If it's a capitol, it always has a supply line
    if (territory.isCapitol)
        return true;
    // Check if there's a path to any capitol owned by the player
    const visited = new Set();
    const queue = [territoryId];
    while (queue.length > 0) {
        const currentId = queue.shift();
        if (visited.has(currentId))
            continue;
        visited.add(currentId);
        const current = gameState.territories[currentId];
        if (!current || current.owner !== playerId)
            continue;
        // If we found a capitol, we have a supply line
        if (current.isCapitol)
            return true;
        // Add adjacent territories to the queue
        const [x, y] = currentId.split('-').map(Number);
        const adjacent = getAdjacentTerritories(x, y, 6);
        queue.push(...adjacent);
    }
    // If we've searched all territories and found no path to a capitol,
    // and this territory is a capitol, it should have a supply line
    if (territory.isCapitol)
        return true;
    return false;
}
// Update supply lines for all territories of a player
function updateSupplyLines(playerId) {
    Object.values(gameState.territories).forEach(territory => {
        if (territory.owner === playerId) {
            territory.hasSupplyLine = checkSupplyLine(territory.id, playerId);
        }
    });
}
// Modify the processDuelResult function to handle supply lines
function processDuelResult(territoryId) {
    const duel = activeQuestions.get(territoryId);
    if (!duel)
        return;
    const { attackerId, defenderId, question, attackerAnswer, defenderAnswer, round } = duel;
    const territory = gameState.territories[territoryId];
    if (!territory || !attackerId)
        return;
    const attackingPlayer = gameState.players.find(p => p.id === attackerId);
    const defendingPlayer = defenderId ? gameState.players.find(p => p.id === defenderId) : null;
    if (!attackingPlayer)
        return;
    const result = {
        winner: null,
        attackerId,
        defenderId: defenderId || '',
        attackerCorrect: false,
        defenderCorrect: false,
        attackerTime: attackerAnswer?.responseTime || 15,
        defenderTime: defenderAnswer?.responseTime,
        attackerAnswer: attackerAnswer?.answer || -1,
        defenderAnswer: defenderAnswer?.answer,
        correctAnswer: question.correctAnswer,
        answerText: question.answers[question.correctAnswer],
        round,
        shieldsRemaining: territory.isCapitol ? (territory.shields || 2) : 0,
        unclaimedTerritory: !defenderId
    };
    // Determine correctness
    result.attackerCorrect = attackerAnswer?.answer === question.correctAnswer;
    if (defenderId) {
        result.defenderCorrect = defenderAnswer?.answer === question.correctAnswer;
    }
    // Update scores based on correct answers
    if (result.attackerCorrect) {
        attackingPlayer.score += territory.value;
    }
    if (defendingPlayer && result.defenderCorrect) {
        defendingPlayer.score += territory.value;
    }
    // For unclaimed territory
    if (!defenderId) {
        if (result.attackerCorrect) {
            // Attacker wins the territory if they answer correctly
            result.winner = 'attacker';
            territory.owner = attackerId;
            attackingPlayer.territories.push(territoryId);
            updateSupplyLines(attackerId);
        }
        // Move to next player's turn
        const currentPlayerIndex = gameState.players.findIndex(p => p.id === attackerId);
        let nextPlayerIndex = (currentPlayerIndex + 1) % gameState.players.length;
        while (gameState.players[nextPlayerIndex].territories.length === 0) {
            nextPlayerIndex = (nextPlayerIndex + 1) % gameState.players.length;
            if (nextPlayerIndex === currentPlayerIndex)
                break;
        }
        gameState.currentTurn = gameState.players[nextPlayerIndex].id;
    }
    else if (defendingPlayer) { // Only process normal battle if there's a defending player
        // Normal territory battle logic
        if (result.attackerCorrect) {
            if (!result.defenderCorrect) {
                result.winner = 'attacker';
            }
            else {
                result.winner = (result.attackerTime <= (result.defenderTime || 15)) ? 'attacker' : 'defender';
            }
        }
        else if (result.defenderCorrect) {
            result.winner = 'defender';
        }
        // Handle capitol shield system
        if (territory.isCapitol) {
            if (result.winner === 'attacker') {
                // Attacker won, reduce shields or life
                if (territory.shields === undefined) {
                    territory.shields = 2; // Initialize shields if not set
                }
                if (territory.shields > 0) {
                    // Reduce shields
                    territory.shields--;
                    result.shieldsRemaining = territory.shields;
                    result.continuing = true;
                    // Start next round immediately
                    const nextQuestion = getRandomQuestion(territory.value);
                    activeQuestions.set(territoryId, {
                        attackerId,
                        defenderId,
                        question: nextQuestion,
                        round: round + 1,
                        timeoutId: setTimeout(() => processDuelResult(territoryId), 20000)
                    });
                    // Emit next question to both players
                    io.to(attackerId).emit('question-start', { question: nextQuestion, role: 'attacker', round: round + 1 });
                    io.to(defenderId).emit('question-start', { question: nextQuestion, role: 'defender', round: round + 1 });
                }
                else {
                    // No shields left, this is the final life
                    territory.shields = -1; // Mark as having lost final life
                    result.shieldsRemaining = -1;
                    result.continuing = false;
                    // Territory is captured
                    territory.owner = attackerId;
                    attackingPlayer.territories.push(territoryId);
                    defendingPlayer.territories = defendingPlayer.territories.filter(t => t !== territoryId);
                    // Transfer all defender's territories to the attacker
                    defendingPlayer.territories.forEach(tId => {
                        const t = gameState.territories[tId];
                        if (t) {
                            t.owner = attackerId;
                            attackingPlayer.territories.push(tId);
                        }
                    });
                    defendingPlayer.territories = []; // Clear defender's territories
                    // Update supply lines for both players
                    updateSupplyLines(attackerId);
                    updateSupplyLines(defenderId);
                }
            }
            else {
                // Defender won or both lost, shield stays up and turn advances
                result.continuing = false;
            }
        }
        else {
            // Process normal territory transfer if attacker wins
            if (result.winner === 'attacker') {
                territory.owner = attackerId;
                attackingPlayer.territories.push(territoryId);
                defendingPlayer.territories = defendingPlayer.territories.filter(t => t !== territoryId);
                // Update supply lines for both players
                updateSupplyLines(attackerId);
                updateSupplyLines(defenderId);
            }
        }
        // Move to next player's turn only if the attack is not continuing
        if (!result.continuing) {
            const currentPlayerIndex = gameState.players.findIndex(p => p.id === attackerId);
            let nextPlayerIndex = (currentPlayerIndex + 1) % gameState.players.length;
            // Skip eliminated players when finding next turn
            while (gameState.players[nextPlayerIndex].territories.length === 0) {
                nextPlayerIndex = (nextPlayerIndex + 1) % gameState.players.length;
                // If we've gone through all players and found none with territories, break
                if (nextPlayerIndex === currentPlayerIndex)
                    break;
            }
            gameState.currentTurn = gameState.players[nextPlayerIndex].id;
        }
    }
    // Check for game end conditions
    const activePlayers = gameState.players.filter(p => p.territories.length > 0);
    if (activePlayers.length === 1) {
        // Last man standing wins
        const winner = activePlayers[0];
        io.emit('game-end', {
            winner: winner.id,
            winnerName: winner.name,
            reason: 'last-man-standing',
            finalScores: gameState.players.map(p => ({
                name: p.name,
                score: p.score
            }))
        });
        gameState.gameActive = false;
    }
    // Emit results and update game state
    io.emit('duel-result', result);
    io.emit('game-state-update', {
        territories: gameState.territories,
        players: gameState.players,
        currentTurn: gameState.currentTurn
    });
    // Clean up only if the attack is not continuing
    if (!result.continuing) {
        activeQuestions.delete(territoryId);
    }
}
// Helper function to get adjacent territory IDs
function getAdjacentTerritories(x, y, grid) {
    const adjacent = [];
    if (x > 0)
        adjacent.push(`${x - 1}-${y}`);
    if (x < grid - 1)
        adjacent.push(`${x + 1}-${y}`);
    if (y > 0)
        adjacent.push(`${x}-${y - 1}`);
    if (y < grid - 1)
        adjacent.push(`${x}-${y + 1}`);
    return adjacent;
}
// Helper function to find distance between two points
function getDistance(x1, y1, x2, y2) {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2); // Manhattan distance
}
// Helper function to find the farthest territory from enemy territories
function findCapitol(territories, enemyTerritories, grid) {
    let maxMinDistance = -1;
    let capitol = territories[0];
    territories.forEach(tId => {
        const [x1, y1] = tId.split('-').map(Number);
        let minDistance = Infinity;
        enemyTerritories.forEach(enemyId => {
            const [x2, y2] = enemyId.split('-').map(Number);
            const distance = getDistance(x1, y1, x2, y2);
            minDistance = Math.min(minDistance, distance);
        });
        if (minDistance > maxMinDistance) {
            maxMinDistance = minDistance;
            capitol = tId;
        }
    });
    return capitol;
}
function getCapitolPositions(numPlayers) {
    const grid = 6;
    function generatePositions() {
        let positions;
        // Base positions
        switch (numPlayers) {
            case 2:
                positions = [
                    { x: 0, y: 0 }, // Top-left
                    { x: grid - 1, y: grid - 1 } // Bottom-right
                ];
                break;
            case 3:
                positions = [
                    { x: 0, y: 0 }, // Top-left
                    { x: grid - 1, y: 0 }, // Top-right
                    { x: Math.floor(grid / 2), y: grid - 1 } // Bottom-middle
                ];
                break;
            case 4:
                positions = [
                    { x: 0, y: 0 }, // Top-left
                    { x: grid - 1, y: 0 }, // Top-right
                    { x: 0, y: grid - 1 }, // Bottom-left
                    { x: grid - 1, y: grid - 1 } // Bottom-right
                ];
                break;
            default:
                positions = [];
        }
        // Generate random transformations
        const transforms = {
            flipX: Math.random() < 0.5,
            flipY: Math.random() < 0.5,
            swapXY: Math.random() < 0.5
        };
        // Apply transformations
        positions = positions.map(pos => {
            let { x, y } = pos;
            if (transforms.flipX) {
                x = grid - 1 - x;
            }
            if (transforms.flipY) {
                y = grid - 1 - y;
            }
            if (transforms.swapXY) {
                [x, y] = [y, x];
            }
            return { x, y };
        });
        return { positions, transforms };
    }
    // Keep generating until we get valid positions (no overlaps)
    let result;
    let isValid = false;
    let attempts = 0;
    const maxAttempts = 10;
    while (!isValid && attempts < maxAttempts) {
        result = generatePositions();
        // Check for duplicates
        const seen = new Set();
        isValid = true;
        for (const pos of result.positions) {
            const key = `${pos.x},${pos.y}`;
            if (seen.has(key)) {
                isValid = false;
                break;
            }
            seen.add(key);
        }
        attempts++;
    }
    if (!isValid) {
        // If we couldn't generate valid positions with transformations,
        // fall back to the original untransformed positions
        console.warn('Failed to generate valid transformed positions, using default positions');
        result = {
            positions: (() => {
                switch (numPlayers) {
                    case 2:
                        return [
                            { x: 0, y: 0 },
                            { x: grid - 1, y: grid - 1 }
                        ];
                    case 3:
                        return [
                            { x: 0, y: 0 },
                            { x: grid - 1, y: 0 },
                            { x: Math.floor(grid / 2), y: grid - 1 }
                        ];
                    case 4:
                        return [
                            { x: 0, y: 0 },
                            { x: grid - 1, y: 0 },
                            { x: 0, y: grid - 1 },
                            { x: grid - 1, y: grid - 1 }
                        ];
                    default:
                        return [];
                }
            })(),
            transforms: { flipX: false, flipY: false, swapXY: false }
        };
    }
    // Shuffle the positions among players
    return shuffleArray(result.positions);
}
// Modify the distributeTerritories function to grow territories in a more natural way
function distributeTerritories() {
    const grid = 6;
    const numPlayers = gameState.players.length;
    const capitolPositions = getCapitolPositions(numPlayers);
    const totalTerritories = grid * grid;
    const territoriesPerPlayer = Math.floor(totalTerritories / numPlayers);
    // Initialize all territories as unclaimed
    const unclaimedTerritories = new Set();
    for (let x = 0; x < grid; x++) {
        for (let y = 0; y < grid; y++) {
            const id = `${x}-${y}`;
            unclaimedTerritories.add(id);
            gameState.territories[id] = {
                id,
                x,
                y,
                owner: null,
                value: 1, // Default value
                isCapitol: false
            };
        }
    }
    // Calculate territory scores for expansion priority
    function calculateTerritoryScore(territoryId, playerId) {
        const [tx, ty] = territoryId.split('-').map(Number);
        let score = 0;
        // Get the player's capitol position
        const playerCapitol = capitolPositions[gameState.players.findIndex(p => p.id === playerId)];
        // Calculate distance from capitol (closer is better)
        const distanceFromCapitol = Math.abs(tx - playerCapitol.x) + Math.abs(ty - playerCapitol.y);
        score -= distanceFromCapitol; // Negative score for distance (closer is better)
        // Count friendly neighbors (more is better)
        const adjacent = getAdjacentTerritories(tx, ty, grid);
        const friendlyNeighbors = adjacent.filter(id => gameState.territories[id]?.owner === playerId).length;
        score += friendlyNeighbors * 2;
        // Count enemy neighbors (fewer is better)
        const enemyNeighbors = adjacent.filter(id => gameState.territories[id]?.owner !== null &&
            gameState.territories[id]?.owner !== playerId).length;
        score -= enemyNeighbors * 3;
        // Prefer territories that don't create gaps
        const unclaimedNeighbors = adjacent.filter(id => gameState.territories[id]?.owner === null).length;
        score += unclaimedNeighbors;
        // Add some randomness to break ties (but keep it small)
        score += Math.random() * 0.5;
        return score;
    }
    // Assign territories to each player
    gameState.players.forEach((player, index) => {
        const playerTerritories = [];
        const capitol = capitolPositions[index];
        const capitolId = `${capitol.x}-${capitol.y}`;
        // Start with the capitol
        playerTerritories.push(capitolId);
        unclaimedTerritories.delete(capitolId);
        // Set the capitol
        gameState.territories[capitolId].value = 3;
        gameState.territories[capitolId].isCapitol = true;
        gameState.territories[capitolId].shields = 2;
        gameState.territories[capitolId].owner = player.id;
        // Grow territory until we have enough
        while (playerTerritories.length < territoriesPerPlayer) {
            // Find all possible territories we can expand to
            const expandableTerritories = new Set();
            // For each owned territory
            playerTerritories.forEach(tId => {
                const [x, y] = tId.split('-').map(Number);
                const adjacent = getAdjacentTerritories(x, y, grid);
                // Add all unclaimed adjacent territories as candidates
                adjacent.forEach(adjId => {
                    if (unclaimedTerritories.has(adjId)) {
                        expandableTerritories.add(adjId);
                    }
                });
            });
            // If no expansion is possible, break
            if (expandableTerritories.size === 0)
                break;
            // Score each possible territory
            const scoredTerritories = Array.from(expandableTerritories).map(tId => ({
                id: tId,
                score: calculateTerritoryScore(tId, player.id)
            }));
            // Sort by score (highest first) and take the best one
            scoredTerritories.sort((a, b) => b.score - a.score);
            const chosenTerritory = scoredTerritories[0].id;
            // Claim the territory
            playerTerritories.push(chosenTerritory);
            unclaimedTerritories.delete(chosenTerritory);
            gameState.territories[chosenTerritory].owner = player.id;
            // Set random value (1-3) for non-capitol territory
            gameState.territories[chosenTerritory].value = Math.floor(Math.random() * 3) + 1;
        }
        // Store the territories in the player object
        player.territories = playerTerritories;
    });
    // After distributing territories, update supply lines for all players
    gameState.players.forEach(player => {
        updateSupplyLines(player.id);
    });
    console.log('🏰 Territories distributed among players with strategic capitol placement');
    // Log territory distribution for verification
    gameState.players.forEach(player => {
        console.log(`Player ${player.name} has ${player.territories.length} territories`);
    });
}
// Modify the startGame function to ensure random turn order
function startGame() {
    if (gameState.players.length < 2 || gameState.players.length > 4) {
        console.log('❌ Cannot start game: Invalid number of players');
        return;
    }
    // Shuffle player order first
    gameState.players = shuffleArray([...gameState.players]);
    // Define available houses
    const houses = ['Gryffindor', 'Slytherin', 'Ravenclaw', 'Hufflepuff'];
    // Shuffle and assign houses to players
    const shuffledHouses = shuffleArray([...houses]);
    gameState.players.forEach((player, index) => {
        player.house = shuffledHouses[index];
    });
    // Randomly select first player
    const firstPlayerIndex = Math.floor(Math.random() * gameState.players.length);
    gameState.currentTurn = gameState.players[firstPlayerIndex].id;
    gameState.gameActive = true;
    // Distribute territories
    distributeTerritories();
    // Emit game start event with player order, house assignments, and territories
    io.emit('game-start', {
        players: gameState.players.map(p => ({
            id: p.id,
            name: p.name,
            house: p.house,
            territories: p.territories,
            score: p.score
        })),
        currentTurn: gameState.currentTurn,
        territories: gameState.territories
    });
    console.log('🎮 Game started with randomized player order and house assignments');
    console.log(`First player to move: ${gameState.players[firstPlayerIndex].name}`);
}
// Socket.IO event handlers
io.on('connection', (socket) => {
    console.log('👋 New connection from socket:', socket.id);
    console.log('🔍 Total connected clients:', io.engine.clientsCount);
    socket.on('join-game', (playerName) => {
        console.log(`🧙‍♂️ Player "${playerName}" (${socket.id}) is trying to join the game`);
        console.log('📝 Current game state:', gameState);
        const newPlayer = {
            id: socket.id,
            name: playerName,
            territories: [],
            score: 0,
            eliminated: false
        };
        gameState.players.push(newPlayer);
        console.log('📝 Current players in game:', gameState.players.map(p => `${p.name} (${p.id})`));
        io.emit('player-list-update', gameState.players);
        console.log('✅ Player list update sent to all clients');
    });
    socket.on('start-game', () => {
        console.log('🎮 Attempting to start game...');
        startGame();
    });
    socket.on('disconnect', () => {
        const playerIndex = gameState.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
            const player = gameState.players[playerIndex];
            console.log(`👋 Player "${player.name}" (${socket.id}) disconnected`);
            gameState.players.splice(playerIndex, 1);
            io.emit('player-list-update', gameState.players);
            console.log('📝 Updated player list after disconnect:', gameState.players.map(p => `${p.name} (${p.id})`));
        }
        else {
            console.log('👋 Unknown socket disconnected:', socket.id);
        }
    });
    socket.on('attack-territory', (territoryId) => {
        console.log(`⚔️ Player ${socket.id} is attacking territory ${territoryId}`);
        // Validate the attack
        if (!gameState.gameActive) {
            console.log('❌ Game is not active');
            return;
        }
        if (gameState.currentTurn !== socket.id) {
            console.log('❌ Not this player\'s turn');
            return;
        }
        const territory = gameState.territories[territoryId];
        if (!territory) {
            console.log('❌ Invalid territory');
            return;
        }
        if (territory.owner === socket.id) {
            console.log('❌ Cannot attack own territory');
            return;
        }
        // Check if the territory is adjacent to any of the attacker's territories
        const [tx, ty] = territory.id.split('-').map(Number);
        const hasAdjacentTerritory = Object.values(gameState.territories).some(t => {
            if (t.owner !== socket.id)
                return false;
            const [x, y] = t.id.split('-').map(Number);
            const dx = Math.abs(x - tx);
            const dy = Math.abs(y - ty);
            return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
        });
        if (!hasAdjacentTerritory) {
            console.log('❌ Territory is not adjacent to any of the attacker\'s territories');
            return;
        }
        // Start a new duel
        const question = getRandomQuestion(territory.value);
        if (!territory.owner) {
            // For unclaimed territory, only the attacker needs to answer
            activeQuestions.set(territoryId, {
                attackerId: socket.id,
                defenderId: '', // No defender for unclaimed territory
                question,
                round: 0,
                timeoutId: setTimeout(() => processDuelResult(territoryId), 20000)
            });
            // Only emit question to attacker
            socket.emit('question-start', {
                question,
                role: 'attacker',
                round: 0,
                unclaimedTerritory: true
            });
        }
        else {
            // Normal duel for claimed territory
            activeQuestions.set(territoryId, {
                attackerId: socket.id,
                defenderId: territory.owner,
                question,
                round: territory.isCapitol ? 1 : 0, // Start with round 1 for capitols
                timeoutId: setTimeout(() => processDuelResult(territoryId), 20000)
            });
            // Emit question to both players
            socket.emit('question-start', {
                question,
                role: 'attacker',
                round: territory.isCapitol ? 1 : 0
            });
            io.to(territory.owner).emit('question-start', {
                question,
                role: 'defender',
                round: territory.isCapitol ? 1 : 0
            });
        }
    });
    socket.on('submit-answer', (answer) => {
        const activeDuels = Array.from(activeQuestions.entries());
        const duel = activeDuels.find(([_, d]) => d.attackerId === socket.id || d.defenderId === socket.id);
        if (!duel)
            return;
        const [territoryId, duelData] = duel;
        if (socket.id === duelData.attackerId) {
            duelData.attackerAnswer = answer;
        }
        else if (socket.id === duelData.defenderId) {
            duelData.defenderAnswer = answer;
        }
        // For unclaimed territories, process immediately after attacker answers
        if (!duelData.defenderId && duelData.attackerAnswer) {
            if (duelData.timeoutId) {
                clearTimeout(duelData.timeoutId);
            }
            processDuelResult(territoryId);
        }
        // For normal duels, wait for both answers or timeout
        else if (duelData.attackerAnswer && duelData.defenderAnswer) {
            if (duelData.timeoutId) {
                clearTimeout(duelData.timeoutId);
            }
            processDuelResult(territoryId);
        }
    });
});
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});
//# sourceMappingURL=server.js.map