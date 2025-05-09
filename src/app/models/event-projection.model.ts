export interface EventCounts {
  meetings: number;
  emails: number;
  calls: number;
  follows: number;
}

export interface EventProjection {
  day: number;
  events: EventCounts;
}
