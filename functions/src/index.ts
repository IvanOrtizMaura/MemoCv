/**
 * Firebase Cloud Functions — MemoCV
 *
 * sendStudentEmail: Callable HTTPS function that:
 *  1. Verifies the caller is authenticated.
 *  2. Reads the student document from Firestore.
 *  3. Downloads each photo from its Firebase Storage download URL.
 *  4. Sends an HTML email via Resend with the photos as real attachments.
 *  5. Marks emailSent: true in Firestore on success.
 *
 * ─────────────────────────────────────────────
 * SETUP — Resend API Key (required)
 * ─────────────────────────────────────────────
 * Store the Resend API key as a Firebase Secret:
 *   firebase functions:secrets:set RESEND_API_KEY
 *
 * The secret is injected automatically via runWith({ secrets: ['RESEND_API_KEY'] })
 * and is accessible at process.env['RESEND_API_KEY'] at runtime.
 *
 * For local development / emulator, create functions/.secret.local:
 *   RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
 * ─────────────────────────────────────────────
 */

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';
import axios from 'axios';

const { HttpsError } = functions.https;

// ── Firebase Admin init ───────────────────────────────────────────────────────
admin.initializeApp();
const db = admin.firestore();

// ── Types ─────────────────────────────────────────────────────────────────────
interface SendEmailRequest {
  studentId: string;
}

interface SendEmailResponse {
  success: boolean;
  message: string;
}

interface StudentData {
  nombre: string;
  apellidos: string;
  email: string;
  photos: string[];
  emailSent: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Downloads a file from a URL and returns it as a Buffer.
 * Throws an HttpsError if the download fails.
 */
async function downloadPhoto(url: string): Promise<Buffer> {
  const response = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 30_000, // 30 s per photo
  });
  return Buffer.from(response.data);
}

/**
 * Infers a safe filename from a Firebase Storage download URL.
 * Falls back to a numbered default when the URL has no readable path segment.
 */
function filenameFromUrl(url: string, index: number): string {
  try {
    const decoded = decodeURIComponent(url);
    // Firebase Storage URLs contain the path after "/o/" — e.g.
    // .../o/students%2FstudentId%2Fphoto.jpg?...
    const match = decoded.match(/\/o\/(.+?)(\?|$)/);
    if (match) {
      const segments = match[1].split('/');
      const name = segments[segments.length - 1];
      // Make sure we have an image extension
      if (/\.(jpe?g|png|gif|webp)$/i.test(name)) return name;
    }
  } catch {
    // ignore parse errors
  }
  return `foto_${index + 1}.jpg`;
}

/**
 * Builds the HTML email body following the original Google Apps Script template.
 */
function buildEmailHtml(nombre: string, photoCount: number): string {
  const photoWord = photoCount === 1 ? 'fotografía' : 'fotografías';
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">

  <h2 style="color: #2c3e50;">¡Hola, ${nombre}! 👋</h2>

  <p>
    Te envío adjuntas las <strong>${photoCount} ${photoWord}</strong> capturadas de
    nuestra sesión. ¡El resultado ha quedado genial! 🎉
  </p>

  <p>
    Puedes ver más sobre nuestro trabajo en
    <a href="https://memodreams.com/" style="color: #e74c3c; text-decoration: none;">
      memodreams.com
    </a>.
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />

  <p style="margin-bottom: 4px;">
    Si estás satisfecho/a con el resultado, nos ayudaría muchísimo que nos dejaras
    una reseña en Google:
  </p>
  <p>
    <a
      href="https://g.page/r/CdcQrFTiPOEMEBM/review"
      style="
        display: inline-block;
        background-color: #4285f4;
        color: #fff;
        padding: 10px 20px;
        border-radius: 4px;
        text-decoration: none;
        font-weight: bold;
      "
    >
      ⭐ Dejar reseña en Google
    </a>
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />

  <p style="color: #666; font-size: 14px;">
    Un saludo,<br />
    <strong>MemodreamsEvents</strong><br />
    <a href="https://memodreams.com/" style="color: #e74c3c;">memodreams.com</a>
  </p>

</body>
</html>
  `.trim();
}

// ── Cloud Function ────────────────────────────────────────────────────────────

/**
 * sendStudentEmail
 *
 * Callable HTTPS function. Must be called from an authenticated Angular client:
 *
 *   const fn = httpsCallable(functions, 'sendStudentEmail');
 *   await fn({ studentId: 'abc123' });
 */
export const sendStudentEmail = functions
  .region('europe-west1')
  .runWith({
    timeoutSeconds: 120,
    memory: '512MB',
    secrets: ['RESEND_API_KEY'], // injects the secret as process.env['RESEND_API_KEY']
  })
  .https.onCall(async (data: SendEmailRequest, context): Promise<SendEmailResponse> => {
    // ── 1. Authentication guard ───────────────────────────────────────────────
    if (!context.auth) {
      throw new HttpsError(
        'unauthenticated',
        'You must be signed in to send emails.'
      );
    }

    // ── 2. Validate input ─────────────────────────────────────────────────────
    const { studentId } = data;
    if (!studentId || typeof studentId !== 'string' || studentId.trim() === '') {
      throw new HttpsError('invalid-argument', 'studentId must be a non-empty string.');
    }

    functions.logger.info(`sendStudentEmail called for studentId=${studentId}`, {
      callerUid: context.auth.uid,
    });

    // ── 3. Read student from Firestore ────────────────────────────────────────
    const studentRef = db.collection('students').doc(studentId.trim());
    const snapshot = await studentRef.get();

    if (!snapshot.exists) {
      throw new HttpsError('not-found', `Student ${studentId} not found.`);
    }

    const student = snapshot.data() as StudentData;

    if (!student.email) {
      throw new HttpsError('failed-precondition', 'Student has no email address.');
    }

    if (!student.photos || student.photos.length === 0) {
      throw new HttpsError('failed-precondition', 'Student has no photos to send.');
    }

    if (student.emailSent) {
      functions.logger.warn(`Email already sent for studentId=${studentId}. Aborting.`);
      return { success: false, message: 'Email was already sent for this student.' };
    }

    // ── 4. Download photos ────────────────────────────────────────────────────
    functions.logger.info(`Downloading ${student.photos.length} photo(s)…`);

    const attachments = await Promise.all(
      student.photos.map(async (url, index) => {
        const buffer = await downloadPhoto(url);
        const filename = filenameFromUrl(url, index);
        return {
          filename,
          content: buffer,
          contentType: 'image/jpeg',
        };
      })
    );

    // ── 5. Send email via Resend ──────────────────────────────────────────────
    // TODO: switch from to 'MemodreamsEvents <eventos@memodreams.com>' once
    //       the memodreams.com domain is verified in Resend.
    const resendApiKey = process.env['RESEND_API_KEY'];

    if (!resendApiKey) {
      functions.logger.error('RESEND_API_KEY secret is not set.');
      throw new HttpsError(
        'internal',
        'Email service is not configured. Contact the administrator.'
      );
    }

    const resend = new Resend(resendApiKey);

    const nombre = student.nombre;
    const photoCount = student.photos.length;

    functions.logger.info(`Sending email to ${student.email} with ${photoCount} attachment(s)…`);

    try {
      const { error } = await resend.emails.send({
        from: 'MemodreamsEvents <onboarding@resend.dev>', // TODO: change to 'MemodreamsEvents <eventos@memodreams.com>' once domain is verified
        to: student.email,
        subject: `FOTO CV JOB DAY UIB 2026 - ${nombre}`,
        html: buildEmailHtml(nombre, photoCount),
        attachments: attachments.map((a) => ({
          filename: a.filename,
          content: a.content, // Resend accepts Buffer directly
        })),
      });

      if (error) {
        functions.logger.error('Resend returned an error:', error);
        throw new HttpsError('internal', 'Failed to send email. Please try again later.');
      }

      functions.logger.info(`Email sent successfully via Resend to ${student.email}`);
    } catch (mailError: unknown) {
      functions.logger.error('Resend failed to send email:', mailError);
      throw new HttpsError('internal', 'Failed to send email. Please try again later.');
    }

    // ── 7. Mark emailSent: true in Firestore ──────────────────────────────────
    await studentRef.update({ emailSent: true });
    functions.logger.info(`Marked emailSent=true for studentId=${studentId}`);

    return {
      success: true,
      message: `Email sent successfully to ${student.email}.`,
    };
  });
