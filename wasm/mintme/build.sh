#/bin/bash
emcc -O3 bridge.cpp Lyra2.c Sponge.c \
  -o mintme_miner.js \
  -I ./ \
  -D NROWS=16384 -D NCOLS=4 \
  -s WASM=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s EXPORTED_FUNCTIONS="['_malloc','_free']" \
  -s EXPORTED_RUNTIME_METHODS="['ccall','cwrap']" \
  -s EXPORT_NAME='createMintMeModule' \
  -s MODULARIZE=1

  