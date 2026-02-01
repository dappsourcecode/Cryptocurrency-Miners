const WebSocket = require('ws');
const net = require('net');

const wss = new WebSocket.Server({ port: 8081 });

wss.on('connection', (ws) => {
    let tcpClient = null;

    ws.on('message', (message) => {
        // Parse the incoming message from the browser miner
        // The miner sends JSON. We need to handle the "start" event specially
        // to know which pool to connect to, or just hardcode your pool here.
        
        const data = JSON.parse(message);
        
        if (data.type === 'start' || !tcpClient) {
            // Connect to the real Raptoreum pool
            tcpClient = new net.Socket();
            tcpClient.connect(3333, 'europe.raptoreum.zone', () => {
                console.log('Connected to Pool');
            });

            tcpClient.on('data', (poolData) => {
                ws.send(poolData.toString());
            });

            tcpClient.on('close', () => ws.close());
            tcpClient.on('error', (err) => console.error(err));
        }

        if (tcpClient && tcpClient.writable) {
            // Forward browser data to pool
            // Note: You might need to re-format the data if the miner sends custom events
            // but standard Stratum JSON-RPC usually passes through fine.
             if (data.type !== 'start') {
                 tcpClient.write(message); // Depending on protocol, might need newline
             }
        }
    });
});

console.log("Proxy running on port 8081");