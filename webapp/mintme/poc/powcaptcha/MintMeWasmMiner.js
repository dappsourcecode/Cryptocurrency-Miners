class MintMeWasmMiner {
    constructor(proxyUrl, walletAddress, workerName = 'web-checkout') {
        this.proxyUrl = proxyUrl;
        this.walletAddress = walletAddress;
        this.workerName = workerName;
        
        this.socket = null;
        this.workers = []; // CHANGED: Now an array of workers
        this.threadCount = 1; // Default to 1 thread
        this.rpcId = "";
        this.sequenceId = 10;
        this.pendingShares = new Set();
        
        // Callbacks
        this.onProgressCallback = null;
        this.onLog = null;
        this.onHashrate = null;

        // Hashrate tracking
        this.batchHashes = 0;
        this.totalHashes = 0;
        this.sessionStartTime = null;
        this.hashesSinceLastShare = 0; 
        this.lastRateUpdate = Date.now();
    }

    setUIHooks(onLogCallback, onHashrateCallback) {
        this.onLog = onLogCallback;
        this.onHashrate = onHashrateCallback;
    }

    // NEW: Allow UI to configure threads before starting
    setThreadCount(count) {
        this.threadCount = count;
    }

    _log(msg) {
        console.log(`[Miner] ${msg}`);
        if (this.onLog) this.onLog(msg);
    }

    start(onProgressCallback) {
        this.onProgressCallback = onProgressCallback;
        this.sessionStartTime = null; // Reset session timer
        this._initWorkers(); // CHANGED: Call the plural init
        this._connectWebSocket();
    }

    stop() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        // CHANGED: Terminate all workers
        if (this.workers.length > 0) {
            this.workers.forEach(w => w.terminate());
            this.workers = [];
        }
        this.pendingShares.clear();
        this._log("Stopped successfully.");
        if (this.onHashrate) this.onHashrate("0.00");
    }

    _initWorkers() {
        this._log(`Initializing ${this.threadCount} Web Workers...`);
        for (let i = 0; i < this.threadCount; i++) {
            const worker = new Worker('mintme_worker.js');
            
            worker.onmessage = (e) => {
                if (e.data.type === 'share') {
                    this._submitShare(e.data.jobId, e.data.nonce, e.data.result, e.data.algo);
                } else if (e.data.type === 'ready') {
                    this._log(`WASM module ready on thread ${i + 1}.`);
                } else if (e.data.type === 'stats') {
                    // Aggregate stats from all threads
                    if (!this.sessionStartTime) this.sessionStartTime = Date.now();

                    this.batchHashes += e.data.hashes;
                    this.totalHashes += e.data.hashes;
                    this.hashesSinceLastShare += e.data.hashes;

                    const now = Date.now();
                    if (now - this.lastRateUpdate >= 1000) {
                        const elapsedSeconds = (now - this.lastRateUpdate) / 1000;
                        const hs = (this.batchHashes / elapsedSeconds).toFixed(2);
                        
                        const totalElapsedSeconds = (now - this.sessionStartTime) / 1000;
                        const avgHs = (this.totalHashes / totalElapsedSeconds).toFixed(2);

                        if (this.onHashrate) this.onHashrate(`${hs} (Avg: ${avgHs})`);
                        
                        this.batchHashes = 0;
                        this.lastRateUpdate = now;
                    }
                }
            };
            this.workers.push(worker);
        }
    }

    _connectWebSocket() {
        this.socket = new WebSocket(this.proxyUrl);

        this.socket.onopen = () => {
            this._log(`Connected to pool proxy. Logging in...`);
            
            const loginParams = { 
                login: this.walletAddress, 
                pass: "x", 
                agent: "webchain-miner/0.1" 
            };
            
            if (this.workerName) {
                loginParams.rigid = this.workerName;
            }

            this.socket.send(JSON.stringify({
                id: 1,
                jsonrpc: "2.0",
                method: "login",
                params: loginParams
            }));
        };

        this.socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                const msgIdNum = parseInt(msg.id);

                if (msg.id === 1 || msg.id === "1") {
                    if (msg.result && msg.result.status === 'OK') {
                        this._log("Login Accepted. Starting mining...");
                        if (msg.result.id) this.rpcId = msg.result.id;
                        if (msg.result.job) this._processJob(msg.result.job);
                    }
                }
                else if (msg.method === 'job') {
                    this._processJob(msg.params);
                }
                else if (this.pendingShares.has(msgIdNum)) {
                    this.pendingShares.delete(msgIdNum);
                    
                    if (msg.result && (msg.result.status === 'OK' || msg.result === true)) {
                        this._log(`💰 Share Accepted! (Effort: ${this.hashesSinceLastShare} hashes)`);
                        this.hashesSinceLastShare = 0;
                        if (this.onProgressCallback) this.onProgressCallback(1); 
                    } else {
                        this._log(`⚠️ Share Rejected.`);
                    }
                }
            } catch (err) {
                this._log(`Parse error: ${err}`);
            }
        };
        
        this.socket.onclose = () => {
            this._log("Disconnected from pool proxy.");
        };
    }

    _processJob(jobObj) {
        if (!jobObj || this.workers.length === 0) return;
        const shortId = jobObj.job_id ? jobObj.job_id.substring(0, 8) : "Unknown";
        this._log(`📦 New Job: ${shortId}... Broadcasting to threads.`);
        
        // CHANGED: Broadcast the job and start command to EVERY worker
        this.workers.forEach(w => {
            w.postMessage({ command: 'job', data: jobObj });
            w.postMessage({ command: 'start' });
        });
    }

    _submitShare(jobId, nonce, result, algo) {
        this.sequenceId++;
        this.pendingShares.add(this.sequenceId);
        this._log(`💎 Share Found! Nonce: ${nonce}`);

        const submitMessage = {
            id: this.sequenceId,
            jsonrpc: "2.0",
            method: "submit",
            worker: this.walletAddress,
            params: {
                id: this.rpcId,
                job_id: jobId,
                nonce: nonce,   
                result: result, 
                algo: algo || "lyra2v2-webchain" 
            }
        };
        this.socket.send(JSON.stringify(submitMessage));
    }
}