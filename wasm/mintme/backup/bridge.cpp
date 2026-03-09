#include <emscripten/emscripten.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "Lyra2.h"

// Keep these Defines for Memory Allocation (Lyra2.c likely needs them at compile time)
#define NROWS 16384
#define NCOLS 4

extern "C" {

// Updated signature: now accepts 'time_cost' from JS
EMSCRIPTEN_KEEPALIVE
void hash_data(uint8_t* input, uint8_t* output, int len, int time_cost) {
    static void* ctx = NULL;
    if (ctx == NULL) {
        // If LYRA2_create() uses NROWS/NCOLS, it will use the #defines above
        ctx = LYRA2_create();
    }

    // Pass the dynamic time_cost variable to LYRA2
    // LYRA2(ctx, output, 32, input, len, time_cost);
    LYRA2(ctx, output, 32, input, len, time_cost);
}

EMSCRIPTEN_KEEPALIVE
int check_ready() {
    return 1;
}

}
