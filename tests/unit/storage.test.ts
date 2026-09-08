import { describe, it, expect, vi } from "vitest";
import { StorageService } from "../../src/storage/supabaseStorage";

describe("StorageService", () => {
  it("generates correct storage file path format", async () => {
    const service = new StorageService("test-bucket");
    const buffer = Buffer.from("fake-image-bytes");

    const path = await service.uploadAnswerSheet("user-123", "sub-456", buffer, "image/jpeg");
    expect(path).toBe("user-123/sub-456.jpg");
  });

  it("handles png mime type appropriately", async () => {
    const service = new StorageService("test-bucket");
    const buffer = Buffer.from("fake-image-bytes");

    const path = await service.uploadAnswerSheet("user-123", "sub-789", buffer, "image/png");
    expect(path).toBe("user-123/sub-789.png");
  });
});
