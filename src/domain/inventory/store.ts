import { computed, ref, type Ref } from 'vue';
import { fetchInventoryBatch, normalizeInventoryBatchPayload, type InventoryBatchKind, type InventoryBatchPayload } from '../../api/inventoryBatches';

export type InventoryBatchStoreStatus = 'idle' | 'loading' | 'ready' | 'refreshing' | 'error';

type BatchStoreState = {
  payload: Ref<InventoryBatchPayload>;
  status: Ref<InventoryBatchStoreStatus>;
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
    status: ref<InventoryBatchStoreStatus>('idle'),
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
    const ttlMs = Number(options.ttlMs ?? 5 * 60_000);
    const now = Date.now();
    const payload = state.payload.value;
    const hasData = Boolean(payload.active || payload.latest || (payload.recent || []).length);
    if (!options.force && state.inFlight) return state.inFlight;
    if (!options.force && hasData && now - Number(state.lastLoadedAt.value || 0) < ttlMs) {
      return state.payload.value;
    }
    state.status.value = options.silent && hasData ? 'refreshing' : 'loading';
    const request = fetchInventoryBatch(kind, { force: options.force })
      .then((next) => {
        state.payload.value = normalizeInventoryBatchPayload(next);
        state.error.value = null;
        state.lastLoadedAt.value = Date.now();
        state.status.value = 'ready';
        return state.payload.value;
      })
      .catch((error) => {
        state.error.value = error;
        state.status.value = 'error';
        throw error;
      })
      .finally(() => {
        if (state.inFlight === request) state.inFlight = null;
      });
    state.inFlight = request;
    return request;
  }

  function applyPayload(next: Partial<InventoryBatchPayload> | InventoryBatchPayload | null | undefined) {
    state.payload.value = normalizeInventoryBatchPayload(next as InventoryBatchPayload);
    state.error.value = null;
    state.lastLoadedAt.value = Date.now();
    state.status.value = 'ready';
  }

  function invalidate() {
    state.lastLoadedAt.value = 0;
    if (state.status.value === 'ready') state.status.value = 'idle';
  }

  function reset() {
    state.payload.value = createInitialPayload();
    state.error.value = null;
    state.lastLoadedAt.value = 0;
    state.status.value = 'idle';
    state.inFlight = null;
  }

  return {
    payload: state.payload,
    status: state.status,
    loading: computed(() => state.status.value === 'loading' || state.status.value === 'refreshing'),
    error: state.error,
    lastLoadedAt: computed(() => state.lastLoadedAt.value),
    refresh,
    applyPayload,
    invalidate,
    reset,
  };
}
