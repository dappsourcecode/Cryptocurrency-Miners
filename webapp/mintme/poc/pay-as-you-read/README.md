# Diagrams Explaining Codes

## The Pay-As-You-Read Core Loop
This diagram shows the continuous cycle of user experience and background computation. The beauty of this model is that Step 4 and Step 5 happen simultaneously.

```mermaid
flowchart TD
    A[User visits page] --> B[Reads Free Teaser Content]
    B --> C{Wants to read more?}
    C -->|No| D[Leaves Page]
    C -->|Yes| E[Clicks 'Start Mining']
    
    E --> F[MintMeWasmMiner Starts Threads]
    F --> G[Worker Calculates Hashes]
    
    G --> H{Valid Share Found?}
    H -->|No| G
    H -->|Yes| I[Submit to ws://localhost:8888]
    
    I --> J{Pool Accepts Share?}
    J -->|No| G
    J -->|Yes| K[Content Unlock Triggered]
    
    K --> L[Update UI & Remove Blur]
    L --> M[User Reads New Content]
    
    %% The concurrent reading and mining loop
    M -. "Mining continues in background\nwhile user reads" .-> G
    
    M --> N{Is Article Finished?}
    N -->|No| G
    N -->|Yes| O[Auto-Stop Miner / Complete]
```

## Paragraph-Based Unlock Logic
This diagram visualizes how the first version of our script handled data. It relies on mapping an array of text blocks to specific DOM elements.

```mermaid
flowchart LR
    subgraph Data Structure
        Array[Array: articleParagraphs]
        P0[Index 0: Teaser]
        P1[Index 1: Locked]
        P2[Index 2: Locked]
        Array --- P0 & P1 & P2
    end

    subgraph State Machine
        Shares[currentBlockShares: 0/2]
        Index[unlockedIndex: 1]
    end

    subgraph Trigger Event
        SF[Share Accepted by Pool] --> Add[currentBlockShares + 1]
        Add --> Check{Shares == Target?}
        Check -->|No| Wait[Wait for next share]
        Check -->|Yes| Reset[Reset Shares to 0]
        Reset --> Inc[unlockedIndex + 1]
    end

    subgraph DOM Update
        Inc --> Find[Find Element: id='para-1']
        Find --> Remove[Remove 'locked' CSS class]
        Remove --> Notify[Show 'Paragraph Unlocked' notification]
        Notify --> Scroll[Smooth Scroll to new text]
    end
```

## Character-Based Unlock Logic (with HTML Failsafe)
This diagram explains the highly versatile second version. It treats the entire article as one massive string and uses mathematical indices to slice it, complete with the failsafe to prevent breaking HTML tags.

```mermaid
flowchart TD
    Start((Share Found)) --> AddChars[unlockedChars += 250]
    
    AddChars --> CheckMax{unlockedChars >= Total Length?}
    CheckMax -->|Yes| Full[Render Full HTML & Stop Miner]
    CheckMax -->|No| Slice[Slice String into 'Revealed' and 'Hidden']
    
    subgraph The Smart HTML Splitter
        Slice --> Failsafe[Check Last '<' and '>']
        Failsafe --> Condition{Is '<' after '>' in Revealed?}
        
        Condition -->|No: Safe to Split| Wrap[Wrap 'Hidden' in <span class='locked'>]
        
        Condition -->|Yes: Cut inside a tag!| FastForward[Find next '>' in 'Hidden']
        FastForward --> Adjust[Shift split point forward to include full tag]
        Adjust --> Wrap
    end
    
    Wrap --> Inject[Inject combined string into container.innerHTML]
    Inject --> UpdateBar[Update Progress Bar UI]
    
    style Condition fill:#ffeb3b,stroke:#f57f17,color:#000
    style FastForward fill:#81c784,stroke:#388e3c,color:#000
```