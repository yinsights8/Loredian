import { getSettings } from '../../settingsService'
import { getEmbeddingDimension } from '../embeddingService'
import { logger } from '../../../logger'
import type { Mem0Memory, Mem0SearchResult } from '../../../../shared/types'

const MEM0_SIDECAR_URL = 'http://localhost:7264'

let cachedUserId: string | null = null

function getUserId(): string {
  const username = getSettings().username

  if (!username) {
    logger.warn({ username }, '[Mem0] No username set in settings')
    throw new Error('Username required. Set your name in Settings > General')
  }

  const currentUserId = username

  if (cachedUserId !== null && cachedUserId !== currentUserId) {
    logger.info(
      { old: cachedUserId, new: currentUserId },
      '[Mem0] User changed, will use new namespace',
    )
  }

  logger.debug({ username: currentUserId }, '[Mem0] getUserId resolved')
  cachedUserId = currentUserId
  return currentUserId
}

let isInitialized = false

async function waitForSidecar(maxAttempts = 10, delayMs = 500): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${MEM0_SIDECAR_URL}/health`, { signal: AbortSignal.timeout(2000) })
      // 200 = ready, 503 = sidecar running but Mem0 not init
      if (res.status === 200 || res.status === 503) {
        return true
      }
    } catch {
      // Sidecar not responding
    }
    await new Promise(resolve => setTimeout(resolve, delayMs))
  }
  return false
}

export async function initializeMem0(): Promise<void> {
  try {
    logger.info('[Mem0] Waiting for sidecar to be ready...')
    const sidecarReady = await waitForSidecar()
    if (!sidecarReady) {
      throw new Error('Mem0 sidecar not responding')
    }
    logger.info('[Mem0] Sidecar ready, initializing Mem0...')

    const settings = getSettings()
    const dims = getEmbeddingDimension()

    const config = {
      ollama_host: settings.ollamaHost || 'http://127.0.0.1:11434',
      model: settings.selectedModel,
      embedding_model: settings.embeddingModel || 'nomic-embed-text',
      embedding_dims: dims,
    }

    logger.info({ config }, '[Mem0] Initializing with config')

    // Try init - will fail if sidecar not ready, that's ok
    let initRes: Response | null = null
    try {
      initRes = await fetch(`${MEM0_SIDECAR_URL}/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
    } catch {
      // Sidecar not ready yet, wait and retry once
      await new Promise(resolve => setTimeout(resolve, 2000))
      initRes = await fetch(`${MEM0_SIDECAR_URL}/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
    }

    if (!initRes.ok) {
      const error = await initRes.text()
      throw new Error(`Sidecar init failed: ${error}`)
    }

    isInitialized = true
    logger.info('[Mem0] Initialized successfully')
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
      body: JSON.stringify({
        messages,
        user_id: getUserId(),
        metadata,
      }),
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
      body: JSON.stringify({
        query,
        user_id: getUserId(),
        limit,
      }),
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
    const res = await fetch(
      `${MEM0_SIDECAR_URL}/memories?user_id=${encodeURIComponent(getUserId())}`,
    )

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
    const res = await fetch(
      `${MEM0_SIDECAR_URL}/memories?user_id=${encodeURIComponent(getUserId())}`,
      {
        method: 'DELETE',
      },
    )

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
