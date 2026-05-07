import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss'
})
export class NavbarComponent {
  private readonly authService = inject(AuthService);

  protected readonly isLoggedIn = computed(() => this.authService.isLoggedIn());

  async onLogout(): Promise<void> {
    await this.authService.logout();
  }
}
