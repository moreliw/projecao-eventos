export type Priority = "HIGH" | "MEDIUM" | "LOW";

export interface CycleStructure {
  day: number;
  meetings: number;
  emails: number;
  calls: number;
  follows: number;
}

export interface Cycle {
  name: string;
  availableEntities: number;
  priority: Priority;
  structure: CycleStructure[];
}
