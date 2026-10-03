use super::*;

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SceneOperation {
    Import {
        parent: Option<String>,
        scenes: Vec<ImportedScene>,
    },
    Split {
        id: String,
        offset: usize,
        title: String,
    },
    Merge {
        id: String,
        next: String,
    },
    Trash {
        id: String,
    },
    Restore {
        id: String,
    },
}

#[derive(Debug, Deserialize)]
pub struct ImportedScene {
    title: String,
    content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashItem {
    id: String,
    title: String,
    count: usize,
    parent_available: bool,
}

#[tauri::command]
pub fn list_manuscript_trash(project_path: String) -> Result<Vec<TrashItem>, String> {
    let manifest = read_manifest(Path::new(&project_path))?;
    Ok(manifest
        .nodes
        .iter()
        .filter(|node| node.trashed.as_ref() == Some(&node.id))
        .map(|node| TrashItem {
            id: node.id.clone(),
            title: node.title.clone(),
            count: manifest
                .nodes
                .iter()
                .filter(|child| child.trashed.as_ref() == Some(&node.id))
                .count(),
            parent_available: node.parent_id.as_ref().is_none_or(|parent| {
                manifest
                    .nodes
                    .iter()
                    .any(|item| &item.id == parent && item.trashed.is_none())
            }),
        })
        .collect())
}

fn scene_text(project: &Path, node: &NodeMeta) -> Result<String, String> {
    fs::read_to_string(checked_scene_path(
        project,
        node.file.as_deref().ok_or("SCENE_OPERATION_INVALID")?,
    )?)
    .map_err(|e| e.to_string())
}

fn new_body(
    project: &Path,
    content: &str,
    guards: &mut Vec<(String, String)>,
) -> Result<String, String> {
    let file = format!("manuscript/{}.md", timestamp_id("body")?);
    let path = checked_scene_path(project, &file)?;
    if path.exists() {
        return Err("SCENE_OPERATION_INVALID".into());
    }
    write_atomic(&path, content.as_bytes())?;
    guards.push((file.clone(), content.into()));
    Ok(file)
}

fn split_byte(source: &str, offset: usize) -> Result<usize, String> {
    let mut utf16 = 0;
    for (byte, ch) in source.char_indices() {
        if utf16 == offset {
            return Ok(byte);
        }
        utf16 += ch.len_utf16();
    }
    if utf16 == offset {
        Ok(source.len())
    } else {
        Err("SCENE_OPERATION_INVALID".into())
    }
}

fn inside_link(source: &str, at: usize) -> bool {
    for (open, close) in [("[[", "]]"), ("![", ")")] {
        let mut from = 0;
        while let Some(start) = source[from..].find(open).map(|offset| from + offset) {
            let Some(end) = source[start..]
                .find(close)
                .map(|offset| start + offset + close.len())
            else {
                break;
            };
            if start < at && at < end {
                return true;
            }
            from = end;
        }
    }
    false
}

#[tauri::command]
pub fn apply_scene_operation(
    project_path: String,
    expected_nodes: Vec<ManuscriptNode>,
    operation: SceneOperation,
) -> Result<ProjectSnapshot, String> {
    let _guard = SAVE_LOCK.lock().map_err(|e| e.to_string())?;
    let project = Path::new(&project_path);
    let manifest_before = fs::read(project.join(MANIFEST_FILE)).map_err(|e| e.to_string())?;
    let current = load_project_from_path(project)?;
    if current.nodes != expected_nodes {
        return Err("SCENE_OPERATION_CONFLICT".into());
    }
    let mut manifest = read_manifest(project)?;
    let original_manifest = manifest.clone();
    let mut guards = Vec::new();
    match operation {
        SceneOperation::Import { parent, scenes } => {
            if parent.as_ref().is_some_and(|id| {
                !manifest.nodes.iter().any(|node| {
                    &node.id == id && node.kind == NodeKind::Group && node.trashed.is_none()
                })
            }) || scenes.is_empty()
                || scenes.len() > 500
                || scenes
                    .iter()
                    .any(|scene| scene.title.trim().is_empty() || scene.content.contains('\0'))
                || scenes
                    .iter()
                    .map(|scene| scene.content.len())
                    .sum::<usize>()
                    > 50 * 1024 * 1024
            {
                return Err("SCENE_OPERATION_INVALID".into());
            }
            for scene in scenes {
                let file = new_body(project, &scene.content, &mut guards)?;
                manifest.nodes.push(NodeMeta {
                    id: timestamp_id("scene")?,
                    kind: NodeKind::Scene,
                    parent_id: parent.clone(),
                    file: Some(file),
                    title: scene.title,
                    status: "draft".into(),
                    synopsis: String::new(),
                    trashed: None,
                });
            }
        }
        SceneOperation::Split { id, offset, title } => {
            let index = manifest
                .nodes
                .iter()
                .position(|node| {
                    node.id == id && node.kind == NodeKind::Scene && node.trashed.is_none()
                })
                .ok_or("SCENE_OPERATION_INVALID")?;
            if title.trim().is_empty() {
                return Err("SCENE_OPERATION_INVALID".into());
            }
            let original = manifest.nodes[index].clone();
            let content = scene_text(project, &original)?;
            let byte = split_byte(&content, offset)?;
            if byte == 0 || byte == content.len() || inside_link(&content, byte) {
                return Err("SCENE_OPERATION_INVALID".into());
            }
            guards.push((original.file.clone().unwrap(), content.clone()));
            manifest.nodes[index].file = Some(new_body(project, &content[..byte], &mut guards)?);
            let file = new_body(project, &content[byte..], &mut guards)?;
            manifest.nodes.insert(
                index + 1,
                NodeMeta {
                    id: timestamp_id("scene")?,
                    title,
                    file: Some(file),
                    ..original
                },
            );
        }
        SceneOperation::Merge { id, next } => {
            let index = manifest
                .nodes
                .iter()
                .position(|node| {
                    node.id == id && node.kind == NodeKind::Scene && node.trashed.is_none()
                })
                .ok_or("SCENE_OPERATION_INVALID")?;
            let first = manifest.nodes[index].clone();
            let second_index = manifest
                .nodes
                .iter()
                .enumerate()
                .skip(index + 1)
                .find(|(_, node)| node.parent_id == first.parent_id && node.trashed.is_none())
                .map(|(index, _)| index)
                .ok_or("SCENE_OPERATION_INVALID")?;
            let second = manifest.nodes[second_index].clone();
            if second.id != next || second.kind != NodeKind::Scene {
                return Err("SCENE_OPERATION_INVALID".into());
            }
            let before = scene_text(project, &first)?;
            let after = scene_text(project, &second)?;
            guards.push((first.file.clone().unwrap(), before.clone()));
            guards.push((second.file.clone().unwrap(), after.clone()));
            let merged = format!("{before}\n\n{after}");
            manifest.nodes[index].file = Some(new_body(project, &merged, &mut guards)?);
            // Keep the second scene (including its synopsis/status) recoverable in trash.
            manifest.nodes[second_index].trashed = Some(second.id);
            manifest.format_version = 3;
        }
        SceneOperation::Trash { id } => {
            if !manifest
                .nodes
                .iter()
                .any(|node| node.id == id && node.trashed.is_none())
            {
                return Err("SCENE_OPERATION_INVALID".into());
            }
            let mut descendants = HashSet::from([id.clone()]);
            loop {
                let before = descendants.len();
                for node in &manifest.nodes {
                    if node
                        .parent_id
                        .as_ref()
                        .is_some_and(|parent| descendants.contains(parent))
                    {
                        descendants.insert(node.id.clone());
                    }
                }
                if before == descendants.len() {
                    break;
                }
            }
            for node in &mut manifest.nodes {
                if descendants.contains(&node.id) && node.trashed.is_none() {
                    node.trashed = Some(id.clone());
                }
            }
            manifest.format_version = 3;
        }
        SceneOperation::Restore { id } => {
            let node = manifest
                .nodes
                .iter()
                .find(|node| node.id == id && node.trashed.as_ref() == Some(&id))
                .ok_or("SCENE_OPERATION_INVALID")?;
            if node.parent_id.as_ref().is_some_and(|parent| {
                manifest
                    .nodes
                    .iter()
                    .any(|node| &node.id == parent && node.trashed.is_some())
            }) {
                return Err("SCENE_RESTORE_PARENT".into());
            }
            for node in &mut manifest.nodes {
                if node.trashed.as_ref() == Some(&id) {
                    node.trashed = None;
                }
            }
        }
    }
    validate_manifest(&manifest)?;
    // New bodies are written first. Until this final manifest swap, the old project is intact.
    if fs::read(project.join(MANIFEST_FILE)).map_err(|e| e.to_string())? != manifest_before {
        return Err("SCENE_OPERATION_CONFLICT".into());
    }
    for node in &current.nodes {
        if node.kind == NodeKind::Scene {
            let old = original_manifest
                .nodes
                .iter()
                .find(|meta| meta.id == node.id)
                .ok_or("SCENE_OPERATION_CONFLICT")?;
            if scene_text(project, &old)? != node.content {
                return Err("SCENE_OPERATION_CONFLICT".into());
            }
        }
    }
    write_manifest_with_files(project, &manifest, Some(guards))?;
    load_project_from_path(project)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn setup() -> (tempfile::TempDir, ProjectSnapshot) {
        let temp = tempfile::tempdir().unwrap();
        let project = create_project(
            temp.path().to_string_lossy().into_owned(),
            "Operations".into(),
            "Group".into(),
            "Scene".into(),
        )
        .unwrap();
        (temp, project)
    }
    fn apply(
        project: &ProjectSnapshot,
        operation: SceneOperation,
    ) -> Result<ProjectSnapshot, String> {
        apply_scene_operation(
            project.project_path.clone(),
            project.nodes.clone(),
            operation,
        )
    }
    fn content(project: &ProjectSnapshot, id: &str, text: &str) -> ProjectSnapshot {
        save_scene(project.project_path.clone(), id.into(), text.into()).unwrap();
        load_project_from_path(Path::new(&project.project_path)).unwrap()
    }

    #[test]
    fn split_preserves_unicode_assets_and_supports_undo_redo() {
        let (_temp, project) = setup();
        let text = "한😀글\n![사진](images/image-test.png) [[resource:person|이름]]";
        let project = content(&project, &project.nodes[1].id, text);
        let before_file = read_manifest(Path::new(&project.project_path))
            .unwrap()
            .nodes[1]
            .file
            .clone()
            .unwrap();
        let split = apply(
            &project,
            SceneOperation::Split {
                id: project.nodes[1].id.clone(),
                offset: 3,
                title: "Second".into(),
            },
        )
        .unwrap();
        assert_eq!(split.nodes[1].content, "한😀");
        assert_eq!(
            format!("{}{}", split.nodes[1].content, split.nodes[2].content),
            text
        );
        assert_eq!(
            fs::read_to_string(Path::new(&project.project_path).join(before_file)).unwrap(),
            text
        );
        let undone = undo_project_edit(project.project_path.clone(), false).unwrap();
        assert_eq!(undone.nodes, project.nodes);
        let redone = undo_project_edit(project.project_path.clone(), true).unwrap();
        assert_eq!(redone.nodes, split.nodes);
        let edited = content(&redone, &redone.nodes[2].id, "later writing");
        assert_eq!(
            undo_project_edit(project.project_path.clone(), false).unwrap_err(),
            "HISTORY_CONFLICT"
        );
        assert_eq!(
            load_project_from_path(Path::new(&project.project_path))
                .unwrap()
                .nodes,
            edited.nodes
        );
    }

    #[test]
    fn split_rejects_surrogate_and_link_boundaries_without_changes() {
        let (_temp, project) = setup();
        let project = content(
            &project,
            &project.nodes[1].id,
            "😀 [[resource:a|A]] ![a](images/image-a.png)",
        );
        for offset in [0, 1, 7, 27, 999] {
            assert!(apply(
                &project,
                SceneOperation::Split {
                    id: project.nodes[1].id.clone(),
                    offset,
                    title: "Next".into()
                }
            )
            .is_err());
            assert_eq!(
                load_project_from_path(Path::new(&project.project_path))
                    .unwrap()
                    .nodes,
                project.nodes
            );
        }
    }

    #[test]
    fn import_merge_and_restore_keep_bodies_and_metadata() {
        let (_temp, project) = setup();
        let imported = apply(
            &project,
            SceneOperation::Import {
                parent: Some(project.nodes[0].id.clone()),
                scenes: vec![
                    ImportedScene {
                        title: "One".into(),
                        content: "first [[resource:a|A]]".into(),
                    },
                    ImportedScene {
                        title: "Two".into(),
                        content: "second ![a](images/image-a.png)".into(),
                    },
                ],
            },
        )
        .unwrap();
        let first = &imported.nodes[2];
        let second = &imported.nodes[3];
        let merged = apply(
            &imported,
            SceneOperation::Merge {
                id: first.id.clone(),
                next: second.id.clone(),
            },
        )
        .unwrap();
        assert_eq!(
            merged.nodes[2].content,
            format!("{}\n\n{}", first.content, second.content)
        );
        assert_eq!(
            list_manuscript_trash(project.project_path.clone()).unwrap()[0].id,
            second.id
        );
        let undone = undo_project_edit(project.project_path.clone(), false).unwrap();
        assert_eq!(undone.nodes, imported.nodes);
        let redone = undo_project_edit(project.project_path.clone(), true).unwrap();
        let restored = apply(
            &redone,
            SceneOperation::Restore {
                id: second.id.clone(),
            },
        )
        .unwrap();
        assert_eq!(restored.nodes[3], *second);
    }

    #[test]
    fn trash_restores_subtree_order_without_reviving_earlier_trash() {
        let (temp, project) = setup();
        let project = content(&project, &project.nodes[1].id, "private discarded text");
        let group = project.nodes[0].id.clone();
        let scene = project.nodes[1].id.clone();
        let trashed_scene = apply(&project, SceneOperation::Trash { id: scene.clone() }).unwrap();
        let trashed_group =
            apply(&trashed_scene, SceneOperation::Trash { id: group.clone() }).unwrap();
        assert!(trashed_group.nodes.is_empty());
        assert_eq!(
            apply(
                &trashed_group,
                SceneOperation::Restore { id: scene.clone() }
            )
            .unwrap_err(),
            "SCENE_RESTORE_PARENT"
        );
        let output = export_project(
            project.project_path.clone(),
            temp.path().to_string_lossy().into_owned(),
        )
        .unwrap();
        assert!(
            !fs::read_to_string(Path::new(&output).join("Manuscript.md"))
                .unwrap()
                .contains("private discarded text")
        );
        let backup = Path::new(&output).join("Project.story");
        assert!(load_project_from_path(&backup).unwrap().nodes.is_empty());
        assert_eq!(
            list_manuscript_trash(backup.to_string_lossy().into_owned())
                .unwrap()
                .len(),
            2
        );
        let restored_group = apply(&trashed_group, SceneOperation::Restore { id: group }).unwrap();
        assert_eq!(restored_group.nodes.len(), 1);
        let restored_all = apply(&restored_group, SceneOperation::Restore { id: scene }).unwrap();
        assert_eq!(restored_all.nodes, project.nodes);
    }

    #[test]
    fn importing_many_scenes_creates_unique_ids_and_files() {
        let (_temp, project) = setup();
        let scenes = (0..200)
            .map(|index| ImportedScene {
                title: format!("Scene {index}"),
                content: format!("body {index}"),
            })
            .collect();
        let imported = apply(
            &project,
            SceneOperation::Import {
                parent: None,
                scenes,
            },
        )
        .unwrap();
        let ids: HashSet<_> = imported.nodes.iter().map(|node| &node.id).collect();
        assert_eq!(ids.len(), imported.nodes.len());
        assert_eq!(imported.nodes.len(), project.nodes.len() + 200);
        assert_eq!(imported.nodes.last().unwrap().content, "body 199");
    }

    #[test]
    fn external_changes_and_invalid_imports_never_commit() {
        let (_temp, project) = setup();
        assert!(apply(
            &project,
            SceneOperation::Import {
                parent: None,
                scenes: vec![ImportedScene {
                    title: "".into(),
                    content: "new".into()
                }]
            }
        )
        .is_err());
        let edited = content(&project, &project.nodes[1].id, "external edit");
        assert_eq!(
            apply(
                &project,
                SceneOperation::Trash {
                    id: project.nodes[1].id.clone()
                }
            )
            .unwrap_err(),
            "SCENE_OPERATION_CONFLICT"
        );
        assert_eq!(
            load_project_from_path(Path::new(&project.project_path))
                .unwrap()
                .nodes,
            edited.nodes
        );
    }
}
