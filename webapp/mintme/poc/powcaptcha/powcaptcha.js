document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("pow-gatekeeper-container");
    if (!container) return; 

    // Configuration Read from HTML or Defaults
    const targetShares = parseInt(container.getAttribute('data-target-shares')) || 5;
    const proxyUrl = container.getAttribute('data-proxy-url') || 'ws://127.0.0.1:8888';
    const wallet = container.getAttribute('data-wallet') || '0xa733c9545a3476de410e7704d8be586d59db9c6d';
    const algorithm = container.getAttribute('data-algorithm') || 'Lyra2v2 (Webchain)';
    const pool = container.getAttribute('data-pool') || 'pool.mintme.com:2222';
    
    // Hardware detection for threads
    const maxCores = navigator.hardwareConcurrency || 4;
    const defaultCores = Math.max(1, Math.floor(maxCores / 2));

    let minerEngine = null;
    let currentShares = 0;
    let state = "IDLE"; // IDLE, MINING, PAUSED, COMPLETE

    // 1. Inject the Advanced UI
    container.innerHTML = `
        <style>
            .pow-transparency-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: #f9f9f9; padding: 15px; border-radius: 6px; font-size: 0.85em; margin-bottom: 15px; text-align: left;}
            .pow-transparency-grid div { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .pow-log-terminal { background: #1e1e1e; color: #00ff00; font-family: monospace; font-size: 0.8em; height: 120px; overflow-y: scroll; padding: 10px; border-radius: 6px; text-align: left; margin-top: 15px; }
            .pow-log-terminal div { margin-bottom: 4px; }
            .pow-controls { margin: 15px 0; text-align: left; }
            .pow-controls input[type=range] { width: 100%; margin-top: 5px; }
            .pow-actions { display: flex; gap: 10px; margin-bottom: 15px; }
            .pow-btn { flex: 1; padding: 12px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; color: #fff; transition: 0.2s;}
            .btn-start { background: #007BFF; }
            .btn-pause { background: #ff9800; }
            .btn-proceed { background: #28a745; }
            .btn-disabled { background: #ccc; cursor: not-allowed; }
        </style>

        <h3 style="margin-top:0;">Computational Security Check</h3>
        
        <div class="pow-transparency-grid">
            <div><strong>Algorithm:</strong> ${algorithm}</div>
            <div><strong>Target:</strong> ${targetShares} Validated Shares</div>
            <div><strong>Pool:</strong> ${pool}</div>
            <div style="word-break: break-all; font-size: 0.6rem;"><strong>Wallet:</strong> ${wallet}</div>
        </div>

        <div class="pow-controls">
            <label><strong>CPU Threads Dedication:</strong> <span id="pow-thread-val">${defaultCores}</span> / ${maxCores}</label>
            <input type="range" id="pow-thread-slider" min="1" max="${maxCores}" value="${defaultCores}">
        </div>

        <div class="pow-progress-wrap" style="width: 100%; height: 12px; background: #eee; border-radius: 6px; overflow: hidden; margin-bottom: 5px;">
            <div id="pow-progress-bar" style="width: 0%; height: 100%; background: #28a745; transition: width 0.3s;"></div>
        </div>
        
        <div style="display: flex; justify-content: space-between; font-size: 0.85em; margin-bottom: 15px;">
            <span id="pow-status" style="font-weight: bold;">0 / ${targetShares} Shares</span>
            <span id="pow-hashrate" style="color: #007BFF; font-family: monospace;">0.00 H/s</span>
        </div>

        <div class="pow-actions">
            <button id="pow-main-btn" class="pow-btn btn-start">Accept & Start</button>
        </div>

        <div id="pow-log-box" class="pow-log-terminal">
            <div>[System] Ready. Awaiting user consent to utilize CPU.</div>
        </div>
    `;

    const mainBtn = document.getElementById("pow-main-btn");
    const threadSlider = document.getElementById("pow-thread-slider");
    const threadVal = document.getElementById("pow-thread-val");
    const progressBar = document.getElementById("pow-progress-bar");
    const statusText = document.getElementById("pow-status");
    const hashrateText = document.getElementById("pow-hashrate");
    const logBox = document.getElementById("pow-log-box");
    const secretContent = document.getElementById("secret-content");

    // UI Helpers
    function appendLog(msg) {
        const d = document.createElement('div');
        d.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
        logBox.appendChild(d);
        logBox.scrollTop = logBox.scrollHeight; // Auto-scroll to bottom
    }

    function formatHashrate(rawHashrate) {
        const val = parseFloat(rawHashrate);
        if (isNaN(val) || !isFinite(val) || val < 0) return "0.00";
        return val.toFixed(2);
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) return resolve();
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load: ${src}`));
            document.head.appendChild(script);
        });
    }

    // Thread Event Listener
    threadSlider.addEventListener("input", (e) => {
        const cores = parseInt(e.target.value);
        threadVal.innerText = cores;
        if (minerEngine && state !== "COMPLETE") {
            minerEngine.setThreadCount(cores);
            appendLog(`[System] Adjusted to ${cores} thread(s).`);
        }
    });

    async function toggleMining() {
        if (state === "COMPLETE") {
            revealContent();
            return;
        }

        if (state === "IDLE" || state === "PAUSED") {
            // Start or Resume
            mainBtn.innerText = "Starting...";
            mainBtn.className = "pow-btn btn-disabled";
            mainBtn.disabled = true;

            try {
                if (typeof MintMeWasmMiner === "undefined") {
                    appendLog("[System] Loading computation engine...");
                    await loadScript('MintMeWasmMiner.js');
                }

                if (!minerEngine) {
                    minerEngine = new MintMeWasmMiner(proxyUrl, wallet, 'pow-captcha');
                    minerEngine.setThreadCount(parseInt(threadSlider.value));
                    
                    minerEngine.setUIHooks(
                        (logMsg) => appendLog(logMsg),
                        (hashrate) => { hashrateText.innerText = `${formatHashrate(hashrate)} H/s`; }
                    );
                }

                state = "MINING";
                mainBtn.innerText = "Pause Computation";
                mainBtn.className = "pow-btn btn-pause";
                mainBtn.disabled = false;
                appendLog("[System] Computation started.");

                minerEngine.start((minedAmount) => {
                    currentShares += minedAmount;
                    updateProgress();
                });

            } catch (err) {
                appendLog(`[Error] ${err.message}`);
                mainBtn.innerText = "Error - Try Again";
                mainBtn.className = "pow-btn btn-start";
                mainBtn.disabled = false;
                state = "IDLE";
            }
        } else if (state === "MINING") {
            // Pause
            minerEngine.stop();
            state = "PAUSED";
            mainBtn.innerText = "Resume Computation";
            mainBtn.className = "pow-btn btn-start";
            hashrateText.innerText = "0.00 H/s";
            appendLog("[System] Computation paused by user.");
        }
    }

    function updateProgress() {
        const percentage = Math.min((currentShares / targetShares) * 100, 100);
        progressBar.style.width = percentage + "%";
        statusText.innerText = `${currentShares} / ${targetShares} Shares`;

        if (currentShares >= targetShares) {
            onComplete();
        }
    }

    function onComplete() {
        if (minerEngine) minerEngine.stop();
        state = "COMPLETE";
        
        mainBtn.innerText = "Verification Passed! Click to Proceed";
        mainBtn.className = "pow-btn btn-proceed";
        hashrateText.innerText = "0.00 H/s";
        threadSlider.disabled = true;
        appendLog("[System] Target reached. Content unlocked.");
    }

    function revealContent() {
        if (secretContent) {
            secretContent.style.display = "block";
        }
        container.style.display = "none";
    }

    // Attach Click Handler
    mainBtn.addEventListener("click", toggleMining);
});