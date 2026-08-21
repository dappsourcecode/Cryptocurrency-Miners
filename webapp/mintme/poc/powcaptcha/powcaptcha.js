document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("pow-gatekeeper-container");
    if (!container) return; // Exit if no container found

    const targetShares = parseInt(container.getAttribute('data-target-shares')) || 10;
    let currentShares = 0;
    let miningInterval;

    // 1. Inject the UI
    container.innerHTML = `
        <h3 style="margin-top:0;">Verify You Are Human (PoW)</h3>
        <p style="font-size: 0.9em; color: #666;">Prove your computational effort to unlock the rest of this article.</p>
        <button id="pow-start-btn" class="pow-btn">Start Verification</button>
        <div class="pow-progress-wrap">
            <div id="pow-progress-bar" class="pow-progress"></div>
        </div>
        <div id="pow-status" style="font-size: 0.85em; font-weight: bold;">0 / ${targetShares} Validated</div>
    `;

    const startBtn = document.getElementById("pow-start-btn");
    const progressBar = document.getElementById("pow-progress-bar");
    const statusText = document.getElementById("pow-status");
    const secretContent = document.getElementById("secret-content");

    // 2. Load Dependency (Simulated for Demo)
    function loadMinerDependency() {
        console.log("Loading MintMeWasmMiner.js dependency...");
        // In reality, you'd do: 
        // const script = document.createElement('script'); script.src = 'MintMeWasmMiner.js'; document.head.appendChild(script);
    }

    // 3. Mock Mining Logic
    function startVerification() {
        startBtn.innerText = "Verifying...";
        startBtn.disabled = true;
        startBtn.style.background = "#ff9800"; // Orange processing state

        // Simulate receiving shares from the Wasm Miner over time
        miningInterval = setInterval(() => {
            currentShares += 1;
            
            // Update UI
            const percentage = Math.min((currentShares / targetShares) * 100, 100);
            progressBar.style.width = percentage + "%";
            statusText.innerText = `${currentShares} / ${targetShares} Validated`;

            if (currentShares >= targetShares) {
                completeVerification();
            }
        }, 800); // Simulates 1 share every 0.8 seconds
    }

    function completeVerification() {
        clearInterval(miningInterval);
        startBtn.innerText = "Verification Complete";
        startBtn.style.background = "#28a745"; // Green success state
        container.style.borderColor = "#28a745";
        
        // Reveal the secret content
        secretContent.style.display = "block";
    }

    // Initialize
    loadMinerDependency();
    startBtn.addEventListener("click", startVerification);
});