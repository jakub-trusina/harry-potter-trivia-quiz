export interface Territory {
    id: string;
    x: number;
    y: number;
    owner: string | null;
    value: number;
    isCapitol: boolean;
}
export interface Player {
    id: string;
    name: string;
    territories: string[];
    score: number;
    eliminated: boolean;
}
export interface Question {
    id: string;
    question: string;
    answers: string[];
    correctAnswer: number;
    continuing?: boolean;
    round?: number;
}
export interface DuelResult {
    winner: 'attacker' | 'defender' | null;
    attackerId: string;
    defenderId: string | null;
    attackerCorrect: boolean;
    defenderCorrect: boolean;
    attackerTime: number;
    defenderTime?: number;
    attackerAnswer: number;
    defenderAnswer?: number;
    correctAnswer: number;
    answerText: string;
    reason?: string;
    continuingAttack?: boolean;
    defenseReduced?: boolean;
}
export interface GameState {
    territories: {
        [key: string]: Territory;
    };
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
