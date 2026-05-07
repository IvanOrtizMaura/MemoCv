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
      console.log('Send email Cloud Function stub — student ID:', currentStudent.id);
      await this.studentService.markEmailSent(currentStudent.id);
      this.student.update((previous) =>
        previous ? { ...previous, emailSent: true } : null
      );
    } catch (error: unknown) {
      console.error('Error sending email:', error);
    } finally {
      this.isSendingEmail.set(false);
    }
  }
}
