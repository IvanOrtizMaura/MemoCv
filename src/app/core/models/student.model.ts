export interface Student {
  id?: string;
  nombre: string;
  apellidos: string;
  email: string;
  photos: string[];
  createdAt: Date;
  emailSent: boolean;
}

export interface StudentFormData {
  nombre: string;
  apellidos: string;
  email: string;
  photoFiles: File[];
}
