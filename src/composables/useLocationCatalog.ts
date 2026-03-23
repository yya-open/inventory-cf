import { readonly, ref } from 'vue';
import { listAllLocations, listEnabledLocations } from '../api/assetLedgers';
import type { LocationRow } from '../types/assets';

const enabledLocationsState = ref<LocationRow[]>([]);
const allLocationsState = ref<LocationRow[]>([]);
let enabledPromise: Promise<LocationRow[]> | null = null;
let allPromise: Promise<LocationRow[]> | null = null;

async function ensureEnabledLocations(force = false) {
  if (!force && enabledLocationsState.value.length) return enabledLocationsState.value;
  if (!force && enabledPromise) return enabledPromise;
  enabledPromise = listEnabledLocations()
    .then((rows) => {
      enabledLocationsState.value = rows;
      return rows;
    })
    .finally(() => {
      enabledPromise = null;
    });
  return enabledPromise;
}

async function ensureAllLocations(force = false) {
  if (!force && allLocationsState.value.length) return allLocationsState.value;
  if (!force && allPromise) return allPromise;
  allPromise = listAllLocations()
    .then((rows) => {
      allLocationsState.value = rows;
      enabledLocationsState.value = rows.filter((row) => Number(row.enabled || 0) === 1);
      return rows;
    })
    .finally(() => {
      allPromise = null;
    });
  return allPromise;
}

function resetLocationCatalog() {
  enabledLocationsState.value = [];
  allLocationsState.value = [];
}

export function useLocationCatalog() {
  return {
    enabledLocations: readonly(enabledLocationsState),
    allLocations: readonly(allLocationsState),
    ensureEnabledLocations,
    ensureAllLocations,
    resetLocationCatalog,
  };
}
