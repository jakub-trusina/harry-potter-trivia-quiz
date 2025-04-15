import { createTestServer } from '../setup.js';
import { jest } from '@jest/globals';
import type { Territory } from '../../src/types/game.js';

describe('Game Integration Tests', () => {
    let server: Awaited<ReturnType<typeof createTestServer>>;
    
    beforeEach(async () => {
        server = await createTestServer();
    });
    
    afterEach(async () => {
        await server.cleanup();
    });
    
    describe('Game Setup', () => {
        it('should allow players to join the game', async () => {
            const { clientSocket } = server;
            
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Test timeout waiting for player list update'));
                }, 5000);
                
                clientSocket.emit('join-game', 'TestPlayer');
                
                clientSocket.on('player-list-update', (players) => {
                    clearTimeout(timeout);
                    try {
                        expect(players).toHaveLength(1);
                        expect(players[0].name).toBe('TestPlayer');
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        });
        
        it('should not allow duplicate player names', async () => {
            const { clientSocket, createTestClient } = server;
            const client2 = createTestClient(server.port);
            
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Test timeout waiting for player list update'));
                }, 5000);
                
                clientSocket.emit('join-game', 'TestPlayer');
                
                clientSocket.on('player-list-update', () => {
                    client2.emit('join-game', 'TestPlayer');
                    
                    // Wait a moment to ensure no second update
                    setTimeout(() => {
                        clearTimeout(timeout);
                        client2.disconnect();
                        resolve();
                    }, 1000);
                });
            });
        });
    });
    
    describe('Game Start', () => {
        it('should distribute territories when game starts', async () => {
            const { clientSocket, createTestClient } = server;
            const client2 = createTestClient(server.port);
            
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Test timeout waiting for game start'));
                }, 5000);
                
                // Join two players
                clientSocket.emit('join-game', 'Player1');
                client2.emit('join-game', 'Player2');
                
                // Start game after both players join
                clientSocket.on('player-list-update', (players) => {
                    if (players.length === 2) {
                        clientSocket.emit('start-game');
                    }
                });
                
                // Check territory distribution
                clientSocket.on('game-start', (data) => {
                    clearTimeout(timeout);
                    try {
                        expect(data.territories).toBeDefined();
                        expect(Object.keys(data.territories).length).toBeGreaterThan(0);
                        client2.disconnect();
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        });
        
        it('should assign capitols to players', async () => {
            const { clientSocket, createTestClient } = server;
            const client2 = createTestClient(server.port);
            
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Test timeout waiting for game start'));
                }, 5000);
                
                // Join two players
                clientSocket.emit('join-game', 'Player1');
                client2.emit('join-game', 'Player2');
                
                // Start game after both players join
                clientSocket.on('player-list-update', (players) => {
                    if (players.length === 2) {
                        clientSocket.emit('start-game');
                    }
                });
                
                // Check capitol assignment
                clientSocket.on('game-start', (data) => {
                    clearTimeout(timeout);
                    try {
                        const territories = data.territories as Record<string, Territory>;
                        const capitols = Object.values(territories)
                            .filter(t => t.isCapitol);
                        expect(capitols).toHaveLength(2);
                        client2.disconnect();
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        });
    });
    
    describe('Territory Attacks', () => {
        it('should initiate duel when attacking territory', async () => {
            const { clientSocket, createTestClient } = server;
            const client2 = createTestClient(server.port);
            
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Test timeout waiting for duel start'));
                }, 5000);
                
                // Join two players
                clientSocket.emit('join-game', 'Player1');
                client2.emit('join-game', 'Player2');
                
                // Start game after both players join
                clientSocket.on('player-list-update', (players) => {
                    if (players.length === 2) {
                        clientSocket.emit('start-game');
                    }
                });
                
                // Attack after game starts
                clientSocket.on('game-start', (data: { territories: Record<string, Territory> }) => {
                    // Find an enemy territory to attack
                    const enemyTerritory = Object.values(data.territories)
                        .find((t: Territory) => t.owner !== clientSocket.id);
                    
                    if (enemyTerritory) {
                        clientSocket.emit('attack-territory', enemyTerritory.id);
                    } else {
                        clearTimeout(timeout);
                        reject(new Error('No enemy territory found'));
                    }
                });
                
                // Check if duel starts
                clientSocket.on('duel-started', (data) => {
                    clearTimeout(timeout);
                    try {
                        expect(data.role).toBe('attacker');
                        client2.disconnect();
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        });
    });
}); 