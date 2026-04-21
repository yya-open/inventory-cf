import { readonly, ref } from 'vue';
import { invalidateLocationListCache, listAllLocations, listEnabledLocations } from '../api/assetLedgers';
import type { LocationRow } from '../types/assets';
import { readJsonStorage, writeJsonStorage } from '../utils/storage';

type CachedLocationPayload = {
  rows: LocationRow[];
  fetchedAt: number;
};

const ENABLED_CACHE_KEY = 'inventory:monitor-location-catalog:enabled';
const ALL_CACHE_KEY = 'inventory:monitor-location-catalog:all';
const LOCATION_CACHE_TTL_MS = 5 * 60 * 1000;

const cachedEnabled = readCache(ENABLED_CACHE_KEY);
const cachedAll = readCache(ALL_CACHE_KEY);

const enabledLocationsState = ref<LocationRow[]>(cachedEnabled.rows);
const allLocationsState = ref<LocationRow[]>(cachedAll.rows);
const enabledFetchedAtState = ref(Number(cachedEnabled.fetchedAt || 0));
const allFetchedAtState = ref(Number(cachedAll.fetchedAt || 0));
let enabledPromise: Promise<LocationRow[]> | null = null;
let allPromise: Promise<LocationRow[]> | null = null;

function normalizeRows(rows: LocationRow[]) {
  return Array.isArray(rows)
    ? rows.map((row) => ({
        ...row,
        id: Number(row.id),
        parent_id: row.parent_id == null ? null : Number(row.parent_id),
        enabled: Number(row.enabled || 0),
      }))
    : [];
}

function readCache(key: string): CachedLocationPayload {
  const payload = readJsonStorage<CachedLocationPayload | null>(key, null);
  if (!payload || !Array.isArray(payload.rows)) return { rows: [], fetchedAt: 0 };
  return {
    rows: normalizeRows(payload.rows),
    fetchedAt: Number(payload.fetchedAt || 0),
  };
}

function writeCache(key: string, rows: LocationRow[], fetchedAt: number) {
  writeJsonStorage<CachedLocationPayload>(key, {
    rows: normalizeRows(rows),
    fetchedAt: Number(fetchedAt || Date.now()),
  });
}

function isFresh(fetchedAt: number) {
  return !!fetchedAt && Date.now() - fetchedAt < LOCATION_CACHE_TTL_MS;
}

function syncEnabledRows(rows: LocationRow[], fetchedAt = Date.now()) {
  const normalized = normalizeRows(rows);
  enabledLocationsState.value = normalized;
  enabledFetchedAtState.value = fetchedAt;
  writeCache(ENABLED_CACHE_KEY, normalized, fetchedAt);
}

function syncAllRows(rows: LocationRow[], fetchedAt = Date.now()) {
  const normalized = normalizeRows(rows);
  allLocationsState.value = normalized;
  allFetchedAtState.value = fetchedAt;
  writeCache(ALL_CACHE_KEY, normalized, fetchedAt);
  syncEnabledRows(normalized.filter((row) => Number(row.enabled || 0) === 1), fetchedAt);
}

async function refreshEnabledLocations(force = false) {
  if (!force && enabledPromise) return enabledPromise;
  enabledPromise = listEnabledLocations(undefined, { force })
    .then((rows) => {
      syncEnabledRows(rows, Date.now());
      return enabledLocationsState.value;
    })
    .finally(() => {
      enabledPromise = null;
    });
  return enabledPromise;
}

async function refreshAllLocations(force = false) {
  if (!force && allPromise) return allPromise;
  allPromise = listAllLocations(undefined, { force })
    .then((rows) => {
      syncAllRows(rows, Date.now());
      return allLocationsState.value;
    })
    .finally(() => {
      allPromise = null;
    });
  return allPromise;
}

async function ensureEnabledLocations(force = false) {
  if (force) return refreshEnabledLocations(true);
  if (!enabledLocationsState.value.length) {
    if (allLocationsState.value.length && isFresh(allFetchedAtState.value)) {
      syncEnabledRows(allLocationsState.value.filter((row) => Number(row.enabled || 0) === 1), allFetchedAtState.value);
      return enabledLocationsState.value;
    }
    return refreshEnabledLocations(true);
  }
  if (isFresh(enabledFetchedAtState.value)) return enabledLocationsState.value;
  if (allLocationsState.value.length && isFresh(allFetchedAtState.value) && allFetchedAtState.value >= enabledFetchedAtState.value) {
    syncEnabledRows(allLocationsState.value.filter((row) => Number(row.enabled || 0) === 1), allFetchedAtState.value);
    return enabledLocationsState.value;
  }
  void refreshEnabledLocations().catch(() => undefined);
  return enabledLocationsState.value;
}

async function ensureAllLocations(force = false) {
  if (force) return refreshAllLocations(true);
  if (!allLocationsState.value.length) return refreshAllLocations(true);
  if (isFresh(allFetchedAtState.value)) return allLocationsState.value;
  void refreshAllLocations(true).catch(() => undefined);
  return allLocationsState.value;
}

function invalidateLocationCatalog() {
  enabledFetchedAtState.value = 0;
  allFetchedAtState.value = 0;
  invalidateLocationListCache();
}

function resetLocationCatalog() {
  enabledLocationsState.value = [];
  allLocationsState.value = [];
  enabledFetchedAtState.value = 0;
  allFetchedAtState.value = 0;
  writeCache(ENABLED_CACHE_KEY, [], 0);
  writeCache(ALL_CACHE_KEY, [], 0);
}

export function useLocationCatalog() {
  return {
    enabledLocations: readonly(enabledLocationsState),
    allLocations: readonly(allLocationsState),
    enabledLocationsFetchedAt: readonly(enabledFetchedAtState),
    allLocationsFetchedAt: readonly(allFetchedAtState),
    ensureEnabledLocations,
    ensureAllLocations,
    invalidateLocationCatalog,
    resetLocationCatalog,
  };
}
