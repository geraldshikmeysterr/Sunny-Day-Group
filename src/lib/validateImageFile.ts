const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

/** Validates file by reading magic bytes — not just extension or MIME type from OS */
export async function validateImageFile(
  file: File
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (file.size > MAX_IMAGE_SIZE) {
    return { ok: false, error: "Файл слишком большой (максимум 5 МБ)" };
  }

  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());

  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng  = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
              && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;

  if (!isJpeg && !isPng && !isWebp) {
    return { ok: false, error: "Допустимы только изображения JPEG, PNG или WebP" };
  }

  return { ok: true };
}
