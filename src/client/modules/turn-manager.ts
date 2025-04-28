import { GameState } from '../../types/game';
import { enableTerritory, refreshTerritories } from './territory-manager.js';
import { showMessage, updateTurnIndicator, clearDiceResults, updatePlayerStats } from './ui-manager.js';
import { isCurrentPlayer } from './state-manager.js';

export function processTurnTransition(state: GameState): void {
    console.log('Processing turn transition', state.currentTurn);
    
    // Clear any previous dice results
    clearDiceResults();
    
    // Update the turn indicator with the current player's name
    const currentPlayer = state.players.find(p => p.id === state.currentTurn);
    if (currentPlayer) {
        updateTurnIndicator(currentPlayer.name);
        console.log(`Turn indicator updated for player: ${currentPlayer.name}`);
    }
    
    // Check if it's the current player's turn
    if (isCurrentPlayer(state)) {
        showMessage('It\'s your turn!');
        console.log('Player turn activated - enabling territories');
        enableTerritory(true);
    } else {
        showMessage(`It's ${currentPlayer?.name}'s turn.`);
        console.log('Not player turn - disabling territories');
        enableTerritory(false);
    }
    
    // Always update the player stats when a turn changes
    updatePlayerStats(state);
    
    // Refresh the territories to show the current state
    refreshTerritories(state);
} 