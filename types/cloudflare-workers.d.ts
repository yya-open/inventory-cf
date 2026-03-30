declare interface D1Result<T = Record<string, unknown>> { results?: T[]; success?: boolean; meta?: Record<string, unknown>; }
declare interface D1PreparedStatement { bind(...values: unknown[]): D1PreparedStatement; first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>; all<T = Record<string, unknown>>(): Promise<D1Result<T>>; run<T = Record<string, unknown>>(): Promise<D1Result<T>>; raw<T = unknown[]>(): Promise<T[]>; }
declare interface D1Database { prepare(query: string): D1PreparedStatement; batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<Array<D1Result<T>>>; exec(query: string): Promise<unknown>; }
declare type EventContext<Env = Record<string, unknown>> = { env: Env; request: Request; waitUntil: (promise: Promise<unknown>) => void; next: () => Promise<Response>; data: Record<string, unknown>; params: Record<string, string>; functionPath: string; };
declare type PagesFunction<Env = Record<string, unknown>> = (context: EventContext<Env>) => Response | Promise<Response>;

declare interface ExecutionContext { waitUntil(promise: Promise<unknown>): void; }
declare interface ScheduledController { cron: string; scheduledTime: number; }
declare interface Queue<T = unknown> { send(body: T): Promise<void>; sendBatch?(messages: Array<{ body: T }>): Promise<Array<{ ok?: boolean; error?: unknown }> | void>; }
