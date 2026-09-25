import sharp from 'sharp';

// Las fotos del celular pesan varios MB cada una; sin reducirlas, un PDF con
// 5-10 fotos llegaba a 14-27 MB, pesado para compartir por WhatsApp o abrir
// con datos móviles. A ~1400 px por lado y calidad 80 se ven nítidas incluso
// con zoom y el PDF queda en pocos MB. `rotate()` respeta la orientación
// EXIF, para que las fotos verticales no salgan de lado. Si sharp falla con
// una imagen rara, se usa la original: un PDF pesado es mejor que uno sin la
// foto. Las fotos originales no se tocan: esto solo afecta la copia del PDF.
export async function comprimirFoto(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const out = await sharp(bytes)
      .rotate()
      .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return new Uint8Array(out);
  } catch {
    return bytes;
  }
}
