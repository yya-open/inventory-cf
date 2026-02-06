// functions/api/_auth.ts
// NOTE:
// Some API handlers live under nested folders like `functions/api/stocktake/*` and
// import auth helpers with `../_auth` (which resolves to this file).
//
// The project already has a single source of truth at `functions/_auth.ts` which
// is used by the login/me endpoints and defines the JWT payload format.
//
// To avoid JWT payload mismatches (leading to 401 on nested routes), this file
// simply re-exports the shared helpers from `functions/_auth.ts`.

export * from "../_auth";
