export const MAX_MESSAGE_LENGTH = 8000;

/** Fallback limits, refreshed from /api/chat/upload-limits/ when online. */
export const DEFAULT_UPLOAD_LIMITS = {
  image: 10 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
  video: 200 * 1024 * 1024,
  file: 50 * 1024 * 1024,
};

export type UploadKind = keyof typeof DEFAULT_UPLOAD_LIMITS;

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const units = ["КБ", "МБ", "ГБ"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 || Number.isInteger(value) ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

export function kindForFile(file: File): UploadKind {
  const type = file.type || "";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("video/")) return "video";
  return "file";
}

export const KIND_LABEL: Record<UploadKind, string> = {
  image: "изображения",
  audio: "аудио",
  video: "видео",
  file: "файлы",
};

export function describeLimits(limits: Record<string, number>): string {
  return `Аудио до ${formatSize(limits.audio)}, видео до ${formatSize(
    limits.video
  )}, фото до ${formatSize(limits.image)}, файлы до ${formatSize(limits.file)}`;
}

export function checkFileSize(
  file: File,
  limits: Record<string, number>,
  kind?: UploadKind
): string | null {
  const resolved = kind ?? kindForFile(file);
  const limit = limits[resolved] ?? DEFAULT_UPLOAD_LIMITS.file;
  if (file.size > limit) {
    return `Файл «${file.name}» больше лимита: максимум ${formatSize(limit)} для ${
      KIND_LABEL[resolved]
    }`;
  }
  return null;
}
