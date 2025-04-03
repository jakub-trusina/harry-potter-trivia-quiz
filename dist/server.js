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
// Active duels map: territoryId -> { attackerId, defenderId, question, answers }
const activeQuestions = new Map();
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
function processDuelResult(territoryId) {
    const duel = activeQuestions.get(territoryId);
    if (!duel)
        return;
    const { attackerId, defenderId, question, attackerAnswer, defenderAnswer } = duel;
    const territory = gameState.territories[territoryId];
    if (!territory || !attackerId || !defenderId)
        return;
    const attackingPlayer = gameState.players.find(p => p.id === attackerId);
    const defendingPlayer = gameState.players.find(p => p.id === defenderId);
    if (!attackingPlayer || !defendingPlayer)
        return;
    const result = {
        winner: null,
        attackerId,
        defenderId,
        attackerCorrect: false,
        defenderCorrect: false,
        attackerTime: attackerAnswer?.responseTime || 15,
        defenderTime: defenderAnswer?.responseTime,
        attackerAnswer: attackerAnswer?.answer || -1,
        defenderAnswer: defenderAnswer?.answer,
        correctAnswer: question.correctAnswer,
        answerText: question.answers[question.correctAnswer]
    };
    // Determine correctness
    result.attackerCorrect = attackerAnswer?.answer === question.correctAnswer;
    result.defenderCorrect = defenderAnswer?.answer === question.correctAnswer;
    // Update scores based on correct answers
    if (result.attackerCorrect) {
        attackingPlayer.score += territory.value;
    }
    if (result.defenderCorrect) {
        defendingPlayer.score += territory.value;
    }
    // Determine territory winner (for territory control only)
    if (result.attackerCorrect) {
        if (!result.defenderCorrect) {
            result.winner = 'attacker';
        }
        else {
            // Both correct, faster response wins territory
            result.winner = (result.attackerTime <= (result.defenderTime || 15)) ? 'attacker' : 'defender';
        }
    }
    else if (result.defenderCorrect) {
        result.winner = 'defender';
    }
    // Process territory transfer if attacker wins
    if (result.winner === 'attacker') {
        territory.owner = attackerId;
        attackingPlayer.territories.push(territoryId);
        defendingPlayer.territories = defendingPlayer.territories.filter(t => t !== territoryId);
        // If the captured territory is a capitol, eliminate the defender
        if (territory.isCapitol) {
            // Transfer all defender's territories to the attacker
            defendingPlayer.territories.forEach(tId => {
                const t = gameState.territories[tId];
                if (t) {
                    t.owner = attackerId;
                    attackingPlayer.territories.push(tId);
                }
            });
            defendingPlayer.territories = []; // Clear defender's territories
        }
    }
    // Move to next player's turn
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
    // Clean up
    activeQuestions.delete(territoryId);
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
    switch (numPlayers) {
        case 2:
            return [
                { x: 0, y: 0 }, // Top-left
                { x: grid - 1, y: grid - 1 } // Bottom-right
            ];
        case 3:
            return [
                { x: 0, y: 0 }, // Top-left
                { x: grid - 1, y: 0 }, // Top-right
                { x: Math.floor(grid / 2), y: grid - 1 } // Bottom-middle
            ];
        case 4:
            return [
                { x: 0, y: 0 }, // Top-left (Gryffindor)
                { x: grid - 1, y: 0 }, // Top-right (Hufflepuff)
                { x: 0, y: grid - 1 }, // Bottom-left (Ravenclaw)
                { x: grid - 1, y: grid - 1 } // Bottom-right (Slytherin)
            ];
        default:
            return [];
    }
}
// Distribute territories among players
function distributeTerritories() {
    const grid = 6;
    const numPlayers = gameState.players.length;
    const capitolPositions = getCapitolPositions(numPlayers);
    const territoriesPerPlayer = Math.floor(36 / numPlayers);
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
        // Grow territory until we have enough
        while (playerTerritories.length < territoriesPerPlayer) {
            const expandableTerritories = new Set();
            // Find all possible territories we can expand to
            playerTerritories.forEach(tId => {
                const [x, y] = tId.split('-').map(Number);
                const adjacent = getAdjacentTerritories(x, y, grid);
                adjacent.forEach(adjId => {
                    if (unclaimedTerritories.has(adjId)) {
                        expandableTerritories.add(adjId);
                    }
                });
            });
            if (expandableTerritories.size === 0)
                break;
            // Choose the closest territory to the capitol
            const expandableArray = Array.from(expandableTerritories);
            let closestTerritory = expandableArray[0];
            let minDistance = Infinity;
            expandableArray.forEach(tId => {
                const [x, y] = tId.split('-').map(Number);
                const distance = Math.abs(x - capitol.x) + Math.abs(y - capitol.y);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestTerritory = tId;
                }
            });
            playerTerritories.push(closestTerritory);
            unclaimedTerritories.delete(closestTerritory);
        }
        // Assign territories to the player
        playerTerritories.forEach(tId => {
            const territory = gameState.territories[tId];
            territory.owner = player.id;
            if (!territory.isCapitol) {
                territory.value = Math.floor(Math.random() * 2) + 1;
            }
            player.territories.push(tId);
        });
    });
    // Distribute any remaining territories to the closest player's capitol
    if (unclaimedTerritories.size > 0) {
        Array.from(unclaimedTerritories).forEach(tId => {
            const [tx, ty] = tId.split('-').map(Number);
            let closestPlayer = gameState.players[0];
            let minDistance = Infinity;
            gameState.players.forEach(player => {
                const capitol = player.territories.find(t => gameState.territories[t].isCapitol);
                if (capitol) {
                    const [cx, cy] = capitol.split('-').map(Number);
                    const distance = Math.abs(tx - cx) + Math.abs(ty - cy);
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestPlayer = player;
                    }
                }
            });
            const territory = gameState.territories[tId];
            territory.owner = closestPlayer.id;
            territory.value = Math.floor(Math.random() * 2) + 1;
            closestPlayer.territories.push(tId);
        });
    }
    console.log('🏰 Territories distributed among players with strategic capitol placement');
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
        if (gameState.players.length < 2) {
            console.log('❌ Cannot start game - need at least 2 players');
            socket.emit('error-message', 'Need at least 2 players to start');
            return;
        }
        gameState.gameActive = true;
        distributeTerritories();
        gameState.currentTurn = gameState.players[0].id;
        console.log('🎯 Game started! First turn:', gameState.players[0].name);
        io.emit('game-start', {
            territories: gameState.territories,
            players: gameState.players,
            currentTurn: gameState.currentTurn
        });
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
        if (!territory || !territory.owner) {
            console.log('❌ Invalid territory or no owner');
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
        activeQuestions.set(territoryId, {
            attackerId: socket.id,
            defenderId: territory.owner,
            question,
            timeoutId: setTimeout(() => processDuelResult(territoryId), 20000) // 20 seconds total timeout
        });
        // Emit question to both players
        socket.emit('question-start', { question, role: 'attacker' });
        io.to(territory.owner).emit('question-start', { question, role: 'defender' });
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
        // If both players have answered or time is up, process the result
        if (duelData.attackerAnswer && duelData.defenderAnswer) {
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