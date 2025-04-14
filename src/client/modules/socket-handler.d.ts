import { Socket } from 'socket.io-client';
import { GameStateManager } from './state-manager.js';

export function initializeSocketHandlers(socket: Socket, state: GameStateManager): void; 