# Instructions

Build in Ubuntu 24.04 LTS:

```console
chmod +x build.sh
./build.sh
```

If error just read the feedback and install the missing packages. Other than that, there are large language model (LLM) artificial intelligence (AI) services you can ask. The prebuilts are the .wasm and .js files if you do not want to build yourselves.

# Diagrams

## build.sh

```mermaid
flowchart LR
    subgraph Source Files
        Bridge[bridge.cpp]
        LyraC[Lyra2.c]
        SpongeC[Sponge.c]
        LyraH[Lyra2.h]
        SpongeH[Sponge.h]
    end

    subgraph Emscripten Compiler
        EMCC["emcc -O3 (Maximum Optimization)"]
        Flags["Flags:<br/>-s WASM=1<br/>-s ALLOW_MEMORY_GROWTH=1<br/>-s EXPORTED_FUNCTIONS"]
    end

    subgraph Output Artifacts
        JS["mintme_miner.js<br/>(Glue Code)"]
        WASM["mintme_miner.wasm<br/>(Compiled Binary)"]
    end

    Bridge --> EMCC
    LyraC --> EMCC
    SpongeC --> EMCC
    LyraH -. "Included by" .-> LyraC & Bridge
    SpongeH -. "Included by" .-> SpongeC & LyraC

    EMCC --> Flags
    Flags --> JS
    Flags --> WASM
```

## bridge.cpp

```mermaid
classDiagram
    class JS_Worker {
        +Module._malloc()
        +Module.hash_data()
    }

    class Bridge_CPP {
        -void* ctx (Global Context Pointer)
        +init_miner()
        +hash_data(input, output, len, time_cost)
        +check_ready() int
    }

    class Lyra2_Engine {
        +LYRA2_create() void*
        +LYRA2(ctx, K, kLen, pwd, pwdlen, tcost)
    }

    JS_Worker --|> Bridge_CPP : Calls via WebAssembly Bridge
    
    note for Bridge_CPP "Maintains a persistent singleton 'ctx'.\nHandles Endianness Swapping for Stratum."
    
    Bridge_CPP --|> Lyra2_Engine : init_miner() calls LYRA2_create()
    Bridge_CPP --|> Lyra2_Engine : hash_data() calls LYRA2()
```

## Lyra

```mermaid
flowchart TD
    Start([hash_data Called]) --> CheckCTX{"Is ctx == NULL?"}
    CheckCTX -->|Yes| Create["LYRA2_create: Allocate Matrix <br/> (16384 Rows x 4 Cols)"]
    CheckCTX -->|No| Init["Initialize Matrix & Blake2b Sponge State"]
    Create --> Init
    
    subgraph The Lyra2 Memory Hard Algorithm
        Init --> Setup["1. Setup Phase<br/>Absorb password, salt, and basil.<br/>Sequentially fill the memory matrix.<br/>(reducedDuplexRowSetup)"]
        
        Setup --> Wander["2. Wandering Phase<br/>Loop based on timeCost (tcost).<br/>Pseudo-randomly read and overwrite <br/>rows in the memory matrix.<br/>(reducedDuplexRow)"]
        
        Wander --> WrapUp["3. Wrap-up Phase<br/>Absorb last matrix block.<br/>Squeeze Blake2b Sponge into 32-byte key."]
    end
    
    WrapUp --> EndianSwap["Endian Swap (bridge.cpp)<br/>Reverse output array indices"]
    EndianSwap --> End([Return 32-byte Hash to JS])
```

## Sponge

### The Sponge State Lifecycle

```mermaid
flowchart TD
    subgraph Initialization
        Init["initState()<br/>Creates a 16-word state (1024 bits)<br/>Words 0-7 = Zeros<br/>Words 8-15 = Blake2b IV constants"]
    end

    subgraph The Absorb Phase
        Absorb["absorbBlock()<br/>XOR new data into State[0..11]"]
        Permute1["blake2bLyra()<br/>Scramble state using 12 rounds of G-function"]
    end

    subgraph The Squeeze Phase
        Squeeze["squeeze()<br/>Extract bytes from State memory"]
        Permute2["blake2bLyra()<br/>Scramble state again for next extraction"]
    end

    Init --> Absorb
    Absorb --> Permute1
    Permute1 -->|More Input?| Absorb
    Permute1 -->|Finished Input| Squeeze
    Squeeze -->|Need More Output?| Permute2
    Permute2 --> Squeeze
```

### The Memory-Hard Duplex Operation (reducedDuplexRow)

```mermaid
flowchart LR
    subgraph Inputs from Lyra2 Matrix
        PrevRow["M[prev]<br/>(ptrWordIn)"]
        RowStar["M[row*]<br/>(ptrWordInOut)"]
    end

    subgraph The Sponge Core
        State["Sponge State Array<br/>(state[0] to state[11])"]
        GFunc["reducedBlake2bLyra()<br/>(1 round of Blake2b G-function)"]
    end

    subgraph Outputs back to Lyra2 Matrix
        TargetRow["M[rowOut]<br/>(ptrWordOut)"]
        RowStarOut["M[row*]<br/>(Updated ptrWordInOut)"]
    end

    %% Flow logic
    PrevRow -->|"+" Addition| Sum["Wordwise Addition [+]"]
    RowStar -->|"+" Addition| Sum
    
    Sum -->|"XOR (^=)"| State
    State --> GFunc
    GFunc --> State
    
    State -->|"XOR (^=)"| TargetRow
    State -->|"XOR & rotW (Left Rotate 64)"| RowStarOut
```