import { Server } from 'socket.io';
import { createServer } from 'http';
import { AddressInfo } from 'net';
import { io as ioc } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { jest } from '@jest/globals';

// Global setup
beforeAll(() => {
    // Silence console logs during tests unless there's an error
    global.console.log = jest.fn();
    global.console.info = jest.fn();
    global.console.warn = jest.fn();
    // Keep error logging for debugging
    // global.console.error = jest.fn();
    
    // Increase Jest timeout for all tests
    jest.setTimeout(10000);
});

// Helper to create a new Socket.IO server and client for testing
export async function createTestServer() {
    const httpServer = createServer();
    const io = new Server(httpServer, {
        transports: ['websocket'],
        pingTimeout: 1000,
        pingInterval: 1000
    });
    
    // Start server and get port
    await new Promise<void>(resolve => httpServer.listen(0, resolve));
    const port = (httpServer.address() as AddressInfo).port;
    
    // Create client socket with connection timeout
    const clientSocket = ioc(`http://localhost:${port}`, {
        transports: ['websocket'],
        autoConnect: false,
        forceNew: true,
        timeout: 5000
    }) as Socket;
    
    // Helper to create additional test clients
    const createTestClient = (port: number) => {
        const socket = ioc(`http://localhost:${port}`, {
            transports: ['websocket'],
            autoConnect: false,
            forceNew: true,
            timeout: 5000
        }) as Socket;
        socket.connect();
        return socket;
    };
    
    // Helper to cleanup resources
    const cleanup = async () => {
        return new Promise<void>((resolve) => {
            const sockets = Array.from(io.sockets.sockets.values());
            
            // Disconnect all sockets
            sockets.forEach(socket => {
                if (socket.connected) {
                    socket.disconnect(true);
                }
            });
            
            // Disconnect client socket
            if (clientSocket.connected) {
                clientSocket.disconnect();
            }
            
            // Close server with timeout
            const closeTimeout = setTimeout(() => {
                console.warn('Server close timed out, forcing close');
                httpServer.close();
                resolve();
            }, 3000);
            
            // Normal close
            io.close(() => {
                httpServer.close(() => {
                    clearTimeout(closeTimeout);
                    resolve();
                });
            });
        });
    };
    
    // Connect client socket
    clientSocket.connect();
    
    // Wait for connection with timeout
    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Client socket connection timeout'));
        }, 5000);
        
        clientSocket.on('connect', () => {
            clearTimeout(timeout);
            resolve();
        });
        
        clientSocket.on('connect_error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });
    });
    
    return {
        io,
        clientSocket,
        httpServer,
        port,
        createTestClient,
        cleanup
    };
}

// Add custom matchers
declare global {
    namespace jest {
        interface Matchers<R> {
            toBeValidTerritory(): R;
        }
    }
}

expect.extend({
    toBeValidTerritory(received) {
        const pass = received &&
            typeof received === 'object' &&
            'id' in received &&
            'owner' in received &&
            'value' in received &&
            'isCapitol' in received;
            
        return {
            pass,
            message: () => 
                pass
                    ? 'Expected object not to be a valid territory'
                    : 'Expected object to be a valid territory'
        };
    }
}); 