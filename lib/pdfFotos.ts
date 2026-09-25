import sharp from 'sharp';

// Las fotos del celular pesan varios MB cada una; sin reducirlas, un PDF con
// 10+ fotos llega a decenas de MB, y Vercel rechaza respuestas de más de
// 4.5 MB. A ~1000 px por lado se ven bien en media hoja y el PDF queda en
// ~1 MB. `rotate()` respeta la orientación EXIF, para que las fotos
// verticales no salgan de lado. Si sharp falla con una imagen rara, se usa
// la original: un PDF pesado es mejor que uno sin la foto.
export async function comprimirFoto(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const out = await sharp(bytes)
      .rotate()
      .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
    return new Uint8Array(out);
  } catch {
    return bytes;
  }
}
