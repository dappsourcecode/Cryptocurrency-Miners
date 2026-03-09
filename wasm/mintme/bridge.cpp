#include <emscripten/emscripten.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "Lyra2.h"

// Keep these Defines for Memory Allocation
#define NROWS 16384
#define NCOLS 4

extern "C" {

// Global context pointer (removes static initialization overhead from the hot path)
void* ctx = NULL;

// 1. New Init Function: Call this ONCE from JS before setting up Uint8Array views
EMSCRIPTEN_KEEPALIVE
void init_miner() {
    if (ctx == NULL) {
        ctx = LYRA2_create();
    }
}

// Updated signature: now accepts 'time_cost' from JS
EMSCRIPTEN_KEEPALIVE
void hash_data(uint8_t* input, uint8_t* output, int len, int time_cost) {
    // Safety check just in case JS forgets to call init_miner()
    if (ctx == NULL) {
        ctx = LYRA2_create();
    }

    // Pass the dynamic time_cost variable to LYRA2
    LYRA2(ctx, output, 32, input, len, time_cost);

    // 2. Endianness Swap: Reverse the 32-byte hash for Stratum/Target compatibility
    for (int i = 0; i < 16; i++) {
        uint8_t temp = output[i];
        output[i] = output[31 - i];
        output[31 - i] = temp;
    }
}

EMSCRIPTEN_KEEPALIVE
int check_ready() {
    return (ctx != NULL) ? 1 : 0;
}

}