import { Cron } from './Cron'
import { Message } from './Message'
import { Page } from './Page'
import { Queue } from './Queue'
  
interface EntityTypes  {
  Cron: Cron
    Message: Message
    Page: Page
    Queue: Queue
}
  
export { EntityTypes, Cron, Message, Page, Queue }