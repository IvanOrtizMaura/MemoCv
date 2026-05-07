import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'galeria', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent)
  },
  {
    path: 'galeria',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/galeria/galeria.component').then(
        (m) => m.GaleriaComponent
      )
  },
  {
    path: 'register',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/register/register.component').then(
        (m) => m.RegisterComponent
      )
  },
  {
    path: 'student/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/student-detail/student-detail.component').then(
        (m) => m.StudentDetailComponent
      )
  },
  { path: '**', redirectTo: 'galeria' }
];
