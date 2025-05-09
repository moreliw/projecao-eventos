import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  BehaviorSubject,
  Observable,
  catchError,
  finalize,
  map,
  of,
  shareReplay,
  throwError,
} from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
import { Cycle, Priority } from '../models/cycle.model';
import { EventProjection } from '../models/event-projection.model';

/**
 * Serviço responsável por lidar com projeções de eventos e ciclos
 * Provê métodos para obter, calcular e distribuir eventos entre ciclos
 */
@Injectable({ providedIn: 'root' })
export class EventProjectionService {
  /**
   * URLs para carregamento de dados
   * @private
   */
  private readonly PRIMARY_API_URL =
    'assets/mock-data/events-api-response.json';
  private readonly FALLBACK_API_URL = 'assets/data/events-api-response.json';

  /**
   * Armazena os dados carregados
   * @private
   */
  private readonly data$ = new BehaviorSubject<ApiResponse | null>(null);

  /**
   * Indica se está carregando dados
   */
  private readonly loading$ = new BehaviorSubject<boolean>(true);

  /**
   * Cache observável para ciclos ordenados por prioridade
   * @private
   */
  private readonly sortedCycles$ = this.data$.asObservable().pipe(
    map((data) => this.extractAndSortCycles(data)),
    shareReplay(1)
  );

  /**
   * Cache observável para projeções de eventos
   * @private
   */
  private readonly eventsProjection$ = this.data$.asObservable().pipe(
    map((data) => this.extractEventsProjection(data)),
    shareReplay(1)
  );

  constructor(private readonly http: HttpClient) {
    // Carregar dados imediatamente
    this.loadData();

    // Dados de mock para debug - descomente se necessário para debugging
    // this.loadMockDataForDebug();
  }

  /**
   * Carrega os dados do mock API
   * Em caso de erro, tenta carregar de uma fonte alternativa
   * @private
   */
  private loadData(): void {
    this.loading$.next(true);

    this.http
      .get<ApiResponse>(this.PRIMARY_API_URL)
      .pipe(
        catchError((error: HttpErrorResponse) => {
          console.error('Erro ao carregar dados primários:', error);
          return this.loadFallbackData();
        }),
        finalize(() => this.loading$.next(false)) // Garante finalizar o loading mesmo com erro
      )
      .subscribe({
        next: (data) => {
          console.log('Dados carregados com sucesso:', data);
          this.data$.next(data);
        },
        error: (err) => {
          console.error('Erro fatal ao carregar dados:', err);
          // Fornece dados vazios em caso de falha total
          this.data$.next(this.getEmptyApiResponse());
        },
      });
  }

  /**
   * Carrega dados alternativos em caso de falha na fonte primária
   * @private
   * @returns Observable<ApiResponse>
   */
  private loadFallbackData(): Observable<ApiResponse> {
    console.log('Tentando carregar dados alternativos...');
    return this.http.get<ApiResponse>(this.FALLBACK_API_URL).pipe(
      catchError((error) => {
        console.error('Erro ao carregar dados alternativos:', error);
        // Retorna uma resposta vazia em vez de lançar erro
        return of(this.getEmptyApiResponse());
      })
    );
  }

  /**
   * Fornece objeto vazio com a estrutura correta em caso de falha no carregamento
   * @private
   * @returns ApiResponse com estrutura vazia
   */
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

  /**
   * Carrega dados mock para depuração (use apenas em desenvolvimento)
   * @private
   */
  private loadMockDataForDebug(): void {
    // Dados de mock embutidos para depuração
    const mockData: ApiResponse = this.getEmptyApiResponse();
    mockData.cycles[0].name = 'Ciclo de debug';
    mockData.cycles[0].availableEntities = 5;

    setTimeout(() => {
      this.data$.next(mockData);
      this.loading$.next(false);
    }, 1000);
  }

  /**
   * Extrai e ordena ciclos por prioridade
   * @private
   * @param data Dados da API ou null
   * @returns Array de ciclos ordenados
   */
  private extractAndSortCycles(data: ApiResponse | null): Cycle[] {
    if (!data) return [];

    return [...data.cycles].sort(
      (a, b) =>
        this.getPriorityOrder(a.priority) - this.getPriorityOrder(b.priority)
    );
  }

  /**
   * Extrai projeções de eventos
   * @private
   * @param data Dados da API ou null
   * @returns Array de projeções de eventos
   */
  private extractEventsProjection(data: ApiResponse | null): EventProjection[] {
    return data?.eventsProjection || [];
  }

  /**
   * Obtém ciclos ordenados por prioridade
   * @returns Observable com array de ciclos
   */
  public getCycles(): Observable<Cycle[]> {
    return this.sortedCycles$;
  }

  /**
   * Obtém projeções de eventos
   * @returns Observable com array de projeções
   */
  public getEventsProjection(): Observable<EventProjection[]> {
    return this.eventsProjection$;
  }

  /**
   * Retorna o estado de carregamento
   * @returns Observable<boolean>
   */
  public getLoading(): Observable<boolean> {
    return this.loading$.asObservable();
  }

  /**
   * Converte prioridade em valor numérico para ordenação
   * HIGH = 0, MEDIUM = 1, LOW = 2
   * @private
   * @param priority Prioridade a ser convertida
   * @returns Valor numérico da prioridade
   */
  private getPriorityOrder(priority: Priority): number {
    const priorityMap: Record<Priority, number> = {
      HIGH: 0,
      MEDIUM: 1,
      LOW: 2,
    };

    return priorityMap[priority];
  }

  /**
   * Distribui entidades entre ciclos considerando suas prioridades
   * Prioridades mais altas recebem entidades primeiro
   * @param total Total de entidades a distribuir
   * @param cycles Ciclos disponíveis
   * @returns Array com a distribuição de entidades por ciclo
   */
  public distributeEntities(total: number, cycles: Cycle[]): number[] {
    if (total <= 0 || cycles.length === 0) {
      return new Array(cycles.length).fill(0);
    }

    const sortedCycles = this.sortCyclesByPriority(cycles);
    const result = new Array(cycles.length).fill(0);
    let remaining = total;

    // Processa cada nível de prioridade
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

  /**
   * Ordena ciclos por prioridade
   * @private
   * @param cycles Ciclos a ordenar
   * @returns Ciclos ordenados com índice original
   */
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

  /**
   * Filtra ciclos com um determinado nível de prioridade
   * @private
   * @param sortedCycles Ciclos ordenados
   * @param priorityLevel Nível de prioridade a filtrar
   * @returns Ciclos filtrados
   */
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

  /**
   * Distribui entidades para um nível de prioridade específico
   * @private
   * @param remaining Entidades restantes a distribuir
   * @param cycles Ciclos do nível de prioridade
   * @param result Array de resultado
   * @returns Entidades restantes após distribuição
   */
  private distributeEntitiesForPriorityLevel(
    remaining: number,
    cycles: Array<Cycle & { idx: number }>,
    result: number[]
  ): number {
    // Calcula entidades por ciclo
    const entitiesPerCycle = Math.floor(remaining / cycles.length);
    let leftover = remaining % cycles.length;

    // Distribui entidades
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

  /**
   * Calcula a projeção de eventos para os próximos dias
   * @param base Projeção base de eventos
   * @param cycles Ciclos selecionados
   * @param entitiesPerCycle Distribuição de entidades por ciclo
   * @returns Projeção calculada com eventos somados
   */
  public calculateProjection(
    base: EventProjection[],
    cycles: Cycle[],
    entitiesPerCycle: number[]
  ): EventProjection[] {
    if (base.length === 0 || cycles.length === 0) {
      return [...base];
    }

    // Copia dados base para não modificar o original
    const result = this.copyBaseProjection(base);

    // Soma eventos de cada ciclo
    cycles.forEach((cycle, idx) => {
      const entities = entitiesPerCycle[idx];

      if (entities > 0) {
        this.addCycleEventsToProjection(cycle, entities, result);
      }
    });

    return result;
  }

  /**
   * Faz uma cópia profunda da projeção base
   * @private
   * @param base Projeção base
   * @returns Cópia da projeção
   */
  private copyBaseProjection(base: EventProjection[]): EventProjection[] {
    return base.map((projection) => ({
      day: projection.day,
      events: { ...projection.events },
    }));
  }

  /**
   * Adiciona eventos de um ciclo à projeção
   * @private
   * @param cycle Ciclo a adicionar
   * @param entities Número de entidades do ciclo
   * @param result Projeção de resultado
   */
  private addCycleEventsToProjection(
    cycle: Cycle,
    entities: number,
    result: EventProjection[]
  ): void {
    cycle.structure.forEach((dayStructure, dayIndex) => {
      if (!result[dayIndex]) return;

      // Adiciona eventos para cada tipo
      result[dayIndex].events.meetings += dayStructure.meetings * entities;
      result[dayIndex].events.emails += dayStructure.emails * entities;
      result[dayIndex].events.calls += dayStructure.calls * entities;
      result[dayIndex].events.follows += dayStructure.follows * entities;
    });
  }
}
