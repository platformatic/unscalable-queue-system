import createConnectionPool, { sql } from '@databases/pg'
import { setTimeout as sleep } from 'timers/promises'

// 673 - "outbox" charCodeAt summed up
let n = 0
for (const c of 'outbox') {
  n += c.charCodeAt(0)
}

const db = createConnectionPool(
  'postgres://postgres:postgres@127.0.0.1:5432/postgres'
)

console.log(process.pid)

while (true) {
  const results = await db.query(sql`
    SELECT pg_try_advisory_lock(${n}) as result;
  `)

  console.log(results)
  await sleep(1000)
}

// await db.dispose()
