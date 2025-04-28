import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { gameManager } from './modules/game-manager.js';
import { gameStateManager } from './modules/game-state-manager.js';
import { territoryManager } from './modules/territory-manager.js';
import { questionManager } from './modules/question-manager.js';
import { duelManager } from './modules/duel-manager.js';
import { Player, DuelData, DuelResult, ObserverResult, Territory, GameState, Question, DuelStartData } from './types.js';

interface PlayerWithHost extends Player {
    isHost?: boolean;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../../dist/public')));

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('👋 New connection from socket:', socket.id);

    // Handle player joining
    socket.on('join-game', (playerName: string) => {
        const state = gameStateManager.getState();
        const existingPlayer = state.players.find(p => p.name === playerName) as PlayerWithHost;
        const player: PlayerWithHost = {
            id: socket.id,
            socketId: socket.id,
            name: playerName,
            territories: existingPlayer?.territories || [],
            points: existingPlayer?.points || 0,
            score: 0,
            eliminated: existingPlayer?.eliminated || false,
            supplyLines: existingPlayer?.supplyLines || [],
            isHost: existingPlayer?.isHost || state.players.length === 0
        };

        gameStateManager.addPlayer(player);
        socket.emit('joined-game', { 
            playerId: socket.id, 
            isHost: player.isHost,
            isReconnection: !!existingPlayer 
        });
        io.emit('game-state-update', gameStateManager.getState());
    });

    // Handle game start
    socket.on('start-game', () => {
        const state = gameStateManager.getState();
        const player = state.players.find(p => p.id === socket.id) as PlayerWithHost;
        
        if (player?.isHost) {
            gameManager.startGame();
            io.emit('game-started', gameStateManager.getState());
        }
    });

    // Handle territory attacks
    socket.on('attack-territory', (territoryId: string) => {
        try {
            const state = gameStateManager.getState();
            const attacker = state.players.find(p => p.id === socket.id);
            const territory = state.territories[territoryId];

            if (!attacker || !territory) {
                socket.emit('error', 'Invalid attack');
                return;
            }

            if (state.currentTurn !== socket.id) {
                socket.emit('error', 'Not your turn');
                return;
            }

            if (territory.owner === socket.id) {
                socket.emit('error', 'Cannot attack your own territory');
                return;
            }

            // Check if player is already in a capitol battle
            const activeDuel = duelManager.findPlayerDuel(socket.id);
            if (activeDuel && activeDuel.isCapitolRound) {
                socket.emit('error', 'Cannot attack while in a capitol battle');
                return;
            }

            // Get the territory we're attacking from (must be adjacent to target)
            const [tx, ty] = territoryId.split('-').map(Number);
            const adjacentTerritories = territoryManager.getAdjacentTerritories(tx, ty, 6);
            const attackingFromTerritory = adjacentTerritories.find(adjId => {
                const adjTerritory = state.territories[adjId];
                return adjTerritory && adjTerritory.owner === socket.id;
            });

            if (!attackingFromTerritory) {
                socket.emit('error', 'Cannot attack this territory - it must be adjacent to one of your connected territories!');
                return;
            }

            // Check if the territory we're attacking from has a supply line to our capitol
            const hasSupplyLine = territoryManager.checkSupplyLine(attackingFromTerritory, socket.id);
            if (!hasSupplyLine) {
                socket.emit('error', 'You need to connect this territory to your capitol before attacking from here!');
                return;
            }

            const defender = territory.owner ? state.players.find(p => p.id === territory.owner) : null;
            
            if (defender) {
                const attackerWithCapitols = {
                    ...attacker,
                    capitols: Object.values(state.territories).filter(t => t.isCapitol && t.owner === attacker.id)
                };
                const defenderWithCapitols = {
                    ...defender,
                    capitols: Object.values(state.territories).filter(t => t.isCapitol && t.owner === defender.id)
                };
                
                // For capitol territories, set up multi-round duel
                const isCapitolAttack = territory.isCapitol;
                const shields = isCapitolAttack ? (territory.shields || 2) : 0;
                const roundsRequired = isCapitolAttack ? shields + 1 : 1;
                
                const duel = duelManager.createDuel(territory, attackerWithCapitols, defenderWithCapitols);
                if (duel) {
                    // Send duel started event with capitol info
                    socket.emit('duel-started', { 
                        role: 'attacker', 
                        duelId: duel.id,
                        question: duel.question,
                        isCapitolRound: isCapitolAttack,
                        round: 1,
                        totalRounds: roundsRequired,
                        shieldsRemaining: shields
                    });
                    io.to(defender.socketId).emit('duel-started', { 
                        role: 'defender', 
                        duelId: duel.id,
                        question: duel.question,
                        isCapitolRound: isCapitolAttack,
                        round: 1,
                        totalRounds: roundsRequired,
                        shieldsRemaining: shields
                    });
                    
                    // Send question to both players with capitol info
                    socket.emit('question', {
                        question: duel.question.text,
                        answers: duel.question.answers,
                        role: 'attacker',
                        duelId: duel.id,
                        isCapitolRound: isCapitolAttack,
                        round: 1,
                        totalRounds: roundsRequired,
                        shieldsRemaining: shields
                    });
                    io.to(defender.socketId).emit('question', {
                        question: duel.question.text,
                        answers: duel.question.answers,
                        role: 'defender',
                        duelId: duel.id,
                        isCapitolRound: isCapitolAttack,
                        round: 1,
                        totalRounds: roundsRequired,
                        shieldsRemaining: shields
                    });
                }
            } else {
                // Handle unclaimed territory
                territory.owner = socket.id;
                gameStateManager.updateTerritory(territory);
                io.emit('game-state-update', gameStateManager.getState());
                gameManager.nextTurn();
            }
        } catch (error) {
            console.error('Error processing attack territory:', error);
            socket.emit('error', 'Failed to process attack');
        }
    });

    // Handle duel answers - consolidated handler
    socket.on('submit-answer', (data: { duelId: string, answer: string }) => {
        try {
            console.log('📥 Received submit-answer:', data);
            
            const state = gameStateManager.getState();
            const player = state.players.find(p => p.id === socket.id);
            
            // Debug active duels
            console.log('🔍 Active duels:', state.activeDuels.map(d => ({ 
                id: d.id, 
                attacker: d.attacker,
                defender: d.defender
            })));
            
            const duel = duelManager.getDuel(data.duelId);
            
            if (!duel) {
                console.log('❌ Duel not found:', data.duelId);
                socket.emit('error', 'Invalid duel answer - duel not found');
                return;
            }
            
            const territory = state.territories[duel?.contestedTerritoryId || ''];

            if (!player) {
                console.log('❌ Player not found:', socket.id);
                socket.emit('error', 'Invalid duel answer - player not found');
                return;
            }
            
            if (!territory) {
                console.log('❌ Territory not found:', duel?.contestedTerritoryId);
                socket.emit('error', 'Invalid duel answer - territory not found');
                return;
            }

            // Validate player role
            if (duel.attacker !== socket.id && duel.defender !== socket.id) {
                console.log('❌ Player not part of duel:', { playerId: socket.id, duelId: data.duelId });
                socket.emit('error', 'Not part of this duel');
                return;
            }

            console.log('📝 Received answer:', {
                playerId: socket.id,
                playerName: player.name,
                duelId: duel.id,
                answer: data.answer,
                role: duel.attacker === socket.id ? 'attacker' : 'defender'
            });

            // Process answer through duel manager
            const result = duelManager.processAnswer(duel.id, socket.id, data.answer);
            
            if (result) {
                // Emit results to both players
                io.to(duel.attacker).emit('duel-result', result);
                io.to(duel.defender).emit('duel-result', result);

                if (result.continueToNextRound) {
                    // For capitol battles, add a delay before starting the next round
                    // This allows the resolution window to be shown properly
                    setTimeout(() => {
                        // Start next round with a new question
                        const newQuestion = questionManager.getRandomQuestion(territory.value);
                        if (!newQuestion) {
                            console.error('Failed to get new question for next round');
                            return;
                        }

                        // Update duel with new question
                        duel.question = newQuestion;
                        
                        // Emit new round to both players
                        const roundData = {
                            role: 'attacker',
                            duelId: duel.id,
                            question: newQuestion,
                            isCapitolRound: result.isCapitolRound,
                            round: (result.round ?? 1) + 1,
                            totalRounds: result.totalRounds,
                            shieldsRemaining: result.shieldsRemaining
                        } as DuelStartData;

                        io.to(duel.attacker).emit('duel-started', roundData);
                        io.to(duel.defender).emit('duel-started', { ...roundData, role: 'defender' });
                        
                        // Send question to both players immediately
                        io.to(duel.attacker).emit('question', {
                            question: newQuestion.text,
                            answers: newQuestion.answers,
                            role: 'attacker',
                            duelId: duel.id,
                            isCapitolRound: result.isCapitolRound,
                            round: (result.round ?? 1) + 1,
                            totalRounds: result.totalRounds,
                            shieldsRemaining: result.shieldsRemaining
                        });
                        io.to(duel.defender).emit('question', {
                            question: newQuestion.text,
                            answers: newQuestion.answers,
                            role: 'defender',
                            duelId: duel.id,
                            isCapitolRound: result.isCapitolRound,
                            round: (result.round ?? 1) + 1,
                            totalRounds: result.totalRounds,
                            shieldsRemaining: result.shieldsRemaining
                        });
                    }, 3000); // 3 second delay to show resolution window
                } else {
                    // Handle territory capture and game state updates
                    if (result.territoryTransferred) {
                        const territory = state.territories[result.territoryTransferred];
                        if (territory && territory.owner === result.loser) {
                            territory.owner = result.winner;
                            gameStateManager.updateTerritory(territory);
                        }
                    }

                    // Check if game is over
                    const playersWithCapitols = state.players.filter(p => 
                        Object.values(state.territories).some(t => 
                            t.owner === p.id && t.isCapitol && !p.eliminated
                        )
                    );

                    if (playersWithCapitols.length === 1) {
                        io.emit('game-end', { winner: playersWithCapitols[0].id });
                    } else if (playersWithCapitols.length === 0) {
                        io.emit('game-end', { winner: null, reason: 'no_capitols' });
                    } else {
                        gameManager.nextTurn();
                    }

                    io.emit('game-state-update', gameStateManager.getState());
                }
            }
        } catch (error) {
            console.error('Error processing duel answer:', error);
            socket.emit('error', 'Failed to process answer');
        }
    });

    // Handle observer answers with validation
    socket.on('observer-answer', (data: { duelId: string, answer: string }) => {
        try {
            const duel = duelManager.findPlayerDuel(data.duelId);
            if (!duel) {
                socket.emit('error', 'Invalid duel');
                return;
            }

            // Validate observer is not part of the duel
            if (duel.attacker === socket.id || duel.defender === socket.id) {
                socket.emit('error', 'Players cannot be observers');
                return;
            }

            const observerResult = duelManager.processObserverResult(duel, data.answer, socket.id);
            io.emit('observer-result', observerResult);
        } catch (error) {
            console.error('Error processing observer answer:', error);
            socket.emit('error', 'Failed to process observer answer');
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        const state = gameStateManager.getState();
        const player = state.players.find(p => p.id === socket.id);
        
        if (player) {
            player.disconnected = true;
            gameStateManager.updatePlayer(player);
            io.emit('game-state-update', gameStateManager.getState());
        }
    });

    // Update duel-started event handler
    socket.on('duel-started', (duel: DuelData) => {
        const attackerData: DuelStartData = {
            role: 'attacker',
            duelId: duel.id,
            question: duel.question,
            isCapitolRound: duel.isCapitolRound,
            round: duel.round,
            totalRounds: duel.totalRounds,
            shieldsRemaining: duel.shieldsRemaining
        };

        const defenderData: DuelStartData = {
            role: 'defender',
            duelId: duel.id,
            question: duel.question,
            isCapitolRound: duel.isCapitolRound,
            round: duel.round,
            totalRounds: duel.totalRounds,
            shieldsRemaining: duel.shieldsRemaining
        };

        // Emit to both players
        io.to(duel.attacker).emit('duel-started', attackerData);
        io.to(duel.defender).emit('duel-started', defenderData);
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
}); 