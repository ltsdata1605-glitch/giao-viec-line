const MAX_DIMENSION = 1920;
const WEBP_QUALITY = 0.85;
const JPEG_QUALITY = 0.85;

/**
 * Nén ảnh ngay trên trình duyệt trước khi upload: thu nhỏ ảnh có cạnh dài hơn 1920px
 * và mã hoá lại bằng WebP (dự phòng JPEG nếu trình duyệt không hỗ trợ) để giảm dung
 * lượng đáng kể mà mắt thường không thấy khác biệt so với ảnh gốc. Ảnh GIF (có thể là
 * animation) và các lỗi xử lý được bỏ qua, trả về file gốc để không chặn việc upload.
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;

  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const webpBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY));
    const blob = webpBlob && webpBlob.type === 'image/webp'
      ? webpBlob
      : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));

    if (!blob || blob.size >= file.size) return file;

    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    const name = file.name.replace(/\.[^.]+$/, '') + '.' + ext;
    return new File([blob], name, { type: blob.type });
  } catch {
    return file;
  }
}
