import { Injectable, inject, signal, Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import {
  Observable,
  catchError,
  finalize,
  map,
  of,
  shareReplay,
  BehaviorSubject,
} from 'rxjs';

import { ApiResponse } from '../models/api-response.model';
import { Cycle, Priority } from '../models/cycle.model';
import { EventProjection } from '../models/event-projection.model';

@Injectable({ providedIn: 'root' })
export class EventProjectionService {
  private readonly PRIMARY_API_URL =
    'assets/mock-data/events-api-response.json';
  private readonly FALLBACK_API_URL = 'assets/data/events-api-response.json';

  private readonly http = inject(HttpClient);
  private readonly injector = inject(Injector);

  private readonly dataSubject = new BehaviorSubject<ApiResponse | null>(null);
  readonly loading = signal<boolean>(true);

  readonly cycles = toSignal(
    this.dataSubject.asObservable().pipe(
      map((data) => this.extractAndSortCycles(data)),
      shareReplay(1)
    ),
    { initialValue: [] as Cycle[] }
  );

  readonly eventsProjection = toSignal(
    this.dataSubject.asObservable().pipe(
      map((data) => this.extractEventsProjection(data)),
      shareReplay(1)
    ),
    { initialValue: [] as EventProjection[] }
  );

  constructor() {
    this.loadData();
  }

  private loadData(): void {
    this.loading.set(true);

    this.http
      .get<ApiResponse>(this.PRIMARY_API_URL)
      .pipe(
        catchError(() => this.loadFallbackData()),
        finalize(() => this.loading.set(false))
      )
      .subscribe({
        next: (data) => {
          this.dataSubject.next(data);
        },
        error: () => {
          this.dataSubject.next(this.getEmptyApiResponse());
        },
      });
  }

  private loadFallbackData(): Observable<ApiResponse> {
    return this.http
      .get<ApiResponse>(this.FALLBACK_API_URL)
      .pipe(catchError(() => of(this.getEmptyApiResponse())));
  }

  private getEmptyApiResponse(): ApiResponse {
    return {
      eventsProjection: [
        {
          day: 1,
          events: { meetings: 0, emails: 0, calls: 0, follows: 0 },
        },
        {
          day: 2,
          events: { meetings: 0, emails: 0, calls: 0, follows: 0 },
        },
        {
          day: 3,
          events: { meetings: 0, emails: 0, calls: 0, follows: 0 },
        },
        {
          day: 4,
          events: { meetings: 0, emails: 0, calls: 0, follows: 0 },
        },
        {
          day: 5,
          events: { meetings: 0, emails: 0, calls: 0, follows: 0 },
        },
      ],
      cycles: [
        {
          name: 'Ciclo padrão',
          availableEntities: 1,
          priority: 'HIGH',
          structure: [
            { day: 1, meetings: 0, emails: 0, calls: 0, follows: 0 },
            { day: 2, meetings: 0, emails: 0, calls: 0, follows: 0 },
            { day: 3, meetings: 0, emails: 0, calls: 0, follows: 0 },
            { day: 4, meetings: 0, emails: 0, calls: 0, follows: 0 },
            { day: 5, meetings: 0, emails: 0, calls: 0, follows: 0 },
          ],
        },
      ],
    };
  }

  private extractAndSortCycles(data: ApiResponse | null): Cycle[] {
    if (!data) return [];

    return [...data.cycles].sort(
      (a, b) =>
        this.getPriorityOrder(a.priority) - this.getPriorityOrder(b.priority)
    );
  }

  private extractEventsProjection(data: ApiResponse | null): EventProjection[] {
    return data?.eventsProjection || [];
  }

  public getCycles(): Observable<Cycle[]> {
    return this.dataSubject.asObservable().pipe(
      map((data) => this.extractAndSortCycles(data)),
      shareReplay(1)
    );
  }

  public getEventsProjection(): Observable<EventProjection[]> {
    return this.dataSubject.asObservable().pipe(
      map((data) => this.extractEventsProjection(data)),
      shareReplay(1)
    );
  }

  public getLoading(): Observable<boolean> {
    return toObservable(this.loading);
  }

  private getPriorityOrder(priority: Priority): number {
    const priorityMap: Record<Priority, number> = {
      HIGH: 0,
      MEDIUM: 1,
      LOW: 2,
      NEUTRAL: 3,
    };

    return priorityMap[priority];
  }

  public distributeEntities(total: number, cycles: Cycle[]): number[] {
    if (total <= 0 || cycles.length === 0) {
      return new Array(cycles.length).fill(0);
    }

    const sortedCycles = this.sortCyclesByPriority(cycles);
    const result = new Array(cycles.length).fill(0);
    let remaining = total;

    for (
      let priorityLevel = 0;
      priorityLevel <= 2 && remaining > 0;
      priorityLevel++
    ) {
      const cyclesWithCurrentPriority = this.getCyclesWithPriorityLevel(
        sortedCycles,
        priorityLevel
      );

      if (cyclesWithCurrentPriority.length === 0) continue;

      remaining = this.distributeEntitiesForPriorityLevel(
        remaining,
        cyclesWithCurrentPriority,
        result
      );
    }

    return result;
  }

  private sortCyclesByPriority(
    cycles: Cycle[]
  ): Array<Cycle & { idx: number }> {
    return cycles
      .map((cycle, idx) => ({ ...cycle, idx }))
      .sort(
        (a, b) =>
          this.getPriorityOrder(a.priority) - this.getPriorityOrder(b.priority)
      );
  }

  private getCyclesWithPriorityLevel(
    sortedCycles: Array<Cycle & { idx: number }>,
    priorityLevel: number
  ): Array<Cycle & { idx: number }> {
    return sortedCycles.filter(
      (cycle) =>
        this.getPriorityOrder(cycle.priority) === priorityLevel &&
        cycle.availableEntities > 0
    );
  }

  private distributeEntitiesForPriorityLevel(
    remaining: number,
    cycles: Array<Cycle & { idx: number }>,
    result: number[]
  ): number {
    const entitiesPerCycle = Math.floor(remaining / cycles.length);
    let leftover = remaining % cycles.length;

    for (const cycle of cycles) {
      const extraEntity = leftover > 0 ? 1 : 0;
      const toDistribute = Math.min(
        entitiesPerCycle + extraEntity,
        cycle.availableEntities
      );

      result[cycle.idx] += toDistribute;
      remaining -= toDistribute;

      if (leftover > 0) leftover--;
    }

    return remaining;
  }

  public calculateProjection(
    base: EventProjection[],
    cycles: Cycle[],
    entitiesPerCycle: number[]
  ): EventProjection[] {
    if (base.length === 0 || cycles.length === 0) {
      return [...base];
    }

    const result = this.copyBaseProjection(base);

    cycles.forEach((cycle, idx) => {
      const entities = entitiesPerCycle[idx];

      if (entities > 0) {
        this.addCycleEventsToProjection(cycle, entities, result);
      }
    });

    return result;
  }

  private copyBaseProjection(base: EventProjection[]): EventProjection[] {
    return base.map((projection) => ({
      day: projection.day,
      events: { ...projection.events },
    }));
  }

  private addCycleEventsToProjection(
    cycle: Cycle,
    entities: number,
    result: EventProjection[]
  ): void {
    cycle.structure.forEach((dayStructure, dayIndex) => {
      if (!result[dayIndex]) return;

      result[dayIndex].events.meetings += dayStructure.meetings * entities;
      result[dayIndex].events.emails += dayStructure.emails * entities;
      result[dayIndex].events.calls += dayStructure.calls * entities;
      result[dayIndex].events.follows += dayStructure.follows * entities;
    });
  }
}
