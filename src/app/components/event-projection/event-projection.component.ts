import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  ChangeDetectionStrategy,
  inject,
  ChangeDetectorRef,
  DestroyRef,
  PLATFORM_ID,
  Inject,
  HostListener,
  AfterViewChecked,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  FormControl,
  Validators,
  FormsModule,
  ReactiveFormsModule,
  NonNullableFormBuilder,
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  EMPTY,
  Observable,
  catchError,
  finalize,
  forkJoin,
  map,
  switchMap,
  tap,
  of,
} from 'rxjs';

// Models
import { Cycle } from '../../models/cycle.model';
import { EventProjection } from '../../models/event-projection.model';

// Services
import { EventProjectionService } from '../../services/event-projection.service';

// Material Dependencies
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

// Chart.js
import { Chart, ChartOptions, registerables } from 'chart.js';

// Register Chart.js
Chart.register(...registerables);

/**
 * Componente de projeção de eventos
 * Responsável por exibir e calcular eventos futuros baseado nos ciclos e entidades
 */
@Component({
  selector: 'app-event-projection',
  templateUrl: './event-projection.component.html',
  styleUrls: ['./event-projection.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatInputModule,
    MatIconModule,
    MatTableModule,
    MatCheckboxModule,
    MatTooltipModule,
    MatDividerModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventProjectionComponent
  implements OnInit, AfterViewInit, OnDestroy, AfterViewChecked
{
  // View
  @ViewChild('forecastChart')
  public readonly chartCanvas!: ElementRef<HTMLCanvasElement>;

  // Injetando dependências
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly projectionService = inject(EventProjectionService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  public readonly isBrowser: boolean;

  // Form
  public readonly entityCount = this.fb.control(1, [
    Validators.required,
    Validators.min(1),
  ]);

  // UI state
  public showEntityInput = true;
  public showCyclesSection = true;
  public currentPage = 3;
  public totalPages = 4;
  public chartReady = true; // Always set to true to avoid loading state

  // Estado
  public cycles: Cycle[] = [];
  public selected: boolean[] = [];
  public distributed: number[] = [];
  private baseProjection: EventProjection[] = [];
  public projection: EventProjection[] = [];
  public loading = true;
  private chart: Chart | null = null;

  // Tabela
  public readonly displayedColumns: readonly string[] = [
    'cycle',
    'selection',
    'todayEvents',
  ] as const;

  // Labels para tipos de eventos
  private readonly eventLabels: Record<string, string> = {
    meetings: 'Encontros',
    messages: 'Mensagens',
    checkpoints: 'Checkpoints',
    exploration: 'Exploração',
  };

  // Configurações de cores para o gráfico
  private readonly chartColors: Record<string, string> = {
    meetings: '#36B37E', // Green
    messages: '#BDBDBD', // Gray
    checkpoints: '#00B8D9', // Blue
    exploration: '#B388FF', // Purple
  };

  constructor(@Inject(PLATFORM_ID) platformId: Object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    console.log('Event Projection Component initialized');
    this.loadData();
    this.setupFormListeners();

    // Force chart rendering on navigation/refresh
    if (this.isBrowser) {
      // Attempt to render chart on a staggered schedule for better chance of success
      const initialRenderAttempts = [100, 500, 1000, 2000];
      initialRenderAttempts.forEach((delay) => {
        setTimeout(() => {
          if (this.chartCanvas && (!this.chart || this.isChartEmpty())) {
            console.log(`Initialization attempt at ${delay}ms`);
            this.cdr.detectChanges();
            this.initChart();
          }
        }, delay);
      });
    }
  }

  ngAfterViewInit(): void {
    console.log('After view init, checking if chart can be initialized');

    // Initialize chart if in browser environment
    if (this.isBrowser) {
      // Use a slightly longer delay to ensure the DOM is fully ready
      setTimeout(() => {
        try {
          console.log('Initializing chart with available data');
          this.initChart();
        } catch (err) {
          console.error('Error initializing chart:', err);
          // If first attempt fails, try again with a longer delay
          setTimeout(() => {
            try {
              console.log('Retrying chart initialization');
              this.initChart();
            } catch (secondErr) {
              console.error('Error in second chart init attempt:', secondErr);
            }
          }, 1000);
        }
      }, 800);
    } else {
      console.log('Not in browser environment, skipping chart initialization');
    }
  }

  ngOnDestroy(): void {
    if (this.chart) {
      this.chart.destroy();
    }
  }

  /**
   * Carrega dados de ciclos e projeções
   */
  private loadData(): void {
    console.log('Loading data from service');
    this.loading = true;
    this.cdr.markForCheck();

    // Using data from assets/mock-data/events-api-response.json
    this.projectionService
      .getEventsProjection()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        tap((data) => console.log('Raw projection data from API:', data)),
        catchError((error) => {
          console.error('Error loading projections:', error);
          this.snackBar.open(
            'Erro ao carregar projeções de eventos',
            'Fechar',
            {
              duration: 3000,
            }
          );
          return EMPTY;
        }),
        finalize(() => {
          // In case service still says we're loading
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (projections) => {
          console.log('Received projections from API:', projections);
          if (projections && projections.length > 0) {
            this.baseProjection = projections;
            this.projection = [...projections];

            // If we have projection data, load cycles
            this.loadCycles();

            // Update the chart if already initialized
            if (this.chart) {
              this.updateChart();
            }
          } else {
            console.error('No projection data received from API');
            this.loading = false;
            this.initEmptyChart();
            this.cdr.markForCheck();
          }
        },
        error: () => {
          // Ensure we still try to render the chart even on error
          setTimeout(() => this.initEmptyChart(), 300);
        },
      });
  }

  /**
   * Initialize empty chart with sample data when no real data is available
   */
  private initEmptyChart(): void {
    if (this.isBrowser) {
      console.log('Initializing empty chart with sample data');
      setTimeout(() => {
        try {
          this.initChart();
        } catch (error) {
          console.error('Error initializing empty chart:', error);
        }
      }, 300);
    }
  }

  /**
   * Carrega dados de ciclos
   */
  private loadCycles(): void {
    console.log('Loading cycle data');
    this.projectionService
      .getCycles()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        tap((data) => console.log('Raw cycle data:', data)),
        catchError((error) => {
          console.error('Error loading cycles:', error);
          this.snackBar.open('Erro ao carregar ciclos', 'Fechar', {
            duration: 3000,
          });
          return of([]);
        })
      )
      .subscribe({
        next: (cycles) => {
          console.log('Received cycles:', cycles);
          this.cycles = cycles;
          this.selected = cycles.map(() => true);
          this.updateDistribution();

          this.loading = false;
          this.cdr.markForCheck();

          if (this.isBrowser && this.chartCanvas && !this.chart) {
            console.log('Chart canvas is available, initializing chart');
            setTimeout(() => this.initChart(), 100);
          }
        },
      });
  }

  /**
   * Configura listeners para formulários
   */
  private setupFormListeners(): void {
    this.entityCount.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        console.log('Entity count changed:', value);
        this.updateDistribution();
      });
  }

  /**
   * Atualiza a distribuição de entidades entre os ciclos
   */
  public updateDistribution(): void {
    console.log('Updating distribution');
    const total = this.entityCount.value || 1;
    const selectedCycles = this.getSelectedCycles();

    this.distributed = this.projectionService.distributeEntities(
      total,
      selectedCycles
    );
    console.log('New distribution:', this.distributed);
    this.updateProjection();
  }

  /**
   * Alterna a visibilidade da seção de entrada de entidades
   */
  public toggleEntityInput(): void {
    this.showEntityInput = !this.showEntityInput;
    this.cdr.markForCheck();
  }

  /**
   * Alterna a visibilidade da seção de ciclos
   */
  public toggleCyclesSection(): void {
    this.showCyclesSection = !this.showCyclesSection;
    this.cdr.markForCheck();
  }

  /**
   * Alterna a seleção de um ciclo
   */
  public toggleCycleSelection(cycle: Cycle): void {
    const index = this.cycles.indexOf(cycle);
    if (index !== -1) {
      this.selected[index] = !this.selected[index];
      this.updateDistribution();
    }
  }

  /**
   * Calcula o número de eventos para hoje para um ciclo específico
   */
  public getCycleTodayEvents(cycle: Cycle): number {
    if (!cycle.structure || cycle.structure.length === 0) return 0;

    const todayStructure = cycle.structure[0];
    return (
      (todayStructure.meetings || 0) +
      (todayStructure.emails || 0) +
      (todayStructure.calls || 0) +
      (todayStructure.follows || 0)
    );
  }

  /**
   * Retorna o ícone apropriado para a prioridade
   */
  public getPriorityIcon(priority: string): string {
    switch (priority.toUpperCase()) {
      case 'HIGH':
        return 'north';
      case 'MEDIUM':
        return 'north';
      case 'LOW':
        return 'north';
      default:
        return 'circle';
    }
  }

  /**
   * Valida se o formulário está válido
   */
  public isFormValid(): boolean {
    return this.entityCount.valid && this.selected.some((s) => s);
  }

  /**
   * Calcula o total de eventos para hoje
   */
  public getTodayEventsCount(): number {
    if (!this.projection.length) return 0;
    return this.getTotalEventsForDay(0);
  }

  /**
   * Cancela a operação
   */
  public cancel(): void {
    console.log('Operação cancelada');
  }

  /**
   * Envia os dados do formulário
   */
  public submit(): void {
    if (!this.isFormValid()) return;

    const selectedCycles = this.getSelectedCycles().map((cycle) => cycle.name);

    const entityCount = this.entityCount.value;

    console.log('Submetendo', {
      entityCount,
      selectedCycles,
    });

    // Aqui você chamaria o serviço para submeter os dados
  }

  /**
   * Recarrega os dados
   */
  public refreshData(): void {
    this.loading = true;
    this.cdr.markForCheck();

    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    this.loadData();
  }

  /**
   * Retorna os ciclos atualmente selecionados
   */
  private getSelectedCycles(): Cycle[] {
    return this.cycles.filter((_, i) => this.selected[i]);
  }

  /**
   * Calcula o total de eventos para um dia específico
   */
  private getTotalEventsForDay(idx: number): number {
    if (!this.projection || !this.projection[idx]) return 0;

    if (this.projection[idx].events) {
      return Object.values(this.projection[idx].events).reduce(
        (sum, value) => sum + value,
        0
      );
    } else {
      // Direct access to properties if events object doesn't exist
      const projection = this.projection[idx] as any;
      return (
        (projection.meetings || 0) +
        (projection.emails || 0) +
        (projection.calls || 0) +
        (projection.follows || 0)
      );
    }
  }

  /**
   * Atualiza a projeção de eventos baseada nos ciclos selecionados
   */
  private updateProjection(): void {
    console.log('Updating projection');
    const selectedCycles = this.getSelectedCycles();

    // Get the new projection from the service
    this.projection = this.projectionService.calculateProjection(
      this.baseProjection,
      selectedCycles,
      this.distributed
    );

    console.log('New projection:', this.projection);

    // Force chart update if in browser environment
    if (this.isBrowser) {
      // Add a small delay to ensure DOM is ready
      setTimeout(() => {
        this.updateChartIfExists();
        this.cdr.markForCheck();
      }, 100);
    } else {
      // Just update the view
      this.cdr.markForCheck();
    }
  }

  /**
   * Atualiza o gráfico existente ou cria um novo se não existir
   */
  private updateChartIfExists(): void {
    if (!this.isBrowser) return;

    if (this.chart) {
      console.log('Updating existing chart');
      this.updateChart();
    } else if (this.chartCanvas) {
      console.log('Creating new chart');
      this.initChart();
    } else {
      console.log('Chart canvas not available yet');
    }
  }

  /**
   * Inicializa o gráfico de barras
   */
  private initChart(): void {
    if (!this.isBrowser) return;

    try {
      // Verifica se o elemento canvas está disponível
      if (!this.chartCanvas || !this.chartCanvas.nativeElement) {
        console.error('Chart canvas element not found');
        return;
      }

      // Limpa qualquer gráfico existente
      if (this.chart) {
        try {
          // Safely destroy any existing chart
          this.chart.destroy();
        } catch (e) {
          console.warn('Error destroying existing chart:', e);
        }
        this.chart = null;
      }

      // Get canvas dimensions and ensure it's visible
      const canvas = this.chartCanvas.nativeElement;
      if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) {
        console.log('Canvas has zero dimensions, forcing layout recalculation');
        // Force a layout recalculation
        void canvas.offsetHeight;
      }

      // Obter o contexto do canvas
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('Could not get canvas context');
        return;
      }

      // Ensure we have data
      if (!this.projection || this.projection.length === 0) {
        console.log('No projection data, using mock data for chart');
      }

      // Preparar dados para o gráfico
      const data = this.prepareChartData();
      const options = this.getChartOptions();

      // Criar o gráfico with a try-catch block
      try {
        this.chart = new Chart(ctx, {
          type: 'bar',
          data: data,
          options: options,
        });
        console.log('Chart initialized successfully');

        // Set a flag in localStorage to help with refresh issues
        if (this.isBrowser && window.localStorage) {
          window.localStorage.setItem('chartRendered', 'true');
        }
      } catch (chartError) {
        console.error('Error creating Chart.js instance:', chartError);
      }
    } catch (error) {
      console.error('Error initializing chart:', error);
    }
  }

  /**
   * Atualiza o gráfico com novos dados
   */
  private updateChart(): void {
    if (!this.isBrowser) return;

    try {
      if (this.chart) {
        // Update chart data
        this.chart.data = this.prepareChartData();
        this.chart.update();
        console.log('Chart updated successfully');
      } else {
        // Re-initialize chart if it doesn't exist
        this.initChart();
      }
    } catch (error) {
      console.error('Error updating chart:', error);
      // Try to re-initialize chart on error
      setTimeout(() => this.initChart(), 300);
    }
  }

  /**
   * Retorna os dados configurados para o gráfico
   */
  private prepareChartData() {
    const labels = ['Hoje', 'Qui', 'Sex', 'Seg', 'Ter'];

    // Check if we have projection data loaded
    if (!this.projection || this.projection.length === 0) {
      console.warn(
        'No projection data available for chart, using placeholder data'
      );
      // Fallback to placeholder data if no real data is available
      return this.getPlaceholderChartData(labels);
    }

    console.log('Using actual projection data for chart', this.projection);

    // Map our projection data to chart format
    // For each day, we need to extract the events by type
    return {
      labels: labels,
      datasets: [
        {
          label: this.eventLabels['meetings'],
          data: this.projection.map((day) => day.events?.meetings || 0),
          backgroundColor: this.chartColors['meetings'],
          hoverBackgroundColor: this.chartColors['meetings'],
          borderWidth: 0,
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.75,
          categoryPercentage: 0.65,
        },
        {
          label: this.eventLabels['messages'],
          data: this.projection.map((day) => day.events?.emails || 0),
          backgroundColor: this.chartColors['messages'],
          hoverBackgroundColor: this.chartColors['messages'],
          borderWidth: 0,
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.75,
          categoryPercentage: 0.65,
        },
        {
          label: this.eventLabels['checkpoints'],
          data: this.projection.map((day) => day.events?.calls || 0),
          backgroundColor: this.chartColors['checkpoints'],
          hoverBackgroundColor: this.chartColors['checkpoints'],
          borderWidth: 0,
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.75,
          categoryPercentage: 0.65,
        },
        {
          label: this.eventLabels['exploration'],
          data: this.projection.map((day) => day.events?.follows || 0),
          backgroundColor: this.chartColors['exploration'],
          hoverBackgroundColor: this.chartColors['exploration'],
          borderWidth: 0,
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.75,
          categoryPercentage: 0.65,
        },
      ],
    };
  }

  /**
   * Returns placeholder chart data when no real data is available
   */
  private getPlaceholderChartData(labels: string[]) {
    return {
      labels: labels,
      datasets: [
        {
          label: this.eventLabels['meetings'],
          data: [0, 0, 0, 0, 0],
          backgroundColor: this.chartColors['meetings'],
          hoverBackgroundColor: this.chartColors['meetings'],
          borderWidth: 0,
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.75,
          categoryPercentage: 0.65,
        },
        {
          label: this.eventLabels['messages'],
          data: [90, 0, 0, 0, 0],
          backgroundColor: this.chartColors['messages'],
          hoverBackgroundColor: this.chartColors['messages'],
          borderWidth: 0,
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.75,
          categoryPercentage: 0.65,
        },
        {
          label: this.eventLabels['checkpoints'],
          data: [0, 0, 82, 0, 0],
          backgroundColor: this.chartColors['checkpoints'],
          hoverBackgroundColor: this.chartColors['checkpoints'],
          borderWidth: 0,
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.75,
          categoryPercentage: 0.65,
        },
        {
          label: this.eventLabels['exploration'],
          data: [80, 85, 0, 0, 0],
          backgroundColor: this.chartColors['exploration'],
          hoverBackgroundColor: this.chartColors['exploration'],
          borderWidth: 0,
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.75,
          categoryPercentage: 0.65,
        },
      ],
    };
  }

  /**
   * Retorna as opções de configuração para o gráfico
   */
  private getChartOptions(): ChartOptions {
    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 15,
          right: 25,
          bottom: 5,
          left: 10,
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: {
            display: false,
          },
          border: {
            display: false,
          },
          ticks: {
            color: '#101828',
            font: {
              size: 12,
              weight: 500,
            },
            padding: 8,
          },
          afterTickToLabelConversion: (scaleInstance) => {
            // This callback ensures the grid is aligned with labels
            const ticks = scaleInstance.ticks;
            const numberOfTicks = ticks.length;
            if (numberOfTicks > 0) {
              scaleInstance.paddingLeft = 25;
              scaleInstance.paddingRight = 25;
            }
          },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          max: 200,
          ticks: {
            stepSize: 50,
            precision: 0,
            color: '#475467',
            font: {
              size: 11,
              weight: 500,
            },
            padding: 10,
            align: 'end',
            callback: function (value) {
              // Format y-axis values
              return value.toString();
            },
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.06)',
            lineWidth: 1,
            drawTicks: false,
            offset: false,
            z: 1,
          },
          border: {
            display: false,
          },
          position: 'left',
          offset: true,
          title: {
            display: true,
            text: 'Quantidade de Eventos',
            color: '#475467',
            font: {
              size: 11,
              weight: 500,
            },
            padding: {
              top: 0,
              bottom: 0,
            },
          },
        },
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          align: 'center',
          labels: {
            usePointStyle: true,
            pointStyle: 'rect',
            boxWidth: 12,
            boxHeight: 12,
            padding: 20,
            color: '#101828',
            font: {
              size: 12,
              weight: 500,
            },
          },
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          titleColor: '#101828',
          bodyColor: '#475467',
          borderColor: 'rgba(0, 0, 0, 0.1)',
          borderWidth: 1,
          cornerRadius: 6,
          padding: 10,
          boxPadding: 6,
          titleFont: {
            weight: 'bold',
            size: 13,
          },
          bodyFont: {
            size: 12,
          },
          displayColors: true,
          boxWidth: 10,
          boxHeight: 10,
          usePointStyle: true,
          caretPadding: 10,
          caretSize: 8,
        },
      },
      elements: {
        bar: {
          borderRadius: 6,
          borderSkipped: false,
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
        },
      },
      interaction: {
        mode: 'index',
        intersect: false,
      },
      animations: {
        tension: {
          duration: 1000,
          easing: 'easeOutQuart',
          from: 0.8,
          to: 0.2,
        },
      },
      transitions: {
        active: {
          animation: {
            duration: 300,
          },
        },
      },
    };
  }

  /**
   * Incrementa o contador de entidades
   */
  public incrementEntityCount(): void {
    const currentValue = this.entityCount.value || 0;
    this.entityCount.setValue(currentValue + 1);
  }

  /**
   * Decrementa o contador de entidades
   */
  public decrementEntityCount(): void {
    const currentValue = this.entityCount.value || 1;
    if (currentValue > 1) {
      this.entityCount.setValue(currentValue - 1);
    }
  }

  /**
   * Retorna o valor atual do contador de entidades para exibição
   */
  public getEntityCount(): number {
    return this.entityCount.value || 1;
  }

  /**
   * Retorna o número fixo de eventos para hoje para o design estático
   */
  public getFixedEventsCount(): number {
    return 83;
  }

  /**
   * Abre a seleção de entidades (simula um clique no input)
   */
  public openEntitySelection(): void {
    console.log('Entity selection clicked');
    // Here you could open a dialog or do something with the selection
  }

  /**
   * Rerender the chart when the component is activated or window resized
   * This helps with chart not being visible on refresh
   */
  @HostListener('window:resize')
  onResize() {
    // Debounce the resize event to avoid too many rerenders
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
    this.resizeTimeout = setTimeout(() => {
      if (this.isBrowser && this.chartCanvas) {
        this.initChart();
      }
    }, 250);
  }

  /**
   * Handle visibility change to reinitialize chart when tab becomes visible
   * This helps with rendering issues on tab switching or page refresh
   */
  @HostListener('document:visibilitychange')
  onVisibilityChange() {
    if (this.isBrowser && document.visibilityState === 'visible') {
      setTimeout(() => {
        if (this.chartCanvas && (!this.chart || this.isChartEmpty())) {
          console.log('Page became visible, reinitializing chart');
          this.initChart();
        }
      }, 300);
    }
  }

  /**
   * Check if the chart has actual render data
   */
  private isChartEmpty(): boolean {
    if (!this.chart) return true;

    try {
      // Check if chart has data but hasn't rendered properly
      const chartData = this.chart.data;
      if (
        !chartData ||
        !chartData.datasets ||
        chartData.datasets.length === 0
      ) {
        return true;
      }

      // Check if all datasets have zero data
      const hasData = chartData.datasets.some(
        (dataset) => dataset.data && dataset.data.some((val: any) => val > 0)
      );

      return !hasData;
    } catch (e) {
      return true;
    }
  }

  private resizeTimeout: any;

  /**
   * Hook into Angular's change detection to rerender chart when needed
   */
  ngAfterViewChecked() {
    // If we have a canvas but no chart, try to initialize
    if (this.isBrowser && this.chartCanvas && !this.chart) {
      setTimeout(() => this.initChart(), 200);
    }
  }
}
