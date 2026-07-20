import { apiGet, apiPost, apiPut } from './client';

export type DataQualityCase = {
  id: number;
  issue_key: string;
  severity: 'error' | 'warn';
  source_table?: string | null;
  title: string;
  detail?: string | null;
  affected_count: number;
  status: 'open' | 'in_progress' | 'ignored' | 'resolved';
  owner?: string | null;
  due_at?: string | null;
  note?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  resolved_at?: string | null;
  sample?: any[];
};

export function listDataQualityCases(status = '') {
  const qs = new URLSearchParams({ limit: '100' });
  if (status) qs.set('status', status);
  return apiGet<{ ok: boolean; data: DataQualityCase[] }>(`/api/data-quality?${qs}`);
}

export function scanDataQualityCases() {
  return apiPost<{ ok: boolean; data: { issue_count: number; scanned_cases: number } }>('/api/data-quality', {});
}

export function updateDataQualityCase(input: Partial<DataQualityCase> & { id: number }) {
  return apiPut<{ ok: boolean; data: DataQualityCase }>('/api/data-quality', input);
}
