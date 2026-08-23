# Diagrams Explaining Codes

```mermaid
stateDiagram-v2
    [*] --> IDLE : Page Load / Script Injected
    IDLE --> MINING : User Clicks 'Accept & Start'
    MINING --> PAUSED : User Clicks 'Pause Computation'
    PAUSED --> MINING : User Clicks 'Resume Computation'
    MINING --> COMPLETE : Shares >= Target Shares
    COMPLETE --> [*] : User Clicks 'Proceed' (Content Unlocked)
```

## High-Level System Architecture & File Interactions

This diagram illustrates how the client-side files interact with each other and connect to the backend mining infrastructure.

```mermaid
graph TD
    subgraph Client Environment [User Browser]
        HTML[index.html<br/>Host Page] -->|1. Loads script| JS[powcaptcha.js<br/>Drop-in UI Widget]
        JS -->|2. Injects UI HTML & CSS| HTML
        JS -->|3. Dynamically loads| ENGINE[MintMeWasmMiner.js<br/>WASM Engine Wrapper]
        ENGINE -->|4. Spawns threads| WASM[mintme.wasm<br/>Lyra2v2 Hashing Module]
    end

    subgraph Local / Remote Backend
        ENGINE <-->|5. WebSockets WS/WSS| PROXY[Python Stratum Proxy]
        PROXY <-->|6. TCP Socket / Stratum Protocol| POOL[Mining Pool<br/>e.g., Wattpool / MintMe]
    end
```

## Runtime Logic & Execution Sequence Flow

This diagram traces the entire operational life cycle from the moment a user lands on the protected page to the moment the hidden content is revealed.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant HTML as index.html
    participant Widget as powcaptcha.js
    participant Engine as MintMeWasmMiner.js
    participant Proxy as Python Stratum Proxy

    User->>HTML: Navigates to page
    HTML->>Widget: DOMContentLoaded event
    Widget->>HTML: Reads data-* config & injects UI + Log Terminal
    
    User->>Widget: Adjusts Thread Slider (Optional)
    Widget->>Widget: Updates UI thread count value
    
    User->>Widget: Clicks 'Accept & Start'
    Widget->>Engine: Loads dependency & instantiates miner class
    Widget->>Engine: Configures threads & hooks (Log, Hashrate)
    Widget->>Engine: start(onShareCallback)
    
    Engine->>Proxy: Connects WebSocket & sends Stratum handshake
    Proxy-->>Engine: Connection established & job assigned
    
    loop Hashing Loop
        Engine->>Proxy: Submits cryptographic share proof
        Proxy-->>Engine: Share validated / accepted
        Engine-->>Widget: Calls onShareCallback(1) & logCallback()
        Widget->>Widget: currentShares++ & recalculates percentage
        Widget->>HTML: Updates Progress Bar, Hashrate, & Log Terminal
    end

    Note over Widget: Condition Met: currentShares >= targetShares
    Widget->>Engine: stop() (Kills WASM worker threads)
    Widget->>Widget: Changes state to 'COMPLETE'
    Widget->>HTML: Button text -> 'Verification Passed! Click to Proceed'
    
    User->>Widget: Clicks 'Proceed'
    Widget->>HTML: secretContent.style.display = 'block'
    Widget->>HTML: container.style.display = 'none'
```

## Detailed Component Structure & State Machine

This diagram maps out the internal variables, key functions, and UI state transitions inside powcaptcha.js and its relationship with MintMeWasmMiner.js.

```mermaid
classDiagram
    class PowCaptchaWidget {
        +targetShares: int
        +proxyUrl: String
        +wallet: String
        +algorithm: String
        +pool: String
        +state: String ("IDLE" | "MINING" | "PAUSED" | "COMPLETE")
        +currentShares: int
        +toggleMining()
        +updateProgress()
        +onComplete()
        +revealContent()
        +appendLog(msg: String)
        +formatHashrate(raw: float) String
    }

    class MintMeWasmMiner {
        +proxyUrl: String
        +wallet: String
        +workerName: String
        +threadCount: int
        +isMining: boolean
        +setThreadCount(threads: int)
        +setUIHooks(logCallback, rateCallback)
        +start(onShareCallback)
        +stop()
    }

    class HTMLContainer {
        <<DOM Element>>
        +data-target-shares
        +data-proxy-url
        +data-wallet
        +data-algorithm
        +data-pool
    }

    HTMLContainer ..> PowCaptchaWidget : Configuration Inputs
    PowCaptchaWidget --> MintMeWasmMiner : Manages Lifecycle & Listens to Callbacks
```

## For Future Implementation

### Production End-to-End Architecture

```mermaid
graph TD
    subgraph Client [User Browser]
        UI[Page UI / CAPTCHA Widget]
        WASM[WASM Miner Engine]
    end

    subgraph Application Backend [Web / API Server]
        AUTH[Challenge Generator API]
        VERIFIER[PoW Verifier Middleware]
        CACHE[(Redis Anti-Replay Cache)]
        STORAGE[(Protected Assets / DB)]
    end

    subgraph Mining Infrastructure
        PROXY[Python Stratum Proxy]
        POOL[MintMe Pool]
    end

    UI -->|1. GET /api/get-challenge| AUTH
    AUTH -->|2. Returns Signed Challenge Token & Target| UI
    UI -->|3. Runs Hashing Loop| WASM
    WASM <-->|Optional Stratum Work| PROXY <--> POOL
    
    UI -->|4. POST Payload + Nonce + Challenge Token| VERIFIER
    VERIFIER <-->|5. Check / Set Used Nonce| CACHE
    VERIFIER -->|6. Cryptographic Hash Check| VERIFIER
    VERIFIER -->|7. Valid: Serve Content| STORAGE
    STORAGE -->|8. HTTP 200 OK + Payload| UI
```

### Challenge-Response Protocol Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client (Browser)
    participant Server as Application Server
    participant Cache as Anti-Replay Cache (Redis)
    participant Content as Protected Content / DB

    Note over Client, Server: Phase 1: Challenge Request
    Client->>Server: GET /api/pow-challenge (Session ID)
    Server->>Server: Generate Nonce Seed + Timestamp + Target Difficulty
    Server->>Server: Sign Challenge Payload (HMAC-SHA256 with Server Secret)
    Server-->>Client: Return { challengeToken, targetDifficulty, timestamp }

    Note over Client: Phase 2: Client Computation
    loop Until Hash Meets Difficulty Target
        Client->>Client: Compute Hash = SHA256(challengeToken + Nonce)
    end

    Note over Client, Server: Phase 3: Server Verification & Content Delivery
    Client->>Server: POST /api/submit-form (Form Data + challengeToken + Nonce + SolutionHash)
    
    Server->>Server: 1. Verify HMAC Signature of challengeToken
    alt Signature Invalid or Tampered
        Server-->>Client: HTTP 403 Forbidden (Tampering Detected)
    else Signature Valid
        Server->>Server: 2. Check Expiration (e.g., timestamp < 5 mins)
        alt Token Expired
            Server-->>Client: HTTP 400 Bad Request (Challenge Expired)
        else Token Active
            Server->>Cache: 3. Check if Nonce/Token pair exists in Cache
            alt Nonce Already Used
                Server-->>Client: HTTP 409 Conflict (Replay Attack Detected)
            else Nonce Unique
                Server->>Cache: Mark Nonce as Used (Set TTL = Expiration Time)
                Server->>Server: 4. Recompute Hash(challengeToken + Nonce)
                alt Recomputed Hash does NOT meet Target Difficulty
                    Server-->>Client: HTTP 422 Unprocessable (Invalid Proof)
                else Recomputed Hash is Valid
                    Server->>Content: Fetch Protected Resource / Process Action
                    Content-->>Server: Resource Data
                    Server-->>Client: HTTP 200 OK (Content Delivered)
                end
            end
        end
    end
```

### Server-Side Middleware Decision Tree


```mermaid
flowchart TD
    A[Incoming Protected HTTP Request] --> B{HMAC / JWT Signature Valid?}
    B -- No --> C[HTTP 403: Challenge Tampered]
    B -- Yes --> D{Timestamp within Expiry Window?}
    D -- No --> E[HTTP 400: Challenge Expired]
    D -- Yes --> F{Nonce in Redis Cache?}
    F -- Yes --> G[HTTP 409: Replay Attack]
    F -- No --> H[Execute SHA-256 Check in Server Memory]
    H --> I{Hash meets Difficulty Target?}
    I -- No --> J[HTTP 422: Fraudulent Proof]
    I -- Yes --> K[Store Nonce in Redis TTL Cache]
    K --> L[Grant Access / Deliver Content]
```