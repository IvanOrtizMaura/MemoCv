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
}

const initialGaleriaState: GaleriaState = {
  students: [],
  searchQuery: '',
  isLoading: false
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
    })
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
    )
  }))
);
