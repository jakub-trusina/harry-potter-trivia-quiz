import { createTestServer } from '../setup';
import { Socket } from 'socket.io-client';
import { GameState, Territory, Player } from '../../src/types/game';

describe('Full Gameplay E2E Tests', () => {
    let server: any;
    let player1: Socket;
    let player2: Socket;
    
    beforeEach((done) => {
        server = createTestServer();
        player1 = server.clientSocket;
        player2 = server.createTestClient(server.port);
        
        // Wait for sockets to connect
        player1.on('connect', () => {
            player2.on('connect', () => {
                done();
            });
        });
    });
    
    afterEach(() => {
        server.cleanup();
    });
    
    test('Full game flow from start to finish', (done) => {
        let gameState: GameState;
        let player1Id: string;
        let player2Id: string;
        
        // Step 1: Players join the game
        player1.emit('join-game', 'Harry');
        player2.emit('join-game', 'Draco');
        
        let playersJoined = 0;
        player1.on('player-list-update', (players: Player[]) => {
            playersJoined++;
            if (playersJoined === 2) {
                expect(players).toHaveLength(2);
                player1Id = players[0].id;
                player2Id = players[1].id;
                
                // Step 2: Start the game
                player1.emit('start-game');
            }
        });
        
        // Step 3: Game starts and territories are distributed
        player1.on('game-start', (data: GameState) => {
            gameState = data;
            expect(Object.keys(gameState.territories)).toHaveLength(36); // 6x6 grid
            
            // Find adjacent territories for attack
            const player1Territories = Object.values(gameState.territories)
                .filter((t: Territory) => t.owner === player1Id);
            const player2Territories = Object.values(gameState.territories)
                .filter((t: Territory) => t.owner === player2Id);
                
            const attackingTerritory = player1Territories[0];
            const targetTerritory = player2Territories.find(t => 
                Math.abs(t.x - attackingTerritory.x) + Math.abs(t.y - attackingTerritory.y) === 1
            );
            
            if (targetTerritory) {
                // Step 4: Initiate an attack
                player1.emit('attack-territory', targetTerritory.id);
            }
        });
        
        // Step 5: Handle duel
        player1.on('duel-started', (data: { role: string }) => {
            expect(data.role).toBe('attacker');
        });
        
        player1.on('question', (data: { question: string, answers: string[] }) => {
            expect(data.question).toBeDefined();
            expect(data.answers).toBeInstanceOf(Array);
            
            // Submit an answer
            player1.emit('submit-answer', data.answers[0]);
        });
        
        player2.on('question', (data: { question: string, answers: string[] }) => {
            // Submit an answer
            player2.emit('submit-answer', data.answers[0]);
        });
        
        // Step 6: Handle duel result
        player1.on('duel-result', (result: any) => {
            expect(result.attackerId).toBe(player1Id);
            expect(result.defenderId).toBe(player2Id);
            
            // Step 7: Check game state update
            player1.on('game-state-update', (newState: GameState) => {
                expect(newState.territories).toBeDefined();
                expect(newState.players).toBeDefined();
                expect(newState.currentTurn).toBeDefined();
                done();
            });
        });
    }, 10000); // Increase timeout for full game flow
    
    test('Should handle player disconnection during game', (done) => {
        // Step 1: Start game with two players
        player1.emit('join-game', 'Harry');
        player2.emit('join-game', 'Draco');
        
        let gameStarted = false;
        player1.on('player-list-update', (players: Player[]) => {
            if (players.length === 2 && !gameStarted) {
                gameStarted = true;
                player1.emit('start-game');
            }
        });
        
        player1.on('game-start', () => {
            // Step 2: Disconnect one player
            player2.disconnect();
            
            // Step 3: Check for disconnection handling
            player1.on('player-disconnected', (data: { playerId: string, playerName: string }) => {
                expect(data.playerName).toBe('Draco');
                done();
            });
        });
    });
}); 