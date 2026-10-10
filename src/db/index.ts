import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const isValidPostgresUrl = Boolean(
  databaseUrl && (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://"))
);

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: any;
};

function createMockChain(resolvedValue: any = []) {
  const target: any = () => createMockChain(resolvedValue);
  const promise = Promise.resolve(resolvedValue);
  const proxy: any = new Proxy(target, {
    get(_, prop) {
      if (prop === "then") return promise.then.bind(promise);
      if (prop === "catch") return promise.catch.bind(promise);
      if (prop === "finally") return promise.finally.bind(promise);
      return () => proxy;
    },
    apply() {
      return proxy;
    },
  });
  return proxy;
}

const mockDbQuery = {
  findMany: async () => [],
  findFirst: async () => null,
  findUnique: async () => null,
  create: async (d: any) => d?.data ?? {},
  update: async (d: any) => d?.data ?? {},
  delete: async () => ({}),
};

const createMockDb = () =>
  new Proxy(
    {},
    {
      get: (_, prop) => {
        if (prop === "query") return new Proxy({}, { get: () => mockDbQuery });
        if (prop === "select" || prop === "update" || prop === "delete") {
          return () => createMockChain([]);
        }
        if (prop === "insert") {
          return () => createMockChain([{ id: Math.floor(Math.random() * 100000) + 1 }]);
        }
        if (prop === "execute") {
          return async () => ({ rows: [] });
        }
        if (prop === "transaction") {
          return async (fn: any) => fn(createMockDb());
        }
        return async () => [];
      },
    }
  );

let pool: Pool;
let db: NodePgDatabase<any>;

if (isValidPostgresUrl && databaseUrl) {
  try {
    pool =
      globalForDb.__arenaNextJsPostgresqlPool ??
      new Pool({
        connectionString: databaseUrl,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

    pool.on("error", (err) => {
      console.warn("[AI Studio] Background pool connection error:", err.message);
    });

    if (process.env.NODE_ENV !== "production") {
      globalForDb.__arenaNextJsPostgresqlPool = pool;
    }

    db = drizzle(pool);
  } catch (e) {
    console.warn("[AI Studio] Database connection error — using mock:", e);
    pool = {
      query: async () => ({ rows: [] }),
      connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
      end: async () => {},
    } as unknown as Pool;
    db = createMockDb() as unknown as NodePgDatabase<any>;
  }
} else {
  console.warn("[AI Studio] Valid PostgreSQL DATABASE_URL not set — using mock database");
  pool = {
    query: async () => ({ rows: [] }),
    connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
    end: async () => {},
  } as unknown as Pool;
  db = createMockDb() as unknown as NodePgDatabase<any>;
}

export { pool, db };

// Background init — fire and forget, non-blocking
if (isValidPostgresUrl && databaseUrl) {
  import("./init-db")
    .then((mod) => mod.ensureDatabaseInitialized())
    .catch((err) => console.error("Auto DB init error:", err));
}
