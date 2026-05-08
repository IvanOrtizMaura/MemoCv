import {
  Component,
  ChangeDetectionStrategy,
  signal,
  OnInit,
  inject
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { getApps, getApp, initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, Timestamp } from 'firebase/firestore';
import { environment } from '../../../environments/environment';

interface DownloadTokenData {
  photoUrls: string[];
  studentName: string;
  expiresAt: Timestamp;
  createdAt: Timestamp;
}

const firebaseApp = getApps().length ? getApp() : initializeApp(environment.firebase);
const firestoreDatabase = getFirestore(firebaseApp);

@Component({
  selector: 'app-download',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './download.component.html',
  styleUrl: './download.component.scss'
})
export class DownloadComponent implements OnInit {
  private readonly activatedRoute = inject(ActivatedRoute);

  readonly isLoading = signal<boolean>(true);
  readonly isExpired = signal<boolean>(false);
  readonly isInvalid = signal<boolean>(false);
  readonly studentName = signal<string>('');
  readonly photoUrls = signal<string[]>([]);
  readonly expiresAt = signal<Date | null>(null);
  readonly isDownloadingAll = signal<boolean>(false);

  async ngOnInit(): Promise<void> {
    const token = this.activatedRoute.snapshot.paramMap.get('token');

    if (!token) {
      this.isInvalid.set(true);
      this.isLoading.set(false);
      return;
    }

    try {
      const tokenDocumentRef = doc(firestoreDatabase, 'downloadTokens', token);
      const tokenSnapshot = await getDoc(tokenDocumentRef);

      if (!tokenSnapshot.exists()) {
        this.isInvalid.set(true);
        this.isLoading.set(false);
        return;
      }

      const tokenData = tokenSnapshot.data() as DownloadTokenData;
      const expirationDate = tokenData.expiresAt.toDate();

      if (expirationDate < new Date()) {
        this.isExpired.set(true);
        this.expiresAt.set(expirationDate);
        this.isLoading.set(false);
        return;
      }

      this.studentName.set(tokenData.studentName);
      this.photoUrls.set(tokenData.photoUrls);
      this.expiresAt.set(expirationDate);
    } catch {
      this.isInvalid.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }

  downloadPhoto(photoUrl: string, photoIndex: number): void {
    const separator = photoUrl.includes('?') ? '&' : '?';
    const downloadUrl = `${photoUrl}${separator}response-content-disposition=attachment%3Bfilename%3Dfoto_${photoIndex + 1}.jpg`;
    const anchorElement = document.createElement('a');
    anchorElement.href = downloadUrl;
    anchorElement.target = '_blank';
    anchorElement.rel = 'noopener';
    document.body.appendChild(anchorElement);
    anchorElement.click();
    document.body.removeChild(anchorElement);
  }

  async downloadAllPhotos(): Promise<void> {
    this.isDownloadingAll.set(true);
    const allPhotoUrls = this.photoUrls();

    for (let photoIndex = 0; photoIndex < allPhotoUrls.length; photoIndex++) {
      this.downloadPhoto(allPhotoUrls[photoIndex], photoIndex);
      await new Promise<void>((resolve) => setTimeout(resolve, 800));
    }

    this.isDownloadingAll.set(false);
  }

  formatExpirationDate(expirationDate: Date): string {
    return expirationDate.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }
}
