import Foundation
import PDFKit
if CommandLine.arguments.count != 2 { exit(2) }
guard let pdf = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1])), !pdf.isLocked else { exit(1) }
var pages:[String] = []
for i in 0..<pdf.pageCount { pages.append(pdf.page(at:i)?.string ?? "") }
FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: pages))
