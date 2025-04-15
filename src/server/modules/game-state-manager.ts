import { Territory, GameState, Player, DuelData } from '../../types/game.js';

class GameStateManager {
    private gameState: GameState;

    constructor() {
        this.gameState = {
            territories: {} as Record<string, Territory>,
            players: [],
            currentTurn: null,
            gameActive: false,
            activeDuels: []
        };
    }

    public getState(): GameState {
        return this.gameState;
    }

    public setState(newState: GameState): void {
        this.gameState = newState;
    }

    public addPlayer(playerData: Omit<Player, 'territories' | 'score' | 'eliminated' | 'supplyLines'>): Player {
        const existingPlayer = this.gameState.players.find(p => p.id === playerData.id);
        if (existingPlayer) {
            existingPlayer.socketId = playerData.socketId;
            existingPlayer.disconnected = false;
            return existingPlayer;
        }

        const newPlayer: Player = {
            ...playerData,
            territories: [],
            score: 0,
            eliminated: false,
            supplyLines: [],
            isHost: this.gameState.players.length === 0,
            disconnected: false
        };

        this.gameState.players.push(newPlayer);
        return newPlayer;
    }

    public removePlayer(playerId: string): void {
        this.gameState.players = this.gameState.players.filter(p => p.id !== playerId);
        
        // If the removed player was the host and there are remaining players,
        // make the first remaining player the new host
        const wasHost = this.gameState.players.every(p => !p.isHost);
        if (wasHost && this.gameState.players.length > 0) {
            this.gameState.players[0].isHost = true;
        }
    }

    public getPlayer(playerId: string): Player | undefined {
        return this.gameState.players.find(p => p.id === playerId);
    }

    public updatePlayer(player: Player): void {
        const index = this.gameState.players.findIndex(p => p.id === player.id);
        if (index !== -1) {
            this.gameState.players[index] = player;
        }
    }

    public setCurrentTurn(playerId: string | null): void {
        this.gameState.currentTurn = playerId;
    }

    public getCurrentTurn(): string | null {
        return this.gameState.currentTurn;
    }

    public setGameActive(active: boolean): void {
        this.gameState.gameActive = active;
    }

    public isGameActive(): boolean {
        return this.gameState.gameActive;
    }

    public getTerritory(territoryId: string): Territory | undefined {
        return this.gameState.territories[territoryId];
    }

    public updateTerritory(territory: Territory): void {
        this.gameState.territories[territory.id] = territory;
    }

    public getAllTerritories(): Record<string, Territory> {
        return this.gameState.territories;
    }

    public getAllPlayers(): Player[] {
        return this.gameState.players;
    }

    public resetGame(): void {
        this.gameState = {
            territories: {} as Record<string, Territory>,
            players: [],
            currentTurn: null,
            gameActive: false,
            activeDuels: []
        };
    }
}

export const gameStateManager = new GameStateManager(); 