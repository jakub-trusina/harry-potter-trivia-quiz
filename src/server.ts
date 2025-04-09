import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { GameState, Player, Question, DuelResult, ObserverResult } from './types/game';
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
const gameState: GameState = {
    territories: {},
    players: [],
    currentTurn: null,
    gameActive: false
};

// Load questions from JSON file
const questions: Question[] = JSON.parse(
    readFileSync(path.join(projectRoot, 'src', 'data', 'questions.json'), 'utf-8')
);

interface DuelData {
    attackerId: string;
    defenderId?: string;
    territory: string;
    question: Question;
    answers: string[];
    correctAnswer: string;
    observers: string[];
    observerAnswers: Map<string, { answer: string; timestamp: number }>;
    attackerAnswer?: string;
    defenderAnswer?: string;
    round?: number;
    timeoutId?: NodeJS.Timeout;
}

const activeQuestions = new Map<string, DuelData>();
const activeDuels = new Set<string>();

function shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function getRandomQuestion(territoryValue: number): Question {
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
function checkSupplyLine(territoryId: string, playerId: string): boolean {
    console.log(`🔍 Checking supply line for territory ${territoryId} (player ${playerId})`);
    
    const territory = gameState.territories[territoryId];
    if (!territory || territory.owner !== playerId) {
        console.log(`❌ Territory ${territoryId} not found or not owned by player ${playerId}`);
        return false;
    }
    
    // If it's a capitol, it always has a supply line
    if (territory.isCapitol) {
        console.log(`✅ Territory ${territoryId} is a capitol - always has supply line`);
        return true;
    }
    
    // Find the player's capitol
    const capitol = Object.values(gameState.territories)
        .find(t => t.owner === playerId && t.isCapitol);
    
    if (!capitol) {
        console.log(`❌ No capitol found for player ${playerId}`);
        return false;
    }
    
    console.log(`📍 Found capitol at ${capitol.id} for player ${playerId}`);
    
    // The key problem: We should start BFS from the territory, NOT the capitol!
    // That's because we want to find if there's a path FROM the territory TO the capitol
    
    // We want to check if there's a path from the territory to the capitol using BFS
    const visited = new Set<string>();
    const queue: string[] = [territoryId]; // Start from the territory we're checking
    
    console.log(`🔄 Starting BFS from territory ${territoryId} to find path to capitol ${capitol.id}`);
    
    while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);
        
        console.log(`👉 Checking territory ${currentId}`);
        
        // If we found the capitol, we have a supply line
        if (currentId === capitol.id) {
            console.log(`✅ Found path to capitol! ${territoryId} -> ... -> ${capitol.id}`);
            return true;
        }
        
        // Get coordinates of current territory
        const [tx, ty] = currentId.split('-').map(Number);
        
        // Check all adjacent territories
        const adjacent = getAdjacentTerritories(tx, ty, 6);
        console.log(`📊 Adjacent territories to ${currentId}:`, adjacent);
        
        for (const adjId of adjacent) {
            const adjTerritory = gameState.territories[adjId];
            // Only follow path through territories owned by the player
            if (adjTerritory && adjTerritory.owner === playerId) {
                console.log(`➡️ Can move to ${adjId} (owned by player)`);
                queue.push(adjId);
            } else {
                console.log(`❌ Cannot move to ${adjId} (not owned by player or does not exist)`);
            }
        }
    }
    
    console.log(`❌ No path found from ${territoryId} to capitol ${capitol.id}`);
    return false;
}

// Update supply lines for all territories of a player
function updateSupplyLines(playerId: string): Promise<void> {
    return new Promise((resolve) => {
        console.log(`\n🔄 Updating supply lines for player ${playerId}`);
        
        const player = gameState.players.find(p => p.id === playerId);
        if (!player) {
            console.error(`❌ Player ${playerId} not found`);
            resolve();
            return;
        }

        // Reset supply lines
        player.supplyLines = [];
        console.log(`🧹 Reset supply lines for player ${playerId}`);

        // Find all territories owned by the player
        const ownedTerritories = Object.values(gameState.territories)
            .filter(t => t.owner === playerId)
            .map(t => t.id);
        
        console.log(`📊 Player ${playerId} owns territories:`, ownedTerritories);

        // Create supply lines between connected territories
        for (const territoryId of ownedTerritories) {
            // Only create supply lines for territories that have a path to capitol
            const hasSupplyLine = checkSupplyLine(territoryId, playerId);
            console.log(`🔍 Territory ${territoryId} supply line check: ${hasSupplyLine}`);
            
            if (!hasSupplyLine) {
                console.log(`❌ Skipping ${territoryId} - no path to capitol`);
                continue;
            }
            
            const [tx, ty] = territoryId.split('-').map(Number);
            
            // Check all adjacent territories
            for (const adjacentId of ownedTerritories) {
                if (territoryId === adjacentId) continue;
                
                // Only create supply line if adjacent territory also has path to capitol
                const adjacentHasSupplyLine = checkSupplyLine(adjacentId, playerId);
                console.log(`🔍 Adjacent territory ${adjacentId} supply line check: ${adjacentHasSupplyLine}`);
                
                if (!adjacentHasSupplyLine) {
                    console.log(`❌ Skipping connection to ${adjacentId} - no path to capitol`);
                    continue;
                }
                
                const [ax, ay] = adjacentId.split('-').map(Number);
                const dx = Math.abs(tx - ax);
                const dy = Math.abs(ty - ay);
                
                // If territories are adjacent
                if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
                    // Check if there's already a supply line between these territories
                    const existingLine = player.supplyLines.find(line => 
                        (line.from === territoryId && line.to === adjacentId) ||
                        (line.from === adjacentId && line.to === territoryId)
                    );
                    
                    if (!existingLine) {
                        console.log(`✅ Creating supply line: ${territoryId} <-> ${adjacentId}`);
                        player.supplyLines.push({
                            from: territoryId,
                            to: adjacentId
                        });
                    } else {
                        console.log(`ℹ️ Supply line already exists: ${territoryId} <-> ${adjacentId}`);
                    }
                }
            }
        }
        
        console.log(`✅ Final supply lines for player ${playerId}:`, player.supplyLines);
        resolve();
    });
}

function acquireDuelLock(duelId: string): boolean {
    if (activeDuels.has(duelId)) {
        return false;
    }
    activeDuels.add(duelId);
    return true;
}

function releaseDuelLock(duelId: string) {
    activeDuels.delete(duelId);
}

function processDuelResult(result: DuelResult) {
    // Use a lock for result processing
    const duelId = `${result.attackerId}-${result.territory}`;
    if (!acquireDuelLock(duelId)) {
        console.log('❌ Duel result is already being processed');
        return;
    }

    try {
        const attackerCorrect = result.attackerAnswer === result.correctAnswer;
        const defenderCorrect = result.defenderAnswer === result.correctAnswer;
        
        result.attackerCorrect = attackerCorrect;
        result.defenderCorrect = defenderCorrect;
        result.answerText = result.correctAnswer;
        
        if (!result.defenderId || result.unclaimedTerritory) {
            result.winner = attackerCorrect ? 'attacker' : null;
        } else {
            if (attackerCorrect && !defenderCorrect) {
                result.winner = 'attacker';
            } else if (!attackerCorrect && defenderCorrect) {
                result.winner = 'defender';
            } else {
                result.winner = null;
            }
        }
        
        // Update territory ownership based on winner
        if (result.winner === 'attacker') {
            const territory = gameState.territories[result.territory];
            if (!territory) {
                console.error('❌ Territory not found:', result.territory);
                return;
            }

            try {
                if (territory.owner) {
                    const defender = gameState.players.find(p => p.id === territory.owner);
                    if (defender) {
                        defender.territories = defender.territories.filter(t => t !== result.territory);
                    }
                }
                territory.owner = result.attackerId;
                const attacker = gameState.players.find(p => p.id === result.attackerId);
                if (!attacker) {
                    console.error('❌ Attacker not found:', result.attackerId);
                    return;
                }
                if (!attacker.territories.includes(result.territory)) {
                    attacker.territories.push(result.territory);
                }
            } catch (error) {
                console.error('❌ Error updating territory ownership:', error);
                return;
            }
        }
        
        // Update supply lines for all players with synchronization
        const supplyLineUpdates = new Promise<void>((resolve) => {
            let completedUpdates = 0;
            const totalPlayers = gameState.players.length;
            
            gameState.players.forEach(player => {
                updateSupplyLines(player.id).then(() => {
                    completedUpdates++;
                    if (completedUpdates === totalPlayers) {
                        resolve();
                    }
                }).catch(error => {
                    console.error(`❌ Error updating supply lines for player ${player.id}:`, error);
                    completedUpdates++;
                    if (completedUpdates === totalPlayers) {
                        resolve();
                    }
                });
            });
        });

        // Wait for supply line updates to complete before emitting result
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
    } finally {
        releaseDuelLock(duelId);
    }
}

// Helper function to get adjacent territory IDs
function getAdjacentTerritories(x: number, y: number, grid: number): string[] {
    const adjacent: string[] = [];
    
    // Check all four cardinal directions
    if (x > 0) adjacent.push(`${x-1}-${y}`);
    if (x < grid-1) adjacent.push(`${x+1}-${y}`);
    if (y > 0) adjacent.push(`${x}-${y-1}`);
    if (y < grid-1) adjacent.push(`${x}-${y+1}`);
    
    // Debug adjacency information
    console.log(`🔎 Adjacent territories for ${x}-${y}: ${adjacent.join(', ')}`);
    
    return adjacent;
}

// Helper function to find distance between two points
function getDistance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2); // Manhattan distance
}

// Helper function to find the farthest territory from enemy territories
function findCapitol(territories: string[], enemyTerritories: string[], grid: number): string {
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

function getCapitolPositions(numPlayers: number): { x: number; y: number }[] {
    const grid = 6;
    
    function generatePositions(): { positions: { x: number; y: number }[], transforms: { flipX: boolean, flipY: boolean, swapXY: boolean } } {
        let positions;
        
        // Base positions
        switch (numPlayers) {
            case 2:
                positions = [
                    { x: 0, y: 0 },  // Top-left
                    { x: grid-1, y: grid-1 }  // Bottom-right
                ];
                break;
            case 3:
                positions = [
                    { x: 0, y: 0 },  // Top-left
                    { x: grid-1, y: 0 },  // Top-right
                    { x: Math.floor(grid/2), y: grid-1 }  // Bottom-middle
                ];
                break;
            case 4:
                positions = [
                    { x: 0, y: 0 },  // Top-left
                    { x: grid-1, y: 0 },  // Top-right
                    { x: 0, y: grid-1 },  // Bottom-left
                    { x: grid-1, y: grid-1 }  // Bottom-right
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
        const seen = new Set<string>();
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
                            { x: grid-1, y: grid-1 }
                        ];
                    case 3:
                        return [
                            { x: 0, y: 0 },
                            { x: grid-1, y: 0 },
                            { x: Math.floor(grid/2), y: grid-1 }
                        ];
                    case 4:
                        return [
                            { x: 0, y: 0 },
                            { x: grid-1, y: 0 },
                            { x: 0, y: grid-1 },
                            { x: grid-1, y: grid-1 }
                        ];
                    default:
                        return [];
                }
            })(),
            transforms: { flipX: false, flipY: false, swapXY: false }
        };
    }

    // Shuffle the positions among players
    return shuffleArray(result!.positions);
}

// Add debug function to help diagnose capitol issues
function debugCapitols(): void {
    console.log("\n🔍🔍🔍 DEBUGGING CAPITOL TERRITORIES 🔍🔍🔍");
    
    // Find all capitols
    const capitols = Object.values(gameState.territories)
        .filter(t => t.isCapitol)
        .map(t => ({ 
            id: t.id, 
            owner: t.owner, 
            ownerName: gameState.players.find(p => p.id === t.owner)?.name 
        }));
    
    console.log("🏰 Capitol territories:", capitols);
    
    // Debug player ownership
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
                    console.log(`      Distance: dx=${Math.abs(tx-cx)}, dy=${Math.abs(ty-cy)}`);
                    
                    // Check if adjacent to capitol directly
                    const isAdjacentToCapitol = Math.abs(tx-cx) + Math.abs(ty-cy) === 1;
                    console.log(`      Adjacent to capitol: ${isAdjacentToCapitol}`);
                }
            }
        });
    });
    
    console.log("🔍🔍🔍 END CAPITOL DEBUGGING 🔍🔍🔍\n");
}

// Call the debug function after distributing territories
function distributeTerritories(): void {
    const grid = 6;
    const numPlayers = gameState.players.length;
    const capitolPositions = getCapitolPositions(numPlayers);
    const totalTerritories = grid * grid;
    const territoriesPerPlayer = Math.floor(totalTerritories / numPlayers);

    // Initialize all territories as unclaimed
    const unclaimedTerritories = new Set<string>();
    for (let x = 0; x < grid; x++) {
        for (let y = 0; y < grid; y++) {
            const id = `${x}-${y}`;
            unclaimedTerritories.add(id);
            gameState.territories[id] = {
                id,
                x,
                y,
                owner: null,
                value: 1,  // Default value
                isCapitol: false
            };
        }
    }

    // Calculate territory scores for expansion priority
    function calculateTerritoryScore(territoryId: string, playerId: string): number {
        const [tx, ty] = territoryId.split('-').map(Number);
        let score = 0;

        // Get the player's capitol position
        const playerCapitol = capitolPositions[gameState.players.findIndex(p => p.id === playerId)];
        
        // Calculate distance from capitol (closer is better)
        const distanceFromCapitol = Math.abs(tx - playerCapitol.x) + Math.abs(ty - playerCapitol.y);
        score -= distanceFromCapitol; // Negative score for distance (closer is better)

        // Count friendly neighbors (more is better)
        const adjacent = getAdjacentTerritories(tx, ty, grid);
        const friendlyNeighbors = adjacent.filter(id => 
            gameState.territories[id]?.owner === playerId
        ).length;
        score += friendlyNeighbors * 2;

        // Count enemy neighbors (fewer is better)
        const enemyNeighbors = adjacent.filter(id => 
            gameState.territories[id]?.owner !== null && 
            gameState.territories[id]?.owner !== playerId
        ).length;
        score -= enemyNeighbors * 3;

        // Prefer territories that don't create gaps
        const unclaimedNeighbors = adjacent.filter(id => 
            gameState.territories[id]?.owner === null
        ).length;
        score += unclaimedNeighbors;

        // Add some randomness to break ties (but keep it small)
        score += Math.random() * 0.5;

        return score;
    }

    // Assign territories to each player
    gameState.players.forEach((player, index) => {
        const playerTerritories: string[] = [];
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
            const expandableTerritories = new Set<string>();
            
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
            if (expandableTerritories.size === 0) break;

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
        } else {
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
function fixAllSupplyConnections(): void {
    console.log("\n🔧 Fixing all supply connections for all players");
    
    gameState.players.forEach(player => {
        console.log(`\n👤 Fixing supply connections for player ${player.name}`);
        
        // Get all territories owned by this player
        const ownedTerritories = Object.values(gameState.territories)
            .filter(t => t.owner === player.id);
        
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
function startGame(): void {
    if (gameState.players.length < 2 || gameState.players.length > 4) {
        console.log('❌ Cannot start game: Invalid number of players');
        return;
    }

    // Shuffle player order first
    gameState.players = shuffleArray([...gameState.players]);
    
    // Define available houses
    const houses: ('Gryffindor' | 'Slytherin' | 'Ravenclaw' | 'Hufflepuff')[] = ['Gryffindor', 'Slytherin', 'Ravenclaw', 'Hufflepuff'];
    
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
        if (nextPlayerIndex === currentPlayerIndex) break;
    }
    
    gameState.currentTurn = gameState.players[nextPlayerIndex].id;
    
    // Emit updated game state
    io.emit('game-state-update', {
        territories: gameState.territories,
        players: gameState.players,
        currentTurn: gameState.currentTurn
    });
}

// Socket.IO event handlers
io.on('connection', (socket) => {
    console.log('👋 New connection from socket:', socket.id);
    console.log('🔍 Total connected clients:', io.engine.clientsCount);

    socket.on('join-game', (playerName: string) => {
        console.log(`🧙‍♂️ Player "${playerName}" (${socket.id}) is trying to join the game`);
        console.log('📝 Current game state:', gameState);
        
        const newPlayer: Player = {
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
        } else {
            console.log('👋 Unknown socket disconnected:', socket.id);
        }
    });

    socket.on('attack-territory', (territoryId: string) => {
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
        console.log(`🔍 Checking adjacent territories for attack from:`, adjacentTerritories);
        
        // List all player's territories with supply lines for debugging
        const playerTerritories = Object.values(gameState.territories)
            .filter(t => t.owner === socket.id)
            .map(t => ({
                id: t.id,
                hasSupplyLine: checkSupplyLine(t.id, socket.id)
            }));
        
        console.log(`🔍 Player territories with supply lines:`, playerTerritories);
        
        const validAttackingTerritories = adjacentTerritories.filter(adjId => {
            const adjTerritory = gameState.territories[adjId];
            if (!adjTerritory || adjTerritory.owner !== socket.id) {
                return false;
            }
            
            // Check if this territory has a supply line
            const hasSupplyLine = checkSupplyLine(adjId, socket.id);
            console.log(`🔍 Can attack from ${adjId}? Owner: ${adjTerritory.owner}, Has supply line: ${hasSupplyLine}`);
            return hasSupplyLine;
        });
        
        console.log(`🔍 Valid attacking territories: ${validAttackingTerritories.join(', ')}`);
        
        if (validAttackingTerritories.length === 0) {
            console.log('❌ No adjacent territory with supply line to attack from');
            socket.emit('attack-error', 'You need to connect this territory to your capitol before attacking from here!');
            return;
        }
        
        console.log('✅ Attack validation passed, proceeding with duel...');
        // Start a new duel
        const question = getRandomQuestion(territory.value);
        
        // Get all players who are not the attacker or defender
        const observers = gameState.players
            .filter(p => p.id !== socket.id && p.id !== territory.owner)
            .map(p => p.id);
        
        // Create duel data
        const duelData: DuelData = {
            attackerId: socket.id,
            defenderId: territory.owner || undefined,
            territory: territoryId,
            question,
            answers: question.answers,
            correctAnswer: question.correctAnswer,
            observers,
            observerAnswers: new Map(),
            round: territory.isCapitol ? 1 : 0,
            timeoutId: setTimeout(() => {
                const duelData = activeQuestions.get(socket.id);
                if (duelData) {
                    const result: DuelResult = {
                        attackerId: socket.id,
                        defenderId: duelData.defenderId,
                        territory: territoryId,
                        attackerAnswer: duelData.attackerAnswer || '',
                        defenderAnswer: duelData.defenderAnswer || '',
                        correctAnswer: duelData.correctAnswer,
                        unclaimedTerritory: !duelData.defenderId,
                        answerText: duelData.correctAnswer,
                        observerResults: []
                    };

                    // Process observer answers if any
                    const observerResults: ObserverResult[] = [];
                    for (const [observerId, observerData] of duelData.observerAnswers) {
                        const correct = observerData.answer === duelData.correctAnswer;
                        const scoreGained = correct ? 1 : 0;
                        
                        const observer = gameState.players.find(p => p.id === observerId);
                        if (observer) {
                            observer.score += scoreGained;
                        }
                        
                        observerResults.push({
                            playerId: observerId,
                            answer: observerData.answer,
                            correct,
                            scoreGained
                        });
                    }
                    
                    result.observerResults = observerResults;
                    processDuelResult(result);
                }
            }, 20000)
        };

        // Store the duel data
        activeQuestions.set(socket.id, duelData);

        // Emit question to attacker
        socket.emit('question', { 
            question: question.question,
            answers: question.answers,
            role: 'attacker'
        });

        // Emit question to defender if exists
        if (territory.owner) {
            io.to(territory.owner).emit('question', { 
                question: question.question,
                answers: question.answers,
                role: 'defender'
            });
        }

        // Emit question to observers
        observers.forEach(observerId => {
            io.to(observerId).emit('question', {
                question: question.question,
                answers: question.answers,
                role: 'observer'
            });
        });
    });

    socket.on('submit-answer', (answer: string) => {
        const playerId = socket.id;
        const duelData = activeQuestions.get(playerId);
        
        if (!duelData) {
            // Check if player is an observer in any active duel
            for (const [duelId, data] of activeQuestions) {
                if (data.observers.includes(playerId)) {
                    // Use a lock for observer answer processing
                    if (!acquireDuelLock(duelId)) {
                        console.log('❌ Duel is already being processed');
                        return;
                    }
                    
                    try {
                        data.observerAnswers.set(playerId, {
                            answer,
                            timestamp: Date.now()
                        });
                        
                        // Emit to all players in the duel that an observer has answered
                        io.to([data.attackerId, ...data.observers]).emit('observer-answered', {
                            playerId,
                            answer
                        });
                    } finally {
                        releaseDuelLock(duelId);
                    }
                    return;
                }
            }
            return;
        }

        const isAttacker = duelData.attackerId === playerId;
        const isDefender = duelData.defenderId === playerId;
        
        if (!isAttacker && !isDefender) return;

        // Validate answer
        if (!duelData.answers.includes(answer)) {
            console.log('❌ Invalid answer submitted');
            return;
        }

        // Clear timeout if it exists
        if (duelData.timeoutId) {
            clearTimeout(duelData.timeoutId);
            duelData.timeoutId = undefined;
        }

        // Use a lock for duel processing
        const duelId = `${duelData.attackerId}-${duelData.territory}`;
        if (!acquireDuelLock(duelId)) {
            console.log('❌ Duel is already being processed');
            return;
        }

        try {
            if (isAttacker) {
                duelData.attackerAnswer = answer;
                // Process attacker's answer
                const result: DuelResult = {
                    attackerId: playerId,
                    defenderId: duelData.defenderId,
                    attackerAnswer: answer,
                    defenderAnswer: duelData.defenderAnswer,
                    correctAnswer: duelData.correctAnswer,
                    territory: duelData.territory,
                    unclaimedTerritory: !duelData.defenderId,
                    answerText: duelData.correctAnswer,
                    observerResults: []
                };

                // If it's an unclaimed territory or we have both answers, process the result
                if (!duelData.defenderId || (duelData.defenderId && duelData.defenderAnswer)) {
                    processDuelResult(result);
                }
            } else if (isDefender) {
                duelData.defenderAnswer = answer;
                const attackerDuel = activeQuestions.get(duelData.attackerId);
                if (attackerDuel && attackerDuel.attackerAnswer) {
                    const result: DuelResult = {
                        attackerId: duelData.attackerId,
                        defenderId: playerId,
                        attackerAnswer: attackerDuel.attackerAnswer,
                        defenderAnswer: answer,
                        correctAnswer: duelData.correctAnswer,
                        territory: duelData.territory,
                        answerText: duelData.correctAnswer,
                        observerResults: []
                    };
                    processDuelResult(result);
                }
            }
        } finally {
            releaseDuelLock(duelId);
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
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
}); 