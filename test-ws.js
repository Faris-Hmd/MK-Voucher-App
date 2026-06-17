const WebSocket = require('ws');
const ws = new WebSocket('ws://187.127.234.201:3000');
ws.on('open', () => {
    console.log('Connected to WS');
    ws.close();
});
ws.on('error', (err) => {
    console.error('WS Error:', err);
});
ws.on('close', () => {
    console.log('WS Closed');
});
