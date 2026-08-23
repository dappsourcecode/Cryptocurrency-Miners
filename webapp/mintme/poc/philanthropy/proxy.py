import asyncio
import websockets
import json
import signal
import sys
import time
import os
import traceback
from datetime import datetime, timezone

# --- CONFIGURATION ---
LISTEN_PORT = 8888
# POOL_URL = "pool.webchain.network"
# POOL_URL = "pool.mintme.com"
POOL_URL = 'mintme.wattpool.net'
# POOL_PORT = 3333  # standard port
POOL_PORT = 2222  # lower difficulty port

# JSON Database File
DATA_FILE = "donations.json"

# Conversion & Share Estimation Constants
# 1 Share at standard base difficulty ~ 65,536 raw hashes (adjust as needed)
HASHES_PER_SHARE = 65536
# Estimated MINTME token reward per 1 million hashes (rough approximation for demo UI)
MINTME_PER_MH = 0.0015 

# Lock for safe file writing across async tasks
file_lock = asyncio.Lock()

# --- HELPER FUNCTIONS FOR DONATIONS.JSON ---

def get_iso_now():
    return datetime.now(timezone.utc).isoformat()

def load_donations_data():
    """Loads donations.json or initializes a fresh structure if missing/corrupt."""
    if not os.path.exists(DATA_FILE):
        return {
            "global_stats": {
                "total_community_shares": 0,
                "total_community_hashes": 0,
                "total_community_time_seconds": 0,
                "estimated_mintme_contributed": 0.0,
                "total_unique_donors": 0,
                "last_updated": get_iso_now()
            },
            "workers": {}
        }
    try:
        with open(DATA_FILE, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"⚠️ Error reading {DATA_FILE}, initializing fresh structure: {e}")
        return {
            "global_stats": {
                "total_community_shares": 0,
                "total_community_hashes": 0,
                "total_community_time_seconds": 0,
                "estimated_mintme_contributed": 0.0,
                "total_unique_donors": 0,
                "last_updated": get_iso_now()
            },
            "workers": {}
        }

async def record_accepted_share(worker_id, session_duration_sec, threads_used=1):
    """Updates donations.json atomically when a share is validated by the pool."""
    async with file_lock:
        data = load_donations_data()
        
        # 1. Calculate metrics for this share
        hashes_added = HASHES_PER_SHARE
        mintme_added = (hashes_added / 1_000_000) * MINTME_PER_MH
        now_str = get_iso_now()

        # 2. Update Global Stats
        g = data["global_stats"]
        g["total_community_shares"] += 1
        g["total_community_hashes"] += hashes_added
        g["total_community_time_seconds"] += int(session_duration_sec)
        g["estimated_mintme_contributed"] = round(g["estimated_mintme_contributed"] + mintme_added, 6)
        g["last_updated"] = now_str

        # 3. Update Worker Stats
        if worker_id not in data["workers"]:
            data["workers"][worker_id] = {
                "shares": 0,
                "total_hashes": 0,
                "total_time_seconds": 0,
                "avg_hashrate_hps": 0.0,
                "estimated_mintme": 0.0,
                "first_seen": now_str,
                "last_active": now_str,
                "threads_used": threads_used
            }

        w = data["workers"][worker_id]
        w["shares"] += 1
        w["total_hashes"] += hashes_added
        w["total_time_seconds"] += int(session_duration_sec)
        w["last_active"] = now_str
        w["threads_used"] = threads_used
        w["estimated_mintme"] = round(w["estimated_mintme"] + mintme_added, 6)
        
        # Calculate running average hash rate (H/s)
        if w["total_time_seconds"] > 0:
            w["avg_hashrate_hps"] = round(w["total_hashes"] / w["total_time_seconds"], 2)

        # Update donor count
        g["total_unique_donors"] = len(data["workers"])

        # 4. Atomic Write (Write to temp file first, then replace)
        temp_file = f"{DATA_FILE}.tmp"
        with open(temp_file, 'w') as f:
            json.dump(data, f, indent=2)
        os.replace(temp_file, DATA_FILE)
        
        print(f"📊 [JSON Updated] Worker '{worker_id}' | Total Shares: {w['shares']} | Global: {g['total_community_shares']}")

# --- WEBSOCKET & STRATUM PROXY LOGIC ---

user_stats = {}

async def handle_client(websocket, path):
    client_addr = websocket.remote_address
    print(f"🔌 New Client Connected: {client_addr}")
    
    # Initialize connection state
    user_stats[websocket] = {
        'shares': 0,
        'pending_ids': {},
        'worker_id': 'Anonymous_Donor',
        'connect_time': time.time(),
        'last_share_time': time.time(),
        'threads': 1
    }
    
    reader = None
    writer = None

    try:
        print(f"   Connecting to upstream {POOL_URL}:{POOL_PORT}...")
        reader, writer = await asyncio.open_connection(POOL_URL, POOL_PORT)
        print(f"   ✅ Upstream pool connected.")

        async def forward_to_pool():
            try:
                async for message in websocket:
                    try:
                        data = json.loads(message)
                        msg_id = data.get('id')
                        method = data.get('method')
                        params = data.get('params', {})

                        # Intercept Login to extract Worker/Donor ID
                        if method == 'login':
                            login_str = params.get('login', '')
                            rigid = params.get('rigid', '')
                            
                            # Check if login format is "wallet.worker_id" or uses "rigid" parameter
                            if '.' in login_str:
                                user_stats[websocket]['worker_id'] = login_str.split('.', 1)[1]
                            elif rigid:
                                user_stats[websocket]['worker_id'] = rigid
                            elif login_str:
                                user_stats[websocket]['worker_id'] = login_str[:12] # Fallback short wallet ID

                            print(f"👤 [{client_addr}] Identified Donor/Worker ID: '{user_stats[websocket]['worker_id']}'")

                        # Intercept Share Submission
                        elif method == 'submit' and msg_id:
                            user_stats[websocket]['pending_ids'][msg_id] = True
                            print(f"📤 [{client_addr}] Submitting share (id={msg_id}) for '{user_stats[websocket]['worker_id']}'")

                    except Exception as e:
                        print(f"⚠️ Error parsing client message: {e}")

                    # Forward message to pool
                    writer.write(message.encode('utf-8') + b'\n')
                    await writer.drain()

            except websockets.exceptions.ConnectionClosed:
                print(f"🔌 Client WebSocket closed: {client_addr}")
            except Exception as e:
                print(f"⚠️ Error in forward_to_pool: {e}")

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
                                elif result is True or (isinstance(result, dict) and 'status' not in result):
                                    is_success = True

                            if is_success:
                                client_stats['shares'] += 1
                                now = time.time()
                                session_delta = now - client_stats['last_share_time']
                                client_stats['last_share_time'] = now

                                print(f"💎 [{client_addr}] Share ACCEPTED! Worker: '{client_stats['worker_id']}' (Total: {client_stats['shares']})")
                                
                                # Log share to donations.json asynchronously
                                asyncio.create_task(record_accepted_share(
                                    worker_id=client_stats['worker_id'],
                                    session_duration_sec=session_delta,
                                    threads_used=client_stats['threads']
                                ))
                            else:
                                print(f"❌ [{client_addr}] Share REJECTED: {error or result}")

                        # Forward response back to browser
                        await websocket.send(text_data)

                    except json.JSONDecodeError:
                        pass
                    except websockets.exceptions.ConnectionClosed:
                        break
                    except Exception as e:
                        print(f"⚠️ Error processing pool message: {e}")

            except Exception as e:
                print(f"⚠️ Error in forward_to_browser: {e}")

        # Execute forwarding tasks
        task_pool = asyncio.create_task(forward_to_pool())
        task_browser = asyncio.create_task(forward_to_browser())

        done, pending = await asyncio.wait(
            [task_pool, task_browser],
            return_when=asyncio.FIRST_COMPLETED
        )

        for task in pending:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    except Exception as e:
        print(f"⚠️ Connection Error: {e}")
    finally:
        if websocket in user_stats:
            del user_stats[websocket]
        print(f"🔌 Disconnected Client: {client_addr}")
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
        print(f"🚀 Philanthropy Proxy Listening on ws://0.0.0.0:{LISTEN_PORT}")
        print(f"🔗 Forwarding to {POOL_URL}:{POOL_PORT}")
        print(f"📁 Saving live statistics to {DATA_FILE}")
        await stop

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Proxy shut down cleanly.")