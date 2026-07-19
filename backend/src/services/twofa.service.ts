import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

export class TwoFAService {
  static generateSecret(email: string) {
    const secret = speakeasy.generateSecret({ length: 20, name: `OSGARD:${email}` });
    return {
      secret: secret.base32,
      otpauth_url: secret.otpauth_url as string
    };
  }

  static verifyToken(secret: string, token: string): boolean {
    return speakeasy.totp.verify({ secret, encoding: 'base32', token });
  }

  static async generateQR(otpauth_url: string): Promise<string> {
    return QRCode.toDataURL(otpauth_url);
  }
}
