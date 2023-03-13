import createConnectionPool, { sql } from '@databases/pg'
import { on } from 'events'

const db = createConnectionPool(
  'postgres://postgres:postgres@127.0.0.1:5432/postgres'
)

console.log(process.pid)

await db.task(async (t) => {
  await t.query(sql`
   LISTEN "messages";
  `)
  for await (const notification of on(t._driver.client, 'notification')) {
    console.log(notification)
  }
})
