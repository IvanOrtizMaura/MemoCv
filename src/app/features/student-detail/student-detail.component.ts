import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  signal,
  computed
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { StudentService } from '../../core/services/student.service';
import { Student } from '../../core/models/student.model';

const maxTotalPhotos = 12;

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
  protected readonly isUploadingPhotos = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly selectedPhotoFiles = signal<File[]>([]);
  protected readonly photoPreviewUrls = signal<string[]>([]);
  protected readonly maxPhotos = maxTotalPhotos;

  protected readonly hasPhotosForEmail = computed(
    () => (this.student()?.photos.length ?? 0) > 0
  );

  protected readonly canAddMorePhotos = computed(() => {
    const existingPhotosCount = this.student()?.photos.length ?? 0;
    return existingPhotosCount + this.selectedPhotoFiles().length < maxTotalPhotos;
  });

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

  onPhotoFileSelected(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    if (!inputElement.files) return;

    const existingPhotosCount = this.student()?.photos.length ?? 0;
    const incomingFiles = Array.from(inputElement.files);
    const availableSlots = maxTotalPhotos - existingPhotosCount - this.selectedPhotoFiles().length;
    const filesToAdd = incomingFiles.slice(0, availableSlots);

    this.selectedPhotoFiles.set([...this.selectedPhotoFiles(), ...filesToAdd]);
    const newPreviews = filesToAdd.map((file) => URL.createObjectURL(file));
    this.photoPreviewUrls.set([...this.photoPreviewUrls(), ...newPreviews]);

    inputElement.value = '';
  }

  onRemoveSelectedPhoto(index: number): void {
    URL.revokeObjectURL(this.photoPreviewUrls()[index]);
    this.selectedPhotoFiles.set(this.selectedPhotoFiles().filter((_, i) => i !== index));
    this.photoPreviewUrls.set(this.photoPreviewUrls().filter((_, i) => i !== index));
  }

  async onAddPhotos(): Promise<void> {
    const currentStudent = this.student();
    if (!currentStudent?.id || this.selectedPhotoFiles().length === 0) return;

    this.isUploadingPhotos.set(true);
    this.errorMessage.set(null);
    try {
      const updatedPhotos = await this.studentService.addPhotosToStudent(
        currentStudent.id,
        this.selectedPhotoFiles()
      );
      this.photoPreviewUrls().forEach((url) => URL.revokeObjectURL(url));
      this.selectedPhotoFiles.set([]);
      this.photoPreviewUrls.set([]);
      this.student.update((previous) =>
        previous ? { ...previous, photos: updatedPhotos } : null
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error al subir las fotos';
      this.errorMessage.set(message);
    } finally {
      this.isUploadingPhotos.set(false);
    }
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
