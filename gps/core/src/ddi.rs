//! Locating a user-sourced Developer Disk Image (the "bring your own DDI" model).
//!
//! We NEVER host, download, or link to a DDI. We read one the user already has — from a
//! folder they point us at, or (later) Xcode's on-disk copy. If none is found, we guide
//! them to the legitimate source (install Xcode). See `tasks-2-ddi-mounting.md` and
//! design §8.
//!
//! This module reads the "clean" personalized layout (iOS 17+):
//! `Image.dmg` + `BuildManifest.plist` + `Image.dmg.trustcache`. (Mapping Xcode's
//! Restore-bundle layout to these is a separate, researched task.)

use std::path::Path;

use crate::error::DeviceError;

const IMAGE: &str = "Image.dmg";
const BUILD_MANIFEST: &str = "BuildManifest.plist";
const TRUST_CACHE: &str = "Image.dmg.trustcache";

const GUIDANCE: &str = "No developer image found. Install Xcode (or run \
    `xcode-select --install`) and connect your device once so Apple provisions it, or \
    point GeoSpoof GPS at a folder containing Image.dmg, BuildManifest.plist, and \
    Image.dmg.trustcache.";

/// The three artifacts needed to mount a personalized DDI (iOS 17+).
pub struct DdiFiles {
    /// The developer disk image (`Image.dmg`).
    pub image: Vec<u8>,
    /// The build manifest (`BuildManifest.plist`).
    pub build_manifest: Vec<u8>,
    /// The image trust cache (`Image.dmg.trustcache`).
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
    /// Load a personalized DDI from a folder in the clean 3-file layout. Returns
    /// [`DeviceError::DdiUnavailable`] (with guidance) if any file is missing/unreadable.
    pub fn load_from_dir(dir: &Path) -> Result<Self, DeviceError> {
        let image = read_required(dir, IMAGE)?;
        let build_manifest = read_required(dir, BUILD_MANIFEST)?;
        let trust_cache = read_required(dir, TRUST_CACHE)?;
        Ok(Self {
            image,
            build_manifest,
            trust_cache,
        })
    }
}

fn read_required(dir: &Path, name: &str) -> Result<Vec<u8>, DeviceError> {
    std::fs::read(dir.join(name)).map_err(|_| DeviceError::DdiUnavailable(GUIDANCE.to_string()))
}

/// Locate a personalized DDI. If `custom_dir` is given, use it; otherwise return the
/// guidance error. (Auto-detecting Xcode's on-disk Restore bundle is a follow-up task.)
pub fn locate_ddi(custom_dir: Option<&Path>) -> Result<DdiFiles, DeviceError> {
    match custom_dir {
        Some(dir) => DdiFiles::load_from_dir(dir),
        None => Err(DeviceError::DdiUnavailable(GUIDANCE.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(dir: &Path, name: &str, bytes: &[u8]) {
        std::fs::write(dir.join(name), bytes).unwrap();
    }

    #[test]
    fn loads_complete_ddi_folder() {
        let tmp = std::env::temp_dir().join(format!("ggps-ddi-{}", std::process::id()));
        std::fs::create_dir_all(&tmp).unwrap();
        write(&tmp, IMAGE, b"img");
        write(&tmp, BUILD_MANIFEST, b"manifest");
        write(&tmp, TRUST_CACHE, b"tc");

        let files = DdiFiles::load_from_dir(&tmp).expect("should load");
        assert_eq!(files.image, b"img");
        assert_eq!(files.build_manifest, b"manifest");
        assert_eq!(files.trust_cache, b"tc");

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn missing_files_give_guidance() {
        let tmp = std::env::temp_dir().join(format!("ggps-ddi-missing-{}", std::process::id()));
        std::fs::create_dir_all(&tmp).unwrap();
        write(&tmp, IMAGE, b"img"); // manifest + trust cache absent

        let err = DdiFiles::load_from_dir(&tmp).unwrap_err();
        assert!(matches!(err, DeviceError::DdiUnavailable(_)));

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn locate_without_path_guides() {
        let err = locate_ddi(None).unwrap_err();
        match err {
            DeviceError::DdiUnavailable(msg) => assert!(msg.contains("Xcode")),
            other => panic!("expected DdiUnavailable, got {other:?}"),
        }
    }
}
