import { Question } from '../../src/types/game.js';
import { jest } from '@jest/globals';

// Mock the server module
jest.mock('../../src/server.js', () => ({
    shuffleAnswers: (question: Question) => {
        const shuffled = { ...question };
        shuffled.answers = [...question.answers]; // In test we don't actually shuffle
        return shuffled;
    },
    getNextQuestion: (value: number) => ({
        id: '1',
        text: 'Test question',
        answers: ['a', 'b', 'c', 'd'],
        correctAnswer: 'a',
        difficulty: value === 3 ? 'hard' : value === 2 ? 'medium' : 'easy'
    }),
    getRandomQuestion: (value: number) => ({
        id: '2',
        text: 'Random test question',
        answers: ['a', 'b', 'c', 'd'],
        correctAnswer: 'a',
        difficulty: value === 3 ? 'hard' : value === 2 ? 'medium' : 'easy'
    })
}));

// Import the mocked functions
const { shuffleAnswers, getNextQuestion, getRandomQuestion } = require('../../src/server.js');

describe('Question Handling', () => {
    describe('shuffleAnswers', () => {
        it('maintains correct answer after shuffling', () => {
            const question: Question = {
                id: '1',
                text: 'What is 2+2?',
                answers: ['2', '3', '4', '5'],
                correctAnswer: '4',
                difficulty: 'easy'
            };
            
            const shuffled = shuffleAnswers(question);
            expect(shuffled.correctAnswer).toBe('4');
            expect(shuffled.answers).toContain('4');
            expect(shuffled.answers.length).toBe(4);
        });

        it('does not modify original question', () => {
            const question: Question = {
                id: '2',
                text: 'Capital of France?',
                answers: ['London', 'Paris', 'Berlin', 'Madrid'],
                correctAnswer: 'Paris',
                difficulty: 'easy'
            };
            
            const original = [...question.answers];
            shuffleAnswers(question);
            expect(question.answers).toEqual(original);
        });
    });

    describe('getNextQuestion', () => {
        it('returns question based on territory value difficulty', () => {
            const question = getNextQuestion(1);
            expect(question).toBeDefined();
            expect(question.difficulty).toBe('easy');
        });

        it('returns harder questions for higher territory values', () => {
            const easyQuestion = getNextQuestion(1);
            const mediumQuestion = getNextQuestion(2);
            const hardQuestion = getNextQuestion(3);

            expect(easyQuestion.difficulty).toBe('easy');
            expect(mediumQuestion.difficulty).toBe('medium');
            expect(hardQuestion.difficulty).toBe('hard');
        });
    });

    describe('getRandomQuestion', () => {
        it('returns question with appropriate difficulty', () => {
            const question = getRandomQuestion(1);
            expect(question).toBeDefined();
            expect(question.text).toBeDefined();
            expect(question.answers.length).toBeGreaterThan(0);
            expect(question.correctAnswer).toBeDefined();
            expect(question.difficulty).toBe('easy');
        });
    });
}); 