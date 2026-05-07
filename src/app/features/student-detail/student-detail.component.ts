import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  signal
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { StudentService } from '../../core/services/student.service';
import { Student } from '../../core/models/student.model';

@Component({
  selector: 'app-student-detail',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './student-detail.component.html',
  styleUrl: './student-detail.component.scss'
})
export class StudentDetailComponent implements OnInit {
  private readonly studentService = inject(StudentService);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly student = signal<Student | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly isSendingEmail = signal(false);
  protected readonly isDeleting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    const studentId = this.activatedRoute.snapshot.paramMap.get('id');
    if (!studentId) {
      this.router.navigate(['/galeria']);
      return;
    }

    this.studentService.getStudentById(studentId).subscribe({
      next: (fetchedStudent) => {
        if (fetchedStudent) {
          this.student.set(fetchedStudent);
        } else {
          this.notFound.set(true);
        }
        this.isLoading.set(false);
      },
      error: () => {
        this.notFound.set(true);
        this.isLoading.set(false);
      }
    });
  }

  async onSendEmail(): Promise<void> {
    const currentStudent = this.student();
    if (!currentStudent?.id) return;

    this.isSendingEmail.set(true);
    try {
      await this.studentService.sendEmail(currentStudent.id);
      this.student.update((previous) =>
        previous ? { ...previous, emailSent: true } : null
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      console.error('Error sending email via Cloud Function:', message, error);
    } finally {
      this.isSendingEmail.set(false);
    }
  }

  async onDeleteStudent(): Promise<void> {
    const currentStudent = this.student();
    if (!currentStudent?.id) return;

    const confirmed = window.confirm('¿Estás seguro de que quieres eliminar este alumno?');
    if (!confirmed) return;

    this.isDeleting.set(true);
    this.errorMessage.set(null);
    try {
      await this.studentService.deleteStudent(currentStudent.id, currentStudent.photos);
      this.router.navigate(['/galeria']);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error al eliminar el estudiante';
      this.errorMessage.set(message);
    } finally {
      this.isDeleting.set(false);
    }
  }
}
