import { errorResponse, json } from '../../_auth';
import { requirePermission } from '../../_permissions';

const ISSUE_CODES = ['NOT_FOUND', 'WRONG_LOCATION', 'WRONG_QR', 'WRONG_STATUS', 'MISSING', 'OTHER'] as const;

type IssueCode = (typeof ISSUE_CODES)[number];

function emptyBreakdown(): Record<IssueCode, number> {
  return {
    NOT_FOUND: 0,
    WRONG_LOCATION: 0,
    WRONG_QR: 0,
    WRONG_STATUS: 0,
    MISSING: 0,
    OTHER: 0,
  };
}

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requirePermission(env, request, 'stocktake_apply', 'viewer');
    const rows = await env.DB.prepare(`
      SELECT issue_type, COUNT(*) AS total
      FROM pc_inventory_log
      WHERE action='ISSUE'
      GROUP BY issue_type
    `).all<any>();
    const breakdown = emptyBreakdown();
    for (const row of Array.isArray(rows?.results) ? rows.results : []) {
      const code = String(row?.issue_type || '').toUpperCase() as IssueCode;
      if (Object.prototype.hasOwnProperty.call(breakdown, code)) breakdown[code] = Number(row?.total || 0);
    }
    return json(true, breakdown);
  } catch (e: any) {
    return errorResponse(e);
  }
};
