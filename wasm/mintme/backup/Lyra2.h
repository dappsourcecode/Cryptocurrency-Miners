#ifndef LYRA2_H_
#define LYRA2_H_

#include <stdint.h>
#include <stdlib.h>

typedef unsigned char byte;

// --- MINTME / WEBCHAIN PARAMETERS ---
#define NROWS 16384
#define NCOLS 4

// --- RESTORED CONSTANTS (Fixes the compilation error) ---
// Block length required so Blake2's Initialization Vector (IV) is not overwritten
#define BLOCK_LEN_BLAKE2_SAFE_INT64 8                                   // 512 bits (=64 bytes, =8 uint64_t)
#define BLOCK_LEN_BLAKE2_SAFE_BYTES (BLOCK_LEN_BLAKE2_SAFE_INT64 * 8)   // same as above, in bytes

// Standard Lyra2 Constants
#define BLOCK_LEN_INT64 12
#define BLOCK_LEN_BYTES (BLOCK_LEN_INT64 * 8)
#define LYRA2_MEMSIZE (BLOCK_LEN_INT64 * NCOLS * 8 * NROWS)

// The Context Structure
struct LYRA2_ctx {
    uint64_t *wholeMatrix;
};

// Accessor Macro
#define memMatrix(x)  (&ctx->wholeMatrix[x * BLOCK_LEN_INT64 * NCOLS])

#ifdef __cplusplus
extern "C" {
#endif

// Function Prototypes
void *LYRA2_create(void);
int LYRA2(void *ctx, void *K, int64_t kLen, const void *pwd, int32_t pwdlen, uint32_t tcost);

#ifdef __cplusplus
}
#endif

#endif