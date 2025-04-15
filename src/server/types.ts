export interface Territory {
    id: string;
    x: number;
    y: number;
    ownerId: string | null;
    isCapitol: boolean;
}

export interface Player {
    id: string;
    socketId: string;
    name: string;
    territories: string[];
    score: number;
    points: number;  // Points earned from answering questions correctly
    eliminated: boolean;
    supplyLines: { from: string; to: string }[];
    house?: 'Gryffindor' | 'Slytherin' | 'Ravenclaw' | 'Hufflepuff';
    disconnected?: boolean;
    isHost?: boolean;
}

export interface GameState {
    territories: Record<string, Territory>;
    players: Player[];
    currentTurn: string | null;
    gameActive: boolean;
    activeDuels: DuelData[];
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
    status: 'pending' | 'active' | 'completed';
    contestedTerritoryId: string;
    isCapitolRound: boolean;
    round: number;
    totalRounds: number;
    shieldsRemaining: number;
}

export interface ObserverResult {
    playerId: string;
    answer: string;
    correct: boolean;
    scoreGained: number;
    observerId?: string;
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
    isCapitolRound: boolean;
    round: number;
    totalRounds: number;
    shieldsRemaining: number;
    continueToNextRound?: boolean;
}

export interface QuestionQueues {
    easy: Question[];
    medium: Question[];
    hard: Question[];
}

export interface DuelStartData {
    role: 'attacker' | 'defender';
    duelId: string;
    question: Question;
    isCapitolRound: boolean;
    round: number;
    totalRounds: number;
    shieldsRemaining: number;
}