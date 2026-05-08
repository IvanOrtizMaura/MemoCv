import { signalStore, withState, withComputed, withMethods, patchState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, switchMap, tap, catchError, EMPTY } from 'rxjs';
import { Student } from '../../core/models/student.model';
import { StudentService } from '../../core/services/student.service';

interface GaleriaState {
  students: Student[];
  searchQuery: string;
  isLoading: boolean;
  selectedIds: string[];
}

const initialGaleriaState: GaleriaState = {
  students: [],
  searchQuery: '',
  isLoading: false,
  selectedIds: []
};

export const GaleriaStore = signalStore(
  withState(initialGaleriaState),
  withComputed((store) => ({
    filteredStudents: computed(() => {
      const query = store.searchQuery().toLowerCase().trim();
      if (!query) return store.students();
      return store.students().filter((student) => {
        const fullName = `${student.nombre} ${student.apellidos}`.toLowerCase();
        return fullName.includes(query) || student.email.toLowerCase().includes(query);
      });
    }),
    selectedIdsSet: computed(() => new Set(store.selectedIds())),
    selectedCount: computed(() => store.selectedIds().length),
    hasSelection: computed(() => store.selectedIds().length > 0)
  })),
  withMethods((store, studentService = inject(StudentService)) => ({
    setSearchQuery(query: string): void {
      patchState(store, { searchQuery: query });
    },
    loadStudents: rxMethod<void>(
      pipe(
        switchMap(() => {
          patchState(store, { isLoading: true });
          return studentService.getStudents().pipe(
            tap((students) => patchState(store, { students, isLoading: false })),
            catchError(() => {
              patchState(store, { isLoading: false });
              return EMPTY;
            })
          );
        })
      )
    ),
    async deleteStudent(studentId: string, photoUrls: string[]): Promise<void> {
      await studentService.deleteStudent(studentId, photoUrls);
      patchState(store, {
        students: store.students().filter((student) => student.id !== studentId)
      });
    },
    toggleSelection(studentId: string): void {
      const currentIds = store.selectedIds();
      if (currentIds.includes(studentId)) {
        patchState(store, { selectedIds: currentIds.filter((id) => id !== studentId) });
      } else {
        patchState(store, { selectedIds: [...currentIds, studentId] });
      }
    },
    selectAll(studentIds: string[]): void {
      patchState(store, { selectedIds: studentIds });
    },
    clearSelection(): void {
      patchState(store, { selectedIds: [] });
    }
  }))
);
