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
    points: number;
    score: number;
    eliminated: boolean;
    supplyLines: { from: string; to: string }[];
    house?: 'Gryffindor' | 'Slytherin' | 'Ravenclaw' | 'Hufflepuff';
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

export interface DuelData {
    id: string;
    attacker: string;
    defender: string;
    question: Question;
    startTime: number;
    timeLimit: number;
    status: 'pending' | 'in_progress' | 'completed';
    contestedTerritoryId: string;
    isCapitolRound: boolean;
    round: number;
    totalRounds: number;
    shieldsRemaining: number;
}

export interface DuelResult {
    winner: string | null;
    loser: string | null;
    attacker: string;
    defender: string;
    attackerCorrect: boolean;
    defenderCorrect: boolean;
    territoryTransferred: string | null;
    attackerResponseTime?: string;
    defenderResponseTime?: string;
    contestedTerritoryId: string;
    isCapitolRound?: boolean;
    round?: number;
    totalRounds?: number;
    shieldsRemaining?: number;
    continueToNextRound?: boolean;
}

export interface ObserverResult {
    playerId: string;
    answer: string;
    correct: boolean;
    scoreGained: number;
}

export interface GameState {
    ui?: UIElements;
    territories: { [key: string]: Territory };
    players: Player[];
    currentTurn: string | null;
    gameActive: boolean;
    activeDuels: DuelData[];
}

export interface GameStartData {
    playerId: string;
    isHost: boolean;
    isReconnection: boolean;
    territories: { [key: string]: Territory };
    players: Player[];
    currentTurn: string;
}

export interface GameEndData {
    winner: string;
    winnerName: string;
    reason: string;
    scores: {
        name: string;
        id: string;
        score: number;
        territories: number;
        hasCapitol: boolean;
    }[];
    conquestWinner: {
        name: string;
        id: string;
    } | null;
    scoreWinner: {
        name: string;
        id: string;
        score: number;
    };
}

export interface DuelQuestion {
    question: string;
    answers: string[];
    role: 'attacker' | 'defender' | 'observer';
    isCapitolRound: boolean;
    round: number;
    totalRounds: number;
    shieldsRemaining: number;
    questionData?: {
        id: string;
        question: string;
        answers: string[];
        correctAnswer: string;
        difficulty: "easy" | "medium" | "hard";
    };
}

export interface CurrentDuel {
    id: string;
    role: 'attacker' | 'defender';
    question: Question;
    isCapitolRound: boolean;
    round: number;
    totalRounds: number;
    shieldsRemaining: number;
    selectedAnswer: string | null;
}

export type House = 'gryffindor' | 'slytherin' | 'ravenclaw' | 'hufflepuff';

export interface QuestionQueues {
    easy: Question[];
    medium: Question[];
    hard: Question[];
}

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

export interface ModalState {
    isOpen: boolean;
    content: string;
} 