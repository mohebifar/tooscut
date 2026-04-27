import postgres from "postgres";

function createClients() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!process.env.DATABASE_RO_URL) {
    throw new Error("DATABASE_RO_URL is not set");
  }

  const write = postgres(process.env.DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  const read = postgres(process.env.DATABASE_RO_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  return { write, read };
}

const clients = createClients();

export const db = clients.write;
export const dbRead = clients.read;
