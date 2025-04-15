import { checkSupplyLine } from '../../src/server';
import { Territory, GameState } from '../../src/types/game';

describe('Supply Line Tests', () => {
    beforeEach(() => {
        // Reset game state before each test
        global.gameState = {
            territories: {},
            players: [],
            currentTurn: null,
            gameActive: false
        };
    });
    
    describe('Complex Territory Configurations', () => {
        test('should handle snake-like supply line', () => {
            const playerId = 'player1';
            const territories: Record<string, Territory> = {
                '0-0': {
                    id: '0-0',
                    owner: playerId,
                    isCapitol: true,
                    value: 3,
                    x: 0,
                    y: 0
                },
                '0-1': {
                    id: '0-1',
                    owner: playerId,
                    isCapitol: false,
                    value: 1,
                    x: 0,
                    y: 1
                },
                '0-2': {
                    id: '0-2',
                    owner: playerId,
                    isCapitol: false,
                    value: 1,
                    x: 0,
                    y: 2
                },
                '1-2': {
                    id: '1-2',
                    owner: playerId,
                    isCapitol: false,
                    value: 1,
                    x: 1,
                    y: 2
                },
                '2-2': {
                    id: '2-2',
                    owner: playerId,
                    isCapitol: false,
                    value: 1,
                    x: 2,
                    y: 2
                }
            };
            
            global.gameState.territories = territories;
            
            // Check supply line to the last territory in the snake
            expect(checkSupplyLine('2-2', playerId)).toBe(true);
        });
        
        test('should detect isolated territory', () => {
            const playerId = 'player1';
            const territories: Record<string, Territory> = {
                '0-0': {
                    id: '0-0',
                    owner: playerId,
                    isCapitol: true,
                    value: 3,
                    x: 0,
                    y: 0
                },
                '2-2': {
                    id: '2-2',
                    owner: playerId,
                    isCapitol: false,
                    value: 1,
                    x: 2,
                    y: 2
                }
            };
            
            global.gameState.territories = territories;
            
            // Territory at 2-2 should be isolated
            expect(checkSupplyLine('2-2', playerId)).toBe(false);
        });
        
        test('should handle territory surrounded by enemy territories', () => {
            const playerId = 'player1';
            const enemyId = 'player2';
            const territories: Record<string, Territory> = {
                '0-0': {
                    id: '0-0',
                    owner: playerId,
                    isCapitol: true,
                    value: 3,
                    x: 0,
                    y: 0
                },
                '0-1': {
                    id: '0-1',
                    owner: enemyId,
                    isCapitol: false,
                    value: 1,
                    x: 0,
                    y: 1
                },
                '1-0': {
                    id: '1-0',
                    owner: enemyId,
                    isCapitol: false,
                    value: 1,
                    x: 1,
                    y: 0
                },
                '1-1': {
                    id: '1-1',
                    owner: playerId,
                    isCapitol: false,
                    value: 1,
                    x: 1,
                    y: 1
                }
            };
            
            global.gameState.territories = territories;
            
            // Territory at 1-1 should be isolated by enemy territories
            expect(checkSupplyLine('1-1', playerId)).toBe(false);
        });
        
        test('should handle multiple possible supply line paths', () => {
            const playerId = 'player1';
            const territories: Record<string, Territory> = {
                '0-0': {
                    id: '0-0',
                    owner: playerId,
                    isCapitol: true,
                    value: 3,
                    x: 0,
                    y: 0
                },
                '0-1': {
                    id: '0-1',
                    owner: playerId,
                    isCapitol: false,
                    value: 1,
                    x: 0,
                    y: 1
                },
                '1-0': {
                    id: '1-0',
                    owner: playerId,
                    isCapitol: false,
                    value: 1,
                    x: 1,
                    y: 0
                },
                '1-1': {
                    id: '1-1',
                    owner: playerId,
                    isCapitol: false,
                    value: 1,
                    x: 1,
                    y: 1
                }
            };
            
            global.gameState.territories = territories;
            
            // Territory at 1-1 should have supply line through either path
            expect(checkSupplyLine('1-1', playerId)).toBe(true);
        });
    });
    
    describe('Supply Line Updates', () => {
        test('should update supply lines after territory capture', () => {
            const playerId = 'player1';
            const enemyId = 'player2';
            const territories: Record<string, Territory> = {
                '0-0': {
                    id: '0-0',
                    owner: playerId,
                    isCapitol: true,
                    value: 3,
                    x: 0,
                    y: 0
                },
                '0-1': {
                    id: '0-1',
                    owner: enemyId,
                    isCapitol: false,
                    value: 1,
                    x: 0,
                    y: 1
                },
                '0-2': {
                    id: '0-2',
                    owner: playerId,
                    isCapitol: false,
                    value: 1,
                    x: 0,
                    y: 2
                }
            };
            
            global.gameState.territories = territories;
            
            // Initially 0-2 should be isolated
            expect(checkSupplyLine('0-2', playerId)).toBe(false);
            
            // Simulate capturing the middle territory
            territories['0-1'].owner = playerId;
            
            // Now 0-2 should have a supply line
            expect(checkSupplyLine('0-2', playerId)).toBe(true);
        });
    });
}); 