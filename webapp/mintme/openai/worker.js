// worker.js - FINAL FIX
importScripts('mintme_miner.js');

let Module = null;
let currentJob = null;
let nonce = 0n;
let target = 0n;
let isMining = false;
let inputPtr, outputPtr;

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
        currentJob = newJob;

        const blobBytes = hexToBytes(currentJob.blob);
        Module.HEAPU8.set(blobBytes, inputPtr);

        if (currentJob.target) {
            target = BigInt("0x" + reverseHex(currentJob.target));
        } else {
            target = 0xFFFFFFFFFFFFFFFFn;
        }
        // Use 32-bit random starting nonce
        nonce = BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
    }
};

// Inside worker.js
function mineLoop() {
    if (!isMining || !currentJob || !target || !Module) { setTimeout(mineLoop, 100); return; }

    const batchSize = 500; 
    const view = Module.HEAPU8;
    const nonceOffset = 39; // Ensure this matches your pool's blob structure
    const blobLen = currentJob.blob.length / 2;

    for (let i = 0; i < batchSize; i++) {
        // 1. Write 8-byte Nonce (Little Endian) [cite: 35, 39]
        for (let b = 0; b < 8; b++) {
            view[inputPtr + nonceOffset + b] = Number((nonce >> BigInt(b * 8)) & 0xFFn);
        }
        
        // 2. Hash
        Module.hash_data(inputPtr, outputPtr, blobLen);
        
        // 3. Check Target
        if (getLast64BitsLittleEndian(outputPtr) <= target) {
            const hashHex = getFullHashHexString(outputPtr); // in-memory order (0..31)
            
            // POOL EXPECTS: little-endian byte order for the 'result' field (LSB first).
            // So we reverse the 32-byte hash by 2-hex-digit pairs:
            const resultLE = reverseHex(hashHex);

            // 4. Generate 16-character Little-Endian Nonce Hex (same as before)
            let nHex = "";
            for (let b = 0; b < 8; b++) {
                nHex += view[inputPtr + nonceOffset + b].toString(16).padStart(2, '0');
            }

            // Send the *reversed* hash as 'result'
            postMessage({ 
                type: 'share', 
                jobId: currentJob.job_id, 
                nonce: nHex, 
                result: resultLE 
            });
        }
        
        nonce++; // BigInt handles 64-bit naturally in JS [cite: 36]
    }

    postMessage({ type: 'stats', hashes: batchSize });
    setTimeout(mineLoop, 0);
}

// Helpers
function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    return bytes;
}
function reverseHex(hex) {
    let out = "";
    for (let i = hex.length - 2; i >= 0; i -= 2) out += hex.substr(i, 2);
    return out;
}
function getFullHashHexString(ptr) {
    let hex = "";
    for (let i = 0; i < 32; i++) hex += Module.HEAPU8[ptr + i].toString(16).padStart(2, '0');
    return hex;
}
function getLast64BitsLittleEndian(ptr) {
    const view = Module.HEAPU8;
    let hex = "0x";
    // Interprets bytes 24-31 as a 64-bit LE integer
    for(let i=31; i>=24; i--) hex += view[ptr + i].toString(16).padStart(2, '0');
    return BigInt(hex);
}