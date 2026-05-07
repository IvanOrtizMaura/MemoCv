import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { GaleriaStore } from './galeria.store';

@Component({
  selector: 'app-galeria',
  standalone: true,
  imports: [RouterLink],
  providers: [GaleriaStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './galeria.component.html',
  styleUrl: './galeria.component.scss'
})
export class GaleriaComponent implements OnInit {
  protected readonly store = inject(GaleriaStore);

  ngOnInit(): void {
    this.store.loadStudents();
  }

  onSearchInput(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    this.store.setSearchQuery(inputElement.value);
  }

  onSendAllEmails(): void {
    console.log('Send all emails — Cloud Function stub');
  }
}
