import { createTestServer } from '../setup.js';
import { jest } from '@jest/globals';
import type { Territory } from '../../src/types/game.js';

describe('Capitol Battle Tests', () => {
    let server: Awaited<ReturnType<typeof createTestServer>>;

    beforeEach(async () => {
        server = await createTestServer();
    });

    afterEach(async () => {
        await server.cleanup();
    });

    describe('Capitol Shield Mechanics', () => {
        it('should require multiple rounds to capture capitol', async () => {
            const { clientSocket, createTestClient } = server;
            const client2 = createTestClient(server.port);
            
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Test timeout waiting for duel rounds'));
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
                
                // Attack capitol after game starts
                clientSocket.on('game-start', (data: { territories: Record<string, Territory> }) => {
                    // Find enemy capitol to attack
                    const enemyCapitol = Object.values(data.territories)
                        .find(t => t.owner !== clientSocket.id && t.isCapitol);
                    
                    if (enemyCapitol) {
                        clientSocket.emit('attack-territory', enemyCapitol.id);
                    } else {
                        clearTimeout(timeout);
                        reject(new Error('No enemy capitol found'));
                    }
                });
                
                let roundCount = 0;
                
                // Check multiple rounds
                clientSocket.on('duel-started', (data) => {
                    try {
                        expect(data.role).toBe('attacker');
                        roundCount++;
                        
                        if (roundCount === 3) { // Capitol should require 3 rounds
                            clearTimeout(timeout);
                            client2.disconnect();
                            resolve();
                        }
                    } catch (error) {
                        clearTimeout(timeout);
                        reject(error);
                    }
                });
                
                // Handle errors
                clientSocket.on('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
                
                client2.on('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            });
        });

        it('should include observers in all capitol battle rounds', async () => {
            const { clientSocket, createTestClient } = server;
            const client2 = createTestClient(server.port);
            const client3 = createTestClient(server.port); // Observer
            
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Test timeout waiting for observer participation'));
                }, 5000);
                
                // Join three players
                clientSocket.emit('join-game', 'Player1');
                client2.emit('join-game', 'Player2');
                client3.emit('join-game', 'Player3');
                
                // Start game after all players join
                clientSocket.on('player-list-update', (players) => {
                    if (players.length === 3) {
                        clientSocket.emit('start-game');
                    }
                });
                
                // Attack capitol after game starts
                clientSocket.on('game-start', (data: { territories: Record<string, Territory> }) => {
                    // Find enemy capitol to attack
                    const enemyCapitol = Object.values(data.territories)
                        .find(t => t.owner !== clientSocket.id && t.isCapitol);
                    
                    if (enemyCapitol) {
                        clientSocket.emit('attack-territory', enemyCapitol.id);
                    } else {
                        clearTimeout(timeout);
                        reject(new Error('No enemy capitol found'));
                    }
                });
                
                // Check observer participation
                client3.on('duel-started', (data) => {
                    clearTimeout(timeout);
                    try {
                        expect(data.role).toBe('observer');
                        client2.disconnect();
                        client3.disconnect();
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
                
                // Handle errors
                clientSocket.on('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
                
                client2.on('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
                
                client3.on('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            });
        });
    });
}); 