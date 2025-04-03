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
    name: string;
    territories: string[];
    score: number;
    eliminated: boolean;
    house?: 'Gryffindor' | 'Slytherin' | 'Ravenclaw' | 'Hufflepuff';  // Make house optional
}

export interface Question {
    id: string;
    question: string;
    answers: string[];
    correctAnswer: number;
    difficulty: 'easy' | 'medium' | 'hard';
    continuing?: boolean;
    round?: number;
}

export interface DuelResult {
    winner: 'attacker' | 'defender' | null;
    attackerId: string;
    defenderId: string;
    attackerCorrect: boolean;
    defenderCorrect: boolean;
    attackerTime: number;
    defenderTime?: number;
    attackerAnswer: number;
    defenderAnswer?: number;
    correctAnswer: number;
    answerText: string;
    round: number;  // 1 for first shield, 2 for second shield, 3 for final attack
    shieldsRemaining: number;  // Number of shields remaining for capitols
    continuing?: boolean;  // Whether the attack continues to next round
    unclaimedTerritory?: boolean;  // Add this property
}

export interface GameState {
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