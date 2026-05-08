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

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';

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
 * Builds the HTML email body following the original Google Apps Script template.
 */
function buildEmailHtml(nombre: string, photoUrls: string[]): string {
  const photoCount = photoUrls.length;
  const photoWord = photoCount === 1 ? 'fotografía' : 'fotografías';
  const photoLinks = photoUrls
    .map(
      (url, i) => `
    <p style="margin: 8px 0;">
      <a href="${url}" style="color: #e74c3c; text-decoration: none; font-weight: bold;">
        📷 Foto ${i + 1}
      </a>
    </p>`
    )
    .join('');

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
    Te envío los enlaces para descargar las <strong>${photoCount} ${photoWord}</strong> capturadas de
    nuestra sesión. ¡El resultado ha quedado genial! 🎉
  </p>

  ${photoLinks}

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
export const sendStudentEmail = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 120,
    memory: '512MiB',
    secrets: ['GMAIL_PASSWORD'],
  },
  async (request: CallableRequest<SendEmailRequest>): Promise<SendEmailResponse> => {
    // ── 1. Authentication guard ───────────────────────────────────────────────
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'You must be signed in to send emails.'
      );
    }

    // ── 2. Validate input ─────────────────────────────────────────────────────
    const { studentId } = request.data;
    if (!studentId || typeof studentId !== 'string' || studentId.trim() === '') {
      throw new HttpsError('invalid-argument', 'studentId must be a non-empty string.');
    }

    logger.info(`sendStudentEmail called for studentId=${studentId}`, {
      callerUid: request.auth.uid,
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
      logger.warn(`Email already sent for studentId=${studentId}. Aborting.`);
      return { success: false, message: 'Email was already sent for this student.' };
    }

    // ── 4. Send email via Gmail SMTP with photo links ─────────────────────────
    const gmailPassword = process.env['GMAIL_PASSWORD'];

    if (!gmailPassword) {
      logger.error('GMAIL_PASSWORD secret is not set.');
      throw new HttpsError(
        'internal',
        'Email service is not configured. Contact the administrator.'
      );
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: 'memodreamsevents@gmail.com',
        pass: gmailPassword,
      },
    });

    const nombre = student.nombre;
    const photoCount = student.photos.length;

    logger.info(`Sending email to ${student.email} with ${photoCount} photo link(s)…`);

    try {
      await transporter.sendMail({
        from: '"MemodreamsEvents" <memodreamsevents@gmail.com>',
        to: student.email,
        subject: `Fotos CV - ${nombre}`,
        html: buildEmailHtml(nombre, student.photos),
      });
    } catch (mailError: unknown) {
      logger.error('Failed to send email:', mailError);
      throw new HttpsError('internal', 'Failed to send email. Please try again later.');
    }

    // ── 7. Mark emailSent: true in Firestore ──────────────────────────────────
    await studentRef.update({ emailSent: true });
    logger.info(`Marked emailSent=true for studentId=${studentId}`);

    return {
      success: true,
      message: `Email sent successfully to ${student.email}.`,
    };
  });
