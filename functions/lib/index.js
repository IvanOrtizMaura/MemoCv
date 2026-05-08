"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendStudentEmail = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const admin = __importStar(require("firebase-admin"));
const nodemailer = __importStar(require("nodemailer"));
const axios_1 = __importDefault(require("axios"));
// ── Firebase Admin init ───────────────────────────────────────────────────────
admin.initializeApp();
const db = admin.firestore();
// ── Helpers ───────────────────────────────────────────────────────────────────
/**
 * Downloads a file from a URL and returns it as a Buffer.
 * Throws an HttpsError if the download fails.
 */
async function downloadPhoto(url) {
    const response = await axios_1.default.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30 s per photo
    });
    return Buffer.from(response.data);
}
/**
 * Infers a safe filename from a Firebase Storage download URL.
 * Falls back to a numbered default when the URL has no readable path segment.
 */
function filenameFromUrl(url, index) {
    try {
        const decoded = decodeURIComponent(url);
        // Firebase Storage URLs contain the path after "/o/" — e.g.
        // .../o/students%2FstudentId%2Fphoto.jpg?...
        const match = decoded.match(/\/o\/(.+?)(\?|$)/);
        if (match) {
            const segments = match[1].split('/');
            const name = segments[segments.length - 1];
            // Make sure we have an image extension
            if (/\.(jpe?g|png|gif|webp)$/i.test(name))
                return name;
        }
    }
    catch (_a) {
        // ignore parse errors
    }
    return `foto_${index + 1}.jpg`;
}
/**
 * Builds the HTML email body following the original Google Apps Script template.
 */
function buildEmailHtml(nombre, photoCount) {
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
exports.sendStudentEmail = (0, https_1.onCall)({
    region: 'us-central1',
    timeoutSeconds: 120,
    memory: '512MiB',
    secrets: ['GMAIL_PASSWORD'],
}, async (request) => {
    // ── 1. Authentication guard ───────────────────────────────────────────────
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'You must be signed in to send emails.');
    }
    // ── 2. Validate input ─────────────────────────────────────────────────────
    const { studentId } = request.data;
    if (!studentId || typeof studentId !== 'string' || studentId.trim() === '') {
        throw new https_1.HttpsError('invalid-argument', 'studentId must be a non-empty string.');
    }
    v2_1.logger.info(`sendStudentEmail called for studentId=${studentId}`, {
        callerUid: request.auth.uid,
    });
    // ── 3. Read student from Firestore ────────────────────────────────────────
    const studentRef = db.collection('students').doc(studentId.trim());
    const snapshot = await studentRef.get();
    if (!snapshot.exists) {
        throw new https_1.HttpsError('not-found', `Student ${studentId} not found.`);
    }
    const student = snapshot.data();
    if (!student.email) {
        throw new https_1.HttpsError('failed-precondition', 'Student has no email address.');
    }
    if (!student.photos || student.photos.length === 0) {
        throw new https_1.HttpsError('failed-precondition', 'Student has no photos to send.');
    }
    if (student.emailSent) {
        v2_1.logger.warn(`Email already sent for studentId=${studentId}. Aborting.`);
        return { success: false, message: 'Email was already sent for this student.' };
    }
    // ── 4. Download photos ────────────────────────────────────────────────────
    v2_1.logger.info(`Downloading ${student.photos.length} photo(s)…`);
    const attachments = await Promise.all(student.photos.map(async (url, index) => {
        const buffer = await downloadPhoto(url);
        const filename = filenameFromUrl(url, index);
        return {
            filename,
            content: buffer,
            contentType: 'image/jpeg',
        };
    }));
    // ── 5. Send email via Gmail SMTP ──────────────────────────────────────────
    const gmailPassword = process.env['GMAIL_PASSWORD'];
    if (!gmailPassword) {
        v2_1.logger.error('GMAIL_PASSWORD secret is not set.');
        throw new https_1.HttpsError('internal', 'Email service is not configured. Contact the administrator.');
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
    v2_1.logger.info(`Sending email to ${student.email} with ${photoCount} attachment(s)…`);
    try {
        await transporter.sendMail({
            from: '"MemodreamsEvents" <memodreamsevents@gmail.com>',
            to: student.email,
            subject: `FOTO CV JOB DAY UIB 2026 - ${nombre}`,
            html: buildEmailHtml(nombre, photoCount),
            attachments: attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
                contentType: 'image/jpeg',
            })),
        });
    }
    catch (mailError) {
        v2_1.logger.error('Resend failed to send email:', mailError);
        throw new https_1.HttpsError('internal', 'Failed to send email. Please try again later.');
    }
    // ── 7. Mark emailSent: true in Firestore ──────────────────────────────────
    await studentRef.update({ emailSent: true });
    v2_1.logger.info(`Marked emailSent=true for studentId=${studentId}`);
    return {
        success: true,
        message: `Email sent successfully to ${student.email}.`,
    };
});
//# sourceMappingURL=index.js.map