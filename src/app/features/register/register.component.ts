import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { StudentService } from '../../core/services/student.service';

const maxPhotosAllowed = 12;

function minLengthTrimmedValidator(minLength: number) {
  return (control: AbstractControl): ValidationErrors | null => {
    const trimmedValue = (control.value ?? '').trim();
    return trimmedValue.length >= minLength ? null : { minlength: true };
  };
}

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent {
  private readonly studentService = inject(StudentService);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly selectedFiles = signal<File[]>([]);
  protected readonly previewUrls = signal<string[]>([]);

  protected readonly photosCount = computed(() => this.selectedFiles().length);
  protected readonly canAddMorePhotos = computed(
    () => this.selectedFiles().length < maxPhotosAllowed
  );
  protected readonly maxPhotos = maxPhotosAllowed;

  protected readonly registerForm = this.formBuilder.nonNullable.group({
    nombre: ['', [Validators.required, minLengthTrimmedValidator(2)]],
    apellidos: ['', [Validators.required, minLengthTrimmedValidator(2)]],
    email: ['', [Validators.required, Validators.email]]
  });

  onFileSelected(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    if (!inputElement.files) return;

    const incomingFiles = Array.from(inputElement.files);
    const currentFiles = this.selectedFiles();
    const availableSlots = maxPhotosAllowed - currentFiles.length;
    const filesToAdd = incomingFiles.slice(0, availableSlots);

    const newFiles = [...currentFiles, ...filesToAdd];
    this.selectedFiles.set(newFiles);

    const newPreviews = filesToAdd.map((file) => URL.createObjectURL(file));
    this.previewUrls.set([...this.previewUrls(), ...newPreviews]);

    inputElement.value = '';
  }

  removePhoto(index: number): void {
    const currentFiles = this.selectedFiles();
    const currentPreviews = this.previewUrls();

    URL.revokeObjectURL(currentPreviews[index]);

    this.selectedFiles.set(currentFiles.filter((_, i) => i !== index));
    this.previewUrls.set(currentPreviews.filter((_, i) => i !== index));
  }

  async onSubmit(): Promise<void> {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const formValue = this.registerForm.getRawValue();
      await this.studentService.createStudent({
        nombre: formValue.nombre.trim(),
        apellidos: formValue.apellidos.trim(),
        email: formValue.email.trim(),
        photoFiles: this.selectedFiles()
      });
      this.previewUrls().forEach((url) => URL.revokeObjectURL(url));
      await this.router.navigate(['/galeria']);
    } catch (error: unknown) {
      console.error('Error creating student:', error);
      this.errorMessage.set('Error al guardar el registro. Intenta de nuevo.');
    } finally {
      this.isLoading.set(false);
    }
  }

  isFieldInvalid(fieldName: string): boolean {
    const control = this.registerForm.get(fieldName);
    return !!(control && control.invalid && control.touched);
  }
}
