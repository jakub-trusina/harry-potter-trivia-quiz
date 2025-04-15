import { Socket } from 'socket.io-client';
import { GameState, Player } from '../../types/game.js';
import { GameStateManager } from './state-manager.js';
import { updateGameState, updatePlayerId } from './state-manager.js';
import { updatePlayerList, updateStartButton, updatePlayerStats } from './ui-manager.js';
import { addLogEntry } from './log-manager.js';

export function initializeSocketHandlers(socket: Socket, state: GameStateManager): void {
    socket.on('connect', () => {
        console.log('Connected to server');
        
        // Check if there's an existing session
        const existingPlayerId = localStorage.getItem('playerId');
        const existingPlayerName = localStorage.getItem('playerName');
        
        if (existingPlayerId && existingPlayerName) {
            const shouldReconnect = confirm(`Welcome back ${existingPlayerName}! Would you like to reconnect to your previous session?`);
            if (shouldReconnect) {
                console.log('🔄 Attempting to reconnect previous session...');
                socket.emit('reconnect-session', { playerId: existingPlayerId, playerName: existingPlayerName });
                return;
            } else {
                // Clear the stored session if user doesn't want to reconnect
                localStorage.removeItem('playerId');
                localStorage.removeItem('playerName');
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('🔌 Disconnected from server');
        addLogEntry('Disconnected from server');
        if (state.ui) {
            state.ui.joinGameBtn.disabled = true;
        }
        alert('Disconnected from server. Please refresh the page.');
    });

    socket.on('error', (error: Error) => {
        console.error('❌ Socket error:', error);
        addLogEntry('Socket error occurred');
        alert('An error occurred. Please refresh the page.');
    });

    // Add socket event debugging
    const originalEmit = socket.emit;
    socket.emit = function(event: string, ...args: any[]) {
        console.log(`📤 SOCKET EMIT: ${event}`, args);
        return originalEmit.apply(this, [event, ...args]);
    };
    
    // Add a listener for all events
    socket.onAny((event, ...args) => {
        console.log(`📥 SOCKET RECEIVED: ${event}`, args);
    });
    
    // Connection events
    socket.on('connect', () => {
        const playerId = socket.id;
        if (playerId) {
            updatePlayerId(state, playerId);
            console.log('🔌 Connected to server with ID:', playerId);
            // Store the session info when we get a new player ID
            localStorage.setItem('playerId', playerId);
            if (state.playerName) {
                localStorage.setItem('playerName', state.playerName);
            }
        }
        console.log('🔍 Socket connection state:', socket.connected);
        if (state.ui) {
            state.ui.joinGameBtn.disabled = false;
        }
    });

    socket.on('connect_error', (error: Error) => {
        console.error('❌ Socket connection error:', error);
        addLogEntry('Connection error occurred');
        if (state.ui) {
            state.ui.joinGameBtn.disabled = true;
        }
        alert('Failed to connect to server. Please refresh the page.');
    });

    socket.on('connect_timeout', () => {
        console.error('❌ Socket connection timeout');
        if (state.ui) {
            state.ui.joinGameBtn.disabled = true;
        }
        alert('Connection timeout. Please refresh the page.');
    });

    socket.on('player-id', (playerId: string) => {
        console.log('🔌 Connected to server with ID:', playerId);
        state.playerId = playerId;
        // Store the session info when we get a new player ID
        localStorage.setItem('playerId', playerId);
        if (state.playerName) {
            localStorage.setItem('playerName', state.playerName);
        }
    });

    socket.on('reconnection-failed', () => {
        console.log('❌ Reconnection failed, starting new session');
        localStorage.removeItem('playerId');
        localStorage.removeItem('playerName');
        alert('Could not reconnect to previous session. Please join as a new player.');
    });

    socket.on('reconnection-successful', (data: { playerId: string, playerName: string }) => {
        console.log('✅ Reconnected to previous session');
        state.playerId = data.playerId;
        state.playerName = data.playerName;
        addLogEntry('Reconnected to previous session');
        
        // Update UI to show we're reconnected
        if (state.ui) {
            state.ui.playerNameInput.value = data.playerName;
            socket.emit('join-game', data.playerName);
            state.ui.loginScreen.classList.add('hidden');
            state.ui.lobbyScreen.classList.remove('hidden');
        }
    });

    // Game state events
    socket.on('joined-game', (data: { playerId: string, isHost: boolean, isReconnection: boolean }) => {
        console.log('🎮 Joined game:', data);
        state.playerId = data.playerId;
        // Store host status in state
        const currentPlayer: Player = { 
            id: data.playerId,
            name: state.playerName || 'Unknown Player', // Provide default name if null
            territories: [],
            points: 0,
            score: 0,
            eliminated: false,
            supplyLines: [],
            isHost: data.isHost,
            socketId: data.playerId
        };
        
        // Update player list if empty or add new player
        if (state.players.length === 0) {
            state.players = [currentPlayer];
        } else {
            state.players.push(currentPlayer);
        }
        
        console.log('Current game state:', {
            playerId: state.playerId,
            players: state.players,
            isHost: currentPlayer.isHost
        });
        
        updatePlayerList(state);
        updateStartButton(state);
    });

    socket.on('player-list-update', (players: any[]) => {
        console.log('📋 Received player list update:', players);
        state.players = players;
        console.log('Updated game state:', {
            playerId: state.playerId,
            players: state.players,
            currentPlayer: state.players.find(p => p.id === state.playerId)
        });
        updatePlayerList(state);
        updateStartButton(state);
        
        if (state.gameActive) {
            updatePlayerStats(state);
        }
    });

    socket.on('game-state-update', (newState: GameState) => {
        console.log('🔄 Received game state update:', newState);
        state.players = newState.players;
        state.gameActive = newState.gameActive;
        updateGameState(state, newState.territories);
        console.log('Game state after update:', {
            playerId: state.playerId,
            players: state.players,
            currentPlayer: state.players.find(p => p.id === state.playerId),
            gameActive: state.gameActive
        });
        updatePlayerList(state);
        updateStartButton(state);
        if (state.gameActive) {
            updatePlayerStats(state);
        }
    });
} 