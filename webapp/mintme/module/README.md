# Diagrams Explaining Codes

## Flowchart Outline

```mermaid
flowchart TD
    subgraph UI ["1. Presentation Layer (Main Thread)"]
        HTML[<code>checkout.html</code><br/>UI, Consent Modal & Progress Bar]
    end

    subgraph Orchestration ["2. Orchestration Layer (Main Thread)"]
        MinerClass[<code>MintMeWasmMiner.js</code><br/>Manager & WebSocket Handler]
    end

    subgraph Execution ["3. Execution Layer (Background Threads)"]
        Worker1[<code>mintme_worker.js</code><br/>Thread 1]
        Worker2[<code>mintme_worker.js</code><br/>Thread 2]
        WorkerN[<code>mintme_worker.js</code><br/>Thread N...]
        
        WASM1[(<code>mintme_miner.wasm</code>)]
        WASM2[(<code>mintme_miner.wasm</code>)]
        WASMN[(<code>mintme_miner.wasm</code>)]
    end
    
    Proxy((Python WebSocket Proxy))

    %% Connections
    HTML -- Instantiates & Controls --> MinerClass
    MinerClass -- Updates Hashrate & UI Logs --> HTML
    
    MinerClass -- Spawns & Sends Jobs --> Worker1
    MinerClass -- Spawns & Sends Jobs --> Worker2
    MinerClass -- Spawns & Sends Jobs --> WorkerN
    
    Worker1 -- Returns Shares & Stats --> MinerClass
    Worker2 -- Returns Shares & Stats --> MinerClass
    WorkerN -- Returns Shares & Stats --> MinerClass
    
    Worker1 -. Loads .-> WASM1
    Worker2 -. Loads .-> WASM2
    WorkerN -. Loads .-> WASMN
    
    MinerClass <== "JSON-RPC (WSS)" ==> Proxy
```

## Class Diagram
```mermaid
classDiagram
    %% checkout.html Classes
    class ZeroLiquidityCheckout {
        +int targetPrice
        +int payment
        +MintMeWasmMiner mainMining
        +FileUnlockDelivery mainItemDelivery
        +startPayment()
        +pausePayment()
        +monitorProgress(minedAmount)
    }

    class FileUnlockDelivery {
        +String filename
        +execute()
    }

    %% MintMeWasmMiner.js Class
    class MintMeWasmMiner {
        +String proxyUrl
        +String walletAddress
        +Array workers
        +int threadCount
        +setUIHooks(onLogCallback, onHashrateCallback)
        +setThreadCount(count)
        +start(onProgressCallback)
        +stop()
        -_initWorkers()
        -_connectWebSocket()
        -_processJob(jobObj)
        -_submitShare(jobId, nonce, result, algo)
    }

    %% mintme_worker.js Class
    class WasmMinerEngine {
        +Object Module
        +Object currentJob
        +BigInt target
        +BigInt nonce
        +init()
        +handleMessage(msg)
        -_setupJob(jobData)
        -_mineLoop()
        -_hexToBytes(hex)
        -_getLast64BitsLittleEndian(ptr)
    }

    %% Relationships
    ZeroLiquidityCheckout "1" *-- "1" MintMeWasmMiner : orchestrates payment via
    ZeroLiquidityCheckout "1" *-- "1" FileUnlockDelivery : triggers upon completion
    
    MintMeWasmMiner "1" *-- "1..*" WasmMinerEngine : spawns as Web Workers
    
    note for WasmMinerEngine "Runs in isolated background threads (Worker).\nCommunicates with MintMeWasmMiner via postMessage()."
    note for ZeroLiquidityCheckout "Acts as the Business Logic Controller.\nTracks shares to unlock content."
```

## checkout.html

### UI State Machine
```mermaid
stateDiagram-v2
    [*] --> STOPPED : Page Load
    
    STOPPED --> CONSENT_MODAL : User clicks "Start Computational Payment"
    CONSENT_MODAL --> STOPPED : User clicks "Decline"
    
    CONSENT_MODAL --> RUNNING : User clicks "I Understand and Consent"
    
    RUNNING --> PAUSED : User clicks "Pause Computation"
    PAUSED --> RUNNING : User clicks "Resume Computation"
    
    RUNNING --> COMPLETE : paymentProgress >= targetPrice (10 Shares)
    
    COMPLETE --> Delivery : Stop Miner & Trigger FileUnlockDelivery.execute()
    Delivery --> [*] : "Download Unlocked!"
    
    note right of RUNNING
        Thread slider disabled.
        Miner actively hashing.
    end note
    
    note right of PAUSED
        Thread slider enabled.
        Miner stopped.
    end note
```

### DOM-to-Logic Flowchart

```mermaid
flowchart LR
    subgraph HTML DOM Elements
        btn[#btnCheckout]
        modal[#consentModal]
        slider[#threadSlider]
        prog[#paymentProgress]
        logs[#uiLogBox / #uiHashrate]
    end

    subgraph Global JS Functions
        handler[handleMainButton]
        start[startMining]
        pause[pauseMining]
        accept[acceptConsent]
    end

    subgraph Core Classes
        ZLC[ZeroLiquidityCheckout]
        Miner[MintMeWasmMiner]
        Delivery[FileUnlockDelivery]
    end

    %% Event Triggers
    btn -- "onclick" --> handler
    handler -- "if STOPPED" --> modal
    modal -- "onclick (Consent)" --> accept
    accept --> start
    handler -- "if RUNNING" --> pause
    handler -- "if PAUSED" --> start

    %% Function Logic
    start -- "Reads Value" --> slider
    start -- "Sets Threads" --> Miner
    start -- "Calls startPayment()" --> ZLC
    pause -- "Calls pausePayment()" --> ZLC

    %% Class Interactions
    ZLC -- "Calls start/stop" --> Miner
    Miner -- "Fires UI Hooks" --> logs
    Miner -- "Fires Progress Callback" --> ZLC
    ZLC -- "Updates Width" --> prog
    ZLC -- "If payment >= targetPrice" --> Delivery
    Delivery -- "Disables/Updates UI" --> btn
```

## mintme_worker.js

### Worker Execution Loop
```mermaid
flowchart TD
    Start((Start Worker)) --> WaitJob[Wait for 'job' from Main Thread]
    WaitJob --> Setup["Setup Job: <br>1. Load Pristine Blob<br>2. Set Time Cost<br>3. Calculate Target<br>4. Randomize Start Nonce"]
    
    Setup --> CheckState{"Is isMining == true <br> & Job exists?"}
    CheckState -->|No| Wait100[setTimeout 100ms] --> CheckState
    CheckState -->|Yes| BatchLoop["Start Batch Loop <br> i = 0 to BATCH_SIZE"]
    
    subgraph HashingLoop ["The Hashing Loop (WASM Interaction)"]
        BatchLoop --> Restore[Restore Pristine Memory]
        Restore --> Inject[Inject 8-byte Nonce into Memory]
        Inject --> ExecWASM[Execute Module.hash_data]
        ExecWASM --> FetchResult[Fetch Result from Memory]
        
        FetchResult --> Compare{Result <= Target?}
        Compare -->|Yes| PostShare[Post 'share' to Main Thread]
        Compare -->|No| Increment[Nonce++]
        PostShare --> Increment
        
        Increment --> LoopCheck{i < BATCH_SIZE?}
        LoopCheck -->|Yes| Restore
    end
    
    LoopCheck -->|No| PostStats["Post 'stats' (Hash Count) to Main Thread"]
    PostStats --> Yield["setTimeout 0ms <br> (Yield to Event Loop)"]
    Yield --> CheckState
```

### Class Diagram
```mermaid
classDiagram
    class WasmMinerEngine {
        %% Core State
        +Object Module
        +Object currentJob
        +boolean isMining
        
        %% Hashing Variables
        +int currentTimeCost
        +BigInt nonce
        +BigInt target
        +Uint8Array pristineBlob
        
        %% WASM Memory Pointers & Constants
        +int inputPtr
        +int outputPtr
        +int INPUT_SIZE = 2048
        +int OUTPUT_SIZE = 32
        +int BATCH_SIZE = 250
        
        %% Public Methods
        +init() Promise
        +handleMessage(msg: Object)
        
        %% Private/Internal Methods
        -_setupJob(jobData: Object)
        -_mineLoop()
        -_hexToBytes(hex: String) Uint8Array
        -_reverseHex(hex: String) String
        -_getLast64BitsLittleEndian(ptr: int) BigInt
    }
    
    note for WasmMinerEngine "Handles WASM memory allocation (_malloc).\nManages byte-level data manipulation."
```

### Multi-threaded Sequence Diagram

```mermaid
sequenceDiagram
    participant Main as Main Thread (MintMeWasmMiner)
    participant Worker as Worker Event Listener
    participant Engine as WasmMinerEngine (JS)
    participant Wasm as WASM (mintme_miner.wasm)

    %% Initialization Phase
    note over Worker, Wasm: 1. Initialization Phase
    Worker->>Engine: new WasmMinerEngine()
    Worker->>Engine: engine.init()
    Engine->>Wasm: createMintMeModule()
    Wasm-->>Engine: Returns Module Instance
    Engine->>Wasm: Module._malloc(INPUT_SIZE & OUTPUT_SIZE)
    Engine->>Main: postMessage({ type: 'ready' })

    %% Job Assignment Phase
    note over Main, Engine: 2. Job Assignment Phase
    Main->>Worker: postMessage({ command: 'job', data: jobObj })
    Worker->>Engine: handleMessage()
    Engine->>Engine: _setupJob() (Calculates BigInt Target & Nonce)

    %% Mining Execution Phase
    note over Main, Wasm: 3. Execution & Hashing Phase
    Main->>Worker: postMessage({ command: 'start' })
    Worker->>Engine: handleMessage()
    Engine->>Engine: _mineLoop() initiates

    loop Every BATCH_SIZE (250 loops)
        Engine->>Engine: Inject 8-byte Nonce into Memory
        Engine->>Wasm: Module.hash_data(inputPtr, outputPtr, len, cost)
        Wasm-->>Engine: Populates outputPtr memory
        Engine->>Engine: _getLast64BitsLittleEndian(outputPtr)
        
        alt If hash <= target
            Engine->>Main: postMessage({ type: 'share', nonce, result... })
        end
    end
    
    Engine->>Main: postMessage({ type: 'stats', hashes: 250 })
    
    note right of Engine: setTimeout() yields to Event Loop,<br>then _mineLoop() restarts.
```

## MintMeWasmMiner.js

### Class Diagram

```mermaid
classDiagram
    class MintMeWasmMiner {
        %% Initialization & Config
        +String proxyUrl
        +String walletAddress
        +String workerName
        +int threadCount

        %% Networking & Multi-threading State
        -WebSocket socket
        -Array workers
        -String rpcId
        -int sequenceId
        -Set pendingShares

        %% Real-time Metrics & Hashrate State
        -int batchHashes
        -int totalHashes
        -int hashesSinceLastShare
        -long sessionStartTime
        -long lastRateUpdate

        %% Registered Callbacks
        -Function onProgressCallback
        -Function onLog
        -Function onHashrate

        %% Public API (Called by UI)
        +setUIHooks(onLogCallback, onHashrateCallback)
        +setThreadCount(count: int)
        +start(onProgressCallback)
        +stop()

        %% Private Orchestration Methods
        -_initWorkers()
        -_connectWebSocket()
        -_processJob(jobObj: Object)
        -_submitShare(jobId, nonce, result, algo)
        -_log(msg: String)
    }

    note for MintMeWasmMiner "Acts as the central Dispatcher.\nTracks global hashrate math and WebSocket RPC."
```

### Orchestration Sequence Diagram

```mermaid
sequenceDiagram
    participant UI as Presentation UI (HTML)
    participant Engine as MintMeWasmMiner (Orchestrator)
    participant Worker as Web Worker(s) Array
    participant Proxy as WebSocket Proxy (Python)

    %% Startup Flow
    UI->>Engine: start(onProgressCallback)
    Engine->>Engine: _initWorkers()
    
    loop For each threadCount
        Engine->>Worker: new Worker('mintme_worker.js')
        Worker-->>Engine: postMessage({ type: 'ready' })
    end

    Engine->>Proxy: _connectWebSocket() (wss://...)
    Proxy-->>Engine: Connection Open
    Engine->>Proxy: JSON-RPC: { method: "login" }
    Proxy-->>Engine: Result: { status: "OK", id: "rpcId" }

    %% Job Distribution
    Proxy-->>Engine: JSON-RPC: { method: "job", params: jobObj }
    Engine->>Engine: _processJob(jobObj)
    
    par Broadcast to ALL active Workers
        Engine->>Worker: postMessage({ command: 'job', data: jobObj })
        Engine->>Worker: postMessage({ command: 'start' })
    end

    %% Continuous Feedback Loop
    loop The Execution Cycle
        %% Hashrate Math
        Worker-->>Engine: postMessage({ type: 'stats', hashes: 250 })
        Engine->>Engine: Aggregate batchHashes & Calculate Avg/s
        Engine->>UI: onHashrate( "X.XX H/s" )
        
        %% Share Submission
        Worker-->>Engine: postMessage({ type: 'share', nonce, result... })
        Engine->>Engine: pendingShares.add(sequenceId)
        Engine->>Proxy: JSON-RPC: { method: "submit", params: {nonce...} }
        
        %% Share Acceptance
        Proxy-->>Engine: Result: { status: "OK" }
        Engine->>Engine: pendingShares.delete(sequenceId)
        Engine->>UI: onProgressCallback(1) (Updates Progress Bar)
    end
    
    %% Teardown
    UI->>Engine: stop()
    Engine->>Worker: w.terminate() (Kills all threads)
    Engine->>Proxy: socket.close()
```

## mintme_miner.js

### The Emscripten Bootstrapping Lifecycle

```mermaid
flowchart TD
    Start([Worker Calls createMintMeModule]) --> EnvDetect[<b>1. Environment Detection</b><br/>Checks window, process, self.location<br/>Sets ENVIRONMENT_IS_WORKER = true]
    
    EnvDetect --> FetchWasm[<b>2. Binary Retrieval</b><br/>Locates mintme_miner.wasm<br/>Triggers fetch streaming if available]
    
    FetchWasm --> MemoryAlloc[<b>3. Memory Instantiation</b><br/>Allocates INITIAL_MEMORY<br/>Default: 16,777,216 bytes / 16MB]
    
    MemoryAlloc --> Instantiate[<b>4. WebAssembly.instantiateStreaming</b><br/>Compiles WASM binary asynchronously<br/>Passes system library arguments]
    
    Instantiate --> LinkViews[<b>5. Memory Bridging</b><br/>Triggers updateGlobalBufferAndViews<br/>Maps HEAP8, HEAPU8, HEAP32 to WASM buffer]
    
    LinkViews --> MapExports[<b>6. Function Mapping</b><br/>Binds JS functions to internal assembly exports<br/>Exposes _malloc, _free, _hash_data]
    
    MapExports --> ResolvePromise([<b>7. Runtime Initialized</b><br/>Fulfills readyPromiseResolve<br/>Worker receives ready signal])
```

### The Shared Memory Bridge Architecture

```mermaid
flowchart LR
    subgraph JavaScript ["JavaScript Environment (mintme_worker.js)"]
        MallocCall["Module._malloc(SIZE)"]
        FreeCall["Module._free(PTR)"]
        HashCall["Module.hash_data(inputPtr, outputPtr, ...)"]
        
        subgraph TypedArrays ["Memory View Arrays"]
            H8[HEAP8 / Int8Array]
            HU8[HEAPU8 / Uint8Array]
            H32[HEAP32 / Int32Array]
        end
    end

    subgraph MemoryBridge ["The Emscripten Memory Bridge (mintme_miner.js)"]
        WasmMemObj[["wasmMemory = Module.asm.c"]]
        SharedBuffer[["wasmMemory.buffer (ArrayBuffer Workspace)"]]
    end

    subgraph WasmBinary ["Low-Level Execution (mintme_miner.wasm)"]
        C_Code{"Compiled C/C++ Miner Logic"}
        RawHeap[["Linear Linear Memory Stack"]]
    end

    %% Flow lines
    MallocCall -->|1. Requests bytes| WasmMemObj
    FreeCall -->|Reclaims bytes| WasmMemObj
    
    WasmMemObj -->|Owns| SharedBuffer
    
    %% Views overlaying buffer
    H8 -.->|Views over| SharedBuffer
    HU8 -.->|Views over| SharedBuffer
    H32 -.->|Views over| SharedBuffer
    
    HashCall -->|2. Invokes function with pointer addresses| C_Code
    C_Code <-->|3. Reads inputs / Writes output hashes| RawHeap
    RawHeap === SharedBuffer
```