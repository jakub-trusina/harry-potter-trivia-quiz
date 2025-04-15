import { GameState, Player, Territory } from '../../types/game.js';
import { gameStateManager } from './game-state-manager.js';
import { territoryManager } from './territory-manager.js';
import { shuffleArray, getDistance, getAdjacentTerritories } from './utils.js';

class GameManager {
    private get gameState(): GameState {
        return gameStateManager.getState();
    }

    /**
     * Initializes a new game
     */
    public initializeGame(): void {
        console.log('🎮 Initializing new game...');
        
        // Reset game state
        gameStateManager.resetGame();
        
        // Initialize fresh question queues
        // This would be handled by the question manager
        
        console.log('✅ Game initialized');
    }

    /**
     * Starts a new game
     */
    public startGame(): void {
        if (this.gameState.players.length < 2 || this.gameState.players.length > 4) {
            console.log('❌ Cannot start game: Invalid number of players');
            return;
        }

        // Shuffle player order first
        this.gameState.players = shuffleArray([...this.gameState.players]);
        
        // Define available houses
        const houses: ('Gryffindor' | 'Slytherin' | 'Ravenclaw' | 'Hufflepuff')[] = ['Gryffindor', 'Slytherin', 'Ravenclaw', 'Hufflepuff'];
        
        // Shuffle and assign houses to players
        const shuffledHouses = shuffleArray([...houses]);
        this.gameState.players.forEach((player, index) => {
            player.house = shuffledHouses[index];
        });

        // Randomly select first player
        const firstPlayerIndex = Math.floor(Math.random() * this.gameState.players.length);
        this.gameState.currentTurn = this.gameState.players[firstPlayerIndex].id;
        this.gameState.gameActive = true;

        // Distribute territories
        territoryManager.distributeTerritories();
        
        // Fix all supply connections
        this.fixAllSupplyConnections();

        console.log('🎮 Game started with randomized player order and house assignments');
        console.log(`First player to move: ${this.gameState.players[firstPlayerIndex].name}`);
    }

    /**
     * Moves to the next player's turn
     */
    public nextTurn(): void {
        const currentPlayerIndex = this.gameState.players.findIndex(p => p.id === this.gameState.currentTurn);
        let nextPlayerIndex = (currentPlayerIndex + 1) % this.gameState.players.length;
        
        // Skip eliminated players
        while (this.gameState.players[nextPlayerIndex].territories.length === 0) {
            nextPlayerIndex = (nextPlayerIndex + 1) % this.gameState.players.length;
            if (nextPlayerIndex === currentPlayerIndex) break;
        }
        
        this.gameState.currentTurn = this.gameState.players[nextPlayerIndex].id;
        
        console.log(`Next turn: ${this.gameState.players[nextPlayerIndex].name}`);
    }

    /**
     * Checks if the game is over
     * @returns True if the game is over, false otherwise
     */
    public checkGameOver(): boolean {
        // Count how many players still have at least one capitol
        const playersWithCapitols = this.gameState.players.filter(player => 
            Object.values(this.gameState.territories).some(t => 
                t.owner === player.id && t.isCapitol
            )
        );

        // Game is over when only one player has capitols
        return playersWithCapitols.length === 1;
    }

    /**
     * Ends the game
     */
    public endGame(): void {
        this.gameState.gameActive = false;

        // Calculate final scores and include territory counts
        const finalScores = this.gameState.players.map(player => ({
            name: player.name,
            id: player.id,
            score: player.score || 0,
            territories: player.territories.length,
            hasCapitol: Object.values(this.gameState.territories).some(t => 
                t.owner === player.id && t.isCapitol
            )
        }));

        // Sort by score (highest first)
        finalScores.sort((a, b) => b.score - a.score);

        // Find the last player with a capitol (winner by conquest)
        const conquestWinner = this.gameState.players.find(player => 
            Object.values(this.gameState.territories).some(t => 
                t.owner === player.id && t.isCapitol
            )
        );

        console.log('Game ended with scores:', finalScores);
        console.log('Conquest winner:', conquestWinner?.name);
    }

    /**
     * Fixes all supply connections for all players
     */
    public fixAllSupplyConnections(): void {
        console.log("\n🔧 Fixing all supply connections for all players");
        
        this.gameState.players.forEach(player => {
            console.log(`\n👤 Fixing supply connections for player ${player.name}`);
            
            // Get all territories owned by this player
            const ownedTerritories = Object.values(this.gameState.territories)
                .filter((t): t is Territory => t.owner === player.id);
            
            // Find the player's capitol
            const capitol = ownedTerritories.find(t => t.isCapitol);
            if (!capitol) {
                console.log(`❌ No capitol found for player ${player.name}`);
                return;
            }
            
            console.log(`🏰 Found capitol at ${capitol.id}`);
            
            // Update supply lines
            territoryManager.updateSupplyLines(player.id);
        });
        
        console.log("✅ Supply connection fixing complete");
    }

    /**
     * Gets capitol positions for players
     * @param numPlayers Number of players
     * @returns Array of capitol positions
     */
    public getCapitolPositions(numPlayers: number): { x: number; y: number }[] {
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

    /**
     * Debugs capitol territories
     */
    public debugCapitols(): void {
        console.log("\n🔍🔍🔍 DEBUGGING CAPITOL TERRITORIES 🔍🔍🔍");
        
        // Find all capitols
        const capitols = Object.values(this.gameState.territories)
            .filter((t): t is Territory => t.isCapitol)
            .map(t => ({ 
                id: t.id, 
                owner: t.owner, 
                ownerName: this.gameState.players.find(p => p.id === t.owner)?.name 
            }));
        
        console.log("🏰 Capitol territories:", capitols);
        
        // Check territory connections for each player
        this.gameState.players.forEach(player => {
            const ownedTerritories = Object.values(this.gameState.territories)
                .filter(t => t.owner === player.id) as Territory[];
            
            const capitol = ownedTerritories.find(t => t.isCapitol);
            
            console.log(`👤 Player ${player.name} (${player.id}):`);
            console.log(`   Territories: ${ownedTerritories.map(t => t.id).join(', ')}`);
            console.log(`   Capitol: ${capitol ? capitol.id : 'None'}`);
            
            // Check all territories for path to capitol
            ownedTerritories.forEach(territory => {
                if (!territory.isCapitol) {
                    // Check if this territory has a path to the player's capitol
                    const hasPath = territoryManager.checkSupplyLine(territory.id, player.id);
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
}

export const gameManager = new GameManager(); 