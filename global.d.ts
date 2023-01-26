import { Entity } from '@platformatic/sql-mapper';
import graphqlPlugin from '@platformatic/sql-graphql'
import { Queue } from './types/Queue'
import { Message } from './types/Message'
import { Cron } from './types/Cron'

declare module '@platformatic/sql-mapper' {
  interface Entities {
    queue: Entity<Queue>,
    message: Entity<Message>,
    cron: Entity<Cron>,
  }
}
