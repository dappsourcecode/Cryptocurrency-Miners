import asyncio
import websockets
import socket

# Configuration
LOCAL_PORT = 8888
POOL_HOST = "pool.webchain.network"
POOL_PORT = 2222

print(f"⚡ Stratum Proxy Started on port {LOCAL_PORT}")
print(f"   Forwarding to {POOL_HOST}:{POOL_PORT}")

async def handle_client(websocket):
    print("New Browser Client Connected")
    
    # Open a TCP connection to the real mining pool
    pool_reader, pool_writer = await asyncio.open_connection(POOL_HOST, POOL_PORT)

    async def forward_to_pool():
        try:
            async for message in websocket:
                print(f">>> Browser Sent: {message}")
                # Append newline as Stratum is line-based
                msg_bytes = message.encode('utf-8')
                if not message.endswith('\n'):
                     msg_bytes += b'\n'
                pool_writer.write(msg_bytes)
                await pool_writer.drain()
        except Exception as e:
            print(f"Browser connection closed: {e}")

    async def forward_to_browser():
        try:
            while True:
                data = await pool_reader.read(4096)
                if not data:
                    break
                text = data.decode('utf-8')
                print(f"<<< Pool Sent: {text.strip()}")
                await websocket.send(text)
        except Exception as e:
            print(f"Pool connection closed: {e}")

    # Run both tasks simultaneously
    await asyncio.gather(
        forward_to_pool(),
        forward_to_browser()
    )

async def main():
    async with websockets.serve(handle_client, "localhost", LOCAL_PORT):
        await asyncio.Future()  # Run forever

if __name__ == "__main__":
    asyncio.run(main())
