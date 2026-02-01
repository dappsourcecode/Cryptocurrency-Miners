# Cryptocurrency Miners

The folders clearly represent themselves and go to each folders for details:

## webapp

Web application in html, css, and js that can run independently. Most requires the proxy folder to communicate with the mining pools. Most requires and already have web assemblies files in them and some does not.

## proxy

Browsers cannot communicate through transfer control protocol (TCP) and other protocols directly to mining pools. Browser communicates through websockets where if the mining pools accept websockets then proxy is not necessary. If it does then the proxy that open websockets and communicates bidirectional to the mining pools can be host locally or remote server.

## wasm

SHA256, Cryptonite, and other light mining algorithms can be rewritten directly into Javascript. However the Lyra2, Randomx, and heavier mining algorithms cannot be handled by full Javascript. Therefore we have to compile their source codes to web assemblies (WASM).

## Working Web Apps

- cpu-web-miner was forked and style customized but still rely on the owner's library and proxy server.
- mintme only problem left which is the invalid shares problem.
- others are not yet working.