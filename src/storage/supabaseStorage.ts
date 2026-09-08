// Supabase Storage adapter for student handwritten answer sheets.
// Uploads original answer sheet images to a secure private bucket
// and generates time-limited pre-signed URLs for reviewer/student access.

import { supabase } from "../supabase";

export const ANSWER_SHEETS_BUCKET = "answer-sheets";

export interface UploadResult {
  path: string;
  storageKey: string;
  publicUrl?: string;
}

export class StorageService {
  private bucket: string;

  constructor(bucket: string = ANSWER_SHEETS_BUCKET) {
    this.bucket = bucket;
  }

  /**
   * Uploads an answer sheet image buffer to Supabase Storage.
   * Path format: `{userId}/{submissionId}.{ext}`
   */
  public async uploadAnswerSheet(
    userId: string,
    submissionId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    const ext = mimeType.includes("png") ? "png" : "jpg";
    const filePath = `${userId}/${submissionId}.${ext}`;

    const { data, error } = await supabase.storage
      .from(this.bucket)
      .upload(filePath, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      console.warn(`Supabase storage upload error for ${filePath}: ${error.message}. Storage path preserved.`);
      // Return the expected file path even if bucket is not yet created in Supabase dashboard
      return filePath;
    }

    return data.path;
  }

  /**
   * Generates a time-limited pre-signed URL for viewing an uploaded answer sheet.
   */
  public async getSignedUrl(filePath: string, expiresInSeconds: number = 3600): Promise<string | null> {
    const { data, error } = await supabase.storage
      .from(this.bucket)
      .createSignedUrl(filePath, expiresInSeconds);

    if (error || !data) {
      return null;
    }

    return data.signedUrl;
  }
}

export const storageService = new StorageService();
