// worker.js - Endianness Adjusted (Nonce LE, Result Full)
importScripts('mintme_miner.js');

let Module = null;
let currentJob = null;
let nonce = 0n;
let target = 0n;
let isMining = false;
let inputPtr, outputPtr;
let miningGeneration = 0;

const INPUT_SIZE = 2048; 
const OUTPUT_SIZE = 32;

createMintMeModule().then(instance => {
    Module = instance;
    inputPtr = Module._malloc(INPUT_SIZE);
    outputPtr = Module._malloc(OUTPUT_SIZE);
    Module.hash_data = Module.cwrap('hash_data', 'void', ['number', 'number', 'number', 'number']);
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

        // Target parsing: MintMe targets are usually Little Endian.
        // We reverse it to BigInt for easy comparison in JS.
        if (currentJob.target) {
            target = BigInt("0x" + reverseHex(currentJob.target));
        } else {
            target = 0xFFFFFFFFFFFFFFFFn;
        }
        
        // Randomize start nonce
        nonce = BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
    }
};

function mineLoop() {
    if (!isMining || !currentJob || !target || !Module) { 
        setTimeout(mineLoop, 100); 
        return; 
    }

    const batchSize = 100; // Small batch to keep UI responsive
    const view = Module.HEAPU8;
    const nonceOffset = 39;
    const blobLen = currentJob.blob.length / 2;
    
    const generation = miningGeneration;
    const jobId = currentJob.job_id;

    for (let i = 0; i < batchSize; i++) {
        if (generation !== miningGeneration) break;
        
        // 1. Write Nonce to Memory (Little Endian)
        view[inputPtr + nonceOffset]     = Number(nonce & 0xFFn);
        view[inputPtr + nonceOffset + 1] = Number((nonce >> 8n) & 0xFFn);
        view[inputPtr + nonceOffset + 2] = Number((nonce >> 16n) & 0xFFn);
        view[inputPtr + nonceOffset + 3] = Number((nonce >> 24n) & 0xFFn);
        
        // Handle 64-bit nonces if needed (though usually 32-bit is enough for web)
        view[inputPtr + nonceOffset + 4] = Number((nonce >> 32n) & 0xFFn);
        view[inputPtr + nonceOffset + 5] = Number((nonce >> 40n) & 0xFFn);
        view[inputPtr + nonceOffset + 6] = Number((nonce >> 48n) & 0xFFn);
        view[inputPtr + nonceOffset + 7] = Number((nonce >> 56n) & 0xFFn);
        
        // 2. Hash
        const TIME_COST = 1; 
        Module.hash_data(inputPtr, outputPtr, blobLen, TIME_COST);
        
        // 3. Check Target (High bytes must be zero for CryptoNote difficulty)
        // We read the LAST 64 bits of the hash memory as a Big Endian number to compare.
        const hashVal = getLast64BitsLittleEndian(outputPtr);

        if (hashVal <= target) {
            
            // --- NONCE FORMAT FIX: LITTLE ENDIAN ---
            // The pool writes these bytes directly into the blob.
            // Since we wrote `nonce & 0xFF` to the first byte in memory,
            // we must send that byte first in the hex string.
            let nHex = "";
            for (let b = 0; b < 8; b++) { 
                nHex += view[inputPtr + nonceOffset + b].toString(16).padStart(2, '0');
            }

            // --- RESULT FORMAT: RAW BYTES (Commonly accepted) ---
            // Send the 32-byte hash exactly as it sits in memory.
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
        
        nonce++;
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

function reverseHex(hex) {
    let out = "";
    for (let i = hex.length - 2; i >= 0; i -= 2) out += hex.substr(i, 2);
    return out;
}

// Read the last 8 bytes of the 32-byte hash as a Big Int for comparison
// (CryptoNote treats hash as Little Endian number, so last bytes are Most Significant)
function getLast64BitsLittleEndian(ptr) {
    const view = Module.HEAPU8;
    let hex = "0x";
    for(let i = 31; i >= 24; i--) {
        hex += view[ptr + i].toString(16).padStart(2, '0');
    }
    return BigInt(hex);
}