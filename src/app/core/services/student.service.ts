import { Injectable, inject } from '@angular/core';
import {
  getApps,
  getApp,
  initializeApp,
  FirebaseApp
} from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  Firestore,
  Timestamp,
  query,
  orderBy,
  DocumentData
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  FirebaseStorage
} from 'firebase/storage';
import { getFunctions, httpsCallable, Functions } from 'firebase/functions';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Student, StudentFormData } from '../models/student.model';

@Injectable({ providedIn: 'root' })
export class StudentService {
  private readonly firebaseApp: FirebaseApp =
    getApps().length ? getApp() : initializeApp(environment.firebase);
  private readonly firestore: Firestore = getFirestore(this.firebaseApp);
  private readonly storage: FirebaseStorage = getStorage(this.firebaseApp);
  private readonly functions: Functions = getFunctions(this.firebaseApp, 'us-central1');

  private readonly studentsCollection = collection(this.firestore, 'students');

  getStudents(): Observable<Student[]> {
    return new Observable<Student[]>((observer) => {
      const studentsQuery = query(this.studentsCollection, orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(
        studentsQuery,
        (snapshot) => {
          const students = snapshot.docs.map((document) =>
            this.mapDocumentToStudent(document.id, document.data())
          );
          observer.next(students);
        },
        (error) => observer.error(error)
      );
      return () => unsubscribe();
    });
  }

  getStudentById(id: string): Observable<Student | undefined> {
    return new Observable<Student | undefined>((observer) => {
      const studentDocRef = doc(this.firestore, 'students', id);
      const unsubscribe = onSnapshot(
        studentDocRef,
        (snapshot) => {
          if (snapshot.exists()) {
            observer.next(this.mapDocumentToStudent(snapshot.id, snapshot.data()));
          } else {
            observer.next(undefined);
          }
        },
        (error) => observer.error(error)
      );
      return () => unsubscribe();
    });
  }

  async createStudent(formData: StudentFormData): Promise<string> {
    const temporaryDocRef = await addDoc(this.studentsCollection, {
      nombre: formData.nombre,
      apellidos: formData.apellidos,
      email: formData.email,
      photos: [],
      createdAt: Timestamp.now(),
      emailSent: false
    });

    const studentId = temporaryDocRef.id;
    const photoUrls = await this.uploadPhotos(studentId, formData.photoFiles);

    await updateDoc(temporaryDocRef, { photos: photoUrls });

    return studentId;
  }

  async uploadPhotos(studentId: string, photoFiles: File[]): Promise<string[]> {
    const uploadPromises = photoFiles.map(async (file) => {
      const storageRef = ref(this.storage, `students/${studentId}/${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      return getDownloadURL(snapshot.ref);
    });
    return Promise.all(uploadPromises);
  }

  async markEmailSent(studentId: string): Promise<void> {
    const studentDocRef = doc(this.firestore, 'students', studentId);
    await updateDoc(studentDocRef, { emailSent: true });
  }

  async deleteStudent(studentId: string, photoUrls: string[]): Promise<void> {
    const studentDocRef = doc(this.firestore, 'students', studentId);
    await deleteDoc(studentDocRef);

    const deletePhotoPromises = photoUrls.map((photoUrl) => {
      const photoRef = ref(this.storage, photoUrl);
      return deleteObject(photoRef);
    });
    await Promise.all(deletePhotoPromises);
  }

  /**
   * Calls the `sendStudentEmail` Cloud Function.
   *
   * The function downloads the student's photos from Firebase Storage,
   * sends them as email attachments via Nodemailer/Gmail, and marks
   * `emailSent: true` in Firestore on success.
   *
   * @param studentId  Firestore document ID of the student.
   * @throws {FirebaseError} if the function call fails (unauthenticated,
   *   not-found, internal, etc.). The caller should handle this.
   */
  async sendEmail(studentId: string): Promise<void> {
    const sendStudentEmail = httpsCallable<
      { studentId: string },
      { success: boolean; message: string }
    >(this.functions, 'sendStudentEmail');

    const result = await sendStudentEmail({ studentId });

    if (!result.data.success) {
      // The function returned success:false (e.g. email already sent)
      throw new Error(result.data.message);
    }
  }

  private mapDocumentToStudent(id: string, data: DocumentData): Student {
    return {
      id,
      nombre: data['nombre'] as string,
      apellidos: data['apellidos'] as string,
      email: data['email'] as string,
      photos: (data['photos'] as string[]) ?? [],
      createdAt:
        data['createdAt'] instanceof Timestamp
          ? data['createdAt'].toDate()
          : new Date(data['createdAt'] as string),
      emailSent: (data['emailSent'] as boolean) ?? false
    };
  }
}
