import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  getApps,
  getApp,
  initializeApp,
  FirebaseApp
} from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
  Auth
} from 'firebase/auth';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);

  private readonly firebaseApp: FirebaseApp =
    getApps().length ? getApp() : initializeApp(environment.firebase);
  private readonly firebaseAuth: Auth = getAuth(this.firebaseApp);

  readonly currentUser = signal<User | null>(null);
  readonly isLoggedIn = computed(() => this.currentUser() !== null);

  constructor() {
    onAuthStateChanged(this.firebaseAuth, (user) => {
      this.currentUser.set(user);
    });
  }

  async login(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(this.firebaseAuth, email, password);
    await this.router.navigate(['/galeria']);
  }

  async logout(): Promise<void> {
    await firebaseSignOut(this.firebaseAuth);
    await this.router.navigate(['/login']);
  }

  mapFirebaseAuthError(error: unknown): string {
    const code = (error as { code?: string })?.code ?? '';
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
        return 'Email o contraseña incorrectos';
      case 'auth/user-not-found':
        return 'Usuario no encontrado';
      case 'auth/too-many-requests':
        return 'Demasiados intentos fallidos. Intenta más tarde';
      case 'auth/user-disabled':
        return 'Esta cuenta ha sido deshabilitada';
      case 'auth/invalid-email':
        return 'El formato del email no es válido';
      case 'auth/network-request-failed':
        return 'Error de red. Verifica tu conexión';
      default:
        return 'Error al iniciar sesión. Intenta de nuevo';
    }
  }
}
