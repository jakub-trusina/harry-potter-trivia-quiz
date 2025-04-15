import { Question, QuestionQueues } from '../../types/game.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

class QuestionManager {
    private questions: Question[];
    private questionQueues: QuestionQueues;

    constructor() {
        this.questions = JSON.parse(
            readFileSync(join(projectRoot, 'src', 'data', 'questions.json'), 'utf-8')
        );
        this.questionQueues = {
            easy: [],
            medium: [],
            hard: []
        };
        this.initializeQuestionQueues();
    }

    private shuffleArray<T>(array: T[]): T[] {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    private initializeQuestionQueues(): void {
        console.log('🎲 Initializing question queues...');
        
        const easyQuestions = this.shuffleArray(this.questions.filter(q => q.difficulty === 'easy'));
        const mediumQuestions = this.shuffleArray(this.questions.filter(q => q.difficulty === 'medium'));
        const hardQuestions = this.shuffleArray(this.questions.filter(q => q.difficulty === 'hard'));
        
        this.questionQueues = {
            easy: easyQuestions,
            medium: mediumQuestions,
            hard: hardQuestions
        };
        
        console.log(`✅ Question queues initialized with:
            Easy: ${this.questionQueues.easy.length} questions
            Medium: ${this.questionQueues.medium.length} questions
            Hard: ${this.questionQueues.hard.length} questions`);
    }

    public shuffleAnswers(question: Question): Question {
        const shuffledQuestion = { ...question };
        
        if (typeof question.correctAnswer === 'number') {
            const correctAnswer = question.answers[question.correctAnswer];
            shuffledQuestion.answers = this.shuffleArray([...question.answers]);
            shuffledQuestion.correctAnswer = shuffledQuestion.answers.indexOf(correctAnswer);
        } else {
            shuffledQuestion.answers = this.shuffleArray([...question.answers]);
        }
        
        return shuffledQuestion;
    }

    public getNextQuestion(territoryValue: number): Question {
        const difficulty = territoryValue === 3 ? "hard" : 
                          territoryValue === 2 ? "medium" : "easy";
        
        let queue = this.questionQueues[difficulty];
        
        if (queue.length === 0) {
            console.log(`⚠️ ${difficulty} question queue is empty, reshuffling...`);
            const newQuestions = this.shuffleArray(this.questions.filter(q => q.difficulty === difficulty));
            this.questionQueues[difficulty] = newQuestions;
            queue = newQuestions;
            
            if (queue.length === 0) {
                console.warn(`No questions found for difficulty ${difficulty}, falling back to any available questions`);
                for (const diff of ['easy', 'medium', 'hard'] as const) {
                    if (this.questionQueues[diff].length > 0) {
                        queue = this.questionQueues[diff];
                        break;
                    }
                }
                if (queue.length === 0) {
                    this.initializeQuestionQueues();
                    queue = this.questionQueues[difficulty];
                }
            }
        }
        
        const question = queue.shift()!;
        
        if (!question.text && question.question) {
            question.text = question.question;
        } else if (!question.text) {
            console.warn(`Question ${question.id} is missing both text and question properties`);
            question.text = `Question ${question.id}`;
        }
        
        return this.shuffleAnswers(question);
    }

    public getRandomQuestion(territoryValue: number): Question {
        const difficulty = territoryValue === 3 ? "hard" : 
                          territoryValue === 2 ? "medium" : "easy";
        
        const filteredQuestions = this.questions.filter(q => q.difficulty === difficulty);
        
        if (filteredQuestions.length === 0) {
            console.warn(`No questions found for difficulty ${difficulty}, falling back to any question`);
        }
        
        const randomQuestions = filteredQuestions.length > 0 ? filteredQuestions : this.questions;
        const question = randomQuestions[Math.floor(Math.random() * randomQuestions.length)];
        
        if (!question.text && question.question) {
            question.text = question.question;
        } else if (!question.text) {
            console.warn(`Question ${question.id} is missing both text and question properties`);
            question.text = `Question ${question.id}`;
        }
        
        return this.shuffleAnswers(question);
    }
}

export const questionManager = new QuestionManager(); 