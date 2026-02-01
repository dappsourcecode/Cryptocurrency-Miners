#include <emscripten.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "Lyra2.h"

// Global context
void* ctx = NULL;

EMSCRIPTEN_KEEPALIVE
int hash_data(uint8_t* input, uint8_t* output, int len) {
    // 1. Create Context if it doesn't exist
    if (ctx == NULL) {
        ctx = LYRA2_create();
        if (ctx == NULL) return -1; // Panic if memory allocation fails
    }

    // 2. Run Lyra2 (MintMe specific: TimeCost = 1)
    // The simplified LYRA2 implementation typically uses the input as both password and salt 
    // for this specific variant, or the salt is handled internally.
    LYRA2(ctx, output, 32, input, len, 1);
    
    return 0;
}
