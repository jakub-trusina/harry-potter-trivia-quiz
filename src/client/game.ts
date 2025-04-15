// Types for Socket.IO client
declare const io: any;

import { initializeSocketHandlers } from './modules/socket-handler.js';
import { initializeUI } from './modules/ui-manager.js';
import { initializeStateManager, GameStateManager } from './modules/state-manager.js';
import { initializeDuelHandlers } from './modules/duel-manager.js';
import { initializeGameEndHandler } from './modules/game-end-manager.js';
import { initializeHelpModal } from './modules/help-modal-manager.js';
import { initializeLobbyHandlers } from './modules/lobby-manager.js';
import { initializeMapDebugger } from './modules/map-manager.js';
import { initializeGameStateHandlers } from './modules/game-state-handler.js';
import { initializeButtonHandlers } from './modules/button-handler.js';

// Wait for the DOM to be fully loaded before initializing
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 DOM loaded, initializing game...');
    
    try {
        // Initialize Socket.IO
        console.log('🔌 Initializing Socket.IO connection...');
        const socket = io();
        
        // Initialize game state
        const gameState = initializeStateManager();
        gameState.socket = socket;
        
        // Initialize UI components
        initializeUI(gameState);
        
        // Initialize button handlers
        initializeButtonHandlers(gameState);
        
        // Initialize Socket.IO event handlers
        initializeSocketHandlers(socket, gameState);
        
        // Initialize duel handlers
        initializeDuelHandlers(gameState);
        
        // Initialize game end handler
        initializeGameEndHandler(socket, gameState);

        // Initialize lobby handlers
        initializeLobbyHandlers(gameState);

        // Initialize map debugger
        initializeMapDebugger(gameState);

        // Initialize game state handlers
        initializeGameStateHandlers(gameState);
        
        console.log('✅ Game initialization complete');
    } catch (error) {
        console.error('❌ Failed to initialize game:', error);
        alert('Failed to initialize game. Please refresh the page.');
    }
}); 