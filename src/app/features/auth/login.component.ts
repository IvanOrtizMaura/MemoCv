import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal
} from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private readonly authService = inject(AuthService);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  onEmailInput(event: Event): void {
    this.email.set((event.target as HTMLInputElement).value);
  }

  onPasswordInput(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
  }

  async onLogin(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      await this.authService.login(this.email(), this.password());
    } catch (error: unknown) {
      this.errorMessage.set(this.authService.mapFirebaseAuthError(error));
    } finally {
      this.isLoading.set(false);
    }
  }
}
