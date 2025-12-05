"""
File cache.py
Author Youssef Elebiary
Brief Cache Functions for RescuNet
Version 1.0
Date 2025-11-25
Copyright (c) 2025
"""

# ========== IMPORTING LIBRARIES ========== #
from time import time
from hashlib import sha1
from typing import Tuple
from networkx import (
    MultiDiGraph,
    NetworkXError,
)
from sqlite3 import (
    Connection,
    Cursor,
    connect,
)
from pickle import (
    dumps,
    loads,
)

from .utils import download_graph_bbox
########################



# ========== Constants ========== #
DB_PATH: str = "graph_cache.sqlite"
ACCESS_TTL_SECONDS: int = 24 * 3600
DOWNLOAD_TTL_SECONDS: int = 7 * 24 * 3600
ROUND: int = 5
########################



# ========== UTILITY FUNCTIONS ========== #
def normalize_bbox(north: float, south: float, east: float, west: float) -> Tuple[float, float, float, float]:
    north = round(float(north), ROUND)
    south = round(float(south), ROUND)
    east  = round(float(east), ROUND)
    west  = round(float(west), ROUND)
    return north, south, east, west

def make_bbox_key(north: float, south: float, east: float, west: float) -> str:
    n, s, e, w = normalize_bbox(north, south, east, west)
    raw = f"{n},{s},{e},{w}"

    return sha1(raw.encode()).hexdigest()
########################



# ========== DATABASE SETUP ========== #
def init_cache() -> None:
    conn: Connection = connect(DB_PATH)
    c: Cursor = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS graph_cache(
            cache_key TEXT PRIMARY KEY,
            graph_blob BLOB NOT NULL,
            download_time REAL NOT NULL DEFAULT (strftime('%s', 'now')),
            last_access REAL NOT NULL
        )
    """)
    conn.commit()
    conn.close()
########################



# ========== CACHING LOGIC ========== #
def load_from_cache(cache_key: str):
    conn: Connection = connect(DB_PATH)
    c: Cursor = conn.cursor()
    c.execute("SELECT graph_blob FROM graph_cache WHERE cache_key = ?", (cache_key,))
    row = c.fetchone()

    if row is None:
        conn.close()
        return None
    
    c.execute("UPDATE graph_cache SET last_access = ? WHERE cache_key = ?", 
              (time(), cache_key))
    conn.commit()
    conn.close()

    return loads(row[0])

def save_to_cache(cache_key: str, G: MultiDiGraph) -> None:
    conn: Connection = connect(DB_PATH)
    c: Cursor = conn.cursor()
    blob = dumps(G)
    current_time: float = time()
    c.execute(
        "REPLACE INTO graph_cache (cache_key, graph_blob, download_time, last_access) VALUES (?, ?, ?, ?)",
        (cache_key, blob, current_time, current_time)
    )
    conn.commit()
    conn.close()

def cleanup_cache() -> None:
    current_time: float = time()
    access_cutoff = current_time - ACCESS_TTL_SECONDS
    download_cutoff = current_time - DOWNLOAD_TTL_SECONDS

    conn: Connection = connect(DB_PATH)
    c: Cursor = conn.cursor()
    c.execute("""
        DELETE FROM graph_cache 
        WHERE last_access < ? OR download_time < ?
    """, (access_cutoff, download_cutoff))
    conn.commit()
    conn.close()



# ========== FETCH GRAPH ========== #
def get_graph(north: float, south: float, east: float, west: float) -> MultiDiGraph:
    init_cache()

    cache_key: str = make_bbox_key(north, south, east, west)

    # Try loading from cache
    cached = load_from_cache(cache_key)
    if cached is not None:
        return cached

    try:
        G: MultiDiGraph = download_graph_bbox(north=north, south=south, east=east, west=west)
    except NetworkXError as e:
        raise NetworkXError(str(e))

    save_to_cache(cache_key, G)

    cleanup_cache()

    return G
########################