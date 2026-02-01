// worker.js - FIXED: Correct Endianness for Hash Comparison, General 32/64-bit Handling
importScripts('mintme_miner.js');

let Module = null;
let currentJob = null;
let nonce = 0n;
let target = 0n; // Changed to BigInt for consistency
let isMining = false;
let inputPtr, outputPtr;
let miningGeneration = 0;

const INPUT_SIZE = 2048; 
const OUTPUT_SIZE = 32;

createMintMeModule().then(instance => {
    Module = instance;
    inputPtr = Module._malloc(INPUT_SIZE);
    outputPtr = Module._malloc(OUTPUT_SIZE);
    Module.hash_data = Module.cwrap('hash_data', 'void', ['number', 'number', 'number']);
    postMessage({ type: 'ready' });
});

onmessage = function(e) {
    const msg = e.data;
    if (!Module) return; 
    
    if (msg.command === 'start') {
        if (!isMining) { isMining = true; mineLoop(); }
    }
    else if (msg.command === 'job') {
        const newJob = msg.data;
        if (currentJob && currentJob.job_id === newJob.job_id) return;
        
        miningGeneration++;
        currentJob = newJob;

        const blobBytes = hexToBytes(currentJob.blob);
        Module.HEAPU8.set(blobBytes, inputPtr);

        // FIXED: Parse target with endian handling, pad to 64-bit if needed
        let targetHex = currentJob.target || 'ffffffffffffffff'; // Default max if missing
        if (targetHex.length <= 8) {
            // Pad to 16 chars (64-bit) with leading '00' for high bits
            targetHex = '0'.repeat(16 - targetHex.length) + targetHex;
        }
        // Reverse to BE for BigInt (matches diff calc for >8)
        let beHex = "";
        for (let i = targetHex.length - 2; i >= 0; i -= 2) beHex += targetHex.substr(i, 2);
        target = BigInt("0x" + beHex);
        
        // Randomize start nonce (32-bit)
        nonce = BigInt(Math.floor(Math.random() * 0x100000000));
    }
};

function mineLoop() {
    if (!isMining || !currentJob || !target || !Module) { 
        setTimeout(mineLoop, 100); 
        return; 
    }

    const batchSize = 100; // Retained for responsiveness
    const view = Module.HEAPU8;
    const nonceOffset = 39;
    const blobLen = currentJob.blob.length / 2;
    
    const generation = miningGeneration;
    const jobId = currentJob.job_id;

    for (let i = 0; i < batchSize; i++) {
        if (generation !== miningGeneration) break;
        
        // 1. Write Nonce to Memory (Little Endian, 4 bytes only)
        view[inputPtr + nonceOffset]     = Number(nonce & 0xFFn);
        view[inputPtr + nonceOffset + 1] = Number((nonce >> 8n) & 0xFFn);
        view[inputPtr + nonceOffset + 2] = Number((nonce >> 16n) & 0xFFn);
        view[inputPtr + nonceOffset + 3] = Number((nonce >> 24n) & 0xFFn);
        
        // 2. Hash
        Module.hash_data(inputPtr, outputPtr, blobLen);
        
        // 3. Check Target (64-bit BE comparison on high bytes)
        const hashHigh = getHigh64BigEndian(outputPtr);
        if (hashHigh <= target) {
            // 4. Generate 8-character Little-Endian Nonce Hex
            let nHex = "";
            for (let b = 0; b < 4; b++) { 
                nHex += view[inputPtr + nonceOffset + b].toString(16).padStart(2, '0');
            }

            // 5. Result: 64-char hex of full 32-byte hash (byte order as computed)
            let resultHex = "";
            for (let b = 0; b < 32; b++) {
                resultHex += view[outputPtr + b].toString(16).padStart(2, '0');
            }

            if (generation === miningGeneration) {
                postMessage({ 
                    type: 'share', 
                    jobId: jobId,
                    nonce: nHex, 
                    result: resultHex
                });
            }
        }
        
        nonce = (nonce + 1n) & 0xFFFFFFFFn; // Prevent overflow
    }

    postMessage({ type: 'stats', hashes: batchSize });
    setTimeout(mineLoop, 0);
}

// Helpers
function hexToBytes(hex) {
    if (hex.startsWith("0x")) hex = hex.slice(2);
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    return bytes;
}

// FIXED: Get high 64 bits as BE BigInt (reverse bytes for hex)
function getHigh64BigEndian(ptr) {
    const view = Module.HEAPU8;
    let hex = "0x";
    for (let i = 31; i >= 24; i--) {
        hex += view[ptr + i].toString(16).padStart(2, '0');
    }
    return BigInt(hex);
}