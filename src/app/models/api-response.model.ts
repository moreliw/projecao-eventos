import { Cycle } from './cycle.model';
import { EventProjection } from './event-projection.model';

export interface ApiResponse {
  eventsProjection: EventProjection[];
  cycles: Cycle[];
}
