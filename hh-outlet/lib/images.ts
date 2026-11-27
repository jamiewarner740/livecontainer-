import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

// Photos are stored on disk in UPLOAD_DIR (default ./uploads) and served by app/uploads/[...path]/route.ts.
// Each upload becomes two WebP files: -1200 for product pages, -480 for grids. Photos are only resized and
// turned upright: never retouched, so defects stay visible.
export const uploadDir = () => process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');
const MAX_BYTES = 15 * 1024 * 1024;
const OK_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif']);

export async function saveProductPhoto(file: File) {
  if (!OK_TYPES.has(file.type)) throw new Error(`${file.name}: use a JPEG, PNG, WebP or HEIC photo.`);
  if (file.size > MAX_BYTES) throw new Error(`${file.name}: the photo is over 15 MB.`);
  const input = Buffer.from(await file.arrayBuffer());
  const id = randomUUID();
  await mkdir(uploadDir(), { recursive: true });
  const big = sharp(input, { failOn: 'error' }).rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 });
  const { data, info } = await big.toBuffer({ resolveWithObject: true });
  await writeFile(join(uploadDir(), `${id}-1200.webp`), data);
  const small = await sharp(data).resize({ width: 480, height: 480, fit: 'inside' }).webp({ quality: 75 }).toBuffer();
  await writeFile(join(uploadDir(), `${id}-480.webp`), small);
  return { path: `/uploads/${id}-1200.webp`, width: info.width, height: info.height };
}

/** The grid-size version of a photo path, or the path itself for older images. */
export const thumb = (path: string) => (path.endsWith('-1200.webp') ? path.replace('-1200.webp', '-480.webp') : path);

export async function deleteProductPhoto(path: string) {
  const m = path.match(/^\/uploads\/([0-9a-f-]{36})-1200\.webp$/);
  if (!m) return;
  for (const size of ['1200', '480']) await unlink(join(uploadDir(), `${m[1]}-${size}.webp`)).catch(() => {});
}
