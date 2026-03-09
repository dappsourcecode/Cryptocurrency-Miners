// worker.js - FIXED NONCE POSITION
importScripts('mintme_miner.js');

let Module = null;
let currentJob = null;
let currentTimeCost = 1;
let currentSeedHex = "";
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

        currentSeedHex = currentJob.blob;
        if (currentSeedHex.startsWith("0x")) {
            currentSeedHex = currentSeedHex.slice(2);
        }

        // Determine time_cost based on algorithm
        currentTimeCost = 1;
        if (currentJob.algo) {
            if (currentJob.algo.includes("lyra2-webchain") && 
                !currentJob.algo.includes("lyra2v2")) {
                currentTimeCost = 4;
            }
            console.log("Using algorithm:", currentJob.algo, "timeCost:", currentTimeCost);
        }

        // Load blob into memory
        const blobBytes = hexToBytes(currentSeedHex);
        Module.HEAPU8.set(blobBytes, inputPtr);

        // Parse target
        if (currentJob.target) {
            let targetHex = currentJob.target;
            if (targetHex.startsWith("0x")) targetHex = targetHex.slice(2);
            target = BigInt("0x" + reverseHex(targetHex));
        } else {
            target = 0xFFFFFFFFFFFFFFFFn;
        }

        // Random starting nonce
        nonce = BigInt(Math.floor(Math.random() * 0xFFFFFFFFFFFFFFFF));
        
        console.log("New job. Blob length:", currentSeedHex.length/2, "bytes");
        console.log("Blob preview:", currentSeedHex.substring(0, 100));
        
        // CRITICAL: Find the nonce position
        // In Ethereum headers, nonce is the LAST 8 bytes
        const blobLen = currentSeedHex.length / 2;
        console.log("Nonce should be at byte:", blobLen - 8, "(last 8 bytes)");
    }
};

function mineLoop() {
    if (!isMining || !currentJob || !target || !Module) {
        setTimeout(mineLoop, 100);
        return;
    }

    const batchSize = 500;
    const view = Module.HEAPU8;
    const blobLen = currentSeedHex.length / 2;
    const nonceOffset = blobLen - 8;

    const generation = miningGeneration;
    const jobId = currentJob.job_id;

    for (let i = 0; i < batchSize; i++) {
        if (generation !== miningGeneration) break;

        // 1. Write 8-byte Nonce (BIG ENDIAN!)
        for (let b = 0; b < 8; b++) {
            view[inputPtr + nonceOffset + b] = Number((nonce >> BigInt((7 - b) * 8)) & 0xFFn);
        }

        // 2. Hash with correct time_cost
        Module.hash_data(inputPtr, outputPtr, blobLen, currentTimeCost);

        // 3. Check Target
        const hashVal = getLast64BitsLittleEndian(outputPtr);

        if (hashVal <= target) {
            // 4. Nonce for submission (already in correct format from counter)
            let nHex = nonce.toString(16).padStart(16, '0');

            // 5. Prepare result hash
            let resultHex = "";
            for (let b = 0; b < 32; b++) {
                resultHex += view[outputPtr + b].toString(16).padStart(2, '0');
            }

            // Debug
            let nHexInBlob = "";
            for (let b = 0; b < 8; b++) {
                nHexInBlob += view[inputPtr + nonceOffset + b].toString(16).padStart(2, '0');
            }
            
            console.log("=== SHARE FOUND ===");
            console.log("Nonce counter:", nonce.toString(16));
            console.log("Nonce in blob (BE):", nHexInBlob);
            console.log("Nonce for submit:", nHex);
            console.log("Result hash:", resultHex);
            console.log("Hash value (last 64 bits):", hashVal.toString(16));
            console.log("Target:", target.toString(16));
            console.log("===================");
            
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