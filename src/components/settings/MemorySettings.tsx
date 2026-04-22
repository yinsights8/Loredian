import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertTriangle, FolderOpen, RotateCcw, Database, X, RefreshCw } from 'lucide-react'
import type { AppSettings, MemoryStats } from '../../../shared/types'

// [MemorySettings] Props for the MemorySettings component
interface MemorySettingsProps {
  settings: AppSettings
  onUpdate: (partial: Partial<AppSettings>) => void
}

// [MemorySettings] Format timestamp as relative time (e.g., "5 minutes ago")
function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'Never'

  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 60) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
  return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
}

export function MemorySettings({ settings, onUpdate }: MemorySettingsProps) {
  const [stats, setStats] = useState<MemoryStats | null>(null)
  const [dbPath, setDbPath] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [showDisableWarning, setShowDisableWarning] = useState(false)
  const [pendingToggle, setPendingToggle] = useState<boolean | null>(null)
  const [localDbPath, setLocalDbPath] = useState(settings.memorySettings.dbPath)

  const refreshStats = useCallback(async () => {
    try {
      const [memoryStats, path] = await Promise.all([
        window.loreAPI.getMemoryStats(),
        window.loreAPI.getMemoryDbPath(),
      ])
      setStats(memoryStats)
      setDbPath(path)
    } catch {
      setStats({ connected: false, totalDocuments: 0, deletedDocuments: 0, lastUpdated: null })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshStats()

    const interval = setInterval(refreshStats, 30000)
    return () => clearInterval(interval)
  }, [refreshStats])

  // [MemorySettings] Sync local path state with settings
  useEffect(() => {
    setLocalDbPath(settings.memorySettings.dbPath)
  }, [settings.memorySettings.dbPath])

  // [MemorySettings] Handle toggle button click - enable directly, disable with warning
  const handleToggleEnabled = (enabled: boolean) => {
    if (enabled && !settings.memorySettings.enabled) {
      // Enabling: save immediately
      onUpdate({ memorySettings: { ...settings.memorySettings, enabled: true } })
    } else if (!enabled && settings.memorySettings.enabled) {
      // Disabling: show warning dialog first
      setPendingToggle(false)
      setShowDisableWarning(true)
    }
  }

  // [MemorySettings] Confirm disable after warning dialog
  const confirmToggle = () => {
    onUpdate({ memorySettings: { ...settings.memorySettings, enabled: pendingToggle ?? true } })
    setShowDisableWarning(false)
    setPendingToggle(null)
  }

  // [MemorySettings] Open folder picker for custom DB path
  const handleBrowse = async () => {
    const folder = await window.loreAPI.pickMemoryFolder()
    if (folder) {
      setLocalDbPath(folder)
      onUpdate({ memorySettings: { ...settings.memorySettings, dbPath: folder } })
    }
  }

  const handleResetPath = () => {
    setLocalDbPath('')
    onUpdate({ memorySettings: { ...settings.memorySettings, dbPath: '' } })
  }

  const handleCompact = async () => {
    try {
      await window.loreAPI.getDbStats()
      refreshStats()
    } catch {
      // Handle error
    }
  }

  const handleReset = async () => {
    try {
      await window.loreAPI.getDbStats()
      refreshStats()
    } catch {
      // Handle error
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Memory</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure your local memory database settings.
        </p>
      </div>

      {/* [MemorySettings] Enable/Disable Toggle */}
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Memory Storage</p>
            <p className="text-xs text-muted-foreground">
              {settings.memorySettings.enabled
                ? 'New thoughts are being stored in your memory database.'
                : 'Memory storage is disabled. New thoughts will not be stored.'}
            </p>
          </div>
          <button
            onClick={() => handleToggleEnabled(!settings.memorySettings.enabled)}
            className={`relative h-6 w-11 rounded-full transition-colors ${settings.memorySettings.enabled ? 'bg-primary' : 'bg-secondary'
              }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white transition-transform ${settings.memorySettings.enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
            />
          </button>
        </div>
      </div>

      {/* Provider */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Memory Provider</label>
        <select
          value={settings.memorySettings.provider}
          onChange={(e) => {
            const provider = e.target.value as 'lancedb' | 'mem0'
            onUpdate({ memorySettings: { ...settings.memorySettings, provider } })
          }}
          className="max-w-xs rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          <option value="lancedb">LanceDB — Traditional vector search</option>
          <option value="mem0">Mem0 — Smart memory layer (beta)</option>
        </select>
        <p className="text-xs text-muted-foreground">
          {settings.memorySettings.provider === 'mem0'
            ? 'AI-powered memory extraction and consolidation.'
            : 'Direct vector similarity search.'}
        </p>
      </div>

      {/* [MemorySettings] Database Path configuration - LanceDB only */}
      {settings.memorySettings.provider === 'lancedb' && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Database Path</label>
          <div className="flex gap-2">
            <div className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground truncate font-mono">
              {localDbPath || dbPath || 'Default (userData/lore-db)'}
            </div>
            <Button variant="outline" size="sm" onClick={handleBrowse}>
              <FolderOpen className="size-4" />
              Browse
            </Button>
            {localDbPath && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetPath}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="size-4" />
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Where your memory data is stored. Leave empty to use the default location.
          </p>
        </div>
      )}

      {/* [MemorySettings] Status section - shows connection and stats */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">
          {settings.memorySettings.provider === 'mem0' ? 'Mem0 Status' : 'Status'}
        </p>

        {loading ? (
          <p className="text-xs text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span
                className={`size-2 rounded-full ${stats?.connected ? 'bg-emerald-500' : 'bg-red-500'}`}
              />
              <span>Connection: {stats?.connected ? 'Connected' : 'Not connected'}</span>
            </div>
            <p>{settings.memorySettings.provider === 'mem0' ? 'Total Memories' : 'Total Documents'}: {stats?.totalDocuments ?? 0}</p>
            {settings.memorySettings.provider === 'lancedb' && (
              <p>Last Updated: {formatRelativeTime(stats?.lastUpdated ?? null)}</p>
            )}
          </div>
        )}

        <Button variant="outline" size="sm" onClick={refreshStats} className="mt-2">
          <RefreshCw className="size-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* [MemorySettings] Action buttons - provider specific */}
      {settings.memorySettings.provider === 'mem0' ? (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.loreAPI.getMemoryStats()}>
            <Database className="size-4 mr-1" />
            View All Memories
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={async () => {
              const confirmed = confirm('Are you sure you want to delete all memories? This cannot be undone.')
              if (confirmed) {
                await window.loreAPI.deleteAllMemories()
                await refreshStats()
              }
            }}
          >
            <RotateCcw className="size-4 mr-1" />
            Clear All Memories
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCompact}>
            <Database className="size-4 mr-1" />
            Compact Database
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="size-4 mr-1" />
            Reset Database
          </Button>
        </div>
      )}

      {/* Disable Warning Dialog */}
      <Dialog open={showDisableWarning} onOpenChange={setShowDisableWarning}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              Disable Memory Storage?
            </DialogTitle>
            <DialogDescription>
              Turning off memory storage will stop storing new thoughts in your local database.
              <span className="mt-2 block font-medium text-foreground">
                Your existing memories will still be available for retrieval.
              </span>
              <span className="mt-1 block text-muted-foreground">
                You can re-enable storage at any time to start saving thoughts again.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDisableWarning(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmToggle}>
              Disable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
