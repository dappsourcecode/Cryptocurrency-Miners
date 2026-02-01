import asyncio
import websockets
import json
import signal
import sys
import traceback

# --- CONFIGURATION ---
LISTEN_PORT = 8888
POOL_URL = "pool.webchain.network" 
POOL_PORT = 3333  # standard port
# POOL_PORT = 2222  # lower difficulty port


# --- STATE TRACKING ---
user_stats = {}

async def handle_client(websocket, path):
    client_addr = websocket.remote_address
    print(f"🔌 New Client Connected: {client_addr}")
    user_stats[websocket] = {'shares': 0, 'pending_ids': {}}
    
    reader = None
    writer = None

    try:
        print(f"   Connecting to upstream {POOL_URL}:{POOL_PORT}...")
        reader, writer = await asyncio.open_connection(POOL_URL, POOL_PORT)
        print(f"   ✅ Upstream connected.")

        async def forward_to_pool():
            try:
                async for message in websocket:
                    try:
                        data = json.loads(message)
                        msg_id = data.get('id')
                        
                        # Track submit requests
                        if data.get('method') == 'submit' and msg_id:
                            user_stats[websocket]['pending_ids'][msg_id] = True
                            print(f"📤 [{client_addr}] Submitting share (id={msg_id})")
                            print(f"   Params: {json.dumps(data.get('params', {}))}")
                        
                    except Exception as e:
                        print(f"⚠️ Error parsing client message: {e}")
                    
                    # Forward to pool
                    writer.write(message.encode('utf-8') + b'\n')
                    await writer.drain()
                    
            except websockets.exceptions.ConnectionClosed:
                print(f"🔌 Client WebSocket closed")
            except Exception as e:
                print(f"⚠️ Error in forward_to_pool: {e}")
                traceback.print_exc()

        async def forward_to_browser():
            try:
                while True:
                    data = await reader.readline()
                    if not data:
                        print("⚠️ Pool closed connection")
                        break
                    
                    try:
                        text_data = data.decode('utf-8').strip()
                        if not text_data:
                            continue
                            
                        msg = json.loads(text_data)
                        
                        # Track share responses
                        msg_id = msg.get('id')
                        client_stats = user_stats.get(websocket)
                        
                        if client_stats and msg_id in client_stats['pending_ids']:
                            del client_stats['pending_ids'][msg_id]
                            
                            is_success = False
                            result = msg.get('result')
                            error = msg.get('error')

                            if error is None and result is not None:
                                if isinstance(result, dict) and result.get('status') == 'OK':
                                    is_success = True
                                elif result is True:
                                    is_success = True
                                elif isinstance(result, dict) and 'status' not in result:
                                    is_success = True

                            if is_success:
                                client_stats['shares'] += 1
                                print(f"💎 [{client_addr}] Share ACCEPTED! (Total: {client_stats['shares']})")
                            else:
                                print(f"❌ [{client_addr}] Share REJECTED: {error or result}")
                                print(f"   Full response: {json.dumps(msg)}")
                        
                        # Forward response to browser
                        await websocket.send(text_data)
                        
                    except json.JSONDecodeError as e:
                        print(f"⚠️ Invalid JSON from pool: {text_data[:100]}")
                    except websockets.exceptions.ConnectionClosed:
                        print(f"🔌 Client disconnected during send")
                        break
                    except Exception as e:
                        print(f"⚠️ Error processing pool message: {e}")
                        traceback.print_exc()
                        
            except Exception as e:
                print(f"⚠️ Error in forward_to_browser: {e}")
                traceback.print_exc()

        # Run both tasks
        task_pool = asyncio.create_task(forward_to_pool())
        task_browser = asyncio.create_task(forward_to_browser())

        done, pending = await asyncio.wait(
            [task_pool, task_browser], 
            return_when=asyncio.FIRST_COMPLETED
        )
        
        # Cancel remaining tasks
        for task in pending:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    except Exception as e:
        print(f"⚠️ Connection Error: {e}")
        traceback.print_exc()
    finally:
        # Cleanup
        if websocket in user_stats:
            del user_stats[websocket]
        print(f"🔌 Client Disconnected: {client_addr}")
        
        if writer:
            try:
                writer.close()
                await writer.wait_closed()
            except:
                pass

async def main():
    stop = asyncio.Future()
    loop = asyncio.get_running_loop()
    
    def signal_handler():
        stop.set_result(None)
    
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, signal_handler)

    async with websockets.serve(handle_client, "0.0.0.0", LISTEN_PORT):
        print(f"🚀 Smart Proxy Listening on ws://0.0.0.0:{LISTEN_PORT}")
        print(f"🔗 Forwarding to {POOL_URL}:{POOL_PORT}")
        await stop

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Shutting down...")