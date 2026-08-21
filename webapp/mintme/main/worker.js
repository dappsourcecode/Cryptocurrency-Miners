// worker.js - Native Code Parity
importScripts('mintme_miner.js');

let Module = null;
let currentJob = null;
let currentTimeCost = 1;
let nonce = 0n;
let target = 0n;
let isMining = false;
let inputPtr, outputPtr;
let pristineBlob = null; // 1. ADD THIS GLOBAL VARIABLE

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
    } else if (msg.command === 'job') {
        currentJob = msg.data;
        let blobHex = currentJob.blob.startsWith("0x") ? currentJob.blob.slice(2) : currentJob.blob;
        
        pristineBlob = hexToBytes(blobHex); // 2. SAVE THE PRISTINE BLOB HERE
        Module.HEAPU8.set(pristineBlob, inputPtr);

        currentTimeCost = 1; 
        if (currentJob.algo && currentJob.algo.includes("lyra2-webchain") && !currentJob.algo.includes("v2")) {
            currentTimeCost = 4;
        }

        if (currentJob.target) {
            let tHex = currentJob.target.startsWith("0x") ? currentJob.target.slice(2) : currentJob.target;
            if (tHex.length <= 8) {
                const tmp = BigInt("0x" + reverseHex(tHex));
                if (tmp > 0n) {
                    const diff = 0xFFFFFFFFn / tmp;
                    target = diff > 0n ? (0xFFFFFFFFFFFFFFFFn / diff) : 0n;
                } else {
                    target = 0n;
                }
            } else {
                target = BigInt("0x" + reverseHex(tHex));
            }
        }
        
        nonce = BigInt(Math.floor(Math.random() * 0x7FFFFFFF)) << 32n | BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
    }
};

function mineLoop() {
    if (!isMining || !currentJob || !pristineBlob) { setTimeout(mineLoop, 100); return; } // 3. ENSURE PRISTINE BLOB EXISTS

    const batchSize = 500;
    const view = Module.HEAPU8;
    const blobLen = pristineBlob.length; // 4. GET LEN DIRECTLY FROM ARRAY
    const nonceOffset = blobLen - 8; 

    for (let i = 0; i < batchSize; i++) {
        
        // 5. CRITICAL FIX: RESTORE THE PRISTINE BLOB MEMORY BEFORE HASHING
        view.set(pristineBlob, inputPtr);

        for (let b = 0; b < 8; b++) {
            view[inputPtr + nonceOffset + b] = Number((nonce >> BigInt(b * 8)) & 0xFFn);
        }

        Module.hash_data(inputPtr, outputPtr, blobLen, currentTimeCost);

        const hashVal = getLast64BitsLittleEndian(outputPtr);

        if (hashVal <= target) {
            let nHex = "";
            for (let b = 0; b < 8; b++) {
                nHex += view[inputPtr + nonceOffset + b].toString(16).padStart(2, '0');
            }
            
            let resultHex = "";
            for (let b = 0; b < 32; b++) {
                resultHex += view[outputPtr + b].toString(16).padStart(2, '0');
            }

            postMessage({
                type: 'share',
                jobId: currentJob.job_id,
                nonce: nHex,
                result: resultHex,
                algo: currentJob.algo
            });
        }
        nonce++;
    }
    
    postMessage({ type: 'stats', hashes: batchSize });
    setTimeout(mineLoop, 0); 
}

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

function getLast64BitsLittleEndian(ptr) {
    const view = Module.HEAPU8;
    let hex = "0x";
    for (let i = 31; i >= 24; i--) hex += view[ptr + i].toString(16).padStart(2, '0');
    return BigInt(hex);
}