import { Socket } from 'socket.io-client';
import { UIElements } from '../../types/ui.js';
import { Territory, Player } from '../../types/game.js';

export interface ModalState {
    isOpen: boolean;
    questionId: string | null;
    timer: NodeJS.Timeout | null;
}

export interface GameStateManager {
    socket: Socket;
    ui: UIElements | null;
    playerId: string | null;
    playerName: string;
    players: Player[];
    territories: { [key: string]: Territory };
    gameActive: boolean;
    currentTurn: string | null;
    currentModalState: ModalState;
}

export function initializeStateManager(): GameStateManager {
    return {
        socket: null as any,
        ui: null,
        playerId: null,
        playerName: '',
        players: [],
        territories: {},
        gameActive: false,
        currentTurn: null,
        currentModalState: {
            isOpen: false,
            questionId: null,
            timer: null
        }
    };
}

export function updateState(state: GameStateManager, newState: Partial<GameStateManager>): void {
    Object.assign(state, newState);
}

export function updateGameState(state: GameStateManager, newState: { [key: string]: Territory }): void {
    state.territories = { ...state.territories, ...newState };
}

export function updatePlayerId(state: GameStateManager, id: string): void {
    state.playerId = id;
}

export function updatePlayerName(state: GameStateManager, name: string): void {
    state.playerName = name;
}

export function updateModalState(state: GameStateManager, updates: Partial<ModalState>): void {
    state.currentModalState = { ...state.currentModalState, ...updates };
} 