const io = require('socket.io-client');

const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Debug client connected with ID:', socket.id);
});

// Log ALL events
socket.onAny((event, ...args) => {
  console.log(`Event '${event}' received:`, JSON.stringify(args, null, 2));
});

// Keep the process running
setInterval(() => {}, 1000); 