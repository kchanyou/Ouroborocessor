//! Plain text and HTML writers. The HTML is self-contained (pictures are embedded) and carries
//! print CSS for the chosen page, so the PDF path prints the same document.

use crate::document_export::{base64, blocks, Block, Page};
use crate::ProjectSnapshot;

pub(crate) fn build_text(project: &ProjectSnapshot, root: Option<&str>) -> Result<Vec<u8>, String> {
    let mut output = String::new();
    for block in blocks(project, root)? {
        match block {
            Block::Title(title) => {
                output.push_str(&title);
                output.push_str("\n\n");
            }
            Block::Heading(_, text) => {
                if !output.ends_with("\n\n") {
                    output.push('\n');
                }
                output.push_str(&text);
                output.push_str("\n\n");
            }
            Block::Paragraph(text) => {
                output.push_str(&text);
                output.push('\n');
            }
            // Pictures can't live in a text file; keep the description so nothing silently vanishes.
            Block::Image(image) if !image.alt.trim().is_empty() => {
                output.push_str(&format!("[{}]\n", image.alt.trim()));
            }
            Block::Image(_) => {}
        }
    }
    Ok(output.into_bytes())
}

fn html_escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

pub(crate) fn build_html(
    project: &ProjectSnapshot,
    root: Option<&str>,
    page: &Page,
) -> Result<Vec<u8>, String> {
    let mut title_text = String::new();
    let mut body = String::new();
    for block in blocks(project, root)? {
        match block {
            Block::Title(title) => {
                body.push_str(&format!(
                    "<h1 class=\"title\">{}</h1>\n",
                    html_escape(&title)
                ));
                title_text = title;
            }
            Block::Heading(level, text) => {
                let tag = (level + 1).min(6);
                body.push_str(&format!("<h{tag}>{}</h{tag}>\n", html_escape(&text)));
            }
            Block::Paragraph(text) => body.push_str(&format!("<p>{}</p>\n", html_escape(&text))),
            Block::Image(image) => {
                let (width, height) = image.fitted_mm(page.body_width_mm(), page.body_height_mm());
                body.push_str(&format!(
                    "<figure><img src=\"data:{};base64,{}\" alt=\"{}\" style=\"width:{width:.1}mm;max-width:100%;aspect-ratio:{width:.1}/{height:.1}\"></figure>\n",
                    image.media_type(),
                    base64(&image.bytes),
                    html_escape(&image.alt),
                ));
            }
        }
    }
    let css = format!(
        r#"@page {{ size: {width}mm {height}mm; margin: {margin}mm; }}
:root {{ color-scheme: light; }}
body {{ max-width: 42em; margin: 3rem auto; padding: 0 1.5rem; color: #1d1d1f; background: #fff; font: 12pt/1.8 "New York", "Iowan Old Style", "Noto Serif KR", "Noto Serif JP", "Noto Serif SC", "Nanum Myeongjo", Georgia, serif; }}
h1, h2, h3, h4, h5, h6 {{ line-height: 1.35; break-after: avoid; }}
h1.title {{ margin: 0 0 1.5em; font-size: 1.6em; }}
h2 {{ margin: 1.8em 0 0.6em; font-size: 1.3em; }}
h3, h4, h5, h6 {{ margin: 1.4em 0 0.5em; font-size: 1.1em; }}
p {{ min-height: 1.8em; margin: 0 0 0.3em; white-space: pre-wrap; overflow-wrap: anywhere; }}
figure {{ margin: 0.8em 0; text-align: center; break-inside: avoid; }}
img {{ height: auto; }}
@media print {{ body {{ max-width: none; margin: 0; padding: 0; }} }}"#,
        width = page.width_mm,
        height = page.height_mm,
        margin = page.margin_mm,
    );
    Ok(format!(
        "<!doctype html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>{}</title>\n<style>\n{css}\n</style>\n</head>\n<body>\n<article>\n{body}</article>\n</body>\n</html>\n",
        html_escape(&title_text)
    )
    .into_bytes())
}
