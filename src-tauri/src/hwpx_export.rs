//! HWPX (OWPML, KS X 6101) writer for Hancom Office Hangul 2014 and later.
//!
//! Hangul is strict about structure, so the parts follow what Hangul itself writes: a header
//! that declares every font, character and paragraph property referenced from the section,
//! a first paragraph that carries the section and page settings, text in `hp:t` with tabs as
//! nested `hp:tab`, and pictures listed both in the package manifest and the header.

use crate::document_export::{blocks, xml_escape, Block, Page};
use crate::ProjectSnapshot;
use std::io::{Cursor, Write};

const NS: &str = r#"xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0""#;
const XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>"#;
const LANGS: [&str; 7] = [
    "HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER",
];

// Character property ids.
const CHAR_BODY: usize = 0;
const CHAR_TITLE: usize = 1;
const CHAR_HEADING: usize = 2;
// Paragraph property ids.
const PARA_BODY: usize = 0;
const PARA_TITLE: usize = 1;
const PARA_HEADING: usize = 2;
const PARA_PICTURE: usize = 3;

/// HWPUNIT is 1/7200 inch.
fn hwp_unit(mm: f64) -> i64 {
    (mm * 7200.0 / 25.4).round() as i64
}

fn char_pr(id: usize, height: u32, bold: bool) -> String {
    let all = |value: &str| {
        format!(
            r#"hangul="{value}" latin="{value}" hanja="{value}" japanese="{value}" other="{value}" symbol="{value}" user="{value}""#
        )
    };
    format!(
        r##"<hh:charPr id="{id}" height="{height}" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2"><hh:fontRef {}/><hh:ratio {}/><hh:spacing {}/><hh:relSz {}/><hh:offset {}/>{}<hh:underline type="NONE" shape="SOLID" color="#000000"/><hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/><hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/></hh:charPr>"##,
        all("1"),
        all("100"),
        all("0"),
        all("100"),
        all("0"),
        if bold { "<hh:bold/>" } else { "" },
    )
}

fn para_pr(id: usize, align: &str, before: u32, after: u32, keep_with_next: bool) -> String {
    let margin = format!(
        r#"<hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="{before}" unit="HWPUNIT"/><hc:next value="{after}" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/>"#
    );
    format!(
        r#"<hh:paraPr id="{id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0" textDir="LTR"><hh:align horizontal="{align}" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/><hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" widowOrphan="0" keepWithNext="{}" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/><hh:autoSpacing eAsianEng="0" eAsianNum="0"/><hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">{margin}</hp:case><hp:default>{margin}</hp:default></hp:switch><hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr>"#,
        u8::from(keep_with_next)
    )
}

fn header(pictures: &[Picture]) -> String {
    let mut fontfaces = String::new();
    for lang in LANGS {
        fontfaces.push_str(&format!(r#"<hh:fontface lang="{lang}" fontCnt="2">"#));
        for (id, face) in ["함초롬돋움", "함초롬바탕"].into_iter().enumerate() {
            fontfaces.push_str(&format!(
                r#"<hh:font id="{id}" face="{face}" type="TTF" isEmbedded="0"><hh:typeInfo familyType="FCAT_GOTHIC" weight="6" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/></hh:font>"#
            ));
        }
        fontfaces.push_str("</hh:fontface>");
    }
    let border = |id: usize, fill: &str| {
        format!(
            r##"<hh:borderFill id="{id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/><hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/><hh:topBorder type="NONE" width="0.1 mm" color="#000000"/><hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/><hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>{fill}</hh:borderFill>"##
        )
    };
    // Outline numbering referenced by the section (outlineShapeIDRef); headings don't use it.
    let mut outline = String::from(r#"<hh:numbering id="1" start="0">"#);
    for (level, (format, pattern)) in [
        ("DIGIT", "^1."),
        ("HANGUL_SYLLABLE", "^2."),
        ("DIGIT", "^3)"),
        ("HANGUL_SYLLABLE", "^4)"),
        ("DIGIT", "(^5)"),
        ("HANGUL_SYLLABLE", "(^6)"),
        ("CIRCLED_DIGIT", "^7"),
        ("CIRCLED_HANGUL_SYLLABLE", "^8"),
        ("HANGUL_JAMO", "^9"),
        ("ROMAN_SMALL", "^10"),
    ]
    .into_iter()
    .enumerate()
    {
        outline.push_str(&format!(
            r#"<hh:paraHead start="1" level="{}" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="{format}" charPrIDRef="4294967295" checkable="0">{pattern}</hh:paraHead>"#,
            level + 1
        ));
    }
    outline.push_str("</hh:numbering>");
    let mut bin_data = String::new();
    if !pictures.is_empty() {
        bin_data.push_str(&format!(r#"<hh:binDataList itemCnt="{}">"#, pictures.len()));
        for (index, picture) in pictures.iter().enumerate() {
            bin_data.push_str(&format!(
                r#"<hh:binItem id="{index}" Type="Embedding" BinData="{}.{}" Format="{}"/>"#,
                picture.id, picture.extension, picture.extension
            ));
        }
        bin_data.push_str("</hh:binDataList>");
    }
    format!(
        r#"{XML}<hh:head {NS} version="1.5" secCnt="1"><hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/><hh:refList><hh:fontfaces itemCnt="7">{fontfaces}</hh:fontfaces><hh:borderFills itemCnt="2">{}{}</hh:borderFills><hh:charProperties itemCnt="3">{}{}{}</hh:charProperties><hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties><hh:numberings itemCnt="1">{outline}</hh:numberings><hh:paraProperties itemCnt="4">{}{}{}{}</hh:paraProperties><hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="{PARA_BODY}" charPrIDRef="{CHAR_BODY}" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>{bin_data}</hh:refList><hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument><hh:docOption><hh:linkinfo path="" pageInherit="0" footnoteInherit="0"/></hh:docOption><hh:trackchageConfig flags="56"/></hh:head>"#,
        border(1, ""),
        border(
            2,
            r##"<hc:fillBrush><hc:winBrush faceColor="none" hatchColor="#999999" alpha="0"/></hc:fillBrush>"##
        ),
        char_pr(CHAR_BODY, 1200, false),
        char_pr(CHAR_TITLE, 1800, true),
        char_pr(CHAR_HEADING, 1400, true),
        para_pr(PARA_BODY, "JUSTIFY", 0, 600, false),
        para_pr(PARA_TITLE, "LEFT", 0, 1600, true),
        para_pr(PARA_HEADING, "LEFT", 1200, 600, true),
        para_pr(PARA_PICTURE, "CENTER", 600, 600, false),
    )
}

/// Text run with tabs nested inside `hp:t`, the way Hangul writes them.
fn run(text: &str, char_pr: usize) -> String {
    let text = text
        .split('\t')
        .map(xml_escape)
        .collect::<Vec<_>>()
        .join("<hp:tab/>");
    if text.is_empty() {
        format!(r#"<hp:run charPrIDRef="{char_pr}"><hp:t/></hp:run>"#)
    } else {
        format!(r#"<hp:run charPrIDRef="{char_pr}"><hp:t>{text}</hp:t></hp:run>"#)
    }
}

fn paragraph(id: usize, para_pr: usize, runs: &str) -> String {
    format!(
        r#"<hp:p id="{id}" paraPrIDRef="{para_pr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">{runs}</hp:p>"#
    )
}

fn section_properties(page: &Page) -> String {
    let margin = hwp_unit(page.margin_mm);
    let note_shape = |place: &str, between: u32, length: i64| {
        format!(
            r##"<hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="{length}" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="{between}" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="{place}" beneathText="0"/>"##
        )
    };
    let border_fill = |kind: &str| {
        format!(
            r#"<hp:pageBorderFill type="{kind}" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill>"#
        )
    };
    format!(
        r#"<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0"><hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/><hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/><hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/><hp:pagePr landscape="WIDELY" width="{}" height="{}" gutterType="LEFT_ONLY"><hp:margin header="0" footer="0" gutter="0" left="{margin}" right="{margin}" top="{margin}" bottom="{margin}"/></hp:pagePr><hp:footNotePr>{}</hp:footNotePr><hp:endNotePr>{}</hp:endNotePr>{}{}{}</hp:secPr><hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>"#,
        hwp_unit(page.width_mm),
        hwp_unit(page.height_mm),
        note_shape("EACH_COLUMN", 283, -1),
        note_shape("END_OF_DOCUMENT", 0, 14_692_344),
        border_fill("BOTH"),
        border_fill("EVEN"),
        border_fill("ODD"),
    )
}

struct Picture {
    /// Manifest id and file stem, e.g. `BIN0001`.
    id: String,
    extension: String,
    media_type: &'static str,
    source: String,
    bytes: std::rc::Rc<Vec<u8>>,
}

fn picture_object(
    instance: usize,
    picture: &Picture,
    alt: &str,
    width: i64,
    height: i64,
) -> String {
    let (cx, cy) = (width / 2, height / 2);
    format!(
        r#"<hp:pic textWrap="SQUARE" textFlow="BOTH_SIDES" reverse="0" id="{instance}" zOrder="0" numberingType="PICTURE" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="{instance}"><hp:offset x="0" y="0"/><hp:orgSz width="{width}" height="{height}"/><hp:curSz width="{width}" height="{height}"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="{cx}" centerY="{cy}" rotateimage="1"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="{width}" y="0"/><hc:pt2 x="{width}" y="{height}"/><hc:pt3 x="0" y="{height}"/></hp:imgRect><hp:imgClip left="0" right="{width}" top="0" bottom="{height}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="{width}" dimheight="{height}"/><hc:img binaryItemIDRef="{}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:effects/><hp:sz width="{width}" height="{height}" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment>{}</hp:shapeComment></hp:pic>"#,
        picture.id,
        xml_escape(alt),
    )
}

pub(crate) fn build(
    project: &ProjectSnapshot,
    root: Option<&str>,
    page: &Page,
) -> Result<Vec<u8>, String> {
    let mut pictures: Vec<Picture> = Vec::new();
    let mut paragraphs = String::new();
    let mut title_text = String::new();
    let mut paragraph_id = 0usize;
    // Plain-text preview Hangul shows in file lists; Hangul for macOS expects the part.
    let mut preview = String::new();
    for block in blocks(project, root)? {
        let id = paragraph_id;
        paragraph_id += 1;
        match block {
            Block::Title(title) => {
                // The first paragraph carries the section and page settings.
                let settings = format!(
                    r#"<hp:run charPrIDRef="{CHAR_TITLE}">{}</hp:run>"#,
                    section_properties(page)
                );
                paragraphs.push_str(&paragraph(
                    id,
                    PARA_TITLE,
                    &(settings + &run(&title, CHAR_TITLE)),
                ));
                preview.push_str(&title);
                preview.push_str("\r\n");
                title_text = title;
            }
            Block::Heading(_, text) => {
                paragraphs.push_str(&paragraph(id, PARA_HEADING, &run(&text, CHAR_HEADING)));
                preview.push_str(&text);
                preview.push_str("\r\n");
            }
            Block::Paragraph(text) => {
                paragraphs.push_str(&paragraph(id, PARA_BODY, &run(&text, CHAR_BODY)));
                preview.push_str(&text);
                preview.push_str("\r\n");
            }
            Block::Image(image) => {
                let index = match pictures.iter().position(|p| p.source == image.name) {
                    Some(index) => index,
                    None => {
                        pictures.push(Picture {
                            id: format!("BIN{:04}", pictures.len() + 1),
                            extension: image.extension().to_string(),
                            media_type: image.media_type(),
                            source: image.name.clone(),
                            bytes: image.bytes.clone(),
                        });
                        pictures.len() - 1
                    }
                };
                let (width, height) = image.fitted_mm(page.body_width_mm(), page.body_height_mm());
                let object = picture_object(
                    1000 + id,
                    &pictures[index],
                    &image.alt,
                    hwp_unit(width),
                    hwp_unit(height),
                );
                paragraphs.push_str(&paragraph(
                    id,
                    PARA_PICTURE,
                    &format!(r#"<hp:run charPrIDRef="{CHAR_BODY}">{object}</hp:run>"#),
                ));
            }
        }
    }
    let section = format!(r#"{XML}<hs:sec {NS}>{paragraphs}</hs:sec>"#);
    let mut items = String::from(
        r#"<opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/><opf:item id="settings" href="settings.xml" media-type="application/xml"/>"#,
    );
    for picture in &pictures {
        items.push_str(&format!(
            r#"<opf:item id="{0}" href="BinData/{0}.{1}" media-type="{2}" isEmbeded="1"/>"#,
            picture.id, picture.extension, picture.media_type
        ));
    }
    let package = format!(
        r#"{XML}<opf:package {NS} version="" unique-identifier="" id=""><opf:metadata><opf:title>{}</opf:title><opf:language>ko</opf:language></opf:metadata><opf:manifest>{items}</opf:manifest><opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>"#,
        xml_escape(&title_text)
    );
    let header = header(&pictures);
    let preview: String = preview.chars().take(1024).collect();
    let version = format!(
        r#"{XML}<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0" os="1" xmlVersion="1.5" application="Ouroborocessor" appVersion="{}"/>"#,
        env!("CARGO_PKG_VERSION")
    );
    let settings = format!(
        r#"{XML}<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"><ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>"#
    );
    let container = format!(
        r#"{XML}<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/><ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/></ocf:rootfiles></ocf:container>"#
    );
    let manifest = format!(
        r#"{XML}<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>"#
    );

    let mut archive = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let stored =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    // Like ODF and EPUB, the mimetype entry goes first and uncompressed.
    for (name, data) in [
        ("mimetype", "application/hwp+zip"),
        ("version.xml", version.as_str()),
        ("Contents/header.xml", header.as_str()),
        ("Contents/section0.xml", section.as_str()),
        ("settings.xml", settings.as_str()),
        ("Contents/content.hpf", package.as_str()),
        ("META-INF/container.xml", container.as_str()),
        ("META-INF/manifest.xml", manifest.as_str()),
        ("Preview/PrvText.txt", preview.as_str()),
    ] {
        archive
            .start_file(name, stored)
            .map_err(|e| e.to_string())?;
        archive
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
    }
    for picture in pictures {
        archive
            .start_file(
                format!("BinData/{}.{}", picture.id, picture.extension),
                stored,
            )
            .map_err(|e| e.to_string())?;
        archive
            .write_all(&picture.bytes)
            .map_err(|e| e.to_string())?;
    }
    Ok(archive.finish().map_err(|e| e.to_string())?.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn page_sizes_convert_to_hwp_units() {
        assert_eq!(hwp_unit(210.0), 59528);
        assert_eq!(hwp_unit(25.4), 7200);
    }

    #[test]
    fn tabs_nest_inside_text_and_markup_is_escaped() {
        assert_eq!(
            run("a\tb<c>", 0),
            r#"<hp:run charPrIDRef="0"><hp:t>a<hp:tab/>b&lt;c&gt;</hp:t></hp:run>"#
        );
        assert_eq!(run("", 2), r#"<hp:run charPrIDRef="2"><hp:t/></hp:run>"#);
    }
}
