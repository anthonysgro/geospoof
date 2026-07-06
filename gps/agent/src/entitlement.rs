//! Offline verification of the app's Apple-signed StoreKit entitlement (Requirement 6).
//!
//! The iPhone sends Apple-signed JWS material over the link (see
//! [`crate::contract::EntitlementProof`]); this module verifies it OFFLINE — JWS
//! signature + X.509 chain to the embedded Apple Root CA - G3 + bundle-id / environment
//! checks (via a faithful port of Apple's App Store Server Library) — and then derives
//! Pro exactly as the app's own `ProStore` does:
//! `isPro = founder || ownsLifetime || activeSubscription`.
//!
//! Because every artifact is Apple-signed, a forged `desired.json` can't fake it — the
//! honest replacement for the legacy unsigned `pro` bool, which anyone who could write
//! the file could set to `true`.

use app_store_server_library::primitives::app_transaction::AppTransaction;
use app_store_server_library::primitives::environment::Environment;
use app_store_server_library::primitives::jws_transaction_decoded_payload::JWSTransactionDecodedPayload;
use app_store_server_library::signed_data_verifier::SignedDataVerifier;
use chrono::{DateTime, Utc};

use crate::contract::EntitlementProof;

/// Bundle id every signed artifact must belong to (matches the iOS app + the verifier's
/// own app-identifier check).
const BUNDLE_ID: &str = "com.moonloaf.geospoof";

/// Pro product identifiers (mirror `ProStore.ProductID`).
const PRODUCT_MONTHLY: &str = "com.moonloaf.geospoof.pro.monthly";
const PRODUCT_ANNUAL: &str = "com.moonloaf.geospoof.pro.annual";
const PRODUCT_LIFETIME: &str = "com.moonloaf.geospoof.pro.lifetime";

/// Founder cutoff. On iOS, `AppTransaction.originalApplicationVersion` is the app's BUILD
/// number (`CFBundleVersion`); Pro launched at build 40, so a first-installed build below
/// it is grandfathered as a founder — exactly `ProStore.founderCutoff` on iOS. The device
/// sending the proof is always an iPhone here, so this single build cutoff is correct.
const FOUNDER_CUTOFF_BUILD: u64 = 40;

/// Apple Root CA - G3 (DER) — the trust anchor for StoreKit's JWS `x5c` chain. Embedded so
/// verification is fully offline (source: Apple PKI,
/// <https://www.apple.com/certificateauthority/>).
const APPLE_ROOT_CA_G3: &[u8] = include_bytes!("../assets/AppleRootCA-G3.cer");

/// Verify the signed entitlement proof and decide whether the user is Pro.
///
/// Returns `true` only if at least one Apple-signed artifact both VERIFIES (signature +
/// chain to Apple's root + our bundle id) and grants Pro (founder, an owned lifetime
/// unlock, or an unexpired/unrevoked subscription). Any verification failure yields
/// `false` — unverified material is never trusted.
pub fn verify_pro(proof: &EntitlementProof) -> bool {
    verify_pro_at(proof, Utc::now())
}

/// [`verify_pro`] with an injectable "now", so subscription-expiry logic is testable.
fn verify_pro_at(proof: &EntitlementProof, now: DateTime<Utc>) -> bool {
    entitlement_environments()
        .into_iter()
        .any(|env| grants_pro_in_env(proof, env, now))
}

/// Environments to try, in order. StoreKit signs identically across environments; only the
/// payload's `environment` field differs and is checked after decode, so a Production
/// artifact fails a Sandbox verifier and vice-versa — hence we try each.
///
/// - **Release:** only `Production` + `Sandbox`, both fully signature+chain verified
///   against the embedded Apple root. A TestFlight/sandbox tester is still real Pro.
/// - **DEBUG only:** also `Xcode` + `LocalTesting`, which the library decodes WITHOUT
///   signature verification — so an app run from Xcode with a `.storekit` config (whose
///   `AppTransaction` is signed by Xcode's local test cert, not Apple's) can exercise the
///   full flow locally. Compiled out of release, exactly like `ProStore`'s
///   DEBUG-accepts-unverified path, so it can never weaken a shipping agent.
fn entitlement_environments() -> Vec<Environment> {
    #[cfg(debug_assertions)]
    {
        vec![
            Environment::Production,
            Environment::Sandbox,
            Environment::Xcode,
            Environment::LocalTesting,
        ]
    }
    #[cfg(not(debug_assertions))]
    {
        vec![Environment::Production, Environment::Sandbox]
    }
}

/// Verify + evaluate the proof against a single environment's verifier.
fn grants_pro_in_env(proof: &EntitlementProof, env: Environment, now: DateTime<Utc>) -> bool {
    let verifier = SignedDataVerifier::new(
        vec![APPLE_ROOT_CA_G3.to_vec()],
        env.clone(),
        BUNDLE_ID.to_string(),
        // Only used for notification verification (which we don't do); transaction /
        // app-transaction verification checks the bundle id + environment, not this.
        None,
    );

    // Founder — proven by the signed AppTransaction (founders have no purchase to send).
    if let Some(app_tx_jws) = &proof.app_transaction {
        match verifier.verify_and_decode_app_transaction(app_tx_jws) {
            Ok(app_tx) => {
                let founder = is_founder(&app_tx);
                tracing::debug!(
                    ?env,
                    original_app_version = app_tx
                        .original_application_version
                        .as_deref()
                        .unwrap_or("<none>"),
                    founder,
                    "entitlement: AppTransaction verified"
                );
                if founder {
                    return true;
                }
            }
            Err(e) => {
                tracing::debug!(?env, error = %e, "entitlement: AppTransaction verify failed")
            }
        }
    }

    // Lifetime unlock or active subscription — proven by a current entitlement transaction.
    for jws in &proof.transactions {
        match verifier.verify_and_decode_signed_transaction(jws) {
            Ok(tx) => {
                let grants = transaction_grants_pro(&tx, now);
                tracing::debug!(
                    ?env,
                    product = tx.product_id.as_deref().unwrap_or("<none>"),
                    revoked = tx.revocation_date.is_some(),
                    grants,
                    "entitlement: transaction verified"
                );
                if grants {
                    return true;
                }
            }
            Err(e) => tracing::debug!(?env, error = %e, "entitlement: transaction verify failed"),
        }
    }
    false
}

/// Founder if the first-installed build is below the cutoff.
fn is_founder(app_tx: &AppTransaction) -> bool {
    is_founder_build(app_tx.original_application_version.as_deref())
}

/// Founder check on the raw `originalApplicationVersion` string.
///
/// NOTE: in sandbox/TestFlight Apple often reports `originalApplicationVersion` as "1.0"
/// rather than a real build, which parses below the cutoff and thus reads as founder.
/// That only affects sandbox testers (harmless — they're testing), and production values
/// are the true build number.
fn is_founder_build(original_app_version: Option<&str>) -> bool {
    original_app_version
        .and_then(parse_leading_u64)
        .map(|build| build < FOUNDER_CUTOFF_BUILD)
        .unwrap_or(false)
}

/// Whether a verified transaction currently grants Pro: not revoked, and either the
/// lifetime non-consumable or an unexpired subscription.
fn transaction_grants_pro(tx: &JWSTransactionDecodedPayload, now: DateTime<Utc>) -> bool {
    if tx.revocation_date.is_some() {
        return false;
    }
    match tx.product_id.as_deref() {
        Some(PRODUCT_LIFETIME) => true,
        Some(PRODUCT_MONTHLY) | Some(PRODUCT_ANNUAL) => {
            tx.expires_date.is_some_and(|exp| exp > now)
        }
        _ => false,
    }
}

/// Parse the leading run of ASCII digits as a `u64` (e.g. "40" -> 40). `None` if the
/// string doesn't start with a digit.
fn parse_leading_u64(s: &str) -> Option<u64> {
    let digits: String = s.chars().take_while(char::is_ascii_digit).collect();
    digits.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    fn ms(dt: DateTime<Utc>) -> i64 {
        dt.timestamp_millis()
    }

    /// Build a `JWSTransactionDecodedPayload` from just the fields we evaluate. Serde
    /// treats the type's `Option` fields as absent-is-None, so a minimal object suffices.
    fn tx(
        product_id: &str,
        expires_ms: Option<i64>,
        revocation_ms: Option<i64>,
    ) -> JWSTransactionDecodedPayload {
        let mut m = serde_json::Map::new();
        m.insert("productId".into(), json!(product_id));
        if let Some(e) = expires_ms {
            m.insert("expiresDate".into(), json!(e));
        }
        if let Some(r) = revocation_ms {
            m.insert("revocationDate".into(), json!(r));
        }
        serde_json::from_value(Value::Object(m)).expect("valid transaction payload")
    }

    #[test]
    fn parse_leading_u64_reads_leading_digits() {
        assert_eq!(parse_leading_u64("40"), Some(40));
        assert_eq!(parse_leading_u64("39"), Some(39));
        assert_eq!(parse_leading_u64("1.0"), Some(1));
        assert_eq!(parse_leading_u64("beta"), None);
        assert_eq!(parse_leading_u64(""), None);
    }

    #[test]
    fn founder_only_below_cutoff() {
        assert!(is_founder_build(Some("39"))); // pre-paywall build → founder
        assert!(!is_founder_build(Some("40"))); // the paywall build itself → not founder
        assert!(!is_founder_build(Some("41"))); // later build → not founder
        assert!(!is_founder_build(None)); // unknown → not founder
        assert!(!is_founder_build(Some("nope"))); // unparseable → not founder
    }

    #[test]
    fn lifetime_grants_pro_regardless_of_expiry() {
        let now = Utc::now();
        assert!(transaction_grants_pro(
            &tx(PRODUCT_LIFETIME, None, None),
            now
        ));
    }

    #[test]
    fn active_subscription_grants_pro() {
        let now = Utc::now();
        let future = ms(now + chrono::Duration::days(30));
        assert!(transaction_grants_pro(
            &tx(PRODUCT_MONTHLY, Some(future), None),
            now
        ));
        assert!(transaction_grants_pro(
            &tx(PRODUCT_ANNUAL, Some(future), None),
            now
        ));
    }

    #[test]
    fn expired_subscription_does_not_grant_pro() {
        let now = Utc::now();
        let past = ms(now - chrono::Duration::days(1));
        assert!(!transaction_grants_pro(
            &tx(PRODUCT_MONTHLY, Some(past), None),
            now
        ));
        // A subscription with no expiry at all also doesn't count.
        assert!(!transaction_grants_pro(
            &tx(PRODUCT_ANNUAL, None, None),
            now
        ));
    }

    #[test]
    fn revoked_transaction_does_not_grant_pro() {
        let now = Utc::now();
        let future = ms(now + chrono::Duration::days(30));
        let revoked = ms(now - chrono::Duration::days(1));
        // Even a lifetime unlock, once refunded/revoked, stops granting Pro.
        assert!(!transaction_grants_pro(
            &tx(PRODUCT_LIFETIME, None, Some(revoked)),
            now
        ));
        // A revoked-but-not-yet-expired subscription also doesn't count.
        assert!(!transaction_grants_pro(
            &tx(PRODUCT_MONTHLY, Some(future), Some(revoked)),
            now
        ));
    }

    #[test]
    fn unknown_product_does_not_grant_pro() {
        let now = Utc::now();
        let future = ms(now + chrono::Duration::days(30));
        assert!(!transaction_grants_pro(
            &tx("com.moonloaf.geospoof.something.else", Some(future), None),
            now
        ));
    }

    #[test]
    fn forged_or_garbage_proof_is_rejected() {
        // Unsigned / malformed JWS strings must never verify → not Pro.
        let forged = EntitlementProof {
            app_transaction: Some("not.a.real.jws".to_string()),
            transactions: vec![
                "also.fake.jws".to_string(),
                "eyJhbGciOiJFUzI1NiJ9.e30.sig".to_string(),
            ],
        };
        assert!(!verify_pro(&forged));

        // An empty proof is not Pro.
        assert!(!verify_pro(&EntitlementProof::default()));
    }
}
