//! Locating a user-sourced Developer Disk Image (the "bring your own DDI" model).
//!
//! We NEVER host, download, or link to a DDI. We read one the user already has — from
//! Xcode's on-disk copy, or a folder they point us at. If none is found, we guide them
//! to the legitimate source (install Xcode). See `tasks-2-ddi-mounting.md` and design §8.
//!
//! Two layouts are supported (same files, different packaging):
//! - **Restore bundle** (what Xcode installs at `/Library/Developer/DeveloperDiskImages/
//!   iOS_DDI/Restore/`): `BuildManifest.plist` naming a `PersonalizedDMG` (the image)
//!   and a `LoadableTrustCache`.
//! - **Clean trio** (how users may repackage it): `Image.dmg` / `BuildManifest.plist` /
//!   `Image.dmg.trustcache`.

use std::path::{Path, PathBuf};

use crate::error::DeviceError;

const CLEAN_IMAGE: &str = "Image.dmg";
const CLEAN_MANIFEST: &str = "BuildManifest.plist";
const CLEAN_TRUST_CACHE: &str = "Image.dmg.trustcache";

/// Xcode's standard on-disk DDI location (macOS).
const XCODE_DDI: &str = "/Library/Developer/DeveloperDiskImages/iOS_DDI";

const GUIDANCE: &str = "No developer image found. Install Xcode (or run \
    `xcode-select --install`) and connect your device once so Apple provisions it, or \
    point GeoSpoof GPS at a DDI folder.";

/// The three artifacts needed to mount a personalized DDI (iOS 17+).
pub struct DdiFiles {
    /// The developer disk image.
    pub image: Vec<u8>,
    /// The build manifest (passed to Apple TSS for personalization).
    pub build_manifest: Vec<u8>,
    /// The image trust cache.
    pub trust_cache: Vec<u8>,
}

impl std::fmt::Debug for DdiFiles {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DdiFiles")
            .field("image_bytes", &self.image.len())
            .field("build_manifest_bytes", &self.build_manifest.len())
            .field("trust_cache_bytes", &self.trust_cache.len())
            .finish()
    }
}

impl DdiFiles {
    /// Load a DDI from a folder, auto-detecting the layout (clean trio or Restore
    /// bundle, including a nested `Restore/` subdir). Guidance error if none is found.
    pub fn load_from_dir(dir: &Path) -> Result<Self, DeviceError> {
        if dir.join(CLEAN_IMAGE).exists() {
            return load_clean(dir);
        }
        for base in [dir.to_path_buf(), dir.join("Restore")] {
            if base.join("BuildManifest.plist").exists() {
                return load_restore(&base);
            }
        }
        Err(guidance())
    }
}

fn guidance() -> DeviceError {
    DeviceError::DdiUnavailable(GUIDANCE.to_string())
}

fn read(path: &Path) -> Result<Vec<u8>, DeviceError> {
    std::fs::read(path).map_err(|_| guidance())
}

fn load_clean(dir: &Path) -> Result<DdiFiles, DeviceError> {
    Ok(DdiFiles {
        image: read(&dir.join(CLEAN_IMAGE))?,
        build_manifest: read(&dir.join(CLEAN_MANIFEST))?,
        trust_cache: read(&dir.join(CLEAN_TRUST_CACHE))?,
    })
}

/// Read a Restore bundle: parse `BuildManifest.plist` for the `PersonalizedDMG` (image)
/// and `LoadableTrustCache` component paths (relative to `base`), and read those files.
fn load_restore(base: &Path) -> Result<DdiFiles, DeviceError> {
    let build_manifest = read(&base.join("BuildManifest.plist"))?;
    let image_rel = manifest_component_path(&build_manifest, "PersonalizedDMG")?;
    let trust_rel = manifest_component_path(&build_manifest, "LoadableTrustCache")?;
    Ok(DdiFiles {
        image: read(&base.join(image_rel))?,
        trust_cache: read(&base.join(trust_rel))?,
        build_manifest,
    })
}

/// Extract `BuildIdentities[0].Manifest.<component>.Info.Path` from a BuildManifest.
fn manifest_component_path(manifest: &[u8], component: &str) -> Result<String, DeviceError> {
    let value: plist::Value = plist::from_bytes(manifest).map_err(|_| guidance())?;
    value
        .as_dictionary()
        .and_then(|d| d.get("BuildIdentities"))
        .and_then(plist::Value::as_array)
        .and_then(|a| a.first())
        .and_then(plist::Value::as_dictionary)
        .and_then(|d| d.get("Manifest"))
        .and_then(plist::Value::as_dictionary)
        .and_then(|m| m.get(component))
        .and_then(plist::Value::as_dictionary)
        .and_then(|c| c.get("Info"))
        .and_then(plist::Value::as_dictionary)
        .and_then(|i| i.get("Path"))
        .and_then(plist::Value::as_string)
        .map(str::to_string)
        .ok_or_else(guidance)
}

/// Locate a DDI: an explicit user folder if given, else Xcode's standard on-disk
/// location, else the guidance error.
pub fn locate_ddi(custom_dir: Option<&Path>) -> Result<DdiFiles, DeviceError> {
    if let Some(dir) = custom_dir {
        return DdiFiles::load_from_dir(dir);
    }
    let xcode = PathBuf::from(XCODE_DDI);
    if xcode.exists() {
        return DdiFiles::load_from_dir(&xcode);
    }
    Err(guidance())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ggps-ddi-{tag}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn loads_clean_trio() {
        let dir = tmp("clean");
        std::fs::write(dir.join(CLEAN_IMAGE), b"img").unwrap();
        std::fs::write(dir.join(CLEAN_MANIFEST), b"manifest").unwrap();
        std::fs::write(dir.join(CLEAN_TRUST_CACHE), b"tc").unwrap();

        let files = DdiFiles::load_from_dir(&dir).expect("clean load");
        assert_eq!(files.image, b"img");
        assert_eq!(files.trust_cache, b"tc");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn loads_restore_bundle() {
        let dir = tmp("restore");
        std::fs::create_dir_all(dir.join("Firmware")).unwrap();
        std::fs::write(dir.join("Img.dmg"), b"IMAGE").unwrap();
        std::fs::write(dir.join("Firmware/Img.dmg.trustcache"), b"TRUST").unwrap();

        // Minimal BuildManifest: BuildIdentities[0].Manifest.{PersonalizedDMG,
        // LoadableTrustCache}.Info.Path
        let manifest = build_manifest_plist("Img.dmg", "Firmware/Img.dmg.trustcache");
        std::fs::write(dir.join("BuildManifest.plist"), &manifest).unwrap();

        let files = DdiFiles::load_from_dir(&dir).expect("restore load");
        assert_eq!(files.image, b"IMAGE");
        assert_eq!(files.trust_cache, b"TRUST");
        assert_eq!(files.build_manifest, manifest);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn missing_gives_guidance() {
        let dir = tmp("empty");
        let err = DdiFiles::load_from_dir(&dir).unwrap_err();
        assert!(matches!(err, DeviceError::DdiUnavailable(_)));
        std::fs::remove_dir_all(&dir).ok();
    }

    fn build_manifest_plist(image_path: &str, trust_path: &str) -> Vec<u8> {
        use plist::{Dictionary, Value};
        let mut info_img = Dictionary::new();
        info_img.insert("Path".into(), Value::String(image_path.into()));
        let mut img = Dictionary::new();
        img.insert("Info".into(), Value::Dictionary(info_img));

        let mut info_tc = Dictionary::new();
        info_tc.insert("Path".into(), Value::String(trust_path.into()));
        let mut tc = Dictionary::new();
        tc.insert("Info".into(), Value::Dictionary(info_tc));

        let mut manifest = Dictionary::new();
        manifest.insert("PersonalizedDMG".into(), Value::Dictionary(img));
        manifest.insert("LoadableTrustCache".into(), Value::Dictionary(tc));

        let mut identity = Dictionary::new();
        identity.insert("Manifest".into(), Value::Dictionary(manifest));

        let mut root = Dictionary::new();
        root.insert(
            "BuildIdentities".into(),
            Value::Array(vec![Value::Dictionary(identity)]),
        );

        let mut buf = Vec::new();
        plist::to_writer_xml(&mut buf, &Value::Dictionary(root)).unwrap();
        buf
    }
}
