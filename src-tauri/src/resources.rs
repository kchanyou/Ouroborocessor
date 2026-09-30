use super::*;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResourceCard {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub description: String,
    pub aliases: Vec<String>,
    pub tags: Vec<String>,
    pub deleted: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ResourceStore {
    format_version: u32,
    cards: Vec<ResourceCard>,
}

fn resource_path(project: &Path) -> Result<PathBuf, String> {
    read_manifest(project)?;
    let path = project.join("resources.json");
    match fs::symlink_metadata(&path) {
        Ok(meta) if !meta.file_type().is_file() => return Err("RESOURCE_UNSAFE_PATH".into()),
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => return Err(error.to_string()),
        _ => {}
    }
    Ok(path)
}

fn validate(card: &ResourceCard) -> Result<(), String> {
    if card.id.is_empty()
        || !["character", "place", "setting"].contains(&card.kind.as_str())
        || card.name.trim().is_empty()
    {
        return Err("RESOURCE_INVALID".into());
    }
    Ok(())
}

pub fn copy_to_backup(source: &Path, backup: &Path) -> Result<(), String> {
    let path = resource_path(source)?;
    if !path.exists() {
        return Ok(());
    }
    let cards = list_resource_cards(source.to_string_lossy().into_owned())?;
    write_atomic(
        &backup.join("resources.json"),
        &serde_json::to_vec_pretty(&ResourceStore {
            format_version: 1,
            cards,
        })
        .map_err(|e| e.to_string())?,
    )
}

#[tauri::command]
pub fn list_resource_cards(project_path: String) -> Result<Vec<ResourceCard>, String> {
    let path = resource_path(Path::new(&project_path))?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let store: ResourceStore = serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    if store.format_version != 1 {
        return Err("RESOURCE_VERSION".into());
    }
    let mut ids = HashSet::new();
    for card in &store.cards {
        validate(card)?;
        if !ids.insert(&card.id) {
            return Err("RESOURCE_DUPLICATE".into());
        }
    }
    Ok(store.cards)
}

#[tauri::command]
pub fn save_resource_card(
    project_path: String,
    card: ResourceCard,
    expected: Option<ResourceCard>,
) -> Result<Vec<ResourceCard>, String> {
    let _guard = SAVE_LOCK.lock().map_err(|e| e.to_string())?;
    validate(&card)?;
    let mut cards = list_resource_cards(project_path.clone())?;
    let index = cards.iter().position(|item| item.id == card.id);
    let current = index.map(|i| &cards[i]);
    // safe to retry, doesn't touch other cards
    if current == Some(&card) {
        return Ok(cards);
    }
    if current != expected.as_ref() {
        return Err("RESOURCE_CONFLICT".into());
    }
    if let Some(i) = index {
        cards[i] = card;
    } else {
        cards.push(card);
    }
    let bytes = serde_json::to_vec_pretty(&ResourceStore {
        format_version: 1,
        cards: cards.clone(),
    })
    .map_err(|e| e.to_string())?;
    write_atomic(&resource_path(Path::new(&project_path))?, &bytes)?;
    Ok(cards)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, String, ResourceCard) {
        let dir = tempfile::tempdir().unwrap();
        let project = create_project(
            dir.path().to_string_lossy().into(),
            "Cards".into(),
            "Group".into(),
            "Scene".into(),
        )
        .unwrap();
        let card = ResourceCard {
            id: "card-1".into(),
            kind: "character".into(),
            name: "인물 日本語 中文 español".into(),
            description: "<script>plain text</script>".into(),
            aliases: vec!["Alias".into()],
            tags: vec!["tag".into()],
            deleted: false,
        };
        (dir, project.project_path, card)
    }
    #[test]
    fn project_backup_includes_cards_but_manuscript_does_not() {
        let (dir, path, card) = fixture();
        save_resource_card(path.clone(), card.clone(), None).unwrap();
        let exported = export_project(path, dir.path().to_string_lossy().into()).unwrap();
        assert_eq!(
            list_resource_cards(
                Path::new(&exported)
                    .join("Project.story")
                    .to_string_lossy()
                    .into()
            )
            .unwrap(),
            vec![card.clone()]
        );
        assert!(
            !fs::read_to_string(Path::new(&exported).join("Manuscript.md"))
                .unwrap()
                .contains(&card.name)
        );
    }
    #[test]
    fn create_update_trash_restore_and_reopen() {
        let (_dir, path, card) = fixture();
        assert!(list_resource_cards(path.clone()).unwrap().is_empty());
        save_resource_card(path.clone(), card.clone(), None).unwrap();
        let mut edited = card.clone();
        edited.name = "New name".into();
        save_resource_card(path.clone(), edited.clone(), Some(card)).unwrap();
        let mut trashed = edited.clone();
        trashed.deleted = true;
        save_resource_card(path.clone(), trashed.clone(), Some(edited.clone())).unwrap();
        save_resource_card(path.clone(), edited.clone(), Some(trashed)).unwrap();
        assert_eq!(list_resource_cards(path).unwrap(), vec![edited]);
    }
    #[test]
    fn stale_writes_rejected_and_other_cards_preserved() {
        let (_dir, path, card) = fixture();
        save_resource_card(path.clone(), card.clone(), None).unwrap();
        let mut other = card.clone();
        other.id = "card-2".into();
        save_resource_card(path.clone(), other.clone(), None).unwrap();
        let mut edited = card.clone();
        edited.name = "Changed".into();
        assert!(save_resource_card(path.clone(), edited.clone(), None)
            .unwrap_err()
            .contains("RESOURCE_CONFLICT"));
        save_resource_card(path.clone(), edited.clone(), Some(card)).unwrap();
        assert_eq!(
            save_resource_card(path, edited.clone(), None).unwrap(),
            vec![edited, other]
        );
    }
    #[test]
    fn corrupt_or_future_store_is_never_overwritten() {
        let (_dir, path, card) = fixture();
        let file = Path::new(&path).join("resources.json");
        for body in ["broken", "{\"formatVersion\":2,\"cards\":[]}"] {
            fs::write(&file, body).unwrap();
            assert!(save_resource_card(path.clone(), card.clone(), None).is_err());
            assert_eq!(fs::read_to_string(&file).unwrap(), body);
        }
    }
    #[cfg(unix)]
    #[test]
    fn symlink_is_rejected() {
        let (_dir, path, card) = fixture();
        std::os::unix::fs::symlink(
            Path::new(&path).join("project.json"),
            Path::new(&path).join("resources.json"),
        )
        .unwrap();
        assert!(save_resource_card(path, card, None).is_err());
    }
}
