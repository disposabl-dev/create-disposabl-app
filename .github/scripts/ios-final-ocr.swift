import AppKit
import Foundation
import Vision

let url = URL(fileURLWithPath: CommandLine.arguments[1])
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
let handler = VNImageRequestHandler(url: url)
try handler.perform([request])
for observation in request.results ?? [] {
  if let text = observation.topCandidates(1).first?.string { print(text) }
}
