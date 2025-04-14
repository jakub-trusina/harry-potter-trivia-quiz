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
const gameState = {
    territories: {},
    players: [],
    currentTurn: null,
    gameActive: false
};
// Load questions from JSON file
const questions = JSON.parse(readFileSync(path.join(projectRoot, 'src', 'data', 'questions.json'), 'utf-8'));
// Log basic info about questions loaded
console.log(`Loaded ${questions.length} questions from JSON file`);
// Normalize question data to use text property consistently
questions.forEach(q => {
    if (q.question && !q.text) {
        q.text = q.question;
    }
});
// Check for any remaining issues
const questionsWithoutText = questions.filter(q => !q.text);
if (questionsWithoutText.length > 0) {
    console.warn(`⚠️ WARNING: ${questionsWithoutText.length} questions have missing 'text' property after normalization`);
    console.warn(`Example of first problematic question:`, questionsWithoutText[0]);
}
const activeQuestions = new Map();
const activeDuels = new Map();
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
function getRandomQuestion(territoryValue) {
    // Map territory value to difficulty
    const difficulty = territoryValue === 3 ? "hard" :
        territoryValue === 2 ? "medium" : "easy";
    const filteredQuestions = questions.filter(q => q.difficulty === difficulty);
    // If no questions found for the difficulty, fall back to any question
    if (filteredQuestions.length === 0) {
        console.warn(`No questions found for difficulty ${difficulty}, falling back to any question`);
    }
    // Get a random question
    const randomQuestions = filteredQuestions.length > 0 ? filteredQuestions : questions;
    const question = randomQuestions[Math.floor(Math.random() * randomQuestions.length)];
    // Add fallback text if missing
    if (!question.text) {
        console.warn(`Question ${question.id} is missing text property, using fallback`);
        // Add default text based on the answers available
        if (question.answers && question.answers.length > 0) {
            if (question.correctAnswer !== undefined) {
                const correctAnswerIndex = typeof question.correctAnswer === 'number'
                    ? question.correctAnswer
                    : question.answers.indexOf(question.correctAnswer);
                const correctAnswer = question.answers[correctAnswerIndex] || "Unknown";
                question.text = `Which of these is correct? The answer is ${correctAnswer}`;
            }
            else {
                question.text = `Select the correct answer from the options below`;
            }
        }
        else {
            question.text = `Question ${question.id}`;
        }
    }
    return question;
}
// Helper function to check if a territory is connected to a capitol
function checkSupplyLine(territoryId, playerId) {
    const territory = gameState.territories[territoryId];
    if (!territory || territory.owner !== playerId)
        return false;
    // If it's a capitol, it always has a supply line
    if (territory.isCapitol)
        return true;
    // Find the player's capitol
    const capitol = Object.values(gameState.territories)
        .find(t => t.owner === playerId && t.isCapitol);
    if (!capitol)
        return false;
    // Start BFS from the capitol to find all connected territories
    const visited = new Set();
    const queue = [capitol.id];
    visited.add(capitol.id);
    while (queue.length > 0) {
        const currentId = queue.shift();
        const [tx, ty] = currentId.split('-').map(Number);
        const adjacent = getAdjacentTerritories(tx, ty, 6);
        for (const adjId of adjacent) {
            if (visited.has(adjId))
                continue;
            const adjTerritory = gameState.territories[adjId];
            if (adjTerritory && adjTerritory.owner === playerId) {
                visited.add(adjId);
                queue.push(adjId);
            }
        }
    }
    return visited.has(territoryId);
}
// Update supply lines for all territories of a player
function updateSupplyLines(playerId) {
    return new Promise((resolve) => {
        const player = gameState.players.find(p => p.id === playerId);
        if (!player) {
            resolve();
            return;
        }
        // Reset supply lines
        player.supplyLines = [];
        // Find all territories owned by the player
        const ownedTerritories = Object.values(gameState.territories)
            .filter(t => t.owner === playerId);
        // First, find all territories that have a path to capitol
        const territoriesWithSupplyLine = new Set();
        for (const territoryId of ownedTerritories.map(t => t.id)) {
            if (checkSupplyLine(territoryId, playerId)) {
                territoriesWithSupplyLine.add(territoryId);
                // Update territory's hasSupplyLine property
                gameState.territories[territoryId].hasSupplyLine = true;
            }
            else {
                // Mark territory as disconnected
                gameState.territories[territoryId].hasSupplyLine = false;
            }
        }
        // Create supply lines between connected territories that both have paths to capitol
        for (const territoryId of territoriesWithSupplyLine) {
            const [tx, ty] = territoryId.split('-').map(Number);
            // Check all adjacent territories
            for (const adjacentId of territoriesWithSupplyLine) {
                if (territoryId === adjacentId)
                    continue;
                const [ax, ay] = adjacentId.split('-').map(Number);
                const dx = Math.abs(tx - ax);
                const dy = Math.abs(ty - ay);
                // If they're adjacent, add a supply line
                if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
                    player.supplyLines.push({
                        from: territoryId,
                        to: adjacentId
                    });
                }
            }
        }
        resolve();
    });
}
function acquireDuelLock(duelId) {
    if (activeDuels.has(duelId)) {
        return false;
    }
    activeDuels.set(duelId, {
        attackerId: '',
        defenderId: '',
        territory: duelId, // Using duelId as territory since it contains territory info
        observers: new Set(),
        currentQuestion: null,
        answers: new Map(),
        observerAnswers: new Map(),
        isActive: true
    });
    return true;
}
function releaseDuelLock(duelId) {
    activeDuels.delete(duelId);
}
function processDuelResult(result) {
    // Use a lock for result processing
    const duelId = `${result.attackerId}-${result.territoryId}`;
    if (!acquireDuelLock(duelId)) {
        console.log('❌ Duel result is already being processed');
        return;
    }
    try {
        const attackerCorrect = result.attackerCorrect;
        const defenderCorrect = result.defenderCorrect ?? false;
        if (!result.defenderId || result.type === 'unclaimed') {
            result.winner = attackerCorrect ? 'attacker' : null;
        }
        else {
            if (attackerCorrect && !defenderCorrect) {
                result.winner = 'attacker';
            }
            else if (!attackerCorrect && defenderCorrect) {
                result.winner = 'defender';
            }
            else if (attackerCorrect && defenderCorrect) {
                // Both correct - compare response times
                const attackerTime = result.attackerResponseTime || Infinity;
                const defenderTime = result.defenderResponseTime || Infinity;
                result.winner = attackerTime <= defenderTime ? 'attacker' : 'defender';
            }
            else {
                result.winner = null;
            }
        }
        // Update territory ownership and supply lines synchronously
        if (result.winner === 'attacker') {
            const territory = gameState.territories[result.territoryId];
            if (!territory) {
                console.error('❌ Territory not found:', result.territoryId);
                return;
            }
            try {
                // First update the defender's territories and supply lines
                if (territory.owner) {
                    const defender = gameState.players.find(p => p.id === territory.owner);
                    if (defender) {
                        defender.territories = defender.territories.filter(t => t !== result.territoryId);
                        // Update defender's supply lines immediately
                        updateSupplyLines(defender.id).then(() => {
                            // After defender's supply lines are updated, update attacker's ownership
                            territory.owner = result.attackerId;
                            const attacker = gameState.players.find(p => p.id === result.attackerId);
                            if (!attacker) {
                                console.error('❌ Attacker not found:', result.attackerId);
                                return;
                            }
                            if (!attacker.territories.includes(result.territoryId)) {
                                attacker.territories.push(result.territoryId);
                            }
                            // Update all players' supply lines after ownership change
                            const supplyLineUpdates = Promise.all(gameState.players.map(player => updateSupplyLines(player.id)));
                            // Wait for all supply line updates to complete before emitting result
                            supplyLineUpdates.then(() => {
                                // Emit result to all players
                                io.emit('duel-result', result);
                                // Clean up active questions
                                activeQuestions.delete(result.attackerId);
                                if (result.defenderId) {
                                    activeQuestions.delete(result.defenderId);
                                }
                                // Move to next player's turn after a short delay
                                setTimeout(() => {
                                    nextTurn();
                                }, 5000);
                            });
                        });
                    }
                }
                else {
                    // If territory was unclaimed, simply update attacker's ownership
                    territory.owner = result.attackerId;
                    const attacker = gameState.players.find(p => p.id === result.attackerId);
                    if (!attacker) {
                        console.error('❌ Attacker not found:', result.attackerId);
                        return;
                    }
                    if (!attacker.territories.includes(result.territoryId)) {
                        attacker.territories.push(result.territoryId);
                    }
                    // Update supply lines and emit result
                    updateSupplyLines(result.attackerId).then(() => {
                        io.emit('duel-result', result);
                        activeQuestions.delete(result.attackerId);
                        setTimeout(() => {
                            nextTurn();
                        }, 5000);
                    });
                }
            }
            catch (error) {
                console.error('❌ Error updating territory ownership:', error);
                return;
            }
        }
        else {
            // If no ownership change, just emit the result
            io.emit('duel-result', result);
            activeQuestions.delete(result.attackerId);
            if (result.defenderId) {
                activeQuestions.delete(result.defenderId);
            }
            setTimeout(() => {
                nextTurn();
            }, 5000);
        }
    }
    finally {
        releaseDuelLock(duelId);
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
// Add debug function to help diagnose capitol issues
function debugCapitols() {
    console.log("\n🔍🔍🔍 DEBUGGING CAPITOL TERRITORIES 🔍🔍🔍");
    // Find all capitols
    const capitols = Object.values(gameState.territories)
        .filter((t) => t.isCapitol)
        .map(t => ({
        id: t.id,
        owner: t.owner,
        ownerName: gameState.players.find(p => p.id === t.owner)?.name
    }));
    console.log("🏰 Capitol territories:", capitols);
    // Check territory connections for each player
    gameState.players.forEach(player => {
        const ownedTerritories = Object.values(gameState.territories)
            .filter(t => t.owner === player.id);
        const capitol = ownedTerritories.find(t => t.isCapitol);
        console.log(`👤 Player ${player.name} (${player.id}):`);
        console.log(`   Territories: ${ownedTerritories.map(t => t.id).join(', ')}`);
        console.log(`   Capitol: ${capitol ? capitol.id : 'None'}`);
        // Check all territories for path to capitol
        ownedTerritories.forEach(territory => {
            if (!territory.isCapitol) {
                // Check if this territory has a path to the player's capitol
                const hasPath = checkSupplyLine(territory.id, player.id);
                console.log(`   Territory ${territory.id} connected to capitol: ${hasPath}`);
                // If no path, let's investigate why
                if (!hasPath && capitol) {
                    const [tx, ty] = territory.id.split('-').map(Number);
                    const [cx, cy] = capitol.id.split('-').map(Number);
                    console.log(`   ❌ No path from ${territory.id} to capitol ${capitol.id}`);
                    console.log(`      Distance: dx=${Math.abs(tx - cx)}, dy=${Math.abs(ty - cy)}`);
                    // Check if adjacent to capitol directly
                    const isAdjacent = (Math.abs(tx - cx) === 1 && Math.abs(ty - cy) === 0) ||
                        (Math.abs(tx - cx) === 0 && Math.abs(ty - cy) === 1);
                    if (isAdjacent) {
                        console.log(`      ✅ Territory is adjacent to capitol, should have direct connection`);
                    }
                    else {
                        console.log(`      ❌ Territory is not adjacent to capitol, requires path through connected territories`);
                    }
                }
            }
        });
    });
    console.log("🔍🔍🔍 END CAPITOL DEBUGGING 🔍🔍🔍\n");
}
// Call the debug function after distributing territories
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
    // After distributing territories, run debug
    debugCapitols();
    // Then update supply lines for all players
    gameState.players.forEach(player => {
        updateSupplyLines(player.id);
    });
    // Check if all territories are properly connected
    console.log("\n🔄 Verifying territory connections after updates");
    gameState.players.forEach(player => {
        const ownedTerritories = Object.values(gameState.territories)
            .filter(t => t.owner === player.id);
        const unconnectedTerritories = ownedTerritories.filter(t => !t.isCapitol && !checkSupplyLine(t.id, player.id));
        if (unconnectedTerritories.length > 0) {
            console.log(`❌ Player ${player.name} has ${unconnectedTerritories.length} unconnected territories: ${unconnectedTerritories.map(t => t.id).join(', ')}`);
        }
        else {
            console.log(`✅ All territories for player ${player.name} are properly connected to their capitol`);
        }
    });
    console.log('🏰 Territories distributed among players with strategic capitol placement');
    // Log territory distribution for verification
    gameState.players.forEach(player => {
        console.log(`Player ${player.name} has ${player.territories.length} territories`);
    });
}
// Helper function to fix supply connections for all player territories
function fixAllSupplyConnections() {
    console.log("\n🔧 Fixing all supply connections for all players");
    gameState.players.forEach(player => {
        console.log(`\n👤 Fixing supply connections for player ${player.name}`);
        // Get all territories owned by this player
        const ownedTerritories = Object.values(gameState.territories)
            .filter((t) => t.owner === player.id);
        // Find the player's capitol
        const capitol = ownedTerritories.find(t => t.isCapitol);
        if (!capitol) {
            console.log(`❌ No capitol found for player ${player.name}`);
            return;
        }
        console.log(`🏰 Found capitol at ${capitol.id}`);
        // Update supply lines
        updateSupplyLines(player.id);
    });
    console.log("✅ Supply connection fixing complete");
}
// Modified startGame function that ensures proper supply lines
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
    // Fix all supply connections
    fixAllSupplyConnections();
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
function nextTurn() {
    const currentPlayerIndex = gameState.players.findIndex(p => p.id === gameState.currentTurn);
    let nextPlayerIndex = (currentPlayerIndex + 1) % gameState.players.length;
    // Skip eliminated players
    while (gameState.players[nextPlayerIndex].territories.length === 0) {
        nextPlayerIndex = (nextPlayerIndex + 1) % gameState.players.length;
        if (nextPlayerIndex === currentPlayerIndex)
            break;
    }
    gameState.currentTurn = gameState.players[nextPlayerIndex].id;
    // Emit updated game state
    io.emit('game-state-update', {
        territories: gameState.territories,
        players: gameState.players,
        currentTurn: gameState.currentTurn
    });
}
function findPlayerDuel(playerId) {
    // First check in activeDuels
    for (const [_, duel] of activeDuels) {
        if (duel.attackerId === playerId ||
            duel.defenderId === playerId ||
            duel.observers.has(playerId)) {
            return duel;
        }
    }
    // If not found, check in activeQuestions
    console.log(`Looking for duel with player ${playerId} in activeQuestions`);
    for (const [attackerId, duel] of activeQuestions) {
        console.log(`Checking duel: attackerId=${attackerId}, defenderId=${duel.defenderId}`);
        if (duel.attackerId === playerId ||
            duel.defenderId === playerId ||
            duel.observers.has(playerId)) {
            console.log(`Found duel in activeQuestions for player ${playerId}`);
            return duel;
        }
    }
    console.log(`No duel found for player ${playerId} in either activeDuels or activeQuestions`);
    return undefined;
}
function createDuel(attackerId, defenderId, territory) {
    const duel = {
        attackerId,
        defenderId,
        territory,
        observers: new Set(),
        currentQuestion: null,
        answers: new Map(),
        observerAnswers: new Map(),
        isActive: true
    };
    activeDuels.set(`${attackerId}-${defenderId}`, duel);
    return duel;
}
function addObserverToDuel(duelId, observerId) {
    const duel = activeDuels.get(duelId);
    if (!duel)
        return false;
    duel.observers.add(observerId);
    return true;
}
function processDuelResults(duel) {
    if (!duel.currentQuestion)
        return;
    const attackerAnswer = duel.answers.get(duel.attackerId) ?? false;
    const defenderAnswer = duel.answers.get(duel.defenderId) ?? false;
    const attackerResponseTime = duel.responseTime?.get(duel.attackerId);
    const defenderResponseTime = duel.responseTime?.get(duel.defenderId);
    const correctAnswerString = typeof duel.currentQuestion.correctAnswer === 'number'
        ? duel.currentQuestion.answers[duel.currentQuestion.correctAnswer]
        : String(duel.currentQuestion.correctAnswer);
    const result = {
        type: 'claimed',
        attackerCorrect: attackerAnswer,
        defenderCorrect: defenderAnswer,
        attackerId: duel.attackerId,
        defenderId: duel.defenderId,
        territoryId: duel.territory,
        correctAnswer: correctAnswerString,
        attackerResponseTime,
        defenderResponseTime,
        observerResults: Array.from(duel.observerAnswers.entries()).map(([observerId, answer]) => ({
            playerId: observerId,
            answer: answer ? correctAnswerString : '',
            correct: answer,
            responseTime: duel.responseTime?.get(observerId),
            scoreGained: answer ? 10 : 0
        }))
    };
    processDuelResult(result);
    activeDuels.delete(`${duel.attackerId}-${duel.defenderId}`);
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
            eliminated: false,
            supplyLines: []
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
        console.log(`\n⚔️ Player ${socket.id} is attacking territory ${territoryId}`);
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
        // Check if there's any adjacent territory owned by the attacker with a supply line
        const [tx, ty] = territoryId.split('-').map(Number);
        const adjacentTerritories = getAdjacentTerritories(tx, ty, 6);
        const validAttackingTerritories = adjacentTerritories.filter(adjId => {
            const adjTerritory = gameState.territories[adjId];
            return adjTerritory &&
                adjTerritory.owner === socket.id &&
                checkSupplyLine(adjId, socket.id);
        });
        if (validAttackingTerritories.length === 0) {
            console.log('❌ No adjacent territory with supply line to attack from');
            socket.emit('attack-error', 'You need to connect this territory to your capitol before attacking from here!');
            return;
        }
        console.log('✅ Attack validation passed, proceeding with duel...');
        // Get all players who are not the attacker or defender
        const observers = gameState.players
            .filter(p => p.id !== socket.id && p.id !== territory.owner)
            .map(p => p.id);
        // Create duel data
        const duelData = {
            attackerId: socket.id,
            defenderId: territory.owner || '',
            territory: territoryId,
            observers: new Set(observers),
            currentQuestion: null,
            answers: new Map(),
            observerAnswers: new Map(),
            isActive: true,
            round: territory.isCapitol ? 1 : 0
        };
        // Store the duel data
        activeQuestions.set(socket.id, duelData);
        // First, emit duel-started event to all participants
        socket.emit('duel-started', { role: 'attacker' });
        if (territory.owner) {
            io.to(territory.owner).emit('duel-started', { role: 'defender' });
        }
        observers.forEach(observerId => {
            io.to(observerId).emit('duel-started', { role: 'observer' });
        });
        // Wait a short moment for clients to prepare their UI
        setTimeout(() => {
            // Get a random question
            const question = getRandomQuestion(territory.value);
            duelData.currentQuestion = question;
            // For debugging
            console.log("Question to be emitted:", {
                id: question.id,
                text: question.text,
                correctAnswer: question.correctAnswer,
                difficulty: question.difficulty,
                answersCount: question.answers.length
            });
            // Emit question to attacker with fixed structure
            socket.emit('question', {
                question: question.text, // Ensure this is included
                answers: question.answers,
                role: 'attacker'
            });
            // Emit question to defender if exists
            if (territory.owner) {
                io.to(territory.owner).emit('question', {
                    question: question.text, // Ensure this is included
                    answers: question.answers,
                    role: 'defender'
                });
            }
            // Emit question to observers
            observers.forEach(observerId => {
                io.to(observerId).emit('question', {
                    question: question.text, // Ensure this is included
                    answers: question.answers,
                    role: 'observer'
                });
            });
            // Set timeout for answer submission
            duelData.timeoutId = setTimeout(() => {
                const duelData = activeQuestions.get(socket.id);
                if (duelData && duelData.currentQuestion) {
                    const correctAnswerString = typeof duelData.currentQuestion.correctAnswer === 'number'
                        ? duelData.currentQuestion.answers[duelData.currentQuestion.correctAnswer]
                        : String(duelData.currentQuestion.correctAnswer);
                    const result = {
                        type: 'claimed',
                        attackerCorrect: false,
                        defenderCorrect: false,
                        attackerId: socket.id,
                        defenderId: duelData.defenderId,
                        territoryId: duelData.territory,
                        correctAnswer: correctAnswerString,
                        observerResults: Array.from(duelData.observerAnswers.entries()).map(([observerId, answer]) => ({
                            playerId: observerId,
                            answer: answer ? correctAnswerString : '',
                            correct: answer,
                            scoreGained: answer ? 10 : 0
                        }))
                    };
                    processDuelResult(result);
                }
            }, 20000); // 20 seconds timeout
        }, 1000); // Wait 1 second before sending questions
    });
    socket.on('submit-answer', (answer) => {
        console.log(`===============================================`);
        console.log(`📝 Player ${socket.id} submitted answer:`, answer);
        const playerId = socket.id;
        const duel = findPlayerDuel(playerId);
        if (!duel || !duel.currentQuestion) {
            console.error('❌ No active duel found for player', playerId);
            return;
        }
        // Initialize response time map if it doesn't exist
        if (!duel.responseTime) {
            duel.responseTime = new Map();
        }
        // Calculate response time (time since question was sent)
        const responseTime = duel.questionSentTime ? (Date.now() - duel.questionSentTime) / 1000 : 0; // Convert to seconds
        duel.responseTime.set(playerId, responseTime);
        // Helper function to normalize strings for comparison
        const normalizeForComparison = (str) => {
            return str.toLowerCase().trim();
        };
        // Properly evaluate the answer based on the correctAnswer type
        if (playerId === duel.attackerId || playerId === duel.defenderId) {
            // Handle numeric correctAnswer indexes correctly
            let isCorrect = false;
            if (typeof duel.currentQuestion?.correctAnswer === 'number') {
                // For numeric indices, find the index of the player's answer in the answers array
                const answerIndex = duel.currentQuestion.answers.findIndex(a => normalizeForComparison(a) === normalizeForComparison(answer));
                console.log(`📊 Index-based evaluation: Player answer "${answer}" is at index ${answerIndex}, correct index is ${duel.currentQuestion.correctAnswer}`);
                isCorrect = answerIndex === duel.currentQuestion.correctAnswer;
            }
            else {
                const correctAnswerValue = duel.currentQuestion?.correctAnswer;
                const normalizedAnswer = normalizeForComparison(answer);
                const normalizedCorrect = correctAnswerValue ? normalizeForComparison(correctAnswerValue) : '';
                console.log(`📊 String-based evaluation: "${normalizedAnswer}" === "${normalizedCorrect}"`);
                isCorrect = normalizedAnswer === normalizedCorrect;
            }
            console.log(`📊 Final evaluation result: ${isCorrect}`);
            duel.answers.set(playerId, isCorrect);
        }
        else if (duel.observers.has(playerId)) {
            // Similar logic for observers
            let isCorrect = false;
            if (typeof duel.currentQuestion?.correctAnswer === 'number') {
                const answerIndex = duel.currentQuestion.answers.findIndex(a => normalizeForComparison(a) === normalizeForComparison(answer));
                isCorrect = answerIndex === duel.currentQuestion.correctAnswer;
            }
            else {
                const correctAnswerValue = duel.currentQuestion?.correctAnswer;
                const normalizedAnswer = normalizeForComparison(answer);
                const normalizedCorrect = correctAnswerValue ? normalizeForComparison(correctAnswerValue) : '';
                isCorrect = normalizedAnswer === normalizedCorrect;
            }
            duel.observerAnswers.set(playerId, isCorrect);
        }
        // Check if all required players have answered
        if ((duel.attackerId && duel.defenderId && duel.answers.size === 2) ||
            (!duel.defenderId && duel.answers.has(duel.attackerId))) {
            // Clear the timeout so it doesn't process twice
            if (duel.timeoutId) {
                clearTimeout(duel.timeoutId);
                duel.timeoutId = undefined;
            }
            // Process results immediately
            processDuelResults(duel);
        }
    });
    socket.on('reset-supply-lines', () => {
        console.log('🔄 Admin requested supply line reset');
        if (socket.id !== gameState.players[0]?.id) {
            console.log('❌ Only the first player can reset supply lines');
            return;
        }
        fixAllSupplyConnections();
        // Send updated game state to all clients
        io.emit('game-state-update', {
            territories: gameState.territories,
            players: gameState.players,
            currentTurn: gameState.currentTurn
        });
        console.log('✅ Supply lines reset complete');
    });
    socket.on('start-duel', (data) => {
        const { attackerId, defenderId, territory } = data;
        const duelId = `${attackerId}-${defenderId}`;
        // Create duel data
        const duelData = {
            attackerId,
            defenderId,
            territory,
            observers: new Set(),
            currentQuestion: null,
            answers: new Map(),
            observerAnswers: new Map(),
            isActive: true
        };
        activeDuels.set(duelId, duelData);
        // Emit duel start to both players
        io.to(attackerId).emit('duel-started', { role: 'attacker' });
        io.to(defenderId).emit('duel-started', { role: 'defender' });
        // Get a random question and send it
        const question = getRandomQuestion(gameState.territories[territory].value);
        duelData.currentQuestion = question;
        // For debugging
        console.log("Question to be emitted in start-duel:", {
            id: question.id,
            text: question.text,
            correctAnswer: question.correctAnswer,
            difficulty: question.difficulty,
            answersCount: question.answers.length
        });
        // Send question to both players
        io.to(attackerId).emit('question', {
            question: question.text, // Ensure this is included
            answers: question.answers,
            role: 'attacker'
        });
        io.to(defenderId).emit('question', {
            question: question.text, // Ensure this is included
            answers: question.answers,
            role: 'defender'
        });
    });
});
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});
//# sourceMappingURL=server.js.map