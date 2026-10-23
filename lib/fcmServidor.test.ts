import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, createVerify } from 'crypto';
import { firmarJwt } from './fcmServidor';

describe('firma para Google', () => {
  it('arma un JWT firmado que se puede verificar con la llave pública', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const cuenta = {
      project_id: 'prueba',
      client_email: 'prueba@prueba.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    };
    const jwt = firmarJwt(cuenta, 1000);
    const [encabezado, datos, firma] = jwt.split('.');

    const reclamos = JSON.parse(Buffer.from(datos, 'base64url').toString());
    expect(reclamos).toMatchObject({ iss: cuenta.client_email, iat: 1000, exp: 4600 });
    const valida = createVerify('RSA-SHA256').update(`${encabezado}.${datos}`).verify(publicKey, Buffer.from(firma, 'base64url'));
    expect(valida).toBe(true);
  });
});
