// macOS: swift scripts/user-guide/build.swift [repository root]
// Generates the same Hebrew text as the app; CoreText handles bidirectional text.
import AppKit
import CoreText

struct Guide: Decodable {
    struct Section: Decodable { let id: String; let title: String; let page: Int; let steps: [String] }
    let title: String; let app: String; let version: String; let intro: String; let sections: [Section]
}
let root = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : FileManager.default.currentDirectoryPath)
let guide = try JSONDecoder().decode(Guide.self, from: Data(contentsOf: root.appendingPathComponent("src/content/userGuide.he.json")))
let output = root.appendingPathComponent("public/guides/ysnp-user-guide-he.pdf")
try FileManager.default.createDirectory(at: output.deletingLastPathComponent(), withIntermediateDirectories: true)
var media = CGRect(x: 0, y: 0, width: 595.28, height: 841.89)
guard let consumer = CGDataConsumer(url: output as CFURL), let context = CGContext(consumer: consumer, mediaBox: &media, [kCGPDFContextTitle: guide.title, kCGPDFContextAuthor: guide.app] as CFDictionary) else { fatalError("Cannot create PDF") }
let margin: CGFloat = 48
let width = media.width - margin * 2
var y: CGFloat = 0
func text(_ value: String, size: CGFloat = 11, bold: Bool = false, color: NSColor = .darkGray) {
    let style = NSMutableParagraphStyle()
    style.alignment = .right
    style.baseWritingDirection = .rightToLeft
    style.lineSpacing = 4
    let font = NSFont(name: bold ? "Arial-BoldMT" : "ArialMT", size: size) ?? NSFont.systemFont(ofSize: size)
    let attributed = NSAttributedString(string: value, attributes: [.font: font, .foregroundColor: color, .paragraphStyle: style])
    let setter = CTFramesetterCreateWithAttributedString(attributed)
    let needed = CTFramesetterSuggestFrameSizeWithConstraints(setter, CFRange(location: 0, length: attributed.length), nil, CGSize(width: width, height: .greatestFiniteMagnitude), nil)
    let height = ceil(needed.height) + 4
    precondition(y - height > 55, "Guide page overflow: adjust pagination in the shared JSON")
    let frame = CTFramesetterCreateFrame(setter, CFRange(location: 0, length: attributed.length), CGPath(rect: CGRect(x: margin, y: y - height, width: width, height: height), transform: nil), nil)
    context.textMatrix = .identity
    context.textPosition = .zero
    CTFrameDraw(frame, context)
    y -= height + 7
}
let pages = Set(guide.sections.map(\.page)).sorted()
for page in pages {
    context.beginPDFPage(nil)
    context.setFillColor(NSColor.white.cgColor)
    context.fill(media)
    context.setFillColor(NSColor(calibratedRed: 0.10, green: 0.18, blue: 0.24, alpha: 1).cgColor)
    context.fill(CGRect(x: 0, y: media.height - 10, width: media.width, height: 10))
    y = media.height - 42
    text(guide.app, size: 13, bold: true)
    text(guide.title, size: 23, bold: true, color: .black)
    if page == 1 { text(guide.intro, size: 11) }
    for section in guide.sections where section.page == page {
        y -= 9
        text(section.title, size: 15, bold: true, color: .black)
        for step in section.steps { text("• " + step) }
    }
    let footer = "\(guide.version)   |   \(page) / \(pages.count)"
    let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 9), .foregroundColor: NSColor.gray]
    context.textPosition = CGPoint(x: margin, y: 27)
    CTLineDraw(CTLineCreateWithAttributedString(NSAttributedString(string: footer, attributes: attrs)), context)
    context.endPDFPage()
}
context.closePDF()
print("Generated \(pages.count) pages: \(output.path)")
