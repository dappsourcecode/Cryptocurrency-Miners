document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const donorInput = document.getElementById("donor-name");
    const threadSlider = document.getElementById("thread-slider");
    const threadVal = document.getElementById("thread-count-val");
    const toggleBtn = document.getElementById("btn-toggle-mining");
    const logBox = document.getElementById("log-terminal");
    
    const sessionSharesText = document.getElementById("session-shares");
    const sessionHashrateText = document.getElementById("session-hashrate");
    const refreshBtn = document.getElementById("btn-refresh-leaderboard");

    // Leaderboard Elements
    const gShares = document.getElementById("g-shares");
    const gHashes = document.getElementById("g-hashes");
    const gMintme = document.getElementById("g-mintme");
    const gDonors = document.getElementById("g-donors");
    const leaderboardBody = document.getElementById("leaderboard-body");

    // Configuration
    const proxyUrl = "ws://127.0.0.1:8888";
    const wallet = "0xa733c9545a3476de410e7704d8be586d59db9c6d";

    let minerEngine = null;
    let isMining = false;
    let sessionShares = 0;

    // Detect CPU Cores
    const maxCores = navigator.hardwareConcurrency || 4;
    threadSlider.max = maxCores;

    threadSlider.addEventListener("input", (e) => {
        const val = e.target.value;
        threadVal.innerText = val;
        if (minerEngine && isMining) {
            minerEngine.setThreadCount(parseInt(val));
            appendLog(`[System] Thread allocation changed to ${val}`);
        }
    });

    function appendLog(msg) {
        const d = document.createElement("div");
        d.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
        logBox.appendChild(d);
        logBox.scrollTop = logBox.scrollHeight;
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) return resolve();
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
        });
    }

    // Toggle Mining
    async function toggleMining() {
        if (!isMining) {
            const donorName = donorInput.value.trim() || "Anonymous_Donor";
            donorInput.disabled = true; // Lock donor name while active

            toggleBtn.innerText = "Connecting...";
            toggleBtn.className = "btn btn-secondary";

            try {
                if (typeof MintMeWasmMiner === "undefined") {
                    appendLog("[System] Loading MintMe WASM engine...");
                    await loadScript("MintMeWasmMiner.js");
                }

                if (!minerEngine) {
                    // Combine wallet and worker ID using Stratum syntax: wallet.worker
                    const fullWorkerLogin = `${wallet}.${donorName}`;
                    // Send strictly the 42-character wallet address as the login
                    minerEngine = new MintMeWasmMiner(proxyUrl, wallet, donorName);
                    
                    minerEngine.setUIHooks(
                        (log) => appendLog(log),
                        (rate) => { sessionHashrateText.innerText = `${parseFloat(rate).toFixed(2)} H/s`; }
                    );
                }

                minerEngine.setThreadCount(parseInt(threadSlider.value));
                minerEngine.start((amount) => {
                    sessionShares += amount;
                    sessionSharesText.innerText = sessionShares;
                    appendLog(`💎 Accepted share credited to '${donorName}'`);
                });

                isMining = true;
                toggleBtn.innerText = "Stop Donating CPU";
                toggleBtn.className = "btn btn-danger";
                appendLog(`[System] Mining active for donor: '${donorName}'`);

            } catch (err) {
                appendLog(`[Error] ${err.message}`);
                toggleBtn.innerText = "Start Donating CPU";
                toggleBtn.className = "btn btn-primary";
                donorInput.disabled = false;
            }
        } else {
            // Stop Mining
            if (minerEngine) {
                minerEngine.stop();
                minerEngine = null; // Re-instantiate next time to update worker name if changed
            }
            isMining = false;
            toggleBtn.innerText = "Start Donating CPU";
            toggleBtn.className = "btn btn-primary";
            sessionHashrateText.innerText = "0.00 H/s";
            donorInput.disabled = false;
            appendLog("[System] Computational donation paused.");
        }
    }

    // Helper to turn seconds into human-readable duration (e.g., "14m 20s" or "2h 05m")
    function formatTime(seconds) {
        if (!seconds || seconds <= 0) return "0s";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    }

    // Fetch and Populate Leaderboard from donations.json
    async function fetchLeaderboard() {
        refreshBtn.innerText = "Loading...";
        try {
            // Fetch file without caching
            const response = await fetch(`./donations.json?t=${Date.now()}`);
            if (!response.ok) throw new Error("JSON file not found yet.");
            
            const data = await response.json();

            // Populate Global Aggregate Stats
            const g = data.global_stats;
            gShares.innerText = g.total_community_shares;
            gHashes.innerText = g.total_community_hashes.toLocaleString();
            gMintme.innerText = g.estimated_mintme_contributed.toFixed(4);
            gDonors.innerText = g.total_unique_donors;

            // Convert workers object into array and sort by total hashes descending
            const workersArray = Object.keys(data.workers).map(key => ({
                id: key,
                ...data.workers[key]
            })).sort((a, b) => b.total_hashes - a.total_hashes);

            // Populate Table
            leaderboardBody.innerHTML = "";
            if (workersArray.length === 0) {
                leaderboardBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No donation records found yet.</td></tr>`;
            } else {
                workersArray.forEach((w, index) => {
                    const row = document.createElement("tr");
                    const dateStr = new Date(w.last_active).toLocaleTimeString();
                    const activeTimeStr = formatTime(w.total_time_seconds);

                    row.innerHTML = `
                        <td><strong>#${index + 1}</strong></td>
                        <td>${w.id}</td>
                        <td>${w.shares}</td>
                        <td>${w.total_hashes.toLocaleString()}</td>
                        <td>${w.estimated_mintme.toFixed(4)}</td>
                        <td>${w.avg_hashrate_hps} H/s</td>
                        <td>${activeTimeStr}</td>
                        <td>${dateStr}</td>
                    `;
                    leaderboardBody.appendChild(row);
                });
            }

            appendLog("[Leaderboard] Stats updated from donations.json.");

        } catch (err) {
            appendLog(`[Leaderboard] ${err.message}`);
        } finally {
            refreshBtn.innerText = "🔄 Refresh Leaderboard";
        }
    }

    // Event Listeners
    toggleBtn.addEventListener("click", toggleMining);
    refreshBtn.addEventListener("click", fetchLeaderboard);

    // Initial fetch on page load
    fetchLeaderboard();
});