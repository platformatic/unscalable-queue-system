import createConnectionPool, { sql } from '@databases/pg'
import { setTimeout as sleep } from 'timers/promises'

const db = createConnectionPool(
  'postgres://postgres:postgres@127.0.0.1:5432/postgres'
)

console.log(process.pid)

const results = await db.query(sql`
  NOTIFY "messages";
`)

console.log(results)
await sleep(6000)
