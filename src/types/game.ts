import { UIElements } from './ui.js';

export interface Territory {
    id: string;
    x: number;
    y: number;
    owner: string | null;
    value: number;
    isCapitol: boolean;
    shields?: number;  // Number of shields (0-2) for capitols
    hasSupplyLine?: boolean;  // Whether the territory is connected to a capitol
}

export interface Player {
    id: string;
    socketId: string;
    name: string;
    territories: string[];
    score: number;
    eliminated: boolean;
    house?: 'Gryffindor' | 'Slytherin' | 'Ravenclaw' | 'Hufflepuff';  // Make house optional
    supplyLines: { from: string; to: string }[];
    isHost?: boolean;
    disconnected?: boolean;
}

export interface Question {
    id: string;
    text?: string;
    question?: string;
    correctAnswer: string | number;
    difficulty: "easy" | "medium" | "hard";
    answers: string[];
}

export interface ObserverResult {
    playerId: string;
    answer: string;
    correct: boolean;
    scoreGained: number;
}

export interface DuelResult {
    attackerId: string;
    defenderId?: string;
    attackerAnswer?: string;
    defenderAnswer?: string;
    correctAnswer: string;
    territory: string;
    unclaimedTerritory?: boolean;
    winner?: 'attacker' | 'defender' | null;
    attackerCorrect?: boolean;
    defenderCorrect?: boolean;
    observerResults: ObserverResult[];
}

export interface GameState {
    ui?: UIElements;
    territories: { [key: string]: Territory };
    players: Player[];
    currentTurn: string | null;
    gameActive: boolean;
}

export type House = 'gryffindor' | 'slytherin' | 'ravenclaw' | 'hufflepuff';

export interface DuelAnswer {
    territoryId: string;
    answer: number;
    responseTime: number;
    isObserver?: boolean;
}

export interface DuelStatusUpdate {
    playerId: string;
    playerName: string;
    role: 'attacker' | 'defender' | 'observer';
    responseTime: number;
} 