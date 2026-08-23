# Diagrams Explaining Codes

## System Architecture & Components Overview

This diagram shows how client connections, Stratum proxy parsing, pool connections, persistent JSON storage, and leaderboard fetching relate to one another.

```mermaid
graph TD
    subgraph Client [Browser Environment]
        UI[index.html<br/>Philanthropy Dashboard]
        JS[philanthropy.js<br/>UI & Fetch Logic]
        WASM[MintMeWasmMiner.js<br/>WebAssembly Engine]
        UI -->|User Inputs Donor ID & Thread Count| JS
        JS -->|Instantiates & Starts| WASM
        JS -->|HTTP GET /donations.json| FILE
    end

    subgraph Backend [Local Proxy Server]
        PROXY[proxy.py<br/>Asyncio Stratum Proxy]
        SAN[Login Sanitizer & Worker Extractor]
        LOCK[File Lock & Atomic Write Queue]
        PROXY --> SAN
        PROXY --> LOCK
    end

    subgraph Storage [File System]
        FILE[(donations.json<br/>Persistent Database)]
        LOCK -->|Atomic Update| FILE
    end

    subgraph External [Mining Pool]
        POOL[mintme.wattpool.net:2222<br/>Stratum Pool]
    end

    WASM <-->|WebSocket ws://localhost:8888| PROXY
    PROXY <-->|TCP Socket / Stratum JSON-RPC| POOL
```

## Runtime Execution & Share Validation Sequence

This diagram details the exact flow when a user starts mining, how shares are intercepted and validated, and how donations.json is safely updated.

```mermaid
sequenceDiagram
    autonumber
    actor Donor
    participant Dashboard as philanthropy.js
    participant WASM as MintMeWasmMiner.js
    participant Proxy as proxy.py
    participant Pool as Wattpool Upstream
    participant DB as donations.json

    Donor->>Dashboard: Enters Donor ID & clicks "Start Donating CPU"
    Dashboard->>WASM: Initialize miner with login "WalletAddress"
    WASM->>Proxy: WS Connect & Stratum 'login' (wallet & worker ID)
    Proxy->>Proxy: Extract worker_id & sanitize login params
    Proxy->>Pool: Forward clean Stratum 'login' over TCP
    Pool-->>Proxy: Return login success & job assignment
    Proxy-->>WASM: Forward job assignment to browser

    loop Mining Loop
        WASM->>Proxy: Submit calculated share (JSON-RPC)
        Proxy->>Pool: Forward share to pool
        Pool-->>Proxy: Return result: { status: "OK" }
        Proxy-->>WASM: Forward success to browser
        Dashboard->>Dashboard: Update session stats & terminal log
        
        Note over Proxy,DB: Async Background Worker Task
        Proxy->>Proxy: Calculate session delta, hashes, & MINTME reward
        Proxy->>DB: Read donations.json -> Update Worker & Global Stats
        Proxy->>DB: Write to donations.json.tmp -> Replace donations.json
    end

    Donor->>Dashboard: Clicks "Refresh Leaderboard"
    Dashboard->>DB: fetch('./donations.json')
    DB-->>Dashboard: Return JSON payload
    Dashboard->>Dashboard: Sort workers by total hashes & render table
```

## Data Schema & State Model

This diagram maps out the data structure inside donations.json and the session state variables maintained inside proxy.py.

```mermaid
classDiagram
    class DonationsDatabase {
        +GlobalStats global_stats
        +Map~String, WorkerStats~ workers
    }

    class GlobalStats {
        +int total_community_shares
        +int total_community_hashes
        +int total_community_time_seconds
        +float estimated_mintme_contributed
        +int total_unique_donors
        +String last_updated
    }

    class WorkerStats {
        +int shares
        +int total_hashes
        +int total_time_seconds
        +float avg_hashrate_hps
        +float estimated_mintme
        +String first_seen
        +String last_active
        +int threads_used
    }

    class ProxyConnectionState {
        +String worker_id
        +int shares
        +float connect_time
        +float last_share_time
        +int threads
        +Map pending_ids
    }

    DonationsDatabase *-- GlobalStats
    DonationsDatabase *-- WorkerStats
    ProxyConnectionState ..> WorkerStats : Updates on Share Acceptance
```