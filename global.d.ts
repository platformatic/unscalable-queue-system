import type { PlatformaticApp, PlatformaticDBMixin, PlatformaticDBConfig, Entity, Entities, EntityHooks } from '@platformatic/db'
import { EntityTypes, Cron,Message,Page,Queue } from './types'

declare module 'fastify' {
  interface FastifyInstance {
    getSchema<T extends 'Cron' | 'Message' | 'Page' | 'Queue'>(schemaId: T): {
      '$id': string,
      title: string,
      description: string,
      type: string,
      properties: {
        [x in keyof EntityTypes[T]]: { type: string, nullable?: boolean }
      },
      required: string[]
    };
  }
}

interface AppEntities extends Entities {
  cron: Entity<Cron>,
    message: Entity<Message>,
    page: Entity<Page>,
    queue: Entity<Queue>,
}

interface AppEntityHooks {
  addEntityHooks(entityName: 'cron', hooks: EntityHooks<Cron>): any
    addEntityHooks(entityName: 'message', hooks: EntityHooks<Message>): any
    addEntityHooks(entityName: 'page', hooks: EntityHooks<Page>): any
    addEntityHooks(entityName: 'queue', hooks: EntityHooks<Queue>): any
}

declare module 'fastify' {
  interface FastifyInstance {
    platformatic: PlatformaticApp<PlatformaticDBConfig> &
      PlatformaticDBMixin<AppEntities> &
      AppEntityHooks
  }
}
