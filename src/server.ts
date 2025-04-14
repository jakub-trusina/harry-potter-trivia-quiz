import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { GameState, Player } from './types/game.js';
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
interface Territory {
    id: string;
    x: number;
    y: number;
    owner: string | null;
    value: number;
    isCapitol: boolean;
    shields?: number;  // Number of shields (0-2) for capitols
    hasSupplyLine?: boolean;  // Whether the territory is connected to a capitol
}

const gameState: GameState = {
    territories: {} as Record<string, Territory>,
    players: [],
    currentTurn: null,
    gameActive: false
};

// Load questions from JSON file
const questions: Question[] = JSON.parse(
    readFileSync(path.join(projectRoot, 'src', 'data', 'questions.json'), 'utf-8')
);

// Question queues for each difficulty
interface QuestionQueues {
    easy: Question[];
    medium: Question[];
    hard: Question[];
}

let questionQueues: QuestionQueues = {
    easy: [],
    medium: [],
    hard: []
};

function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array]; // Create a copy to not modify the original
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function initializeQuestionQueues() {
    console.log('🎲 Initializing question queues...');
    
    // Filter questions by difficulty and shuffle each group
    const easyQuestions = shuffleArray(questions.filter(q => q.difficulty === 'easy'));
    const mediumQuestions = shuffleArray(questions.filter(q => q.difficulty === 'medium'));
    const hardQuestions = shuffleArray(questions.filter(q => q.difficulty === 'hard'));
    
    questionQueues = {
        easy: easyQuestions,
        medium: mediumQuestions,
        hard: hardQuestions
    };
    
    console.log(`✅ Question queues initialized with:
        Easy: ${questionQueues.easy.length} questions
        Medium: ${questionQueues.medium.length} questions
        Hard: ${questionQueues.hard.length} questions`);
}

function shuffleAnswers(question: Question): Question {
    // Create a copy of the question to avoid modifying the original
    const shuffledQuestion = { ...question };
    
    // If the correct answer is a number (index), we need to track the original answer
    if (typeof question.correctAnswer === 'number') {
        const correctAnswer = question.answers[question.correctAnswer];
        // Shuffle the answers
        shuffledQuestion.answers = shuffleArray([...question.answers]);
        // Find the new index of the correct answer
        shuffledQuestion.correctAnswer = shuffledQuestion.answers.indexOf(correctAnswer);
    } else {
        // For string answers, just shuffle the array
        shuffledQuestion.answers = shuffleArray([...question.answers]);
    }
    
    return shuffledQuestion;
}

function getNextQuestion(territoryValue: number): Question {
    // Map territory value to difficulty
    const difficulty = territoryValue === 3 ? "hard" : 
                      territoryValue === 2 ? "medium" : "easy";
    
    // Get the appropriate queue
    let queue = questionQueues[difficulty];
    
    // If queue is empty, reshuffle all questions of that difficulty
    if (queue.length === 0) {
        console.log(`⚠️ ${difficulty} question queue is empty, reshuffling...`);
        const newQuestions = shuffleArray(questions.filter(q => q.difficulty === difficulty));
        questionQueues[difficulty] = newQuestions;
        queue = newQuestions;
        
        // If still empty (no questions of this difficulty exist), fall back to any difficulty
        if (queue.length === 0) {
            console.warn(`No questions found for difficulty ${difficulty}, falling back to any available questions`);
            for (const diff of ['easy', 'medium', 'hard'] as const) {
                if (questionQueues[diff].length > 0) {
                    queue = questionQueues[diff];
                    break;
                }
            }
            // If all queues are empty, reinitialize everything
            if (queue.length === 0) {
                initializeQuestionQueues();
                queue = questionQueues[difficulty];
            }
        }
    }
    
    // Get the next question from the queue
    const question = queue.shift()!;
    
    // Use question.question as text if text is missing
    if (!question.text && question.question) {
        question.text = question.question;
    } else if (!question.text) {
        console.warn(`Question ${question.id} is missing both text and question properties`);
        question.text = `Question ${question.id}`;
    }
    
    // Shuffle the answers before returning
    return shuffleAnswers(question);
}

function getRandomQuestion(territoryValue: number): Question {
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
    
    // Use question.question as text if text is missing
    if (!question.text && question.question) {
        question.text = question.question;
    } else if (!question.text) {
        console.warn(`Question ${question.id} is missing both text and question properties`);
        question.text = `Question ${question.id}`;
    }
    
    // Shuffle the answers before returning
    return shuffleAnswers(question);
}

// Initialize question queues when game starts
function initializeGame() {
    console.log('🎮 Initializing new game...');
    
    // Reset game state
    gameState.territories = {} as Record<string, Territory>;
    gameState.players = [];
    gameState.currentTurn = null;
    gameState.gameActive = false;
    
    // Initialize fresh question queues
    initializeQuestionQueues();
    
    // ... rest of game initialization ...
}

interface PlayerState {
    id: string;
    name: string;
    role?: 'attacker' | 'defender';
    territories: string[];
    score: number;
}

interface Question {
    id: string;
    text?: string;
    question?: string;
    correctAnswer: string | number;
    difficulty: "easy" | "medium" | "hard";
    answers: string[];
}

interface DuelData {
    attackerId: string;
    defenderId: string;
    observers: Set<string>;
    currentQuestion: Question | null;
    answers: Map<string, boolean>;
    observerAnswers: Map<string, boolean>;
    isActive: boolean;
    territory: string;
    attackerAnswer?: string;
    defenderAnswer?: string;
    correctAnswer?: string;
    timeoutId?: NodeJS.Timeout;
    round?: number;
    responseTime?: Map<string, string>;
    questionSentTime?: number;
    roundsRequired?: number;
}

interface ObserverResult {
    playerId: string;
    answer: string;
    correct: boolean;
    scoreGained: number;
}

interface DuelResult {
    type: 'claimed' | 'unclaimed';
    attackerCorrect: boolean;
    defenderCorrect?: boolean;
    attackerId: string;
    defenderId?: string;
    territoryId: string;
    correctAnswer?: string;
    observerResults?: ObserverResult[];
    winner?: string | null;  // Updated to allow null
    attackerResponseTime?: string;
    defenderResponseTime?: string;
    isCapitolRound?: boolean;
    roundNumber?: number;
    roundsRequired?: number;
    continueToNextRound?: boolean;
    shieldsRemaining?: number;
    round?: number;
    totalRounds?: number;
}

const activeQuestions = new Map<string, DuelData>();
const activeDuels = new Map<string, DuelData>();

// Helper function to check if a territory is connected to a capitol
function checkSupplyLine(territoryId: string, playerId: string): boolean {
    const territory = gameState.territories[territoryId];
    if (!territory || territory.owner !== playerId) return false;
    
    // If it's a capitol, it always has a supply line
    if (territory.isCapitol) return true;
    
    // Find the player's capitol
    const capitol = Object.values(gameState.territories)
        .find(t => t.owner === playerId && t.isCapitol) as Territory | undefined;
    
    if (!capitol) return false;
    
    // Start BFS from the capitol to find all connected territories
    const visited = new Set<string>();
    const queue: string[] = [capitol.id];
    visited.add(capitol.id);
    
    while (queue.length > 0) {
        const currentId = queue.shift()!;
        const [tx, ty] = currentId.split('-').map(Number);
        const adjacent = getAdjacentTerritories(tx, ty, 6);
        
        for (const adjId of adjacent) {
            if (visited.has(adjId)) continue;
            
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
function updateSupplyLines(playerId: string): Promise<void> {
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
            .filter(t => t.owner === playerId) as Territory[];

        // First, find all territories that have a path to capitol
        const territoriesWithSupplyLine = new Set<string>();
        for (const territoryId of ownedTerritories.map(t => t.id)) {
            if (checkSupplyLine(territoryId, playerId)) {
                territoriesWithSupplyLine.add(territoryId);
                // Update territory's hasSupplyLine property
                gameState.territories[territoryId].hasSupplyLine = true;
            } else {
                // Mark territory as disconnected
                gameState.territories[territoryId].hasSupplyLine = false;
            }
        }

        // Create supply lines between connected territories that both have paths to capitol
        for (const territoryId of territoriesWithSupplyLine) {
            const [tx, ty] = territoryId.split('-').map(Number);
            
            // Check all adjacent territories
            for (const adjacentId of territoriesWithSupplyLine) {
                if (territoryId === adjacentId) continue;
                
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

function acquireDuelLock(duelId: string): boolean {
    if (activeDuels.has(duelId)) {
        return false;
    }
    activeDuels.set(duelId, {
        attackerId: '',
        defenderId: '',
        territory: duelId,  // Using duelId as territory since it contains territory info
        observers: new Set<string>(),
        currentQuestion: null,
        answers: new Map(),
        observerAnswers: new Map(),
        isActive: true
    });
    return true;
}

function releaseDuelLock(duelId: string) {
    activeDuels.delete(duelId);
}

function processDuelResult(result: DuelResult) {
    // Use a lock for result processing
    const duelId = `${result.attackerId}-${result.territoryId}`;
    if (!acquireDuelLock(duelId)) {
        console.log('❌ Duel result is already being processed');
        return;
    }

    try {
        const attackerCorrect = result.attackerCorrect;
        const defenderCorrect = result.defenderCorrect ?? false;
        const territory = gameState.territories[result.territoryId];
        
        if (!territory) {
            console.error('❌ Territory not found:', result.territoryId);
            return;
        }

        // Handle capitol territory differently
        if (territory.isCapitol) {
            const duelData = activeQuestions.get(result.attackerId);
            if (!duelData) {
                console.error('❌ No duel data found for capitol attack');
                return;
            }

            // Determine round winner based on correctness and response time
            if (attackerCorrect || defenderCorrect) {
                if (attackerCorrect && !defenderCorrect) {
                    result.winner = 'attacker';
                } else if (!attackerCorrect && defenderCorrect) {
                    result.winner = 'defender';
                } else if (attackerCorrect && defenderCorrect) {
                    // Both correct - compare response times
                    const attackerTime = parseFloat(result.attackerResponseTime?.replace('s', '') || 'Infinity');
                    const defenderTime = parseFloat(result.defenderResponseTime?.replace('s', '') || 'Infinity');
                    result.winner = attackerTime <= defenderTime ? 'attacker' : 'defender';
                }
            } else {
                // If both wrong, defender wins by default
                result.winner = 'defender';
            }

            // Add round information to result
            result.isCapitolRound = true;
            result.roundNumber = duelData.round;
            result.roundsRequired = duelData.roundsRequired;

            console.log(`Capitol duel - Shields remaining: ${territory.shields || 0}`, {
                attackerCorrect,
                defenderCorrect,
                attackerTime: result.attackerResponseTime,
                defenderTime: result.defenderResponseTime,
                winner: result.winner
            });

            // If attacker wins, reduce shields
            if (result.winner === 'attacker') {
                if (territory.shields && territory.shields > 0) {
                    territory.shields--;
                    console.log(`Reduced shields to ${territory.shields}`);
                    
                    // Emit territory update to update UI
                    io.emit('game-state-update', {
                        territories: gameState.territories,
                        players: gameState.players,
                        currentTurn: gameState.currentTurn
                    });

                    // Automatically start next round after shield reduction
                    console.log('Starting next round automatically after shield reduction');
                    
                    // Keep the same duel data but prepare for next round
                    duelData.round = (duelData.round || 1) + 1;
                    duelData.answers = new Map();
                    duelData.observerAnswers = new Map();
                    duelData.responseTime = new Map();
                    
                    // Emit current result with continueToNextRound flag and shields info
                    result.continueToNextRound = true;
                    result.shieldsRemaining = territory.shields;
                    io.emit('duel-result', result);
                    
                    // Start next round after a delay
                    setTimeout(() => {
                        // First, reinitialize duel UI for all participants
                        io.to(result.attackerId).emit('duel-started', { 
                            role: 'attacker',
                            isCapitolRound: true,
                            round: duelData.round,
                            totalRounds: duelData.roundsRequired,
                            shieldsRemaining: territory.shields
                        });
                        
                        if (result.defenderId) {
                            io.to(result.defenderId).emit('duel-started', { 
                                role: 'defender',
                                isCapitolRound: true,
                                round: duelData.round,
                                totalRounds: duelData.roundsRequired,
                                shieldsRemaining: territory.shields
                            });
                        }

                        // Also reinitialize for observers
                        duelData.observers.forEach(observerId => {
                            io.to(observerId).emit('duel-started', {
                                role: 'observer',
                                isCapitolRound: true,
                                round: duelData.round,
                                totalRounds: duelData.roundsRequired,
                                shieldsRemaining: territory.shields
                            });
                        });

                        // Wait a short moment for clients to prepare their UI
                        setTimeout(() => {
                            // Get new question from the queue
                            const newQuestion = getNextQuestion(territory.value);
                            duelData.currentQuestion = newQuestion;
                            duelData.questionSentTime = Date.now();
                            
                            console.log(`Starting capitol duel round ${duelData.round} - Shields remaining: ${territory.shields}`);
                            
                            // Send new question to all participants
                            io.to(result.attackerId).emit('question', {
                                question: newQuestion.text,
                                answers: newQuestion.answers,
                                role: 'attacker',
                                shieldsRemaining: territory.shields,
                                isCapitolRound: true,
                                round: duelData.round,
                                totalRounds: duelData.roundsRequired
                            });
                            
                            if (result.defenderId) {
                                io.to(result.defenderId).emit('question', {
                                    question: newQuestion.text,
                                    answers: newQuestion.answers,
                                    role: 'defender',
                                    shieldsRemaining: territory.shields,
                                    isCapitolRound: true,
                                    round: duelData.round,
                                    totalRounds: duelData.roundsRequired
                                });
                            }

                            // Send question to observers
                            duelData.observers.forEach(observerId => {
                                io.to(observerId).emit('question', {
                                    question: newQuestion.text,
                                    answers: newQuestion.answers,
                                    role: 'observer',
                                    shieldsRemaining: territory.shields,
                                    isCapitolRound: true,
                                    round: duelData.round,
                                    totalRounds: duelData.roundsRequired
                                });
                            });
                            
                            // Set timeout for this round
                            if (duelData.timeoutId) {
                                clearTimeout(duelData.timeoutId);
                            }
                            duelData.timeoutId = setTimeout(() => {
                                if (duelData.isActive) {
                                    console.log('Round timed out, defender wins by default');
                                    const timeoutResult: DuelResult = {
                                        type: 'claimed',
                                        attackerCorrect: false,
                                        defenderCorrect: false,
                                        attackerId: result.attackerId,
                                        defenderId: result.defenderId,
                                        territoryId: result.territoryId,
                                        winner: 'defender',
                                        isCapitolRound: true,
                                        shieldsRemaining: territory.shields,
                                        round: duelData.round,
                                        totalRounds: duelData.roundsRequired,
                                        continueToNextRound: false
                                    };
                                    processDuelResult(timeoutResult);
                                }
                            }, 30000);
                        }, 1000); // Wait 1 second after duel-started before sending question
                    }, 5000); // 5 second delay between rounds
                    return;
                }
            }

            // Check if we need another round
            if (result.winner === 'attacker' && duelData.round && duelData.roundsRequired && 
                duelData.round < duelData.roundsRequired) {
                // This block is now handled in the shield reduction section above
                return;
            }

            // If defender won or this was the final round, proceed with territory update
            if (result.winner === 'defender' || (duelData.round === duelData.roundsRequired)) {
                // Clean up timeouts
                if (duelData.timeoutId) {
                    clearTimeout(duelData.timeoutId);
                    duelData.timeoutId = undefined;
                }
                
                // Set continueToNextRound to false if defender won
                if (result.winner === 'defender') {
                    result.continueToNextRound = false;
                }
                
                // Emit result before cleaning up
                result.shieldsRemaining = territory.shields || 0;
                io.emit('duel-result', result);
                
                // Clean up active questions for all participants
                activeQuestions.delete(result.attackerId);
                if (result.defenderId) {
                    activeQuestions.delete(result.defenderId);
                }
                duelData.observers.forEach(observerId => {
                    activeQuestions.delete(observerId);
                });

                // If attacker won all rounds, update territory ownership
                if (result.winner === 'attacker' && duelData.round === duelData.roundsRequired) {
                    // Process territory capture
                    handleTerritoryCapture(result, territory);
                } else {
                    // Defender won, move to next turn
                    setTimeout(() => {
                        nextTurn();
                    }, 5000);
                }
                return;
            }
        } else {
            // Normal territory logic
            if (!result.defenderId || result.type === 'unclaimed') {
                result.winner = attackerCorrect ? 'attacker' : null;
            } else {
                if (attackerCorrect && !defenderCorrect) {
                    result.winner = 'attacker';
                } else if (!attackerCorrect && defenderCorrect) {
                    result.winner = 'defender';
                } else if (attackerCorrect && defenderCorrect) {
                    // Both correct - compare response times
                    const attackerTime = result.attackerResponseTime || Infinity;
                    const defenderTime = result.defenderResponseTime || Infinity;
                    result.winner = attackerTime <= defenderTime ? 'attacker' : 'defender';
                } else {
                    result.winner = null;
                }
            }
        }

        // Update territory ownership and supply lines
        if (result.winner === 'attacker') {
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
                            Promise.all(gameState.players.map(player => updateSupplyLines(player.id)))
                                .then(() => {
                                    // Check if defender has lost all capitols
                                    const defenderHasCapitols = Object.values(gameState.territories).some(t => 
                                        t.owner === defender.id && t.isCapitol
                                    );

                                    if (!defenderHasCapitols && defender.territories.length > 0) {
                                        // Defender lost all capitols but still has territories
                                        // Transfer all remaining territories to the attacker
                                        const remainingTerritories = Object.values(gameState.territories)
                                            .filter(t => t.owner === defender.id);

                                        remainingTerritories.forEach(t => {
                                            t.owner = result.attackerId;
                                            defender.territories = defender.territories.filter(id => id !== t.id);
                                            if (!attacker.territories.includes(t.id)) {
                                                attacker.territories.push(t.id);
                                            }
                                        });

                                        // Add log entry about territory transfer
                                        console.log(`🏰 ${defender.name} lost all capitols. ${remainingTerritories.length} territories transferred to ${attacker.name}`);
                                    }

                                    // Check if game is over (only one player has capitols)
                                    const playersWithCapitols = gameState.players.filter(p => 
                                        Object.values(gameState.territories).some(t => 
                                            t.owner === p.id && t.isCapitol
                                        )
                                    );

                                    const gameOver = playersWithCapitols.length === 1;
                                    
                                    // Emit game state update first
                                    io.emit('game-state-update', {
                                        territories: gameState.territories,
                                        players: gameState.players,
                                        currentTurn: gameState.currentTurn
                                    });
                                    
                                    // Then emit duel result
                                    io.emit('duel-result', result);
                                    
                                    // Clean up active questions
                                    activeQuestions.delete(result.attackerId);
                                    if (result.defenderId) {
                                        activeQuestions.delete(result.defenderId);
                                    }
                                    
                                    if (gameOver) {
                                        endGame();
                                    } else if (!territory.isCapitol || result.roundNumber === result.roundsRequired) {
                                        // Move to next player's turn after a delay, but only if:
                                        // - It's not a capitol territory, OR
                                        // - It's the final round of a capitol battle
                                        setTimeout(() => {
                                            nextTurn();
                                        }, 5000);
                                    }
                                });
                        });
                    }
                }
            } catch (error) {
                console.error('❌ Error updating territory ownership:', error);
                return;
            }
        } else {
            // If defender wins, move to next turn
            io.emit('duel-result', result);
            activeQuestions.delete(result.attackerId);
            if (result.defenderId) {
                activeQuestions.delete(result.defenderId);
            }
            setTimeout(() => {
                nextTurn();
            }, 5000);
        }
    } finally {
        releaseDuelLock(duelId);
    }
}

function checkGameOver(): boolean {
    // Count how many players still have at least one capitol
    const playersWithCapitols = gameState.players.filter(player => 
        Object.values(gameState.territories).some(t => 
            t.owner === player.id && t.isCapitol
        )
    );

    // Game is over when only one player has capitols
    return playersWithCapitols.length === 1;
}

function endGame(): void {
    gameState.gameActive = false;

    // Calculate final scores and include territory counts
    const finalScores = gameState.players.map(player => ({
        name: player.name,
        id: player.id,
        score: player.score || 0,
        territories: player.territories.length,
        hasCapitol: Object.values(gameState.territories).some(t => 
            t.owner === player.id && t.isCapitol
        )
    }));

    // Sort by score (highest first)
    finalScores.sort((a, b) => b.score - a.score);

    // Find the last player with a capitol (winner by conquest)
    const conquestWinner = gameState.players.find(player => 
        Object.values(gameState.territories).some(t => 
            t.owner === player.id && t.isCapitol
        )
    );

    // First emit a close-all-modals event
    io.emit('close-all-modals');

    // Wait a moment for modals to close, then show game over
    setTimeout(() => {
        // Emit game end event with results
        io.emit('game-end', {
            scores: finalScores,  // Include both scores and finalScores for backward compatibility
            finalScores: finalScores,
            conquestWinner: conquestWinner ? {
                name: conquestWinner.name,
                id: conquestWinner.id
            } : null,
            scoreWinner: finalScores[0],
            columnSpacing: {  // Add spacing information for the table
                player: 20,   // Minimum width for player name column
                score: 15,    // Minimum width for score column
                territories: 15,  // Minimum width for territories column
                capitol: 15   // Minimum width for capitol column
            }
        });
        
        console.log('Game ended with scores:', finalScores);
    }, 2000); // Wait 2 seconds before showing game over screen
}

// Helper function to get adjacent territory IDs
function getAdjacentTerritories(x: number, y: number, grid: number): string[] {
    const adjacent: string[] = [];
    if (x > 0) adjacent.push(`${x-1}-${y}`);
    if (x < grid-1) adjacent.push(`${x+1}-${y}`);
    if (y > 0) adjacent.push(`${x}-${y-1}`);
    if (y < grid-1) adjacent.push(`${x}-${y+1}`);
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
        .filter((t): t is Territory => t.isCapitol)
        .map(t => ({ 
            id: t.id, 
            owner: t.owner, 
            ownerName: gameState.players.find(p => p.id === t.owner)?.name 
        }));
    
    console.log("🏰 Capitol territories:", capitols);
    
    // Check territory connections for each player
    gameState.players.forEach(player => {
        const ownedTerritories = Object.values(gameState.territories)
            .filter(t => t.owner === player.id) as Territory[];
        
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
                    const isAdjacent = (Math.abs(tx-cx) === 1 && Math.abs(ty-cy) === 0) || 
                                     (Math.abs(tx-cx) === 0 && Math.abs(ty-cy) === 1);
                    
                    if (isAdjacent) {
                        console.log(`      ✅ Territory is adjacent to capitol, should have direct connection`);
                    } else {
                        console.log(`      ❌ Territory is not adjacent to capitol, requires path through connected territories`);
                    }
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
            .filter((t): t is Territory => t.owner === player.id);
        
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

function findPlayerDuel(playerId: string): DuelData | undefined {
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

function createDuel(attackerId: string, defenderId: string, territory: string): DuelData {
    const duel: DuelData = {
        attackerId,
        defenderId,
        territory,
        observers: new Set<string>(),
        currentQuestion: null,
        answers: new Map<string, boolean>(),
        observerAnswers: new Map<string, boolean>(),
        isActive: true
    };
    activeDuels.set(`${attackerId}-${defenderId}`, duel);
    return duel;
}

function addObserverToDuel(duelId: string, observerId: string): boolean {
    const duel = activeDuels.get(duelId);
    if (!duel) return false;
    duel.observers.add(observerId);
    return true;
}

function processDuelResults(duel: DuelData): void {
    if (!duel.currentQuestion) return;

    const attackerAnswer = duel.answers.get(duel.attackerId) ?? false;
    const defenderAnswer = duel.answers.get(duel.defenderId) ?? false;
    const attackerResponseTime = duel.responseTime?.get(duel.attackerId);
    const defenderResponseTime = duel.responseTime?.get(duel.defenderId);
    
    const correctAnswerString = typeof duel.currentQuestion.correctAnswer === 'number' 
        ? duel.currentQuestion.answers[duel.currentQuestion.correctAnswer] 
        : String(duel.currentQuestion.correctAnswer);
    
    // Update scores based on correct answers
    const attacker = gameState.players.find(p => p.id === duel.attackerId);
    const defender = gameState.players.find(p => p.id === duel.defenderId);
    
    if (attacker && attackerAnswer) {
        attacker.score = (attacker.score || 0) + 10;
    }
    if (defender && defenderAnswer) {
        defender.score = (defender.score || 0) + 10;
    }
    
    // Update observer scores
    Array.from(duel.observerAnswers.entries()).forEach(([observerId, correct]) => {
        if (correct) {
            const observer = gameState.players.find(p => p.id === observerId);
            if (observer) {
                observer.score = (observer.score || 0) + 10;
            }
        }
    });
    
    const result: DuelResult = {
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
            scoreGained: answer ? 10 : 0
        }))
    };
    
    processDuelResult(result);
    activeDuels.delete(`${duel.attackerId}-${duel.defenderId}`);
}

function handleTerritoryCapture(result: DuelResult, territory: Territory): void {
    // Check if territory has an owner
    if (!territory.owner || typeof territory.owner !== 'string') {
        console.error('❌ Territory has no valid owner');
        return;
    }

    const defender = gameState.players.find(p => p.id === territory.owner);
    const attacker = gameState.players.find(p => p.id === result.attackerId);

    if (!defender || !attacker) {
        console.error('❌ Could not find attacker or defender for territory capture');
        return;
    }

    // Remove territory from defender
    defender.territories = defender.territories.filter(t => t !== result.territoryId);
    
    // Update defender's supply lines
    updateSupplyLines(defender.id).then(() => {
        // Update territory ownership
        territory.owner = result.attackerId;
        
        // Add territory to attacker
        if (!attacker.territories.includes(result.territoryId)) {
            attacker.territories.push(result.territoryId);
        }

        // Update all players' supply lines
        Promise.all(gameState.players.map(player => updateSupplyLines(player.id)))
            .then(() => {
                // Check if defender has lost all capitols
                const defenderHasCapitols = Object.values(gameState.territories).some(t => 
                    t.owner === defender.id && t.isCapitol
                );

                if (!defenderHasCapitols && defender.territories.length > 0) {
                    // Transfer remaining territories to attacker
                    const remainingTerritories = Object.values(gameState.territories)
                        .filter(t => t.owner === defender.id);

                    remainingTerritories.forEach(t => {
                        t.owner = result.attackerId;
                        defender.territories = defender.territories.filter(id => id !== t.id);
                        if (!attacker.territories.includes(t.id)) {
                            attacker.territories.push(t.id);
                        }
                    });

                    console.log(`🏰 ${defender.name} lost all capitols. ${remainingTerritories.length} territories transferred to ${attacker.name}`);
                }

                // Check if game is over
                const playersWithCapitols = gameState.players.filter(p => 
                    Object.values(gameState.territories).some(t => 
                        t.owner === p.id && t.isCapitol
                    )
                );

                const gameOver = playersWithCapitols.length === 1;

                // Emit game state update
                io.emit('game-state-update', {
                    territories: gameState.territories,
                    players: gameState.players,
                    currentTurn: gameState.currentTurn
                });

                if (gameOver) {
                    endGame();
                } else {
                    // Move to next turn
                    setTimeout(() => {
                        nextTurn();
                    }, 5000);
                }
            });
    });
}

// Socket.IO event handlers
io.on('connection', (socket) => {
    console.log('👋 New connection from socket:', socket.id);
    console.log('🔍 Total connected clients:', io.engine.clientsCount);

    socket.on('join-game', (playerName: string) => {
        console.log(`🧙‍♂️ Player "${playerName}" (${socket.id}) is trying to join the game`);
        
        // Check if a player with this name already exists
        const existingPlayer = gameState.players.find(p => p.name === playerName);
        if (existingPlayer) {
            // If the player exists but with a different socket ID, they might have refreshed
            if (existingPlayer.socketId !== socket.id) {
                // Update their socket ID
                existingPlayer.socketId = socket.id;
                existingPlayer.id = socket.id; // Update main ID as well since we use it for game logic
                console.log(`🔄 Updated socket ID for existing player ${playerName}`);
                
                // Send the current game state to the reconnected player
                socket.emit('player-list-update', gameState.players);
                if (gameState.gameActive) {
                    socket.emit('game-state-update', {
                        territories: gameState.territories,
                        players: gameState.players,
                        currentTurn: gameState.currentTurn
                    });
                }
                return;
            }
            // If they have the same socket ID, this is a duplicate join attempt
            console.log(`❌ Player ${playerName} already exists in the game`);
            return;
        }

        const newPlayer: Player = {
            id: socket.id,
            socketId: socket.id,
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
        // Find the player by socket ID
        const playerIndex = gameState.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex !== -1) {
            const player = gameState.players[playerIndex];
            console.log(`👋 Player "${player.name}" (${socket.id}) disconnected`);
            
            // If the game hasn't started yet, remove them from the game
            if (!gameState.gameActive) {
                gameState.players.splice(playerIndex, 1);
                io.emit('player-list-update', gameState.players);
                console.log('📝 Updated player list after disconnect:', gameState.players.map(p => `${p.name} (${p.id})`));
            } else {
                // If the game is active, mark them as disconnected but don't remove them
                player.disconnected = true;
                io.emit('player-disconnected', { playerId: player.id, playerName: player.name });
            }
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
        const duelData: DuelData = {
            attackerId: socket.id,
            defenderId: territory.owner || '',
            territory: territoryId,
            observers: new Set(observers),
            currentQuestion: null,
            answers: new Map<string, boolean>(),
            observerAnswers: new Map<string, boolean>(),
            isActive: true,
            round: territory.isCapitol ? 1 : undefined,
            roundsRequired: territory.isCapitol ? (territory.shields || 0) + 1 : undefined,
            responseTime: new Map()
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
            // Get a question from the queue
            const question = getNextQuestion(territory.value);
            duelData.currentQuestion = question;
            
            // Set the question sent time
            duelData.questionSentTime = Date.now();
            
            // For debugging
            console.log("Question to be emitted:", {
                id: question.id,
                text: question.text,
                correctAnswer: question.correctAnswer,
                difficulty: question.difficulty,
                answersCount: question.answers.length,
                isCapitol: territory.isCapitol,
                round: duelData.round,
                roundsRequired: duelData.roundsRequired
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
                        
                    const result: DuelResult = {
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
            }, 20000);
        }, 1000); // Wait 1 second before sending questions
    });

    socket.on('submit-answer', (answer: string) => {
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

        // Calculate response time
        const responseTimeMs = duel.questionSentTime ? Date.now() - duel.questionSentTime : 0;
        const responseTime = (responseTimeMs / 1000).toFixed(1) + 's';
        
        // Store response time
        duel.responseTime.set(playerId, responseTime);
        
        // Helper function to normalize strings for comparison
        const normalizeForComparison = (str: string) => {
            return str.toLowerCase().trim();
        };
        
        // Properly evaluate the answer based on the correctAnswer type
        if (playerId === duel.attackerId || playerId === duel.defenderId) {
            // Handle numeric correctAnswer indexes correctly
            let isCorrect = false;
            if (typeof duel.currentQuestion?.correctAnswer === 'number') {
                // For numeric indices, find the index of the player's answer in the answers array
                const answerIndex = duel.currentQuestion.answers.findIndex(a => 
                    normalizeForComparison(a) === normalizeForComparison(answer));
                
                console.log(`📊 Index-based evaluation: Player answer "${answer}" is at index ${answerIndex}, correct index is ${duel.currentQuestion.correctAnswer}`);
                isCorrect = answerIndex === duel.currentQuestion.correctAnswer;
            } else {
                const correctAnswerValue = duel.currentQuestion?.correctAnswer;
                
                const normalizedAnswer = normalizeForComparison(answer);
                const normalizedCorrect = correctAnswerValue ? normalizeForComparison(correctAnswerValue as string) : '';
                
                console.log(`📊 String-based evaluation: "${normalizedAnswer}" === "${normalizedCorrect}"`);
                isCorrect = normalizedAnswer === normalizedCorrect;
            }
            
            console.log(`📊 Final evaluation result: ${isCorrect}`);
            duel.answers.set(playerId, isCorrect);
        } else if (duel.observers.has(playerId)) {
            // Similar logic for observers
            let isCorrect = false;
            
            if (typeof duel.currentQuestion?.correctAnswer === 'number') {
                const answerIndex = duel.currentQuestion.answers.findIndex(a => 
                    normalizeForComparison(a) === normalizeForComparison(answer));
                
                isCorrect = answerIndex === duel.currentQuestion.correctAnswer;
            } else {
                const correctAnswerValue = duel.currentQuestion?.correctAnswer;
                
                const normalizedAnswer = normalizeForComparison(answer);
                const normalizedCorrect = correctAnswerValue ? normalizeForComparison(correctAnswerValue as string) : '';
                
                isCorrect = normalizedAnswer === normalizedCorrect;
            }
            
            duel.observerAnswers.set(playerId, isCorrect);
        }
        
        // Check if all participants have answered
        const allParticipantsAnswered = () => {
            // Check if attacker has answered
            const attackerAnswered = duel.answers.has(duel.attackerId);
            
            // For unclaimed territories, we only need attacker and observers
            if (!duel.defenderId) {
                return attackerAnswered && 
                       duel.observers.size === duel.observerAnswers.size;
            }
            
            // For claimed territories, we need both attacker, defender, and all observers
            const defenderAnswered = duel.answers.has(duel.defenderId);
            return attackerAnswered && 
                   defenderAnswered && 
                   duel.observers.size === duel.observerAnswers.size;
        };

        console.log(`Answer status:
            Attacker (${duel.attackerId}): ${duel.answers.has(duel.attackerId)}
            Defender (${duel.defenderId || 'none'}): ${duel.defenderId ? duel.answers.has(duel.defenderId) : 'N/A'}
            Observers answered: ${duel.observerAnswers.size}/${duel.observers.size}
        `);
        
        if (allParticipantsAnswered()) {
            console.log('✅ All participants have answered, processing results...');
            
            // Clear the timeout so it doesn't process twice
            if (duel.timeoutId) {
                clearTimeout(duel.timeoutId);
                duel.timeoutId = undefined;
            }
            
            // Process results
            processDuelResults(duel);
        } else {
            console.log('⏳ Waiting for other participants to answer...');
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

    socket.on('start-duel', (data: { attackerId: string, defenderId: string, territory: string }) => {
        const { attackerId, defenderId, territory } = data;
        const duelId = `${attackerId}-${defenderId}`;
        
        // Create duel data
        const duelData: DuelData = {
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
        const question = getNextQuestion(gameState.territories[territory].value);
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

    socket.on('reconnect-session', (data: { playerId: string, playerName: string }) => {
        console.log(`Attempting to reconnect player ${data.playerName} (${data.playerId})`);
        
        // Check if the player exists in any active game
        const existingPlayer = gameState.players.find(p => p.id === data.playerId);
        
        if (existingPlayer) {
            // Reconnect the player
            existingPlayer.socketId = socket.id;
            socket.emit('reconnection-successful', { 
                playerId: existingPlayer.id, 
                playerName: existingPlayer.name 
            });
            
            // If there's an active game, send the current state
            if (gameState.gameActive) {
                socket.emit('game-state-update', {
                    territories: gameState.territories,
                    players: gameState.players
                });
            }
            
            console.log(`Player ${data.playerName} reconnected successfully`);
        } else {
            socket.emit('reconnection-failed');
            console.log(`Failed to reconnect player ${data.playerName} - session not found`);
        }
    });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
}); 