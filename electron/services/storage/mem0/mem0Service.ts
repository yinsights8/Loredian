import { getSettings } from '../../settingsService'
import { getEmbeddingDimension } from '../embeddingService'
import { logger } from '../../../logger'
import type { Mem0Memory, Mem0SearchResult } from '../../../../shared/types'

const MEM0_SIDECAR_URL = 'http://localhost:7264'

let isInitialized = false

export async function initializeMem0(): Promise<void> {
  try {
    const settings = getSettings()
    const dims = getEmbeddingDimension()

    const config = {
      ollama_host: settings.ollamaHost || 'http://127.0.0.1:11434',
      model: settings.selectedModel,
      embedding_model: settings.embeddingModel || 'nomic-embed-text',
      embedding_dims: dims,
    }

    // Send init config to sidecar
    const initRes = await fetch(`${MEM0_SIDECAR_URL}/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })

    if (!initRes.ok) {
      const error = await initRes.text()
      throw new Error(`Sidecar init failed: ${error}`)
    }

    // Poll health endpoint until ready
    const healthTimeout = 30_000
    const startTime = Date.now()

    while (Date.now() - startTime < healthTimeout) {
      try {
        const healthRes = await fetch(`${MEM0_SIDECAR_URL}/health`)
        if (healthRes.ok) {
          isInitialized = true
          logger.info('[Mem0] Initialized successfully')
          return
        }
      } catch {
        // Not ready yet, retry
      }
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    throw new Error('Mem0 sidecar health check timeout')
  } catch (err) {
    logger.error({ err }, '[Mem0] Initialization failed')
    throw err
  }
}

export async function reinitializeMem0(): Promise<void> {
  isInitialized = false
  await initializeMem0()
}

export async function addToMem0(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  metadata?: Record<string, string>,
): Promise<{ memoryIds: string[] }> {
  if (!isInitialized) {
    throw new Error('Mem0 not initialized')
  }

  try {
    const res = await fetch(`${MEM0_SIDECAR_URL}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, metadata }),
    })

    if (!res.ok) {
      const error = await res.text()
      throw new Error(error)
    }

    const result = await res.json() as { memoryIds: string[] }
    return result
  } catch (err) {
    logger.error({ err }, '[Mem0] Failed to add memories')
    throw err
  }
}

export async function searchMem0(query: string, limit = 20): Promise<Mem0SearchResult[]> {
  if (!isInitialized) {
    throw new Error('Mem0 not initialized')
  }

  try {
    const res = await fetch(`${MEM0_SIDECAR_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit }),
    })

    if (!res.ok) {
      const error = await res.text()
      throw new Error(error)
    }

    const results = await res.json() as Array<{
      id: string
      memory: string
      userId: string
      createdAt: string
      updatedAt: string
      metadata?: Record<string, unknown>
      score: number
    }>

    if (!Array.isArray(results)) {
      return []
    }

    return results.map((r) => ({
      id: r.id,
      memory: r.memory,
      userId: r.userId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      metadata: r.metadata,
      score: r.score ?? 0,
    }))
  } catch (err) {
    logger.error({ err }, '[Mem0] Search failed')
    throw err
  }
}

export async function getAllMem0Memories(): Promise<Mem0Memory[]> {
  if (!isInitialized) {
    throw new Error('Mem0 not initialized')
  }

  try {
    const res = await fetch(`${MEM0_SIDECAR_URL}/memories`)

    if (!res.ok) {
      const error = await res.text()
      throw new Error(error)
    }

    const results = await res.json() as Array<{
      id: string
      memory: string
      userId: string
      createdAt: string
      updatedAt: string
      metadata?: Record<string, unknown>
    }>

    if (!Array.isArray(results)) {
      return []
    }

    return results.map((r) => ({
      id: r.id,
      memory: r.memory,
      userId: r.userId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      metadata: r.metadata,
    }))
  } catch (err) {
    logger.error({ err }, '[Mem0] Failed to get all memories')
    throw err
  }
}

export async function deleteMem0Memory(memoryId: string): Promise<void> {
  if (!isInitialized) {
    throw new Error('Mem0 not initialized')
  }

  try {
    const res = await fetch(`${MEM0_SIDECAR_URL}/memories/${memoryId}`, {
      method: 'DELETE',
    })

    if (!res.ok) {
      const error = await res.text()
      throw new Error(error)
    }

    logger.info('[Mem0] Deleted memory')
  } catch (err) {
    logger.error({ err }, '[Mem0] Failed to delete memory')
    throw err
  }
}

export async function deleteAllMem0Memories(): Promise<void> {
  if (!isInitialized) {
    throw new Error('Mem0 not initialized')
  }

  try {
    const res = await fetch(`${MEM0_SIDECAR_URL}/memories`, {
      method: 'DELETE',
    })

    if (!res.ok) {
      const error = await res.text()
      throw new Error(error)
    }

    logger.info('[Mem0] Deleted all memories')
  } catch (err) {
    logger.error({ err }, '[Mem0] Failed to delete all memories')
    throw err
  }
}

export async function getMem0Stats(): Promise<{ totalMemories: number }> {
  try {
    const memories = await getAllMem0Memories()
    return {
      totalMemories: memories.length,
    }
  } catch (err) {
    logger.error({ err }, '[Mem0] Failed to get stats')
    return { totalMemories: 0 }
  }
}

export function isMem0Initialized(): boolean {
  return isInitialized
}
