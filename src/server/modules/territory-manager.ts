import { Territory, GameState, Player } from '../../types/game.js';
import { gameStateManager } from './game-state-manager.js';

class TerritoryManager {
    private get gameState(): GameState {
        return gameStateManager.getState();
    }

    public getAdjacentTerritories(x: number, y: number, grid: number): string[] {
        const adjacent: string[] = [];
        if (x > 0) adjacent.push(`${x-1}-${y}`);
        if (x < grid-1) adjacent.push(`${x+1}-${y}`);
        if (y > 0) adjacent.push(`${x}-${y-1}`);
        if (y < grid-1) adjacent.push(`${x}-${y+1}`);
        return adjacent;
    }

    public getDistance(x1: number, y1: number, x2: number, y2: number): number {
        return Math.abs(x1 - x2) + Math.abs(y1 - y2); // Manhattan distance
    }

    public findCapitol(territories: string[], enemyTerritories: string[], grid: number): string {
        let maxMinDistance = -1;
        let capitol = territories[0];

        territories.forEach(tId => {
            const [x1, y1] = tId.split('-').map(Number);
            let minDistance = Infinity;

            enemyTerritories.forEach(enemyId => {
                const [x2, y2] = enemyId.split('-').map(Number);
                const distance = this.getDistance(x1, y1, x2, y2);
                minDistance = Math.min(minDistance, distance);
            });

            if (minDistance > maxMinDistance) {
                maxMinDistance = minDistance;
                capitol = tId;
            }
        });

        return capitol;
    }

    public getCapitolPositions(numPlayers: number): { x: number; y: number }[] {
        const grid = 6;
        
        function generatePositions(): { positions: { x: number; y: number }[], transforms: { flipX: boolean, flipY: boolean, swapXY: boolean } } {
            let positions;
            
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

            const transforms = {
                flipX: Math.random() < 0.5,
                flipY: Math.random() < 0.5,
                swapXY: Math.random() < 0.5
            };

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

        let result;
        let isValid = false;
        let attempts = 0;
        const maxAttempts = 10;

        while (!isValid && attempts < maxAttempts) {
            result = generatePositions();
            
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

        return this.shuffleArray(result!.positions);
    }

    private shuffleArray<T>(array: T[]): T[] {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    public checkSupplyLine(territoryId: string, playerId: string): boolean {
        const territory = this.gameState.territories[territoryId];
        if (!territory || territory.owner !== playerId) return false;
        
        if (territory.isCapitol) return true;
        
        const capitol = Object.values(this.gameState.territories)
            .find(t => t.owner === playerId && t.isCapitol);
        
        if (!capitol) return false;
        
        const visited = new Set<string>();
        const queue: string[] = [capitol.id];
        visited.add(capitol.id);
        
        while (queue.length > 0) {
            const currentId = queue.shift()!;
            
            if (currentId === territoryId) {
                return true;
            }
            
            const [tx, ty] = currentId.split('-').map(Number);
            
            const adjacent = this.getAdjacentTerritories(tx, ty, 6);
            for (const adjId of adjacent) {
                if (visited.has(adjId)) continue;
                
                const adjTerritory = this.gameState.territories[adjId];
                if (adjTerritory && adjTerritory.owner === playerId) {
                    visited.add(adjId);
                    queue.push(adjId);
                }
            }
        }
        
        return false;
    }

    public updateSupplyLines(playerId: string): void {
        // Get all territories owned by the player
        const playerTerritories = Object.values(this.gameState.territories)
            .filter(t => t.owner === playerId);
        
        // Reset supply lines
        playerTerritories.forEach(territory => {
            territory.hasSupplyLine = this.checkSupplyLine(territory.id, playerId);
        });
        
        // Update player's supply line status in game state
        const player = this.gameState.players[playerId];
        if (player) {
            player.supplyLines = playerTerritories.filter(t => t.hasSupplyLine).length;
        }
    }

    public distributeTerritories(): void {
        const grid = 6;
        const numPlayers = this.gameState.players.length;
        const capitolPositions = this.getCapitolPositions(numPlayers);
        const totalTerritories = grid * grid;
        const territoriesPerPlayer = Math.floor(totalTerritories / numPlayers);

        const unclaimedTerritories = new Set<string>();
        for (let x = 0; x < grid; x++) {
            for (let y = 0; y < grid; y++) {
                const id = `${x}-${y}`;
                unclaimedTerritories.add(id);
                this.gameState.territories[id] = {
                    id,
                    x,
                    y,
                    owner: null,
                    value: 1,
                    isCapitol: false
                };
            }
        }

        this.gameState.players.forEach((player, index) => {
            const playerTerritories: string[] = [];
            const capitol = capitolPositions[index];
            const capitolId = `${capitol.x}-${capitol.y}`;
            
            playerTerritories.push(capitolId);
            unclaimedTerritories.delete(capitolId);
            
            this.gameState.territories[capitolId].value = 3;
            this.gameState.territories[capitolId].isCapitol = true;
            this.gameState.territories[capitolId].shields = 2;
            this.gameState.territories[capitolId].owner = player.id;

            while (playerTerritories.length < territoriesPerPlayer) {
                const expandableTerritories = new Set<string>();
                
                playerTerritories.forEach(tId => {
                    const [x, y] = tId.split('-').map(Number);
                    const adjacent = this.getAdjacentTerritories(x, y, grid);
                    
                    adjacent.forEach(adjId => {
                        if (unclaimedTerritories.has(adjId)) {
                            expandableTerritories.add(adjId);
                        }
                    });
                });

                if (expandableTerritories.size === 0) break;

                const scoredTerritories = Array.from(expandableTerritories).map(tId => ({
                    id: tId,
                    score: this.calculateTerritoryScore(tId, player.id)
                }));

                scoredTerritories.sort((a, b) => b.score - a.score);
                const chosenTerritory = scoredTerritories[0].id;

                playerTerritories.push(chosenTerritory);
                unclaimedTerritories.delete(chosenTerritory);
                this.gameState.territories[chosenTerritory].owner = player.id;
                this.gameState.territories[chosenTerritory].value = Math.floor(Math.random() * 3) + 1;
            }

            player.territories = playerTerritories;
        });

        this.debugCapitols();
        
        this.gameState.players.forEach(player => {
            this.updateSupplyLines(player.id);
        });
        
        console.log("\n🔄 Verifying territory connections after updates");
        this.gameState.players.forEach(player => {
            const ownedTerritories = Object.values(this.gameState.territories)
                .filter(t => t.owner === player.id);
            
            const unconnectedTerritories = ownedTerritories.filter(t => !t.isCapitol && !this.checkSupplyLine(t.id, player.id));
            
            if (unconnectedTerritories.length > 0) {
                console.log(`❌ Player ${player.name} has ${unconnectedTerritories.length} unconnected territories: ${unconnectedTerritories.map(t => t.id).join(', ')}`);
            } else {
                console.log(`✅ All territories for player ${player.name} are properly connected to their capitol`);
            }
        });

        console.log('🏰 Territories distributed among players with strategic capitol placement');
        this.gameState.players.forEach(player => {
            console.log(`Player ${player.name} has ${player.territories.length} territories`);
        });
    }

    private calculateTerritoryScore(territoryId: string, playerId: string): number {
        const [tx, ty] = territoryId.split('-').map(Number);
        let score = 0;

        const playerCapitol = this.getCapitolPositions(this.gameState.players.length)[
            this.gameState.players.findIndex(p => p.id === playerId)
        ];
        
        const distanceFromCapitol = Math.abs(tx - playerCapitol.x) + Math.abs(ty - playerCapitol.y);
        score -= distanceFromCapitol * 2;

        const adjacent = this.getAdjacentTerritories(tx, ty, 6);
        
        const friendlyNeighbors = adjacent.filter(id => 
            this.gameState.territories[id]?.owner === playerId
        ).length;
        score += friendlyNeighbors * 4;

        if (friendlyNeighbors === 1) {
            score -= 3;
        }

        const enemyNeighbors = adjacent.filter(id => 
            this.gameState.territories[id]?.owner !== null && 
            this.gameState.territories[id]?.owner !== playerId
        ).length;
        score -= enemyNeighbors * 5;

        const unclaimedNeighbors = adjacent.filter(id => 
            this.gameState.territories[id]?.owner === null
        ).length;
        if (unclaimedNeighbors <= 2) {
            score += 2;
        }

        score += Math.random() * 0.1;

        return score;
    }

    private debugCapitols(): void {
        console.log("\n🔍🔍🔍 DEBUGGING CAPITOL TERRITORIES 🔍🔍🔍");
        
        const capitols = Object.values(this.gameState.territories)
            .filter((t): t is Territory => t.isCapitol)
            .map(t => ({ 
                id: t.id, 
                owner: t.owner, 
                ownerName: this.gameState.players.find(p => p.id === t.owner)?.name 
            }));
        
        console.log("🏰 Capitol territories:", capitols);
        
        this.gameState.players.forEach(player => {
            const ownedTerritories = Object.values(this.gameState.territories)
                .filter(t => t.owner === player.id) as Territory[];
            
            const capitol = ownedTerritories.find(t => t.isCapitol);
            
            console.log(`👤 Player ${player.name} (${player.id}):`);
            console.log(`   Territories: ${ownedTerritories.map(t => t.id).join(', ')}`);
            console.log(`   Capitol: ${capitol ? capitol.id : 'None'}`);
            
            ownedTerritories.forEach(territory => {
                if (!territory.isCapitol) {
                    const hasPath = this.checkSupplyLine(territory.id, player.id);
                    console.log(`   Territory ${territory.id} connected to capitol: ${hasPath}`);
                    
                    if (!hasPath && capitol) {
                        const [tx, ty] = territory.id.split('-').map(Number);
                        const [cx, cy] = capitol.id.split('-').map(Number);
                        console.log(`   ❌ No path from ${territory.id} to capitol ${capitol.id}`);
                        console.log(`      Distance: dx=${Math.abs(tx-cx)}, dy=${Math.abs(ty-cy)}`);
                        
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
}

export const territoryManager = new TerritoryManager(); 