import { Component } from '@angular/core';
import { EventProjectionComponent } from './components/event-projection/event-projection.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  standalone: true,
  imports: [EventProjectionComponent],
})
export class AppComponent {
  title = 'projecao-eventos';
}
