use super::*;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    pub scene_id: String,
    pub before: String,
    pub after: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchResult {
    completed: Vec<String>,
    failed_scene: Option<String>,
    error: Option<String>,
    journal_path: String,
}

fn journal_folder(project: &Path) -> Result<PathBuf, String> {
    read_manifest(project)?;
    let folder = project.join(".history");
    if folder.exists()
        && fs::symlink_metadata(&folder)
            .map_err(|e| e.to_string())?
            .file_type()
            .is_symlink()
    {
        return Err("BATCH_UNSAFE_PATH".into());
    }
    Ok(folder)
}

fn valid_journal_id(id: &str) -> bool {
    id.strip_prefix("batch-")
        .and_then(|s| s.strip_suffix(".json"))
        .is_some_and(|s| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()))
}

#[tauri::command]
pub fn list_batch_journals(project_path: String) -> Result<Vec<String>, String> {
    let folder = journal_folder(Path::new(&project_path))?;
    if !folder.exists() {
        return Ok(Vec::new());
    }
    let mut ids = Vec::new();
    for entry in fs::read_dir(folder).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let id = entry.file_name().to_string_lossy().into_owned();
        if valid_journal_id(&id) && entry.file_type().map_err(|e| e.to_string())?.is_file() {
            ids.push(id);
        }
    }
    ids.sort_by(|a, b| b.len().cmp(&a.len()).then_with(|| b.cmp(a)));
    Ok(ids)
}

#[tauri::command]
pub fn read_batch_journal(project_path: String, journal_id: String) -> Result<Vec<Change>, String> {
    if !valid_journal_id(&journal_id) {
        return Err("BATCH_UNSAFE_PATH".into());
    }
    let file = journal_folder(Path::new(&project_path))?.join(journal_id);
    if !fs::symlink_metadata(&file)
        .map_err(|e| e.to_string())?
        .file_type()
        .is_file()
    {
        return Err("BATCH_UNSAFE_PATH".into());
    }
    serde_json::from_slice(&fs::read(file).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn restore_batch_copy(
    project_path: String,
    journal_id: String,
    scene_id: String,
    title: String,
) -> Result<ProjectSnapshot, String> {
    let _guard = SAVE_LOCK.lock().map_err(|e| e.to_string())?;
    let changes = read_batch_journal(project_path.clone(), journal_id)?;
    let change = changes
        .iter()
        .find(|change| change.scene_id == scene_id)
        .ok_or("BATCH_SCENE_MISSING")?;
    preserve_conflict_copy(project_path, scene_id, change.before.clone(), title)
}

#[tauri::command]
pub fn apply_batch_edit(project_path: String, changes: Vec<Change>) -> Result<BatchResult, String> {
    let _guard = SAVE_LOCK.lock().map_err(|e| e.to_string())?;
    apply_with_writer(Path::new(&project_path), changes, |path, body| {
        write_atomic(path, body.as_bytes())
    })
}

fn apply_with_writer<F>(
    project: &Path,
    changes: Vec<Change>,
    mut write: F,
) -> Result<BatchResult, String>
where
    F: FnMut(&Path, &str) -> Result<(), String>,
{
    if changes.is_empty() {
        return Err("BATCH_EMPTY".into());
    }
    let manifest = read_manifest(project)?;
    let root = project.canonicalize().map_err(|e| e.to_string())?;
    let mut ids = HashSet::new();
    let mut files = HashSet::new();
    let mut paths = Vec::new();
    // check all targets before writing anything
    for change in &changes {
        if !ids.insert(&change.scene_id) {
            return Err("BATCH_DUPLICATE".into());
        }
        let node = manifest
            .nodes
            .iter()
            .find(|node| node.id == change.scene_id && node.kind == NodeKind::Scene)
            .ok_or("BATCH_SCENE_MISSING")?;
        let path = checked_scene_path(project, node.file.as_deref().ok_or("BATCH_SCENE_MISSING")?)?;
        let canonical = path.canonicalize().map_err(|e| e.to_string())?;
        if !canonical.starts_with(&root) || !files.insert(canonical) {
            return Err("BATCH_UNSAFE_PATH".into());
        }
        if fs::read_to_string(&path).map_err(|e| e.to_string())? != change.before {
            return Err(format!("SAVE_CONFLICT: {}", node.title));
        }
        paths.push(path);
    }
    // journal goes first. kept even after success, ignores the 5 min history interval
    let folder = journal_folder(project)?;
    fs::create_dir_all(&folder).map_err(storage_error)?;
    let journal = folder.join(format!("{}.json", timestamp_id("batch")?));
    write_atomic(
        &journal,
        &serde_json::to_vec(&changes).map_err(|e| e.to_string())?,
    )?;
    let mut result = BatchResult {
        completed: Vec::new(),
        failed_scene: None,
        error: None,
        journal_path: journal.to_string_lossy().into_owned(),
    };
    for (change, path) in changes.iter().zip(paths) {
        let outcome = (|| {
            // recheck right before writing, other processes don't take SAVE_LOCK
            if fs::read_to_string(&path).map_err(|e| e.to_string())? != change.before {
                return Err("SAVE_CONFLICT".into());
            }
            write(&path, &change.after)
        })();
        if let Err(error) = outcome {
            result.failed_scene = Some(change.scene_id.clone());
            result.error = Some(error);
            break;
        }
        result.completed.push(change.scene_id.clone());
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, ProjectSnapshot, Vec<Change>) {
        let dir = tempfile::tempdir().unwrap();
        let first = create_project(
            dir.path().to_string_lossy().into_owned(),
            "Batch".into(),
            "Group".into(),
            "One".into(),
        )
        .unwrap();
        let project = add_node(first.project_path, None, "scene".into(), "Two".into()).unwrap();
        let changes = project
            .nodes
            .iter()
            .filter(|node| node.kind == NodeKind::Scene)
            .map(|node| Change {
                scene_id: node.id.clone(),
                before: node.content.clone(),
                after: "한국어 Hello 日本語 中文 español".into(),
            })
            .collect();
        (dir, project, changes)
    }
    #[test]
    fn journals_survive_reload_and_restore_without_overwriting() {
        let (_dir, project, changes) = fixture();
        apply_batch_edit(project.project_path.clone(), changes.clone()).unwrap();
        let ids = list_batch_journals(project.project_path.clone()).unwrap();
        assert_eq!(ids.len(), 1);
        let entries = read_batch_journal(project.project_path.clone(), ids[0].clone()).unwrap();
        assert_eq!(entries[0].after, changes[0].after);
        let restored = restore_batch_copy(
            project.project_path.clone(),
            ids[0].clone(),
            changes[0].scene_id.clone(),
            "Restored".into(),
        )
        .unwrap();
        assert_eq!(restored.nodes.last().unwrap().content, changes[0].before);
        assert_eq!(
            restored
                .nodes
                .iter()
                .find(|n| n.id == changes[0].scene_id)
                .unwrap()
                .content,
            changes[0].after
        );
        assert_eq!(list_batch_journals(project.project_path).unwrap(), ids);
    }
    #[test]
    fn invalid_or_corrupt_records_do_not_hide_good_records() {
        let (_dir, project, changes) = fixture();
        apply_batch_edit(project.project_path.clone(), changes).unwrap();
        fs::write(
            Path::new(&project.project_path).join(".history/batch-1.json"),
            "broken",
        )
        .unwrap();
        let ids = list_batch_journals(project.project_path.clone()).unwrap();
        assert_eq!(ids.len(), 2);
        assert_eq!(ids[1], "batch-1.json");
        assert!(read_batch_journal(project.project_path.clone(), ids[0].clone()).is_ok());
        assert!(read_batch_journal(project.project_path.clone(), ids[1].clone()).is_err());
        assert!(
            read_batch_journal(project.project_path.clone(), "../project.json".into()).is_err()
        );
        assert!(restore_batch_copy(
            project.project_path,
            ids[0].clone(),
            "missing".into(),
            "copy".into()
        )
        .is_err());
    }
    #[cfg(unix)]
    #[test]
    fn symlink_records_and_history_folders_are_rejected() {
        let (_dir, project, changes) = fixture();
        let root = Path::new(&project.project_path);
        fs::create_dir(root.join(".history")).unwrap();
        std::os::unix::fs::symlink(
            root.join("project.json"),
            root.join(".history/batch-1.json"),
        )
        .unwrap();
        assert!(list_batch_journals(project.project_path.clone())
            .unwrap()
            .is_empty());
        assert!(read_batch_journal(project.project_path.clone(), "batch-1.json".into()).is_err());
        fs::rename(root.join(".history"), root.join("old-history")).unwrap();
        std::os::unix::fs::symlink(root.join("old-history"), root.join(".history")).unwrap();
        assert!(list_batch_journals(project.project_path.clone()).is_err());
        assert!(apply_batch_edit(project.project_path, changes).is_err());
    }
    #[test]
    fn saves_and_reverses_with_durable_before_images() {
        let (_dir, project, changes) = fixture();
        let result = apply_batch_edit(project.project_path.clone(), changes.clone()).unwrap();
        assert_eq!(result.completed.len(), 2);
        let journal: Vec<Change> =
            serde_json::from_slice(&fs::read(result.journal_path).unwrap()).unwrap();
        assert_eq!(journal[0].after, changes[0].after);
        let inverse = changes
            .iter()
            .map(|c| Change {
                scene_id: c.scene_id.clone(),
                before: c.after.clone(),
                after: c.before.clone(),
            })
            .collect();
        assert_eq!(
            apply_batch_edit(project.project_path.clone(), inverse)
                .unwrap()
                .completed
                .len(),
            2
        );
        assert!(load_project_from_path(Path::new(&project.project_path))
            .unwrap()
            .nodes
            .iter()
            .filter(|n| n.kind == NodeKind::Scene)
            .all(|n| n.content.is_empty()));
    }
    #[test]
    fn preflight_conflict_and_duplicate_do_not_write() {
        let (_dir, project, mut changes) = fixture();
        let duplicate = vec![changes[0].clone(), changes[0].clone()];
        assert!(apply_batch_edit(project.project_path.clone(), duplicate)
            .unwrap_err()
            .contains("BATCH_DUPLICATE"));
        changes[1].before = "external".into();
        assert!(apply_batch_edit(project.project_path.clone(), changes)
            .unwrap_err()
            .contains("SAVE_CONFLICT"));
        assert!(!Path::new(&project.project_path).join(".history").exists());
    }
    #[test]
    fn partial_failure_reports_exact_successes_and_preserves_journal() {
        let (_dir, project, changes) = fixture();
        let mut writes = 0;
        let result = apply_with_writer(
            Path::new(&project.project_path),
            changes.clone(),
            |path, body| {
                writes += 1;
                if writes == 2 {
                    return Err("disk full".into());
                }
                write_atomic(path, body.as_bytes())
            },
        )
        .unwrap();
        assert_eq!(result.completed, vec![changes[0].scene_id.clone()]);
        assert_eq!(result.failed_scene, Some(changes[1].scene_id.clone()));
        assert!(Path::new(&result.journal_path).exists());
        let disk = load_project_from_path(Path::new(&project.project_path)).unwrap();
        assert_eq!(
            disk.nodes
                .iter()
                .find(|n| n.id == changes[1].scene_id)
                .unwrap()
                .content,
            changes[1].before
        );
    }
    #[test]
    fn journal_failure_blocks_every_manuscript_write() {
        let (_dir, project, changes) = fixture();
        fs::write(Path::new(&project.project_path).join(".history"), "blocked").unwrap();
        let result = apply_with_writer(Path::new(&project.project_path), changes, |_, _| {
            panic!("must not write")
        });
        assert!(result.is_err());
    }
    #[test]
    fn undo_refuses_later_edits_without_touching_other_scenes() {
        let (_dir, project, changes) = fixture();
        apply_batch_edit(project.project_path.clone(), changes.clone()).unwrap();
        save_scene_checked(
            project.project_path.clone(),
            changes[1].scene_id.clone(),
            "later edit".into(),
            changes[1].after.clone(),
        )
        .unwrap();
        let inverse = changes
            .iter()
            .map(|c| Change {
                scene_id: c.scene_id.clone(),
                before: c.after.clone(),
                after: c.before.clone(),
            })
            .collect();
        assert!(apply_batch_edit(project.project_path.clone(), inverse)
            .unwrap_err()
            .contains("SAVE_CONFLICT"));
        let disk = load_project_from_path(Path::new(&project.project_path)).unwrap();
        assert_eq!(
            disk.nodes
                .iter()
                .find(|n| n.id == changes[0].scene_id)
                .unwrap()
                .content,
            changes[0].after
        );
        assert_eq!(
            disk.nodes
                .iter()
                .find(|n| n.id == changes[1].scene_id)
                .unwrap()
                .content,
            "later edit"
        );
    }
}
