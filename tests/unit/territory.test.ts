import { checkSupplyLine, getAdjacentTerritories } from '../../src/server';

describe('Territory Functions', () => {
    describe('getAdjacentTerritories', () => {
        test('should return correct adjacent territories for middle position', () => {
            const adjacent = getAdjacentTerritories(2, 2, 6);
            expect(adjacent).toHaveLength(4);
            expect(adjacent).toContain('1-2');
            expect(adjacent).toContain('3-2');
            expect(adjacent).toContain('2-1');
            expect(adjacent).toContain('2-3');
        });

        test('should return correct adjacent territories for corner position', () => {
            const adjacent = getAdjacentTerritories(0, 0, 6);
            expect(adjacent).toHaveLength(2);
            expect(adjacent).toContain('1-0');
            expect(adjacent).toContain('0-1');
        });

        test('should return correct adjacent territories for edge position', () => {
            const adjacent = getAdjacentTerritories(0, 2, 6);
            expect(adjacent).toHaveLength(3);
            expect(adjacent).toContain('0-1');
            expect(adjacent).toContain('0-3');
            expect(adjacent).toContain('1-2');
        });
    });

    describe('checkSupplyLine', () => {
        beforeEach(() => {
            // Reset game state before each test
            global.gameState = {
                territories: {},
                players: [],
                currentTurn: null,
                gameActive: false
            };
        });

        test('should return true for capitol territory', () => {
            const territoryId = '0-0';
            const playerId = 'player1';
            
            global.gameState.territories[territoryId] = {
                id: territoryId,
                owner: playerId,
                isCapitol: true,
                value: 3,
                x: 0,
                y: 0
            };

            expect(checkSupplyLine(territoryId, playerId)).toBe(true);
        });

        test('should return true for territory adjacent to capitol', () => {
            const capitolId = '0-0';
            const territoryId = '0-1';
            const playerId = 'player1';
            
            global.gameState.territories[capitolId] = {
                id: capitolId,
                owner: playerId,
                isCapitol: true,
                value: 3,
                x: 0,
                y: 0
            };
            
            global.gameState.territories[territoryId] = {
                id: territoryId,
                owner: playerId,
                isCapitol: false,
                value: 1,
                x: 0,
                y: 1
            };

            expect(checkSupplyLine(territoryId, playerId)).toBe(true);
        });

        test('should return false for disconnected territory', () => {
            const capitolId = '0-0';
            const territoryId = '5-5';
            const playerId = 'player1';
            
            global.gameState.territories[capitolId] = {
                id: capitolId,
                owner: playerId,
                isCapitol: true,
                value: 3,
                x: 0,
                y: 0
            };
            
            global.gameState.territories[territoryId] = {
                id: territoryId,
                owner: playerId,
                isCapitol: false,
                value: 1,
                x: 5,
                y: 5
            };

            expect(checkSupplyLine(territoryId, playerId)).toBe(false);
        });
    });
}); 