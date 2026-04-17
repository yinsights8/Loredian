export {
  getEmbeddingDimension,
  embedText,
  embedTexts,
} from './embeddingService'

export {
  storeThought,
  storeThoughtWithMetadata,
  checkForDuplicate,
  retrieveRelevantDocuments,
  retrieveWithAdaptiveThreshold,
  retrieveObsidianByTitleCandidates,
  mergeRetrievedDocumentSets,
  retrieveByFilters,
  multiQueryRetrieve,
  getDocumentCount,
} from './documentPipeline'

export {
  initialize,
  resetTable,
  insertDocument,
  insertDocuments,
  updateDocument,
  softDeleteDocument,
  hardDeleteDocument,
  hardDeleteDocuments,
  searchSimilar,
  getDocumentById,
  getDocumentsByType,
  getDocumentsByDateRange,
  getDocumentsByFilter,
  getAllDocuments,
  cleanupOldDeleted,
  getStats,
  compactTable,
  getDbPath,
  getLastUpdated,
} from './lanceService'