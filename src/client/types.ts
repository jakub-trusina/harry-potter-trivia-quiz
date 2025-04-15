import { Socket } from 'socket.io-client';
import { Player, Territory, Question, DuelData } from '../types/game.js';

export interface DuelQuestion {
    question: string;
    answers: string[];
    role: 'attacker' | 'defender';
    isCapitolRound: boolean;
    round: number;
    totalRounds: number;
    shieldsRemaining: number;
    questionData?: {
        id: string;
        question: string;
        answers: string[];
        correctAnswer: string;
        difficulty: string;
    };
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
    correctAnswer: string;
}

export interface CurrentDuel {
    role: 'attacker' | 'defender';
    id: string;
    question: Question;
    isCapitolRound: boolean;
    round: number;
    totalRounds: number;
    shieldsRemaining: number;
    selectedAnswer: string | null;
}

export interface GameEndData {
    winner: string | null;
    reason?: string;
    conquestWinner?: {
        id: string;
        name: string;
    };
    finalScores: Array<{
        id: string;
        name: string;
        score: number;
        territories: number;
        hasCapitol: boolean;
    }>;
}

export interface ModalState {
    isOpen: boolean;
    questionId: string | null;
    selectedAnswer: string | null;
    timer: NodeJS.Timeout | null;
    cleanup?: () => void;
} 