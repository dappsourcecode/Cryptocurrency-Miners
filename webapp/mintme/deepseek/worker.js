// worker.js - FINAL CORRECTED VERSION
importScripts('mintme_miner.js');

let Module = null;
let currentJob = null;
let currentTimeCost = 1;
let currentBlobHex = "";
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

        // Store the blob (hashNoNonce) for submission
        currentBlobHex = currentJob.blob;
        if (currentBlobHex.startsWith("0x")) {
            currentBlobHex = currentBlobHex.slice(2);
        }

        // Determine time_cost based on algorithm
        currentTimeCost = 1; // default for lyra2v2
        if (currentJob.algo) {
            if (currentJob.algo.includes("lyra2-webchain") && 
                !currentJob.algo.includes("lyra2v2")) {
                currentTimeCost = 4; // original lyra2
            }
            console.log("Using algorithm:", currentJob.algo, "timeCost:", currentTimeCost);
        }

        // Load blob into memory
        const blobBytes = hexToBytes(currentBlobHex);
        Module.HEAPU8.set(blobBytes, inputPtr);

        // Parse target (little-endian hex to BigInt)
        if (currentJob.target) {
            let targetHex = currentJob.target;
            if (targetHex.startsWith("0x")) targetHex = targetHex.slice(2);
            // Convert little-endian to big-endian for comparison
            target = BigInt("0x" + reverseHex(targetHex));
            console.log("Target:", target.toString(16));
        } else {
            target = 0xFFFFFFFFFFFFFFFFn;
        }

        // Use 64-bit random starting nonce (8 bytes)
        nonce = BigInt(Math.floor(Math.random() * 0xFFFFFFFFFFFFFFFF));
        console.log("New job. Nonce start:", nonce.toString(16), 
                   "Blob length:", currentBlobHex.length/2, "bytes");
    }
};

function mineLoop() {
    if (!isMining || !currentJob || !target || !Module) {
        setTimeout(mineLoop, 100);
        return;
    }

    const batchSize = 500;
    const view = Module.HEAPU8;
    const nonceOffset = 39; // 8-byte nonce position
    const blobLen = currentBlobHex.length / 2; // Actual byte length

    const generation = miningGeneration;
    const jobId = currentJob.job_id;

    for (let i = 0; i < batchSize; i++) {
        if (generation !== miningGeneration) break;

        // 1. Write 8-byte Nonce (Little Endian)
        for (let b = 0; b < 8; b++) {
            view[inputPtr + nonceOffset + b] = Number((nonce >> BigInt(b * 8)) & 0xFFn);
        }

        // 2. Hash with correct time_cost
        Module.hash_data(inputPtr, outputPtr, blobLen, currentTimeCost);

        // 3. Check Target
        const hashVal = getLast64BitsLittleEndian(outputPtr);

        if (hashVal <= target) {
            // 4. Prepare nonce hex (8 bytes, 16 chars)
            let nHex = "";
            for (let b = 0; b < 8; b++) {
                nHex += view[inputPtr + nonceOffset + b].toString(16).padStart(2, '0');
            }

            // 5. Prepare result hash (32 bytes, 64 chars)
            let resultHex = "";
            for (let b = 0; b < 32; b++) {
                resultHex += view[outputPtr + b].toString(16).padStart(2, '0');
            }

            console.log("Share found! Nonce:", nHex, "Hash:", hashVal.toString(16));
            
            if (generation === miningGeneration) {
                postMessage({
                    type: 'share',
                    jobId: jobId,
                    nonce: nHex,
                    result: resultHex,
                    blob: currentBlobHex  // Send blob for submission
                });
            }
        }

        // Increment 64-bit nonce
        nonce++;
    }

    postMessage({ type: 'stats', hashes: batchSize });
    setTimeout(mineLoop, 0);
}

// Helper functions
function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
}

function reverseHex(hex) {
    let out = "";
    for (let i = hex.length - 2; i >= 0; i -= 2) {
        out += hex.substr(i, 2);
    }
    return out;
}

function getLast64BitsLittleEndian(ptr) {
    const view = Module.HEAPU8;
    let hex = "0x";
    for (let i = 31; i >= 24; i--) {
        hex += view[ptr + i].toString(16).padStart(2, '0');
    }
    return BigInt(hex);
}