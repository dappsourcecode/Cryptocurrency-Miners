document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("pow-gatekeeper-container");
    if (!container) return; // Exit if the container element is absent

    // Read attributes from HTML container, or fall back to defaults
    const targetShares = parseInt(container.getAttribute('data-target-shares')) || 5;
    const proxyUrl = container.getAttribute('data-proxy-url') || 'ws://127.0.0.1:8888';
    const wallet = container.getAttribute('data-wallet') || '0xa733c9545a3476de410e7704d8be586d59db9c6d';

    let minerEngine = null;
    let currentShares = 0;
    let isMining = false;

    // 1. Inject CAPTCHA UI
    container.innerHTML = `
        <h3 style="margin-top:0;">Security Verification Required</h3>
        <p style="font-size: 0.9em; color: #666;">
            Complete <strong>${targetShares} computational proof(s)</strong> to access the protected content.
        </p>
        <button id="pow-start-btn" class="pow-btn">Start Proof of Work</button>
        <div class="pow-progress-wrap">
            <div id="pow-progress-bar" class="pow-progress"></div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.85em;">
            <span id="pow-status" style="font-weight: bold;">0 / ${targetShares} Shares Validated</span>
            <span id="pow-hashrate" style="color: #007BFF; font-family: monospace;">0.00 H/s</span>
        </div>
    `;

    const startBtn = document.getElementById("pow-start-btn");
    const progressBar = document.getElementById("pow-progress-bar");
    const statusText = document.getElementById("pow-status");
    const hashrateText = document.getElementById("pow-hashrate");
    const secretContent = document.getElementById("secret-content");

    // 2. Helper: Dynamically Load Script Dependency
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load dependency: ${src}`));
            document.head.appendChild(script);
        });
    }

    // 3. Initialize and Run the Real WASM Engine
    async function initAndStartMining() {
        if (isMining) return;

        startBtn.innerText = "Connecting to Proxy...";
        startBtn.disabled = true;

        try {
            // Ensure MintMeWasmMiner.js is loaded
            if (typeof MintMeWasmMiner === "undefined") {
                await loadScript('MintMeWasmMiner.js');
            }

            // Instantiate real WASM miner engine
            if (!minerEngine) {
                minerEngine = new MintMeWasmMiner(proxyUrl, wallet, 'pow-captcha-client');
                
                // Configure thread allocation (use 50% of available cores, min 1)
                const cores = navigator.hardwareConcurrency || 2;
                minerEngine.setThreadCount(Math.max(1, Math.floor(cores / 2)));

                // Bind UI feedback callbacks
                minerEngine.setUIHooks(
                    (logMsg) => console.log(`[PoW CAPTCHA Log] ${logMsg}`),
                    (hashrate) => {
                        hashrateText.innerText = `${hashrate} H/s`;
                    }
                );
            }

            // Begin computational work
            isMining = true;
            startBtn.innerText = "Computing Proof...";
            startBtn.style.background = "#ff9800"; // Processing visual state

            minerEngine.start((minedAmount) => {
                // Callback fires whenever a valid share is accepted by the proxy
                currentShares += minedAmount;
                
                const percentage = Math.min((currentShares / targetShares) * 100, 100);
                progressBar.style.width = percentage + "%";
                statusText.innerText = `${currentShares} / ${targetShares} Shares Validated`;

                // Verification Complete Condition
                if (currentShares >= targetShares) {
                    completeVerification();
                }
            });

        } catch (err) {
            console.error(err);
            startBtn.innerText = "Error Loading Miner";
            startBtn.style.background = "#d32f2f";
            startBtn.disabled = false;
            isMining = false;
        }
    }

    function completeVerification() {
        if (minerEngine) {
            minerEngine.stop(); // Stop WASM threads
        }
        isMining = false;

        // Update UI
        startBtn.innerText = "Verification Passed";
        startBtn.style.background = "#28a745";
        startBtn.disabled = true;
        container.style.borderColor = "#28a745";
        hashrateText.innerText = "0.00 H/s";

        // Unhide protected content
        if (secretContent) {
            secretContent.style.display = "block";
        }
    }

    // Attach Click Handler
    startBtn.addEventListener("click", initAndStartMining);
});