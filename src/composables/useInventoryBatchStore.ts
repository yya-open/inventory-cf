import { ref, computed, type Ref } from 'vue';
import { fetchInventoryBatch, normalizeInventoryBatchPayload, type InventoryBatchKind, type InventoryBatchPayload } from '../api/inventoryBatches';

type BatchStoreState = {
  payload: Ref<InventoryBatchPayload>;
  loading: Ref<boolean>;
  error: Ref<unknown | null>;
  lastLoadedAt: Ref<number>;
  inFlight: Promise<InventoryBatchPayload> | null;
};

const storeMap = new Map<InventoryBatchKind, BatchStoreState>();

function createInitialPayload(): InventoryBatchPayload {
  return { active: null, latest: null, recent: [] };
}

function ensureStore(kind: InventoryBatchKind): BatchStoreState {
  let state = storeMap.get(kind);
  if (state) return state;
  state = {
    payload: ref<InventoryBatchPayload>(createInitialPayload()),
    loading: ref(false),
    error: ref<unknown | null>(null),
    lastLoadedAt: ref(0),
    inFlight: null,
  };
  storeMap.set(kind, state);
  return state;
}

export function useInventoryBatchStore(kind: InventoryBatchKind) {
  const state = ensureStore(kind);

  async function refresh(options: { force?: boolean; silent?: boolean; ttlMs?: number } = {}) {
    const ttlMs = Number(options.ttlMs ?? 10_000);
    const now = Date.now();
    const payload = state.payload.value;
    const hasData = Boolean(payload.active || payload.latest || (payload.recent || []).length);
    if (!options.force && state.inFlight) return state.inFlight;
    if (!options.force && hasData && now - Number(state.lastLoadedAt.value || 0) < ttlMs) {
      return state.payload.value;
    }
    if (!options.silent) state.loading.value = true;
    const request = fetchInventoryBatch(kind)
      .then((next) => {
        state.payload.value = normalizeInventoryBatchPayload(next);
        state.error.value = null;
        state.lastLoadedAt.value = Date.now();
        return state.payload.value;
      })
      .catch((error) => {
        state.error.value = error;
        throw error;
      })
      .finally(() => {
        if (state.inFlight === request) state.inFlight = null;
        if (!options.silent) state.loading.value = false;
      });
    state.inFlight = request;
    return request;
  }

  function applyPayload(next: Partial<InventoryBatchPayload> | InventoryBatchPayload | null | undefined) {
    state.payload.value = normalizeInventoryBatchPayload(next as InventoryBatchPayload);
    state.error.value = null;
    state.lastLoadedAt.value = Date.now();
  }

  function invalidate() {
    state.lastLoadedAt.value = 0;
  }

  return {
    payload: state.payload,
    loading: state.loading,
    error: state.error,
    lastLoadedAt: computed(() => state.lastLoadedAt.value),
    refresh,
    applyPayload,
    invalidate,
  };
}
