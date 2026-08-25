/**
 * Apple Root CA - G3, the trust anchor for App Store Server Notifications.
 *
 * Apple signs each notification as a JWS whose `x5c` header carries the full
 * certificate chain (leaf -> intermediate -> root). Verification means checking
 * that chain terminates at a root we already trust, so the root has to be
 * embedded here rather than read from the request.
 *
 * Why base64 in source instead of a `.cer` file: this runs inside a bundled
 * Vercel/Nitro function. A `readFileSync` of a binary asset only works if the
 * bundler happens to trace it; a string constant always survives.
 *
 * Provenance — downloaded from Apple's PKI page (https://www.apple.com/certificateauthority/)
 * at https://www.apple.com/certificateauthority/AppleRootCA-G3.cer:
 *   subject/issuer  CN=Apple Root CA - G3, OU=Apple Certification Authority, O=Apple Inc., C=US
 *   validity        2014-04-30 -> 2039-04-30
 *   SHA-256         63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79
 *
 * To re-verify this blob matches the published certificate:
 *   curl -sO https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
 *   openssl x509 -inform der -in AppleRootCA-G3.cer -noout -fingerprint -sha256
 */
const APPLE_ROOT_CA_G3_BASE64 =
  "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9v" +
  "dCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UE" +
  "CgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2" +
  "WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmlj" +
  "YXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqG" +
  "SM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxE" +
  "tX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNC" +
  "MEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0P" +
  "AQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3m" +
  "eoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkL" +
  "F1vLUagM6BgD56KyKA=="

/** The DER bytes of Apple Root CA - G3, in the shape `SignedDataVerifier` wants. */
export function appleRootCertificates(): Array<Buffer> {
  return [Buffer.from(APPLE_ROOT_CA_G3_BASE64, "base64")]
}
