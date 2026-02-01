#!/bin/bash
emcc wasm_miner.c Lyra2.c Sponge.c \
  -O3 \
  -s WASM=1 \
  -s "EXPORTED_FUNCTIONS=['_hash_data','_malloc','_free']" \
  -s "EXPORTED_RUNTIME_METHODS=['ccall','cwrap']" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=134217728 \
  -s TOTAL_STACK=5242880 \
  -o mintme_miner.js