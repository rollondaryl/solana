import { Component } from '@angular/core';
import { ShooterComponent } from './shooter/shooter.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ShooterComponent],
  template: `
    <div class="app-shell">
      <app-shooter />
    </div>
  `,
  styles: [
    `
      .app-shell {
        min-height: 100dvh;
        background: #0b0f1a;
        color: #e6eef8;
        font-family: Inter, system-ui, Arial, sans-serif;
      }
      h1 {
        margin: 0;
        padding: 16px;
        font-size: clamp(16px, 2.2vw, 22px);
        font-weight: 600;
      }
    `,
  ],
})
export class App {}
