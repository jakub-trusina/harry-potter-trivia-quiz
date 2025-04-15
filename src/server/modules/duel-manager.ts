import { Territory, GameState, Player, DuelData, DuelResult, ObserverResult, Question } from '../../types/game.js';
import { gameStateManager } from './game-state-manager.js';
import { questionManager } from './question-manager.js';
import { territoryManager } from './territory-manager.js';

interface PlayerWithCapitols extends Player {
    capitols: Territory[];
}

export class DuelManager {
    private duelAnswers: Map<string, Map<string, string>> = new Map();
    private duelState: Map<string, {
        round: number;
        totalRounds: number;
        shieldsRemaining: number;
        isCapitolRound: boolean;
    }> = new Map();

    private get gameState(): GameState {
        return gameStateManager.getState();
    }

    public getDuel(duelId: string): DuelData | null {
        return this.gameState.activeDuels.find(d => d.id === duelId) || null;
    }

    findPlayerDuel(playerId: string): DuelData | null {
        return this.gameState.activeDuels.find(
            duel => duel.attacker === playerId || duel.defender === playerId
        ) || null;
    }

    createDuel(territory: Territory, attacker: PlayerWithCapitols, defender: PlayerWithCapitols): DuelData | null {
        if (!territory) return null;

        const question = questionManager.getNextQuestion(territory.value);
        if (!question) return null;

        const isCapitolBattle = territory.isCapitol;
        const shields = isCapitolBattle ? (territory.shields || 2) : 0;
        const totalRounds = isCapitolBattle ? shields + 1 : 1;

        const duel: DuelData = {
            id: Math.random().toString(36).substring(7),
            attacker: attacker.id,
            defender: defender.id,
            question,
            startTime: Date.now(),
            timeLimit: 30000,
            status: 'pending',
            contestedTerritoryId: territory.id,
            isCapitolRound: isCapitolBattle,
            round: 1,
            totalRounds,
            shieldsRemaining: shields
        };

        // Initialize duel state
        this.duelState.set(duel.id, {
            round: 1,
            totalRounds,
            shieldsRemaining: shields,
            isCapitolRound: isCapitolBattle
        });

        this.gameState.activeDuels.push(duel);
        return duel;
    }

    public processAnswer(duelId: string, playerId: string, answer: string): DuelResult | null {
        const duel = this.getDuel(duelId);
        if (!duel) return null;

        // Validate that the player is part of this duel
        if (playerId !== duel.attacker && playerId !== duel.defender) {
            console.error(`Player ${playerId} is not part of duel ${duelId}`);
            return null;
        }

        // Store answer
        if (!this.duelAnswers.has(duelId)) {
            this.duelAnswers.set(duelId, new Map());
        }
        const answers = this.duelAnswers.get(duelId)!;
        answers.set(playerId, answer);

        // Check if both players have answered
        if (!answers.has(duel.attacker) || !answers.has(duel.defender)) {
            return null;
        }

        const attackerAnswer = answers.get(duel.attacker)!;
        const defenderAnswer = answers.get(duel.defender)!;

        // Process the result
        const result = this.processDuelResult(duel, attackerAnswer, defenderAnswer);

        // Clean up if duel is complete
        if (!result.continueToNextRound) {
            this.duelAnswers.delete(duelId);
            this.duelState.delete(duelId);
            this.deleteDuel(duelId);
        }

        return result;
    }

    private isAnswerCorrect(answer: string, question: Question): boolean {
        if (typeof question.correctAnswer === 'number') {
            return answer === question.answers[question.correctAnswer];
        }
        return answer === question.correctAnswer;
    }

    processDuelResult(duel: DuelData, attackerAnswer: string, defenderAnswer: string): DuelResult {
        const attackerCorrect = this.isAnswerCorrect(attackerAnswer, duel.question);
        const defenderCorrect = this.isAnswerCorrect(defenderAnswer, duel.question);

        let winner: string | null = null;
        let loser: string | null = null;
        let territoryTransferred: string | null = null;
        let continueToNextRound = false;

        // Get territory info
        const territory = this.gameState.territories[duel.contestedTerritoryId];
        const isCapitolBattle = territory?.isCapitol || false;
        const duelState = this.duelState.get(duel.id);

        // Determine winner based on correctness
        if (attackerCorrect && !defenderCorrect) {
            winner = duel.attacker;
            loser = duel.defender;
            if (!isCapitolBattle) {
                // Verify territory is still owned by the defender before transferring
                if (territory && territory.owner === duel.defender) {
                    territoryTransferred = duel.contestedTerritoryId;
                } else {
                    console.error(`Territory ${duel.contestedTerritoryId} is no longer owned by defender ${duel.defender}`);
                }
            }
        } else if (!attackerCorrect && defenderCorrect) {
            winner = duel.defender;
            loser = duel.attacker;
        } else if (attackerCorrect && defenderCorrect) {
            // Both correct - faster response wins
            const attackerTime = Date.now() - duel.startTime;
            const defenderTime = Date.now() - duel.startTime;
            
            if (attackerTime <= defenderTime) {
                winner = duel.attacker;
                loser = duel.defender;
                if (!isCapitolBattle) {
                    // Verify territory is still owned by the defender before transferring
                    if (territory && territory.owner === duel.defender) {
                        territoryTransferred = duel.contestedTerritoryId;
                    } else {
                        console.error(`Territory ${duel.contestedTerritoryId} is no longer owned by defender ${duel.defender}`);
                    }
                }
            } else {
                winner = duel.defender;
                loser = duel.attacker;
            }
        }

        // Handle capitol battle logic
        if (isCapitolBattle && duelState) {
            if (winner === duel.attacker) {
                // Attacker wins the round, reduce shields
                if (duelState.shieldsRemaining > 0) {
                    duelState.shieldsRemaining--;
                    continueToNextRound = true;
                    
                    // Update the territory's shields
                    if (territory) {
                        territory.shields = duelState.shieldsRemaining;
                    }
                } else {
                    // No shields left, capitol is captured
                    territoryTransferred = duel.contestedTerritoryId;
                }
            } else if (winner === duel.defender) {
                // Defender wins the round, capitol is defended
                continueToNextRound = false;
            } else {
                // No winner (both incorrect), continue to next round
                continueToNextRound = true;
            }
            
            // Update round counter if continuing
            if (continueToNextRound) {
                duelState.round++;
            }
        }

        // Update points and territory ownership
        if (winner && territoryTransferred && territory) {
            // Transfer territory ownership
            territory.owner = winner;
            
            // Update player points
            const winnerPlayer = this.gameState.players.find(p => p.id === winner);
            const loserPlayer = this.gameState.players.find(p => p.id === loser);
            
            if (winnerPlayer) {
                winnerPlayer.points = (winnerPlayer.points || 0) + 2;
                console.log(`Player ${winnerPlayer.name} earned 2 points. Total points: ${winnerPlayer.points}`);
            }
            
            if (loserPlayer) {
                console.log(`Player ${loserPlayer.name}'s points remain at ${loserPlayer.points || 0}`);

                // Check if defender lost their last capitol
                const hasCapitol = Object.values(this.gameState.territories).some((t: Territory) => 
                    t.owner === loserPlayer.id && t.isCapitol
                );

                if (!hasCapitol) {
                    // Transfer all remaining territories to winner
                    Object.values(this.gameState.territories)
                        .filter((t: Territory) => t.owner === loserPlayer.id)
                        .forEach((t: Territory) => {
                            if (winnerPlayer) {
                                t.owner = winner;
                                loserPlayer.territories = loserPlayer.territories.filter(id => id !== t.id);
                                if (!winnerPlayer.territories.includes(t.id)) {
                                    winnerPlayer.territories.push(t.id);
                                }
                            }
                        });
                    
                    // Eliminate the player
                    loserPlayer.eliminated = true;
                    console.log(`Player ${loserPlayer.name} has been eliminated - lost all capitols`);
                }
            }
        }

        const result: DuelResult = {
            winner,
            loser,
            attacker: duel.attacker,
            defender: duel.defender,
            attackerCorrect,
            defenderCorrect,
            territoryTransferred,
            attackerResponseTime: ((Date.now() - duel.startTime) / 1000).toFixed(1) + 's',
            defenderResponseTime: ((Date.now() - duel.startTime) / 1000).toFixed(1) + 's',
            contestedTerritoryId: duel.contestedTerritoryId,
            isCapitolRound: isCapitolBattle,
            round: duelState?.round || 1,
            totalRounds: duelState?.totalRounds || 1,
            shieldsRemaining: duelState?.shieldsRemaining || 0,
            continueToNextRound
        };

        return result;
    }

    public deleteDuel(duelId: string): void {
        const index = this.gameState.activeDuels.findIndex(d => d.id === duelId);
        if (index !== -1) {
            this.gameState.activeDuels.splice(index, 1);
        }
        this.duelAnswers.delete(duelId);
        this.duelState.delete(duelId);
    }

    public processObserverResult(duel: DuelData, answer: string, playerId: string): ObserverResult {
        const isAnswerCorrect = (answer: string, question: Question): boolean => {
            if (typeof question.correctAnswer === 'number') {
                return answer === question.answers[question.correctAnswer];
            } else {
                return answer === question.correctAnswer;
            }
        };

        const correct = isAnswerCorrect(answer, duel.question);
        const scoreGained = correct ? 1 : 0;

        return {
            playerId,
            answer,
            correct,
            scoreGained
        };
    }
}

export const duelManager = new DuelManager();