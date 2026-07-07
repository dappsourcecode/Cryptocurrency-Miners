# Python

For Python (.py) format:

```python
python file.py
```

or

```python
python3 file.py
```

# NodeJs

For Javascript file format:

```js
node file.js
```

# Diagrams Explaining Codes

## mintme/smart_proxy.py

### Class Diagram

```mermaid
classDiagram
    class Configuration {
        +int LISTEN_PORT = 8888
        +String POOL_URL = "pool.webchain.network"
        +int POOL_PORT = 2222
    }

    class ProxyApplication {
        +Dictionary user_stats
        +main()
        +handle_client(websocket, path)
    }

    class ClientSession {
        +WebSocket websocket
        +StreamReader reader
        +StreamWriter writer
        +forward_to_pool()
        +forward_to_browser()
    }

    class UserStatsTracker {
        +int shares
        +Dictionary pending_ids
    }

    ProxyApplication --> Configuration : uses
    ProxyApplication "1" *-- "many" ClientSession : spawns for each connection
    ProxyApplication "1" *-- "many" UserStatsTracker : maps via websocket key
```

### Sequence Diagram

```mermaid
sequenceDiagram
    participant B as Web Browser (WASM)
    participant P as Python WS Proxy
    participant M as Mining Pool (Webchain)

    B->>P: 1. Connect (ws://0.0.0.0:8888)
    Note over P: Initialize user_stats[websocket]
    P->>M: 2. Open TCP Connection (Port 2222)
    M-->>P: TCP Connected
    
    par Async Task: forward_to_pool
        B->>P: 3. JSON-RPC (e.g., method: "submit", id: X)
        Note over P: Intercept & Track pending_ids[X] = True
        P->>M: 4. Forward raw bytes + \n
    and Async Task: forward_to_browser
        M->>P: 5. JSON-RPC Response (id: X)
        Note over P: Match ID, check if "status: OK"
        Note over P: If OK, increment user_stats shares
        P->>B: 6. Forward text response to WebSocket
    end

    B-xP: 7. Client Disconnects
    Note over P: Cleanup user_stats, close writer
    P-xM: 8. Close TCP Connection
```

### Architecture & Task Flowchart

```mermaid
flowchart TD
    Start([Start Proxy Server]) --> Listen[Listen on ws://0.0.0.0:8888]
    Listen -->|New Client Connects| HandleClient[handle_client Coroutine]
    
    subgraph Client Handler
        Init[Initialize user_stats dict] --> ConnectPool[Connect to pool.webchain.network:2222]
        ConnectPool --> SpawnTasks{asyncio.wait}
        
        SpawnTasks -->|Task 1| F2P[forward_to_pool]
        SpawnTasks -->|Task 2| F2B[forward_to_browser]
        
        F2P -->|Read WS| CheckSubmit{Is method 'submit'?}
        CheckSubmit -->|Yes| TrackID[Store msg_id in pending_ids]
        CheckSubmit -->|No| SendPool[Write to Pool TCP]
        TrackID --> SendPool
        
        F2B -->|Read TCP| ParsePool[Parse JSON from Pool]
        ParsePool --> CheckID{Is msg_id pending?}
        CheckID -->|Yes| CheckSuccess{Is result OK?}
        CheckSuccess -->|Yes| AddShare[shares += 1]
        CheckSuccess -->|No| SendBrowser[Send to Browser WS]
        AddShare --> SendBrowser
        CheckID -->|No| SendBrowser
    end
    
    F2P -.->|If WS Closes| Cleanup
    F2B -.->|If TCP Closes| Cleanup
    
    Cleanup[Remove user_stats, Close TCP Writer] --> End([End Session])
```
