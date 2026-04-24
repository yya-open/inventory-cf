# API Error Codes

This file defines stable backend `error_code` values returned in failure envelopes.

## Envelope format

All API failures should follow this shape:

```json
{
  "ok": false,
  "data": null,
  "message": "human readable message",
  "error_code": "MACHINE_READABLE_CODE",
  "meta": {}
}
```

## Scope and authorization

- `SCOPE_DEPARTMENT_DENIED` (403): User data scope does not include target department.
- `SCOPE_WAREHOUSE_DENIED` (403): User data scope does not include target warehouse.
- `SCOPE_PARTS_WAREHOUSE_DENIED` (403): User cannot access requested parts warehouse.

## Common write errors

- `INVALID_PARAMS` (400): Request parameters are invalid or missing required values.
- `WRITE_CONFLICT` (409): Concurrent write conflict; caller should retry.

## Stock in/out

- `STOCK_IN_FAILED` (500): Stock-in operation did not finalize as expected.
- `INSUFFICIENT_STOCK` (409): Stock-out blocked due to insufficient available quantity.

## Stocktake

- `MISSING_STOCKTAKE_ID` (400): Missing stocktake id.
- `STOCKTAKE_NOT_FOUND` (404): Stocktake record not found.
- `STOCKTAKE_ALREADY_APPLIED` (409): Stocktake already applied.
- `STOCKTAKE_INVALID_STATUS` (409): Status does not allow this action.
- `STOCKTAKE_STATUS_CHANGED` (409): Status changed concurrently; refresh and retry.
- `STOCKTAKE_APPLY_NOT_FINALIZED` (409): Apply flow did not reach final APPLIED state.
- `STOCKTAKE_NOT_DRAFT` (400): Operation requires DRAFT stocktake.
- `STOCKTAKE_NOT_APPLIED` (400): Rollback requires APPLIED or ROLLING stocktake.
- `EMPTY_IMPORT_LINES` (400): Import payload has no lines.
- `EMPTY_SKU` (400): Import lines did not provide valid SKU values.

## User management

- `USER_USERNAME_REQUIRED` (400): Username is required when creating user.
- `USER_PASSWORD_POLICY_INVALID` (400): Password does not meet policy.
- `USER_ROLE_INVALID` (400): Role is invalid.
- `USERNAME_ALREADY_EXISTS` (400): Username already exists.
- `USER_ID_INVALID` (400): User id is missing or invalid.
- `USER_NOT_FOUND` (404): Target user does not exist.
- `USER_SELF_DISABLE_FORBIDDEN` (400): Current user cannot disable itself.
- `USER_SELF_DELETE_FORBIDDEN` (400): Current user cannot delete itself.
- `USER_LAST_ADMIN_REQUIRED` (400): At least one active admin must remain.

## Backup and restore job

- `BACKUP_BUCKET_NOT_BOUND` (500): R2 backup bucket binding is missing.
- `RESTORE_MULTIPART_REQUIRED` (400): Restore upload requires multipart/form-data.
- `RESTORE_CONFIRM_INVALID` (400): Restore confirm text mismatch.
- `RESTORE_FILE_MISSING` (400): Restore file is missing.
- `RESTORE_JOB_ID_REQUIRED` (400): Restore job id is required.
- `RESTORE_JOB_NOT_FOUND` (404): Restore job not found.
- `RESTORE_SNAPSHOT_FAILED` (500): Pre-restore snapshot failed.
- `RESTORE_R2_FILE_MISSING` (500): Restore source object missing in R2.
- `BACKUP_VALIDATE_FAILED` (400): Backup validation failed.
- `RESTORE_RUN_FAILED` (500): Restore execution failed.

## Frontend usage

Use the helper in `src/api/client.ts`:

```ts
import { isApiErrorCode } from '@/api/client';

try {
  await doRequest();
} catch (e) {
  if (isApiErrorCode(e, 'WRITE_CONFLICT')) {
    // show retry-oriented guidance
  }
}
```
