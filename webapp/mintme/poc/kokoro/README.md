# Other Technicals

To run local, clone [Kokoro-82M-v1.0-ONNX](https://www.google.com/search?q=Kokoro-82M-v1.0-ONNX&sxsrf=APpeQntxE-zIuBdwjKSE7Z0uceep8v0SpQ%3A1787622787314).

# Diagrams Explaining Codes

## High-Level System Architecture

This flowchart maps out how the different components (Browser Main Thread, Web Workers, AI Engine, and External Networks) connect and communicate with each other.

```mermaid
graph TD
    subgraph Browser Context
        UI[Main Thread: UI & Application Logic]
        AI[Kokoro AI TTS Engine]
        Audio[Web Audio APIContext]
        
        subgraph Mining Subsystem
            Miner[MintMeWasmMiner Class]
            W1[Web Worker 1<br/>mintme_worker.js]
            W2[Web Worker N<br/>mintme_worker.js]
            WASM[mintme_miner.js<br/>WASM Module]
        end
    end

    subgraph External Resources
        Model[(Model Storage<br/>Local or HuggingFace)]
        Proxy[Python WebSocket Proxy<br/>ws://localhost:8080]
        Pool[MintMe Mining Pool<br/>Stratum TCP]
    end

    User((User)) -->|Clicks Stream| UI
    UI -->|Loads| Model
    UI -->|Sends Text| AI
    UI -->|Controls| Miner
    AI -->|Returns Audio Chunks| Audio
    Audio -->|Plays to| User

    Miner -->|Spawns & Posts Jobs| W1 & W2
    W1 & W2 -->|Executes| WASM
    W1 & W2 -->|Returns Nonces| Miner

    Miner <-->|JSON-RPC via WebSocket| Proxy
    Proxy <-->|Stratum Protocol| Pool
```

## The Execution Pipeline (Sequence Diagram)
This sequence diagram explains the exact timeline of events when a user clicks the "Stream Audio" button. It shows how the promise-based mining process gates the AI generation.

```mermaid
sequenceDiagram
    participant User
    participant Main as Main Thread (App)
    participant Miner as MintMeWasmMiner
    participant Workers as Web Workers
    participant Proxy as WebSocket Proxy
    participant Kokoro as AI Engine

    User->>Main: Click "Stream Audio" (Target: 4 shares)
    Main->>Miner: startRealMiningSequence(4)
    activate Miner
    
    Miner->>Workers: Initialize Threads
    Miner->>Proxy: Connect & Login
    Proxy-->>Miner: Login OK & Assign Job
    Miner->>Workers: Broadcast Job (postMessage)
    
    loop Until Target Reached
        Workers->>Workers: Hash generation (WASM)
        Workers-->>Miner: Share Found (nonce)
        Miner->>Proxy: Submit Share
        Proxy-->>Miner: Share Accepted
        Miner->>Main: Update UI Log & Count++
    end

    Miner->>Main: Target Reached! (Promise Resolved)
    Miner->>Workers: Terminate Workers
    Miner->>Proxy: Close Connection
    deactivate Miner

    Main->>Kokoro: startTTSGeneration(Text)
    activate Kokoro
    loop For each sentence
        Kokoro-->>Main: Audio Buffer
        Main->>Main: Add to Audio Queue
        Main->>User: Play Audio (AudioContext)
    end
    deactivate Kokoro
```

## Miner Internal Data Flow

This diagram breaks down the specific messaging protocol used inside the MintMeWasmMiner class between the browser's Main Thread and the background Web Workers.

```mermaid
flowchart LR
    subgraph Main Thread [Main Thread: MintMeWasmMiner]
        direction TB
        SocketHandler[WebSocket Handler]
        JobManager[Job & Target Manager]
        UIHooks[UI Callbacks]
    end

    subgraph Web Worker [Web Worker: mintme_worker.js]
        direction TB
        Listener[Message Listener]
        WASM[WASM Hashing Loop]
    end

    %% Network to Main
    Pool((Mining Pool)) -- "job (JSON)" --> SocketHandler
    SocketHandler -- "Parses Job" --> JobManager
    JobManager -- "Update Hashrate UI" --> UIHooks
    
    %% Main to Worker
    JobManager -- "{ command: 'job', data: jobObj }" --> Listener
    JobManager -- "{ command: 'start' }" --> Listener
    
    %% Worker Internal
    Listener -- "Starts Hash Loop" --> WASM
    
    %% Worker to Main
    WASM -- "{ type: 'stats', hashes: N }" --> JobManager
    WASM -- "{ type: 'share', nonce, result }" --> JobManager
    
    %% Main to Network
    JobManager -- "submit (JSON)" --> SocketHandler
    SocketHandler -- "Validates Share" --> Pool
```