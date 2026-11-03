import Foundation
import PDFKit

let maxPages = 500
let maxBytes = 8 * 1024 * 1024
if CommandLine.arguments.count != 2 { exit(2) }
guard let pdf = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1])), !pdf.isLocked else { exit(1) }
guard pdf.pageCount <= maxPages else { exit(3) }

// Emit one page at a time instead of retaining every extracted page. The Rust
// caller independently limits output and terminates the process on timeout.
let output = FileHandle.standardOutput
var written = 1
output.write(Data("[".utf8))
for i in 0..<pdf.pageCount {
    guard let page = try? JSONEncoder().encode(pdf.page(at: i)?.string ?? "") else { exit(1) }
    let separator = i == 0 ? 0 : 1
    guard written + separator + page.count + 1 <= maxBytes else { exit(3) }
    if separator == 1 { output.write(Data(",".utf8)) }
    output.write(page)
    written += separator + page.count
}
output.write(Data("]".utf8))
