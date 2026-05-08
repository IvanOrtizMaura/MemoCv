import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  signal
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { GaleriaStore } from './galeria.store';
import { Student } from '../../core/models/student.model';
import { StudentService } from '../../core/services/student.service';

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
  private readonly studentService = inject(StudentService);

  protected readonly isBulkEmailLoading = signal(false);
  protected readonly isBulkDeleteLoading = signal(false);

  ngOnInit(): void {
    this.store.loadStudents();
  }

  onSearchInput(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    this.store.setSearchQuery(inputElement.value);
  }

  onCardClick(event: Event, studentId: string): void {
    if (this.store.hasSelection()) {
      event.preventDefault();
      this.store.toggleSelection(studentId);
    }
  }

  onCheckboxChange(event: Event, studentId: string): void {
    event.stopPropagation();
    this.store.toggleSelection(studentId);
  }

  onSelectAll(): void {
    const allFilteredIds = this.store.filteredStudents()
      .map((student) => student.id)
      .filter((id): id is string => !!id);
    this.store.selectAll(allFilteredIds);
  }

  onClearSelection(): void {
    this.store.clearSelection();
  }

  async onBulkEmail(): Promise<void> {
    const eligibleStudents = this.store.students().filter(
      (student) =>
        student.id &&
        this.store.selectedIdsSet().has(student.id) &&
        student.photos.length > 0 &&
        !student.emailSent
    );

    if (eligibleStudents.length === 0) {
      alert('No hay estudiantes elegibles. Deben tener fotos y el email no debe haber sido enviado.');
      return;
    }

    this.isBulkEmailLoading.set(true);
    let successCount = 0;
    let errorCount = 0;

    for (const student of eligibleStudents) {
      try {
        await this.studentService.sendEmail(student.id!);
        successCount++;
      } catch {
        errorCount++;
      }
    }

    this.isBulkEmailLoading.set(false);
    this.store.clearSelection();
    alert(`✅ Emails enviados: ${successCount}${errorCount > 0 ? ` | ❌ Errores: ${errorCount}` : ''}.`);
  }

  async onBulkDelete(): Promise<void> {
    const selectedCount = this.store.selectedCount();
    const confirmed = window.confirm(
      `¿Estás seguro de que quieres eliminar ${selectedCount} estudiante(s)? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    const studentsToDelete = this.store.students().filter(
      (student) => student.id && this.store.selectedIdsSet().has(student.id)
    );

    this.isBulkDeleteLoading.set(true);
    let errorCount = 0;

    for (const student of studentsToDelete) {
      try {
        await this.store.deleteStudent(student.id!, student.photos);
      } catch {
        errorCount++;
      }
    }

    this.isBulkDeleteLoading.set(false);
    this.store.clearSelection();

    if (errorCount > 0) {
      alert(`Se eliminaron ${studentsToDelete.length - errorCount} estudiante(s). Errores: ${errorCount}.`);
    }
  }

  async onDeleteStudent(student: Student): Promise<void> {
    if (!student.id) return;

    const confirmed = window.confirm('¿Estás seguro de que quieres eliminar este alumno?');
    if (!confirmed) return;

    await this.store.deleteStudent(student.id, student.photos);
  }
}
