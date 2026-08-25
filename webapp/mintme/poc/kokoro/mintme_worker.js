importScripts('mintme_miner.js');

class WasmMinerEngine {
    constructor() {
        this.Module = null;
        this.currentJob = null;
        this.currentTimeCost = 1;
        this.nonce = 0n;
        this.target = 0n;
        this.isMining = false;
        this.inputPtr = null;
        this.outputPtr = null;
        this.pristineBlob = null;
        
        this.INPUT_SIZE = 2048;
        this.OUTPUT_SIZE = 32;
        this.BATCH_SIZE = 250; // Optimized batch size
    }

    async init() {
        this.Module = await createMintMeModule();
        this.inputPtr = this.Module._malloc(this.INPUT_SIZE);
        this.outputPtr = this.Module._malloc(this.OUTPUT_SIZE);
        this.Module.hash_data = this.Module.cwrap('hash_data', 'void', ['number', 'number', 'number', 'number']);
        postMessage({ type: 'ready' });
    }

    handleMessage(msg) {
        if (!this.Module) return;

        if (msg.command === 'start') {
            if (!this.isMining) {
                this.isMining = true;
                this._mineLoop();
            }
        } else if (msg.command === 'job') {
            this._setupJob(msg.data);
        }
    }

    _setupJob(jobData) {
        this.currentJob = jobData;
        
        // 1. Setup Pristine Blob
        let blobHex = this.currentJob.blob.startsWith("0x") ? this.currentJob.blob.slice(2) : this.currentJob.blob;
        this.pristineBlob = this._hexToBytes(blobHex);
        this.Module.HEAPU8.set(this.pristineBlob, this.inputPtr);

        // 2. Setup Time Cost
        this.currentTimeCost = 1; 
        if (this.currentJob.algo && this.currentJob.algo.includes("lyra2-webchain") && !this.currentJob.algo.includes("v2")) {
            this.currentTimeCost = 4;
        }

        // 3. Setup Target (Difficulty Expansion)
        if (this.currentJob.target) {
            let tHex = this.currentJob.target.startsWith("0x") ? this.currentJob.target.slice(2) : this.currentJob.target;
            if (tHex.length <= 8) {
                const tmp = BigInt("0x" + this._reverseHex(tHex));
                if (tmp > 0n) {
                    const diff = 0xFFFFFFFFn / tmp;
                    this.target = diff > 0n ? (0xFFFFFFFFFFFFFFFFn / diff) : 0n;
                } else {
                    this.target = 0n;
                }
            } else {
                this.target = BigInt("0x" + this._reverseHex(tHex));
            }
        }
        
        // 4. Setup Starting Nonce
        this.nonce = BigInt(Math.floor(Math.random() * 0x7FFFFFFF)) << 32n | BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
    }

    _mineLoop() {
        if (!this.isMining || !this.currentJob || !this.pristineBlob) {
            setTimeout(() => this._mineLoop(), 100);
            return;
        }

        const view = this.Module.HEAPU8;
        const blobLen = this.pristineBlob.length;
        const nonceOffset = blobLen - 8; 

        for (let i = 0; i < this.BATCH_SIZE; i++) {
            // Restore pristine memory to prevent C++ mutation pollution
            view.set(this.pristineBlob, this.inputPtr);

            // Inject 8-byte Little Endian Nonce
            for (let b = 0; b < 8; b++) {
                view[this.inputPtr + nonceOffset + b] = Number((this.nonce >> BigInt(b * 8)) & 0xFFn);
            }

            // Execute WASM Hash
            this.Module.hash_data(this.inputPtr, this.outputPtr, blobLen, this.currentTimeCost);

            // Check against target
            const hashVal = this._getLast64BitsLittleEndian(this.outputPtr);

            if (hashVal <= this.target) {
                let nHex = "";
                for (let b = 0; b < 8; b++) {
                    nHex += view[this.inputPtr + nonceOffset + b].toString(16).padStart(2, '0');
                }
                
                let resultHex = "";
                for (let b = 0; b < 32; b++) {
                    resultHex += view[this.outputPtr + b].toString(16).padStart(2, '0');
                }

                postMessage({
                    type: 'share',
                    jobId: this.currentJob.job_id,
                    nonce: nHex,
                    result: resultHex,
                    algo: this.currentJob.algo
                });
            }
            this.nonce++;
        }
        
        // --- CRITICAL FIX: SEND STATS TO MAIN THREAD ---
        postMessage({ type: 'stats', hashes: this.BATCH_SIZE });
        
        // Yield to event loop to allow new jobs to arrive
        setTimeout(() => this._mineLoop(), 0); 
    }

    _hexToBytes(hex) {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
        return bytes;
    }

    _reverseHex(hex) {
        let out = "";
        for (let i = hex.length - 2; i >= 0; i -= 2) out += hex.substr(i, 2);
        return out;
    }

    _getLast64BitsLittleEndian(ptr) {
        const view = this.Module.HEAPU8;
        let hex = "0x";
        for (let i = 31; i >= 24; i--) hex += view[ptr + i].toString(16).padStart(2, '0');
        return BigInt(hex);
    }
}

// Instantiate and bind worker messaging
const engine = new WasmMinerEngine();
engine.init();

onmessage = function(e) {
    engine.handleMessage(e.data);
};