import { Socket } from 'socket.io-client';
import { UIElements } from '../../types/ui.js';
import { Territory, Player, CurrentDuel, DuelData } from '../../types/game.js';
import { ModalState } from '../types.js';

export interface GameStateManager {
    socket: Socket | null;
    ui: UIElements | null;
    territories: { [key: string]: Territory };
    players: Player[];
    playerId: string | null;
    playerName: string | null;
    currentTurn: string | null;
    gameActive: boolean;
    currentModalState: ModalState | null;
    currentDuel: CurrentDuel | null;
    activeDuels: DuelData[];
    updateModalState: (updates: Partial<ModalState>) => void;
    updateCurrentDuel: (duel: CurrentDuel | null) => void;
    cleanupModalState: () => void;
}

export function initializeStateManager(): GameStateManager {
    const state: GameStateManager = {
        socket: null,
        ui: null,
        territories: {},
        players: [],
        playerId: null,
        playerName: null,
        currentTurn: null,
        gameActive: false,
        currentModalState: null,
        currentDuel: null,
        activeDuels: [],
        updateModalState: (updates) => updateModalState(state, updates),
        updateCurrentDuel: (duel) => updateCurrentDuel(state, duel),
        cleanupModalState: () => cleanupState(state)
    };
    return state;
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

export function updateModalState(state: GameStateManager, newState: Partial<ModalState>): void {
    if (!state.currentModalState) {
        state.currentModalState = {
            isOpen: false,
            questionId: null,
            timer: null,
            selectedAnswer: null,
            cleanup: undefined
        };
    }
    state.currentModalState = {
        ...state.currentModalState,
        ...newState
    };
}

export function updateCurrentDuel(state: GameStateManager, duel: CurrentDuel | null): void {
    state.currentDuel = duel;
}

export function cleanupState(state: GameStateManager): void {
    if (state.currentModalState?.timer) {
        clearInterval(state.currentModalState.timer);
    }
    state.currentModalState = null;
    state.currentDuel = null;
} 