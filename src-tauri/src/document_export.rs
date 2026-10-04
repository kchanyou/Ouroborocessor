//! Format-neutral view of a manuscript for the document exporters (DOCX, HWPX, ODT, HTML, TXT).
//! Scope, ordering, heading levels, character checks and image loading happen here once, so
//! each writer only has to turn blocks into its own markup.

use crate::{ManuscriptNode, NodeKind, ProjectSnapshot};
use std::{collections::HashMap, path::Path, rc::Rc};

pub(crate) struct Image {
    pub name: String,
    pub alt: String,
    pub bytes: Rc<Vec<u8>>,
    /// Pixel size when the header could be read.
    pub size: Option<(u32, u32)>,
}

impl Image {
    pub fn extension(&self) -> &str {
        self.name.rsplit_once('.').map(|(_, ext)| ext).unwrap_or("")
    }

    pub fn media_type(&self) -> &'static str {
        match self.extension() {
            "png" => "image/png",
            "jpg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            _ => "application/octet-stream",
        }
    }

    /// Display size in millimetres at 96 dpi, scaled down to fit the page body.
    pub fn fitted_mm(&self, max_width: f64, max_height: f64) -> (f64, f64) {
        let (width, height) = self.size.unwrap_or((400, 300));
        let (width, height) = (width as f64 * 25.4 / 96.0, height as f64 * 25.4 / 96.0);
        let scale = (max_width / width).min(max_height / height).min(1.0);
        (width * scale, height * scale)
    }
}

pub(crate) enum Block {
    Title(String),
    /// Level 1 is the top level below the title.
    Heading(usize, String),
    /// One source line. Empty lines are kept so spacing matches the editor.
    Paragraph(String),
    Image(Image),
}

pub(crate) struct Page {
    pub width_mm: f64,
    pub height_mm: f64,
    pub margin_mm: f64,
}

impl Page {
    pub fn new(paper_size: &str, margin_preset: &str) -> Result<Self, String> {
        let (width_mm, height_mm) = match paper_size {
            "a4" => (210.0, 297.0),
            "letter" => (215.9, 279.4),
            _ => return Err("EXPORT_PAGE_OPTIONS".into()),
        };
        let margin_mm = match margin_preset {
            "narrow" => 12.7,
            "normal" => 25.4,
            "wide" => 38.1,
            _ => return Err("EXPORT_PAGE_OPTIONS".into()),
        };
        Ok(Self {
            width_mm,
            height_mm,
            margin_mm,
        })
    }

    pub fn body_width_mm(&self) -> f64 {
        self.width_mm - self.margin_mm * 2.0
    }

    pub fn body_height_mm(&self) -> f64 {
        self.height_mm - self.margin_mm * 2.0
    }
}

pub(crate) fn ordered_scope<'a>(
    project: &'a ProjectSnapshot,
    root: Option<&str>,
) -> Result<Vec<(&'a ManuscriptNode, usize)>, String> {
    let mut children: HashMap<Option<&str>, Vec<&ManuscriptNode>> = HashMap::new();
    for node in &project.nodes {
        children
            .entry(node.parent_id.as_deref())
            .or_default()
            .push(node);
    }
    let roots = match root {
        Some(id) => vec![project
            .nodes
            .iter()
            .find(|n| n.id == id)
            .ok_or("EXPORT_SCOPE_MISSING")?],
        None => children.get(&None).cloned().unwrap_or_default(),
    };
    let mut stack: Vec<_> = roots.into_iter().rev().map(|n| (n, 1)).collect();
    let mut ordered = Vec::new();
    while let Some((node, depth)) = stack.pop() {
        ordered.push((node, depth));
        if let Some(items) = children.get(&Some(node.id.as_str())) {
            stack.extend(items.iter().rev().map(|n| (*n, depth + 1)));
        }
    }
    Ok(ordered)
}

/// Characters that XML-based formats cannot carry. Checked up front for every format so a
/// manuscript exports the same way regardless of the target.
fn check_text(text: &str) -> Result<(), String> {
    if text.chars().any(|c| {
        !matches!(c, '\t' | '\n' | '\r' | '\u{20}'..='\u{d7ff}' | '\u{e000}'..='\u{fffd}' | '\u{10000}'..='\u{10ffff}')
    }) {
        return Err("EXPORT_INVALID_CHARACTER".into());
    }
    Ok(())
}

pub(crate) fn dimensions(bytes: &[u8], extension: &str) -> Option<(u32, u32)> {
    match extension {
        "png" if bytes.len() >= 24 => Some((
            u32::from_be_bytes(bytes[16..20].try_into().ok()?),
            u32::from_be_bytes(bytes[20..24].try_into().ok()?),
        )),
        "gif" if bytes.len() >= 10 => Some((
            u16::from_le_bytes(bytes[6..8].try_into().ok()?) as u32,
            u16::from_le_bytes(bytes[8..10].try_into().ok()?) as u32,
        )),
        "jpg" => {
            let mut cursor = 2usize;
            while cursor + 9 < bytes.len() {
                if bytes[cursor] != 0xff {
                    cursor += 1;
                    continue;
                }
                let marker = bytes[cursor + 1];
                if marker == 0xd8 || marker == 0xd9 {
                    cursor += 2;
                    continue;
                }
                let length = u16::from_be_bytes([bytes[cursor + 2], bytes[cursor + 3]]) as usize;
                if length < 2 || cursor + 2 + length > bytes.len() {
                    break;
                }
                if matches!(marker, 0xc0..=0xc3 | 0xc5..=0xc7 | 0xc9..=0xcb | 0xcd..=0xcf) {
                    return Some((
                        u16::from_be_bytes([bytes[cursor + 7], bytes[cursor + 8]]) as u32,
                        u16::from_be_bytes([bytes[cursor + 5], bytes[cursor + 6]]) as u32,
                    ));
                }
                cursor += 2 + length;
            }
            None
        }
        "webp" if bytes.len() >= 30 && &bytes[12..16] == b"VP8X" => {
            let width = 1 + u32::from_le_bytes([bytes[24], bytes[25], bytes[26], 0]);
            let height = 1 + u32::from_le_bytes([bytes[27], bytes[28], bytes[29], 0]);
            Some((width, height))
        }
        _ => None,
    }
    .filter(|(width, height)| *width > 0 && *height > 0)
}

/// Title of the export: the project, or the chosen folder/scene when exporting a part.
pub(crate) fn export_title<'a>(project: &'a ProjectSnapshot, root: Option<&str>) -> &'a str {
    root.and_then(|id| project.nodes.iter().find(|n| n.id == id))
        .map(|n| n.title.as_str())
        .unwrap_or(&project.title)
}

pub(crate) fn blocks(project: &ProjectSnapshot, root: Option<&str>) -> Result<Vec<Block>, String> {
    let ordered = ordered_scope(project, root)?;
    let title = export_title(project, root).replace(['\r', '\n'], " ");
    check_text(&title)?;
    let mut blocks = vec![Block::Title(title)];
    let mut cache: HashMap<String, Rc<Vec<u8>>> = HashMap::new();
    for (node, depth) in ordered {
        if Some(node.id.as_str()) != root {
            let level = if root.is_some() {
                depth.saturating_sub(1).max(1)
            } else {
                depth
            };
            let heading = node.title.replace(['\r', '\n'], " ");
            check_text(&heading)?;
            blocks.push(Block::Heading(level.min(9), heading));
        }
        if node.kind == NodeKind::Scene {
            let normalized = crate::resource_links::display_text(&node.content)
                .replace("\r\n", "\n")
                .replace('\r', "\n");
            check_text(&normalized)?;
            for line in normalized.split('\n') {
                push_line(project, line, &mut blocks, &mut cache)?;
            }
        }
    }
    Ok(blocks)
}

/// Splits one line into text and `![alt](images/image-…)` pictures. Other image links stay as text.
fn push_line(
    project: &ProjectSnapshot,
    line: &str,
    blocks: &mut Vec<Block>,
    cache: &mut HashMap<String, Rc<Vec<u8>>>,
) -> Result<(), String> {
    let mut scan = 0usize;
    let mut emitted = 0usize;
    let mut found = false;
    while let Some(relative_start) = line[scan..].find("![") {
        let start = scan + relative_start;
        let Some(alt_end_relative) = line[start + 2..].find("](") else {
            break;
        };
        let alt_end = start + 2 + alt_end_relative;
        let target_start = alt_end + 2;
        let Some(target_end_relative) = line[target_start..].find(')') else {
            break;
        };
        let target_end = target_start + target_end_relative;
        let Some(name) = line[target_start..target_end].strip_prefix("images/") else {
            scan = target_end + 1;
            continue;
        };
        if name.contains('/') || !name.starts_with("image-") {
            scan = target_end + 1;
            continue;
        }
        if start > emitted {
            blocks.push(Block::Paragraph(line[emitted..start].to_string()));
        }
        let bytes = match cache.get(name) {
            Some(bytes) => bytes.clone(),
            None => {
                let bytes = Rc::new(crate::images::read(Path::new(&project.project_path), name)?);
                cache.insert(name.to_string(), bytes.clone());
                bytes
            }
        };
        let extension = name.rsplit_once('.').map(|(_, ext)| ext).unwrap_or("");
        blocks.push(Block::Image(Image {
            name: name.to_string(),
            alt: line[start + 2..alt_end].to_string(),
            size: dimensions(&bytes, extension),
            bytes,
        }));
        found = true;
        emitted = target_end + 1;
        scan = emitted;
    }
    if !found {
        blocks.push(Block::Paragraph(line.to_string()));
    } else if emitted < line.len() {
        blocks.push(Block::Paragraph(line[emitted..].to_string()));
    }
    Ok(())
}

pub(crate) fn xml_escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

pub(crate) fn base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = (chunk[0] as u32) << 16
            | (*chunk.get(1).unwrap_or(&0) as u32) << 8
            | *chunk.get(2).unwrap_or(&0) as u32;
        for (index, shift) in [18, 12, 6, 0].into_iter().enumerate() {
            if index <= chunk.len() {
                output.push(TABLE[(n >> shift & 63) as usize] as char);
            } else {
                output.push('=');
            }
        }
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_the_standard_alphabet_and_padding() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64("한".as_bytes()), "7ZWc");
    }

    #[test]
    fn page_presets_match_paper_and_margin_sizes() {
        let page = Page::new("letter", "wide").unwrap();
        assert!((page.body_width_mm() - (215.9 - 76.2)).abs() < 1e-9);
        assert!(Page::new("a5", "normal").is_err());
    }
}
