import {
  Component,
  ViewChild,
  ElementRef,
  inject,
  ChangeDetectionStrategy,
  HostListener,
  afterNextRender,
  DestroyRef,
  signal,
  computed,
  PLATFORM_ID,
  ChangeDetectorRef,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import {
  FormControl,
  Validators,
  FormsModule,
  ReactiveFormsModule,
  NonNullableFormBuilder,
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, finalize, of } from 'rxjs';

import { Cycle, Priority } from '../../models/cycle.model';
import { EventProjection } from '../../models/event-projection.model';
import { EventProjectionService } from '../../services/event-projection.service';

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

import { Chart, ChartOptions, registerables } from 'chart.js';

Chart.register(...registerables);

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
export class EventProjectionComponent implements OnInit, OnDestroy {
  @ViewChild('forecastChart')
  protected readonly chartCanvas!: ElementRef<HTMLCanvasElement>;

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly projectionService = inject(EventProjectionService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected loading = signal(true);
  protected showEntityInput = signal(true);
  protected showCyclesSection = signal(true);
  protected cycles = signal<Cycle[]>([]);
  protected selected = signal<boolean[]>([]);
  protected distributed = signal<number[]>([]);
  protected projection = signal<EventProjection[]>([]);

  private baseProjection: EventProjection[] = [];
  private chart: Chart | null = null;
  private resizeTimeout: any;
  private currentWeekDay = this.getCurrentWeekDay();

  protected readonly entityCount = this.fb.control(1, [
    Validators.required,
    Validators.min(1),
  ]);

  protected readonly todayEventsCount = computed(() => {
    if (!this.projection().length) return 0;
    return this.getTotalEventsForDay(0);
  });

  protected readonly isFormValid = computed(
    () => this.entityCount.valid && this.selected().some((s) => s)
  );

  protected readonly displayedColumns: readonly string[] = [
    'cycle',
    'selection',
    'todayEvents',
  ];

  protected readonly businessDays = this.getBusinessDaysLabels();

  private readonly eventLabels: Record<string, string> = {
    meetings: 'Encontros',
    messages: 'Mensagens',
    checkpoints: 'Checkpoints',
    exploration: 'Exploração',
  };

  private readonly chartColors: Record<string, string> = {
    meetings: '#36B37E',
    messages: '#BDBDBD',
    checkpoints: '#00B8D9',
    exploration: '#B388FF',
  };

  constructor() {
    afterNextRender(() => {
      if (this.isBrowser) {
        this.initChartWithRetry();
      }
    });
  }

  ngOnInit(): void {
    this.loadData();
    this.setupFormListeners();
  }

  ngOnDestroy(): void {
    if (this.chart) {
      this.chart.destroy();
    }
  }

  private loadData(): void {
    this.loading.set(true);
    this.cdr.markForCheck();

    this.projectionService
      .getEventsProjection()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => {
          this.snackBar.open(
            'Erro ao carregar projeções de eventos',
            'Fechar',
            { duration: 3000 }
          );
          return EMPTY;
        }),
        finalize(() => {
          this.loading.set(false);
          this.cdr.markForCheck();
        })
      )
      .subscribe((projections) => {
        if (projections?.length > 0) {
          this.baseProjection = projections;
          this.projection.set([...projections]);
          this.loadCycles();

          if (this.chart) {
            this.updateChart();
          }
        } else {
          this.loading.set(false);
          this.initEmptyChart();
          this.cdr.markForCheck();
        }
      });
  }

  private loadCycles(): void {
    this.projectionService
      .getCycles()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => {
          this.snackBar.open('Erro ao carregar ciclos', 'Fechar', {
            duration: 3000,
          });
          return of([]);
        })
      )
      .subscribe((cycles) => {
        const sortedCycles = this.sortCyclesByPriority(cycles);
        this.cycles.set(sortedCycles);
        this.selected.set(
          sortedCycles.map((cycle) => cycle.priority === 'HIGH')
        );
        this.updateDistribution();
        this.loading.set(false);
        this.cdr.markForCheck();

        if (this.isBrowser && this.chartCanvas && !this.chart) {
          setTimeout(() => this.initChart(), 100);
        }
      });
  }

  protected toggleEntityInput(): void {
    this.showEntityInput.update((value) => !value);
    this.cdr.markForCheck();
  }

  protected toggleCyclesSection(): void {
    this.showCyclesSection.update((value) => !value);
    this.cdr.markForCheck();
  }

  protected toggleCycleSelection(cycle: Cycle): void {
    const index = this.cycles().indexOf(cycle);
    if (index !== -1) {
      const newSelection = [...this.selected()];
      newSelection[index] = !newSelection[index];
      this.selected.set(newSelection);
      this.updateDistribution();
    }
  }

  protected incrementEntityCount(): void {
    const currentValue = this.entityCount.value || 1;
    this.entityCount.setValue(currentValue + 1);
  }

  protected getEntityCount(): number {
    return this.entityCount.value || 1;
  }

  protected cancel(): void {}

  protected submit(): void {
    if (!this.isFormValid()) return;

    const selectedCycles = this.getSelectedCycles().map((cycle) => cycle.name);
    const entityCount = this.entityCount.value;
  }

  protected refreshData(): void {
    this.loading.set(true);
    this.cdr.markForCheck();

    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    this.loadData();
  }

  protected updateDistribution(): void {
    const total = this.entityCount.value || 1;
    const selectedCycles = this.getSelectedCycles();
    const newDistribution = this.projectionService.distributeEntities(
      total,
      selectedCycles
    );
    this.distributed.set(newDistribution);
    this.updateProjection();
  }

  protected getCycleTodayEvents(cycle: Cycle): number {
    if (!cycle.structure?.length) return 0;

    const todayStructure = cycle.structure[0];
    return (
      (todayStructure.meetings || 0) +
      (todayStructure.emails || 0) +
      (todayStructure.calls || 0) +
      (todayStructure.follows || 0)
    );
  }

  protected getPriorityIcon(priority: string): string {
    switch (priority.toUpperCase()) {
      case 'HIGH':
      case 'MEDIUM':
      case 'LOW':
        return 'north';
      default:
        return 'circle';
    }
  }

  protected getEntityCountError(): string | null {
    if (this.entityCount.hasError('required')) {
      return 'Entidades são obrigatórias';
    }
    if (this.entityCount.hasError('min')) {
      return 'O valor deve ser maior que 0';
    }
    return null;
  }

  protected setEntityCount(value: number): void {
    if (value < 1) value = 1;
    this.entityCount.setValue(value);
  }

  protected validateEntityCount(): void {
    const value = this.entityCount.value;
    if (!value || value < 1 || isNaN(value)) {
      this.entityCount.setValue(1);
    } else {
      this.entityCount.setValue(Math.floor(value));
    }
  }

  private initChartWithRetry(): void {
    const initialRenderAttempts = [100, 500, 1000, 2000];
    initialRenderAttempts.forEach((delay) => {
      setTimeout(() => {
        if (this.chartCanvas && (!this.chart || this.isChartEmpty())) {
          this.cdr.detectChanges();
          this.initChart();
        }
      }, delay);
    });
  }

  private initEmptyChart(): void {
    if (this.isBrowser && this.chartCanvas) {
      setTimeout(() => this.initChart(), 100);
    }
  }

  private updateProjection(): void {
    const selectedCycles = this.getSelectedCycles();
    const newProjection = this.projectionService.calculateProjection(
      this.baseProjection,
      selectedCycles,
      this.distributed()
    );
    this.projection.set(newProjection);

    if (this.isBrowser) {
      setTimeout(() => {
        this.updateChartIfExists();
        this.cdr.markForCheck();
      }, 100);
    } else {
      this.cdr.markForCheck();
    }
  }

  private updateChartIfExists(): void {
    if (!this.isBrowser) return;

    if (this.chart) {
      this.updateChart();
    } else if (this.chartCanvas) {
      this.initChart();
    }
  }

  private initChart(): void {
    if (!this.isBrowser) return;

    try {
      if (!this.chartCanvas?.nativeElement) return;

      if (this.chart) {
        try {
          this.chart.destroy();
        } catch (e) {}
        this.chart = null;
      }

      const canvas = this.chartCanvas.nativeElement;
      if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) {
        void canvas.offsetHeight;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const data = this.prepareChartData();
      const options = this.getChartOptions();

      try {
        this.chart = new Chart(ctx, {
          type: 'bar',
          data,
          options,
        });

        if (this.isBrowser && window.localStorage) {
          window.localStorage.setItem('chartRendered', 'true');
        }
      } catch (chartError) {}
    } catch (error) {}
  }

  private updateChart(): void {
    if (!this.isBrowser) return;

    try {
      if (this.chart) {
        this.chart.data = this.prepareChartData();
        this.chart.update();
      } else {
        this.initChart();
      }
    } catch (error) {
      setTimeout(() => this.initChart(), 300);
    }
  }

  private prepareChartData() {
    const labels = this.businessDays;
    const currentProjection = this.projection();

    if (!currentProjection || currentProjection.length === 0) {
      return this.getPlaceholderChartData(labels);
    }

    return {
      labels,
      datasets: [
        {
          label: this.eventLabels['meetings'],
          data: currentProjection.map((day) => day.events?.meetings || 0),
          backgroundColor: this.chartColors['meetings'],
          hoverBackgroundColor: this.chartColors['meetings'],
          borderWidth: 0,
          borderRadius: 0,
          borderSkipped: false,
          barPercentage: 0.8,
          categoryPercentage: 0.7,
        },
        {
          label: this.eventLabels['messages'],
          data: currentProjection.map((day) => day.events?.emails || 0),
          backgroundColor: this.chartColors['messages'],
          hoverBackgroundColor: this.chartColors['messages'],
          borderWidth: 0,
          borderRadius: 0,
          borderSkipped: false,
          barPercentage: 0.8,
          categoryPercentage: 0.7,
        },
        {
          label: this.eventLabels['checkpoints'],
          data: currentProjection.map((day) => day.events?.calls || 0),
          backgroundColor: this.chartColors['checkpoints'],
          hoverBackgroundColor: this.chartColors['checkpoints'],
          borderWidth: 0,
          borderRadius: 0,
          borderSkipped: false,
          barPercentage: 0.8,
          categoryPercentage: 0.7,
        },
        {
          label: this.eventLabels['exploration'],
          data: currentProjection.map((day) => day.events?.follows || 0),
          backgroundColor: this.chartColors['exploration'],
          hoverBackgroundColor: this.chartColors['exploration'],
          borderWidth: 0,
          borderRadius: 0,
          borderSkipped: false,
          barPercentage: 0.8,
          categoryPercentage: 0.7,
        },
      ],
    };
  }

  private getPlaceholderChartData(labels: string[]) {
    return {
      labels,
      datasets: [
        {
          label: this.eventLabels['meetings'],
          data: [45, 108, 100, 36, 20],
          backgroundColor: this.chartColors['meetings'],
          hoverBackgroundColor: this.chartColors['meetings'],
          borderWidth: 0,
          borderRadius: 0,
          borderSkipped: false,
          barPercentage: 0.8,
          categoryPercentage: 0.7,
        },
        {
          label: this.eventLabels['messages'],
          data: [18, 20, 10, 8, 12],
          backgroundColor: this.chartColors['messages'],
          hoverBackgroundColor: this.chartColors['messages'],
          borderWidth: 0,
          borderRadius: 0,
          borderSkipped: false,
          barPercentage: 0.8,
          categoryPercentage: 0.7,
        },
        {
          label: this.eventLabels['checkpoints'],
          data: [5, 10, 8, 12, 10],
          backgroundColor: this.chartColors['checkpoints'],
          hoverBackgroundColor: this.chartColors['checkpoints'],
          borderWidth: 0,
          borderRadius: 0,
          borderSkipped: false,
          barPercentage: 0.8,
          categoryPercentage: 0.7,
        },
        {
          label: this.eventLabels['exploration'],
          data: [8, 8, 3, 0, 5],
          backgroundColor: this.chartColors['exploration'],
          hoverBackgroundColor: this.chartColors['exploration'],
          borderWidth: 0,
          borderRadius: 0,
          borderSkipped: false,
          barPercentage: 0.8,
          categoryPercentage: 0.7,
        },
      ],
    };
  }

  private getChartOptions(): ChartOptions {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          align: 'center',
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            padding: 15,
            font: {
              size: 12,
              family: "'Roboto', 'Helvetica Neue', sans-serif",
            },
            color: '#333',
            usePointStyle: true,
            pointStyle: 'rect',
          },
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: 'rgba(255, 255, 255, 0.2)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 4,
          displayColors: true,
          boxWidth: 10,
          boxHeight: 10,
          usePointStyle: true,
          caretPadding: 10,
          caretSize: 8,
        },
      },
      scales: {
        y: {
          stacked: true,
          beginAtZero: true,
          max: 120,
          ticks: {
            stepSize: 20,
          },
          title: {
            display: true,
            text: 'Quantidade de Eventos',
            font: {
              size: 14,
              weight: 'bold',
            },
          },
          grid: {
            color: '#e0e0e0',
          },
        },
        x: {
          stacked: true,
          grid: {
            display: false,
          },
        },
      },
      elements: {
        bar: {
          borderRadius: 0,
          borderSkipped: false,
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

  @HostListener('window:resize')
  protected onResize() {
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
    this.resizeTimeout = setTimeout(() => {
      if (this.isBrowser && this.chartCanvas) {
        this.initChart();
      }
    }, 250);
  }

  @HostListener('document:visibilitychange')
  protected onVisibilityChange() {
    if (this.isBrowser && document.visibilityState === 'visible') {
      setTimeout(() => {
        if (this.chartCanvas && (!this.chart || this.isChartEmpty())) {
          this.initChart();
        }
      }, 300);
    }
  }

  private setupFormListeners(): void {
    this.entityCount.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.updateDistribution();
        this.updateChartIfExists();
      });
  }

  private getSelectedCycles(): Cycle[] {
    return this.cycles().filter((_, i) => this.selected()[i]);
  }

  private getTotalEventsForDay(idx: number): number {
    const currentProjection = this.projection();
    if (!currentProjection || !currentProjection[idx]) return 0;

    if (currentProjection[idx].events) {
      return Object.values(currentProjection[idx].events).reduce(
        (sum, value) => sum + value,
        0
      );
    } else {
      const projection = currentProjection[idx] as any;
      return (
        (projection.meetings || 0) +
        (projection.emails || 0) +
        (projection.calls || 0) +
        (projection.follows || 0)
      );
    }
  }

  private isChartEmpty(): boolean {
    if (!this.chart) return true;

    try {
      const chartData = this.chart.data;
      if (
        !chartData ||
        !chartData.datasets ||
        chartData.datasets.length === 0
      ) {
        return true;
      }

      const hasData = chartData.datasets.some(
        (dataset) => dataset.data && dataset.data.some((val: any) => val > 0)
      );

      return !hasData;
    } catch (e) {
      return true;
    }
  }

  private sortCyclesByPriority(cycles: Cycle[]): Cycle[] {
    return [...cycles].sort((a, b) => {
      const priorityOrder: Record<Priority, number> = {
        HIGH: 0,
        MEDIUM: 1,
        LOW: 2,
        NEUTRAL: 3,
      };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  private getCurrentWeekDay(): number {
    const today = new Date().getDay();

    if (today === 0 || today === 6) {
      return 5;
    } else {
      return today;
    }
  }

  private getBusinessDaysLabels(): string[] {
    const orderedDays = ['Quarta', 'Quinta', 'Sexta', 'Segunda'];
    return ['Hoje', ...orderedDays];
  }

  protected getAvailableCyclesCount(): number {
    return this.cycles().filter((cycle) => cycle.availableEntities > 0).length;
  }

  protected getUnavailableCyclesCount(): number {
    return this.cycles().filter((cycle) => cycle.availableEntities === 0)
      .length;
  }

  protected getPriorityClass(priority: string): string {
    switch (priority.toUpperCase()) {
      case 'HIGH':
        return 'priority-high';
      case 'MEDIUM':
        return 'priority-medium';
      case 'LOW':
        return 'priority-low';
      default:
        return 'priority-neutral';
    }
  }
}
