"""
Mem0 HTTP Sidecar Server
Exposes mem0 Python SDK as a FastAPI HTTP server on port 7264
"""

import asyncio
import logging
import os
import pathlib
import sys
from typing import Optional, Any
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn
from mem0 import Memory

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger('mem0_server')

# FastAPI app
app = FastAPI(title='Mem0 Sidecar', version='1.0.0')

# Global mem0 instance and data directory
mem0_instance: Optional[Memory] = None
data_dir: Optional[pathlib.Path] = None


# Request/Response Models
class Message(BaseModel):
    role: str  # 'user' or 'assistant'
    content: str


class InitRequest(BaseModel):
    ollama_host: str
    model: str
    embedding_model: str
    embedding_dims: int


class AddRequest(BaseModel):
    messages: list[Message]
    metadata: Optional[dict[str, Any]] = None


class SearchRequest(BaseModel):
    query: str
    limit: int = 20


class MemoryResponse(BaseModel):
    id: str
    memory: str
    userId: str
    createdAt: str
    updatedAt: str
    metadata: Optional[dict[str, Any]] = None


class SearchResult(MemoryResponse):
    score: float


@app.post('/init')
async def initialize(req: InitRequest):
    """Initialize Mem0 with Ollama configuration"""
    global mem0_instance, data_dir

    try:
        logger.info(f'Initializing Mem0 with Ollama host: {req.ollama_host}')

        data_dir = pathlib.Path(os.environ.get('MEM0_DATA_DIR', pathlib.Path.home() / '.lore' / 'mem0'))
        data_dir.mkdir(parents=True, exist_ok=True)

        config = {
            'version': 'v1.1',
            'llm': {
                'provider': 'ollama',
                'config': {
                    'model': req.model,
                    'ollama_base_url': req.ollama_host,
                }
            },
            'embedder': {
                'provider': 'ollama',
                'config': {
                    'model': req.embedding_model,
                    'ollama_base_url': req.ollama_host,
                }
            },
            'vector_store': {
                'provider': 'chroma',
                'config': {
                    'collection_name': 'lore-memories',
                    'path': str(data_dir),
                }
            }
        }

        mem0_instance = await asyncio.to_thread(Memory.from_config, config)
        logger.info('Mem0 initialized successfully')

        return {'status': 'initialized', 'message': 'Mem0 initialized successfully'}

    except Exception as e:
        logger.error(f'Failed to initialize Mem0: {str(e)}')
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/health')
async def health_check():
    """Health check endpoint"""
    if mem0_instance is None:
        return JSONResponse(
            status_code=503,
            content={'status': 'not_initialized'}
        )

    return {'status': 'ok'}


@app.post('/add')
async def add_memories(req: AddRequest):
    """Add memories to Mem0"""
    if mem0_instance is None:
        raise HTTPException(status_code=503, detail='Mem0 not initialized')

    try:
        # Convert Pydantic models to dicts
        messages = [{'role': m.role, 'content': m.content} for m in req.messages]

        # Add to mem0 in thread pool
        result = await asyncio.to_thread(mem0_instance.add, messages, {'user_id': 'lore-user'})

        # Normalize result to memoryIds array
        memory_ids = []
        if isinstance(result, list):
            memory_ids = [r if isinstance(r, str) else r.get('id', '') for r in result]
        elif isinstance(result, str):
            memory_ids = [result]
        elif isinstance(result, dict) and 'id' in result:
            memory_ids = [result['id']]

        logger.info(f'Added {len(memory_ids)} memories')

        return {'memoryIds': memory_ids}

    except Exception as e:
        logger.error(f'Failed to add memories: {str(e)}')
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/search')
async def search_memories(req: SearchRequest):
    """Search memories in Mem0"""
    if mem0_instance is None:
        raise HTTPException(status_code=503, detail='Mem0 not initialized')

    try:
        results = await asyncio.to_thread(mem0_instance.search, req.query, {'user_id': 'lore-user', 'limit': req.limit})

        if not isinstance(results, list):
            results = []

        # Normalize to SearchResult format
        normalized = []
        for r in results:
            if isinstance(r, dict):
                normalized.append({
                    'id': r.get('id', ''),
                    'memory': r.get('memory', ''),
                    'userId': r.get('userId') or r.get('user_id', 'lore-user'),
                    'createdAt': r.get('createdAt') or r.get('created_at', ''),
                    'updatedAt': r.get('updatedAt') or r.get('updated_at', ''),
                    'metadata': r.get('metadata'),
                    'score': r.get('score', 0.0),
                })

        logger.info(f'Search found {len(normalized)} results')

        return normalized

    except Exception as e:
        logger.error(f'Failed to search memories: {str(e)}')
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/memories')
async def get_all_memories():
    """Get all memories for the user"""
    if mem0_instance is None:
        raise HTTPException(status_code=503, detail='Mem0 not initialized')

    try:
        results = await asyncio.to_thread(mem0_instance.get_all, {'user_id': 'lore-user'})

        if not isinstance(results, list):
            results = []

        # Normalize to MemoryResponse format
        normalized = []
        for r in results:
            if isinstance(r, dict):
                normalized.append({
                    'id': r.get('id', ''),
                    'memory': r.get('memory', ''),
                    'userId': r.get('userId') or r.get('user_id', 'lore-user'),
                    'createdAt': r.get('createdAt') or r.get('created_at', ''),
                    'updatedAt': r.get('updatedAt') or r.get('updated_at', ''),
                    'metadata': r.get('metadata'),
                })

        logger.info(f'Retrieved {len(normalized)} total memories')

        return normalized

    except Exception as e:
        logger.error(f'Failed to get all memories: {str(e)}')
        raise HTTPException(status_code=500, detail=str(e))


@app.delete('/memories/{memory_id}')
async def delete_memory(memory_id: str):
    """Delete a single memory"""
    if mem0_instance is None:
        raise HTTPException(status_code=503, detail='Mem0 not initialized')

    try:
        await asyncio.to_thread(mem0_instance.delete, memory_id)
        logger.info(f'Deleted memory: {memory_id}')
        return {'status': 'deleted'}

    except Exception as e:
        logger.error(f'Failed to delete memory: {str(e)}')
        raise HTTPException(status_code=500, detail=str(e))


@app.delete('/memories')
async def delete_all_memories():
    """Delete all memories for the user"""
    if mem0_instance is None:
        raise HTTPException(status_code=503, detail='Mem0 not initialized')

    try:
        await asyncio.to_thread(mem0_instance.delete_all, {'user_id': 'lore-user'})
        logger.info('Deleted all memories')
        return {'status': 'deleted_all'}

    except Exception as e:
        logger.error(f'Failed to delete all memories: {str(e)}')
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == '__main__':
    logger.info('Starting Mem0 Sidecar Server on 127.0.0.1:7264')
    uvicorn.run(app, host='127.0.0.1', port=7264, log_level='info')
