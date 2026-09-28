export {
  EVENT_DEFINITIONS,
  EVENT_TYPES,
  PLATFORM_EVENT_TYPES,
  WEBHOOK_EVENT_TYPES,
  isEventType,
  isPlatformEvent,
  parsePayload,
  type DomainEvent,
  type EventPayload,
  type EventType,
} from './catalog.js';
export { appendEvent, toDomainEvent, type NewEvent } from './outbox.js';
