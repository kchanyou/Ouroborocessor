use crate::*;

const RECORD: &str = "backup.json";
const PROJECT: &str = "Project.story";

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BackupRecord {
    version: u32,
    source: String,
    title: String,
    created_at: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BackupEntry {
    path: String,
    title: String,
    created_at: u64,
    scenes: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BackupReport {
    entries: Vec<BackupEntry>,
    invalid_count: usize,
}

// Never follow links out of a project, including links in its history or images.
fn copy_tree(source: &Path, target: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(source).map_err(storage_error)?;
    if meta.is_symlink() {
        return Err("BACKUP_SYMLINK".into());
    }
    if meta.is_dir() {
        fs::create_dir(target).map_err(storage_error)?;
        for entry in fs::read_dir(source).map_err(storage_error)? {
            let entry = entry.map_err(storage_error)?;
            copy_tree(&entry.path(), &target.join(entry.file_name()))?;
        }
    } else if meta.is_file() {
        fs::copy(source, target).map_err(storage_error)?;
    } else {
        return Err("BACKUP_INVALID".into());
    }
    Ok(())
}

fn copy_project(source: &Path, target: &Path) -> Result<ProjectSnapshot, String> {
    let revision = project_revision(source)?;
    load_project_from_path(source)?;
    for entry in fs::read_dir(source).map_err(storage_error)? {
        let entry = entry.map_err(storage_error)?;
        if entry.file_name() != MANIFEST_FILE {
            copy_tree(&entry.path(), &target.join(entry.file_name()))?;
        }
    }
    // Commit the manifest last, so partial copies cannot be opened as projects.
    copy_tree(&source.join(MANIFEST_FILE), &target.join(MANIFEST_FILE))?;
    verify_revision(source, &revision)?;
    load_project_from_path(target)
}

// Optimistic snapshot: copying must never hold up editing or saving. If a file
// changes during the copy, discard that output instead of publishing mixed versions.
#[derive(PartialEq, Eq)]
struct FileRevision {
    path: PathBuf,
    len: u64,
    modified: SystemTime,
    created: Option<SystemTime>,
    #[cfg(unix)]
    inode: u64,
}

fn project_revision(root: &Path) -> Result<Vec<FileRevision>, String> {
    fn visit(path: &Path, result: &mut Vec<FileRevision>) -> Result<(), String> {
        let meta = fs::symlink_metadata(path).map_err(storage_error)?;
        if meta.is_symlink() {
            return Err("BACKUP_SYMLINK".into());
        }
        if meta.is_dir() {
            for entry in fs::read_dir(path).map_err(storage_error)? {
                visit(&entry.map_err(storage_error)?.path(), result)?;
            }
        } else if meta.is_file() {
            result.push(FileRevision {
                path: path.to_path_buf(),
                len: meta.len(),
                modified: meta.modified().map_err(storage_error)?,
                created: meta.created().ok(),
                #[cfg(unix)]
                inode: {
                    use std::os::unix::fs::MetadataExt;
                    meta.ino()
                },
            });
        } else {
            return Err("BACKUP_INVALID".into());
        }
        Ok(())
    }
    let mut result = vec![];
    visit(root, &mut result)?;
    result.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(result)
}

fn verify_revision(root: &Path, expected: &[FileRevision]) -> Result<(), String> {
    if project_revision(root)? != expected {
        return Err("BACKUP_CHANGED".into());
    }
    Ok(())
}

fn destination_outside(source: &Path, destination: &str) -> Result<PathBuf, String> {
    let path = Path::new(destination)
        .canonicalize()
        .map_err(storage_error)?;
    if !path.is_dir() || path.starts_with(source) {
        return Err("EXPORT_DESTINATION".into());
    }
    Ok(path)
}

fn read_record(path: &Path) -> Result<BackupRecord, String> {
    for item in [path.to_path_buf(), path.join(RECORD), path.join(PROJECT)] {
        if fs::symlink_metadata(item)
            .map_err(storage_error)?
            .is_symlink()
        {
            return Err("BACKUP_SYMLINK".into());
        }
    }
    let record: BackupRecord =
        serde_json::from_slice(&fs::read(path.join(RECORD)).map_err(storage_error)?)
            .map_err(|_| "BACKUP_INVALID")?;
    if record.version != 1 {
        return Err("BACKUP_INVALID".into());
    }
    Ok(record)
}

pub(crate) fn create_backup_blocking(
    project_path: String,
    destination: String,
) -> Result<BackupEntry, String> {
    let source = Path::new(&project_path)
        .canonicalize()
        .map_err(storage_error)?;
    let destination = destination_outside(&source, &destination)?;
    let output = destination.join(timestamp_id("Ouroborocessor-backup")?);
    fs::create_dir(&output).map_err(storage_error)?;
    let result = (|| {
        fs::create_dir(output.join(PROJECT)).map_err(storage_error)?;
        let snapshot = copy_project(&source, &output.join(PROJECT))?;
        let record = BackupRecord {
            version: 1,
            source: source.to_string_lossy().into_owned(),
            title: snapshot.title.clone(),
            created_at: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_secs(),
        };
        write_atomic(
            &output.join(RECORD),
            &serde_json::to_vec(&record).map_err(|e| e.to_string())?,
        )?;
        Ok(BackupEntry {
            path: output.to_string_lossy().into_owned(),
            title: record.title,
            created_at: record.created_at,
            scenes: snapshot
                .nodes
                .iter()
                .filter(|node| node.kind == NodeKind::Scene)
                .count(),
        })
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&output);
    }
    result
}

pub(crate) fn list_backups_blocking(destination: String) -> Result<BackupReport, String> {
    let mut report = BackupReport {
        entries: vec![],
        invalid_count: 0,
    };
    for item in fs::read_dir(destination).map_err(storage_error)? {
        let item = item.map_err(storage_error)?;
        if !item
            .file_name()
            .to_string_lossy()
            .starts_with("Ouroborocessor-backup-")
        {
            continue;
        }
        let path = item.path();
        let result = (|| {
            let record = read_record(&path)?;
            let project = path.join(PROJECT);
            let manifest = read_manifest(&project)?;
            let scenes: Vec<_> = manifest
                .nodes
                .iter()
                .filter(|node| node.kind == NodeKind::Scene && node.trashed.is_none())
                .collect();
            for node in &scenes {
                let file =
                    checked_scene_path(&project, node.file.as_deref().ok_or("BACKUP_INVALID")?)?;
                // Check access without loading every manuscript into memory.
                fs::File::open(file).map_err(storage_error)?;
            }
            Ok::<_, String>(BackupEntry {
                path: path.to_string_lossy().into_owned(),
                title: record.title,
                created_at: record.created_at,
                scenes: scenes.len(),
            })
        })();
        match result {
            Ok(entry) => report.entries.push(entry),
            Err(_) => report.invalid_count += 1,
        }
    }
    report.entries.sort_by(|a, b| {
        b.created_at
            .cmp(&a.created_at)
            .then_with(|| b.path.cmp(&a.path))
    });
    Ok(report)
}

pub(crate) fn preview_backup_blocking(backup_path: String) -> Result<ProjectSnapshot, String> {
    let path = Path::new(&backup_path);
    read_record(path)?;
    load_project_from_path(&path.join(PROJECT))
}

pub(crate) fn restore_backup_blocking(
    backup_path: String,
    destination: String,
) -> Result<String, String> {
    read_record(Path::new(&backup_path))?;
    let source = Path::new(&backup_path)
        .canonicalize()
        .map_err(storage_error)?;
    let record = read_record(&source)?;
    let destination = destination_outside(&source, &destination)?;
    // Do not place a recovered project inside the original project either.
    if destination.starts_with(Path::new(&record.source)) {
        return Err("EXPORT_DESTINATION".into());
    }
    let output = destination.join(format!(
        "{}.story",
        timestamp_id("Ouroborocessor-restored")?
    ));
    fs::create_dir(&output).map_err(storage_error)?;
    let result = copy_project(&source.join(PROJECT), &output);
    if result.is_err() {
        let _ = fs::remove_dir_all(&output);
    }
    result.map(|_| output.to_string_lossy().into_owned())
}

#[tauri::command]
pub(crate) async fn create_backup(
    project_path: String,
    destination: String,
) -> Result<BackupEntry, String> {
    tauri::async_runtime::spawn_blocking(move || create_backup_blocking(project_path, destination))
        .await
        .map_err(|error| error.to_string())?
}
#[tauri::command]
pub(crate) async fn list_backups(destination: String) -> Result<BackupReport, String> {
    tauri::async_runtime::spawn_blocking(move || list_backups_blocking(destination))
        .await
        .map_err(|error| error.to_string())?
}
#[tauri::command]
pub(crate) async fn preview_backup(backup_path: String) -> Result<ProjectSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || preview_backup_blocking(backup_path))
        .await
        .map_err(|error| error.to_string())?
}
#[tauri::command]
pub(crate) async fn restore_backup(
    backup_path: String,
    destination: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || restore_backup_blocking(backup_path, destination))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn changing_sources_are_rejected_instead_of_publishing_mixed_versions() {
        let root = tempdir().unwrap();
        let file = root.path().join("scene.md");
        fs::write(&file, "before").unwrap();
        let revision = project_revision(root.path()).unwrap();
        write_atomic(&file, b"edited").unwrap();
        assert_eq!(
            verify_revision(root.path(), &revision).err().unwrap(),
            "BACKUP_CHANGED"
        );
        let revision = project_revision(root.path()).unwrap();
        fs::write(root.path().join("new.md"), "added").unwrap();
        assert!(verify_revision(root.path(), &revision).is_err());
        let revision = project_revision(root.path()).unwrap();
        fs::remove_file(&file).unwrap();
        assert!(verify_revision(root.path(), &revision).is_err());
    }

    #[test]
    #[ignore = "creates a temporary ~160 MiB project and its backup/restore for manual performance measurement"]
    fn large_project_performance() {
        use std::time::Instant;
        let root = tempdir().unwrap();
        let project = project(root.path());
        let source = Path::new(&project.project_path);
        let mut manifest = read_manifest(source).unwrap();
        let template = manifest
            .nodes
            .iter()
            .find(|node| node.kind == NodeKind::Scene)
            .unwrap()
            .clone();
        manifest.nodes.retain(|node| node.kind == NodeKind::Group);
        let text = "한글 😀 manuscript\n".repeat(7_000);
        for i in 0..256 {
            let mut scene = template.clone();
            scene.id = format!("scene-{i}");
            scene.file = Some(format!("manuscript/scene-{i}.md"));
            scene.title = format!("Scene {i}");
            fs::write(source.join(scene.file.as_ref().unwrap()), &text).unwrap();
            manifest.nodes.push(scene);
        }
        write_manifest(source, &manifest).unwrap();
        fs::create_dir(source.join("images")).unwrap();
        fs::create_dir(source.join(".history")).unwrap();
        let bytes = vec![0x5a; 2 * 1024 * 1024];
        for i in 0..32 {
            fs::write(source.join(format!("images/image-{i}.png")), &bytes).unwrap();
            fs::write(source.join(format!(".history/version-{i}.json")), &bytes).unwrap();
        }
        let size: u64 = project_revision(source)
            .unwrap()
            .iter()
            .map(|file| file.len)
            .sum();
        let archive = root.path().join("backups");
        fs::create_dir(&archive).unwrap();
        let other_parent = root.path().join("other");
        fs::create_dir(&other_parent).unwrap();
        let other = create_project(
            other_parent.to_string_lossy().into_owned(),
            "Other".into(),
            "Group".into(),
            "Scene".into(),
        )
        .unwrap();
        let other_scene = other
            .nodes
            .iter()
            .find(|node| node.kind == NodeKind::Scene)
            .unwrap();
        let start = Instant::now();
        let backup = tauri::async_runtime::spawn(create_backup(
            project.project_path.clone(),
            archive.to_string_lossy().into_owned(),
        ));
        while fs::read_dir(&archive).unwrap().next().is_none() {
            assert!(start.elapsed().as_secs() < 30);
            std::thread::sleep(std::time::Duration::from_millis(1));
        }
        let save_start = Instant::now();
        save_scene_checked(
            other.project_path.clone(),
            other_scene.id.clone(),
            "Saved while backing up".into(),
            other_scene.content.clone(),
        )
        .unwrap();
        let save_ms = save_start.elapsed().as_secs_f64() * 1000.0;
        let entry = tauri::async_runtime::block_on(backup).unwrap().unwrap();
        let backup_ms = start.elapsed().as_secs_f64() * 1000.0;
        let start = Instant::now();
        let legacy_preview = load_project_from_path(&Path::new(&entry.path).join(PROJECT)).unwrap();
        let legacy_list_ms = start.elapsed().as_secs_f64() * 1000.0;
        drop(legacy_preview);
        let start = Instant::now();
        let report =
            tauri::async_runtime::block_on(list_backups(archive.to_string_lossy().into_owned()))
                .unwrap();
        let list_ms = start.elapsed().as_secs_f64() * 1000.0;
        assert_eq!(report.entries[0].scenes, 256);
        let start = Instant::now();
        let restored = tauri::async_runtime::block_on(restore_backup(
            entry.path,
            root.path().to_string_lossy().into_owned(),
        ))
        .unwrap();
        let restore_ms = start.elapsed().as_secs_f64() * 1000.0;
        assert_eq!(
            load_project_from_path(Path::new(&restored))
                .unwrap()
                .nodes
                .len(),
            257
        );
        assert_eq!(
            fs::read(Path::new(&restored).join("images/image-31.png")).unwrap(),
            bytes
        );
        eprintln!("BACKUP_PERFORMANCE bytes={size} scenes=256 backup_ms={backup_ms:.2} concurrent_save_ms={save_ms:.2} legacy_list_ms={legacy_list_ms:.2} list_ms={list_ms:.2} restore_ms={restore_ms:.2}");
    }

    fn project(root: &Path) -> ProjectSnapshot {
        create_project(
            root.to_string_lossy().into_owned(),
            "Backup test".into(),
            "Group".into(),
            "Scene".into(),
        )
        .unwrap()
    }

    #[test]
    fn full_backup_restores_history_images_and_recovery_without_changing_original() {
        let root = tempdir().unwrap();
        let project = project(root.path());
        let source = Path::new(&project.project_path);
        let scene = project
            .nodes
            .iter()
            .find(|n| n.kind == NodeKind::Scene)
            .unwrap();
        let text = "한글 😀\r\nSaved manuscript";
        save_scene_checked(
            project.project_path.clone(),
            scene.id.clone(),
            text.into(),
            scene.content.clone(),
        )
        .unwrap();
        fs::write(
            source.join("resources.json"),
            br#"{"version":1,"cards":[]}"#,
        )
        .unwrap();
        fs::create_dir(source.join("images")).unwrap();
        fs::write(source.join("images/example.png"), b"image bytes").unwrap();
        recovery::write_recovery_draft(
            project.project_path.clone(),
            scene.id.clone(),
            "recovered draft".into(),
            text.into(),
        )
        .unwrap();
        let archive = root.path().join("backups");
        fs::create_dir(&archive).unwrap();
        let entry = create_backup_blocking(
            project.project_path.clone(),
            archive.to_string_lossy().into_owned(),
        )
        .unwrap();
        assert_eq!(entry.scenes, 1);
        let preview = preview_backup_blocking(entry.path.clone()).unwrap();
        assert_eq!(
            preview
                .nodes
                .iter()
                .find(|n| n.id == scene.id)
                .unwrap()
                .content,
            text
        );
        let report = list_backups_blocking(archive.to_string_lossy().into_owned()).unwrap();
        assert_eq!(report.entries.len(), 1);
        assert_eq!(report.invalid_count, 0);
        let destination = root.path().join("restored");
        fs::create_dir(&destination).unwrap();
        let restored = restore_backup_blocking(
            entry.path.clone(),
            destination.to_string_lossy().into_owned(),
        )
        .unwrap();
        let restored_again =
            restore_backup_blocking(entry.path, destination.to_string_lossy().into_owned())
                .unwrap();
        assert_ne!(restored, restored_again);
        fn compare_tree(source: &Path, target: &Path) {
            for entry in fs::read_dir(source).unwrap() {
                let entry = entry.unwrap();
                let copy = target.join(entry.file_name());
                if entry.file_type().unwrap().is_dir() {
                    compare_tree(&entry.path(), &copy);
                } else {
                    assert_eq!(fs::read(entry.path()).unwrap(), fs::read(copy).unwrap());
                }
            }
        }
        compare_tree(source, Path::new(&restored));
        assert!(!list_scene_versions(restored.clone(), scene.id.clone())
            .unwrap()
            .versions
            .is_empty());
        assert_eq!(
            recovery::list_recovery_drafts(restored).unwrap()[0].content,
            "recovered draft"
        );
        assert_eq!(
            load_project_from_path(source)
                .unwrap()
                .nodes
                .iter()
                .find(|n| n.id == scene.id)
                .unwrap()
                .content,
            text
        );
    }

    #[test]
    fn rejects_nested_destinations_and_skips_broken_backups() {
        let root = tempdir().unwrap();
        let project = project(root.path());
        assert_eq!(
            create_backup_blocking(project.project_path.clone(), project.project_path.clone())
                .err()
                .unwrap(),
            "EXPORT_DESTINATION"
        );
        let child = Path::new(&project.project_path).join("nested");
        fs::create_dir(&child).unwrap();
        assert!(create_backup_blocking(
            project.project_path.clone(),
            child.to_string_lossy().into_owned()
        )
        .is_err());
        let entry = create_backup_blocking(
            project.project_path.clone(),
            root.path().to_string_lossy().into_owned(),
        )
        .unwrap();
        assert!(restore_backup_blocking(entry.path.clone(), project.project_path).is_err());
        assert!(restore_backup_blocking(entry.path.clone(), entry.path.clone()).is_err());
        let broken = root.path().join("Ouroborocessor-backup-broken");
        fs::create_dir(&broken).unwrap();
        fs::write(broken.join(RECORD), "bad json").unwrap();
        let report = list_backups_blocking(root.path().to_string_lossy().into_owned()).unwrap();
        assert_eq!(report.entries.len(), 1);
        assert_eq!(report.invalid_count, 1);
        assert!(restore_backup_blocking(
            broken.to_string_lossy().into_owned(),
            root.path().to_string_lossy().into_owned()
        )
        .is_err());
        assert!(broken.exists());
    }

    #[test]
    fn restores_after_original_project_is_missing() {
        let root = tempdir().unwrap();
        let project = project(root.path());
        let entry = create_backup_blocking(
            project.project_path.clone(),
            root.path().to_string_lossy().into_owned(),
        )
        .unwrap();
        fs::remove_dir_all(&project.project_path).unwrap();
        let restored =
            restore_backup_blocking(entry.path, root.path().to_string_lossy().into_owned())
                .unwrap();
        let snapshot = load_project_from_path(Path::new(&restored)).unwrap();
        assert_eq!(snapshot.title, project.title);
        assert_eq!(snapshot.nodes, project.nodes);
        assert!(!Path::new(&project.project_path).exists());
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_fail_without_leaving_a_completed_backup_or_restored_project() {
        let root = tempdir().unwrap();
        let project = project(root.path());
        let archive = root.path().join("backups");
        fs::create_dir(&archive).unwrap();
        let entry = create_backup_blocking(
            project.project_path.clone(),
            archive.to_string_lossy().into_owned(),
        )
        .unwrap();
        let external = root.path().join("external");
        fs::write(&external, b"private").unwrap();
        std::os::unix::fs::symlink(&external, Path::new(&project.project_path).join("linked"))
            .unwrap();
        assert_eq!(
            create_backup_blocking(project.project_path, archive.to_string_lossy().into_owned())
                .err()
                .unwrap(),
            "BACKUP_SYMLINK"
        );
        assert_eq!(fs::read_dir(&archive).unwrap().count(), 1);
        std::os::unix::fs::symlink(
            &external,
            Path::new(&entry.path).join(PROJECT).join("linked"),
        )
        .unwrap();
        let restore = root.path().join("restored");
        fs::create_dir(&restore).unwrap();
        assert!(
            restore_backup_blocking(entry.path, restore.to_string_lossy().into_owned()).is_err()
        );
        assert_eq!(fs::read_dir(restore).unwrap().count(), 0);
        assert_eq!(fs::read(external).unwrap(), b"private");
    }
}
