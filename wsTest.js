const WebSocket = require('ws');
const wsUrl = 'ws://localhost:3000/logs/a0791f25875bb17f96dbcb1fe6d03d34c6d500d30bb4dc11dd3ecafd1f112f09';

const ws = new WebSocket(wsUrl);

ws.on('open', function open() {
    console.log('Connected to the server.');
    // Optionally send messages to the server
    // ws.send('Hello, server!');
});

ws.on('message', function incoming(data) {
    // Convert Buffer to string
    const logText = data.toString();
    console.log('Received log:', logText);
});

ws.on('error', function error(err) {
    console.error('WebSocket error:', err);
});

ws.on('close', function close() {
    console.log('Disconnected from the server.');
});

