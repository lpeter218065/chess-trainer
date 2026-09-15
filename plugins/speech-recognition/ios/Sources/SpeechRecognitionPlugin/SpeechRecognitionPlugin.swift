import AVFoundation
import Capacitor
import Speech

@objc(SpeechRecognitionPlugin)
public class SpeechRecognitionPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "SpeechRecognitionPlugin"
  public let jsName = "SpeechRecognition"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
  ]

  private let audioEngine = AVAudioEngine()
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?
  private var listening = false

  @objc func available(_ call: CAPPluginCall) {
    let rec = SFSpeechRecognizer(locale: Locale(identifier: "zh-CN")) ?? SFSpeechRecognizer()
    call.resolve(["available": rec != nil])
  }

  @objc func start(_ call: CAPPluginCall) {
    let locale = call.getString("locale") ?? "zh-CN"
    requestPermissions { [weak self] denied in
      guard let self else { return }
      if let denied {
        call.reject(denied)
        return
      }
      do {
        try self.begin(locale: locale)
        call.resolve()
      } catch {
        call.reject(error.localizedDescription)
      }
    }
  }

  @objc func stop(_ call: CAPPluginCall) {
    finish(notifyEnd: true)
    call.resolve()
  }

  @objc func cancel(_ call: CAPPluginCall) {
    finish(notifyEnd: true)
    call.resolve()
  }

  private func requestPermissions(_ done: @escaping (String?) -> Void) {
    SFSpeechRecognizer.requestAuthorization { status in
      DispatchQueue.main.async {
        guard status == .authorized else {
          done("denied")
          return
        }
        self.requestMicrophone { ok in
          done(ok ? nil : "denied")
        }
      }
    }
  }

  private func requestMicrophone(_ done: @escaping (Bool) -> Void) {
    if #available(iOS 17.0, *) {
      AVAudioApplication.requestRecordPermission { ok in
        DispatchQueue.main.async { done(ok) }
      }
    } else {
      AVAudioSession.sharedInstance().requestRecordPermission { ok in
        DispatchQueue.main.async { done(ok) }
      }
    }
  }

  private func begin(locale: String) throws {
    finish(notifyEnd: false)
    #if targetEnvironment(simulator)
    throw NSError(domain: "SpeechRecognition", code: 3, userInfo: [NSLocalizedDescriptionKey: "simulator"])
    #endif
    guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale)) ?? SFSpeechRecognizer() else {
      throw NSError(domain: "SpeechRecognition", code: 1, userInfo: [NSLocalizedDescriptionKey: "unavailable"])
    }

    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playAndRecord, mode: .measurement, options: [.duckOthers, .defaultToSpeaker])
    try session.setActive(true, options: .notifyOthersOnDeactivation)

    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    request.taskHint = .dictation
    if #available(iOS 13.0, *), recognizer.supportsOnDeviceRecognition {
      request.requiresOnDeviceRecognition = true
    }
    recognitionRequest = request

    listening = true
    recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
      guard let self else { return }
      if let result {
        let data: [String: Any] = [
          "text": result.bestTranscription.formattedString,
          "isFinal": result.isFinal,
        ]
        self.notifyListeners(result.isFinal ? "result" : "partial", data: data)
      }
      if let error, self.listening {
        let ns = error as NSError
        if ns.domain == "kAFAssistantErrorDomain", ns.code == 216 {
          return
        }
        self.notifyListeners("error", data: ["message": "no-speech"])
        self.finish(notifyEnd: true)
      }
    }

    let input = audioEngine.inputNode
    input.removeTap(onBus: 0)
    audioEngine.prepare()
    try audioEngine.start()

    let hwFormat = input.outputFormat(forBus: 0)
    guard hwFormat.sampleRate > 0, hwFormat.channelCount > 0 else {
      finish(notifyEnd: false)
      throw NSError(domain: "SpeechRecognition", code: 2, userInfo: [NSLocalizedDescriptionKey: "audio-capture"])
    }
    input.installTap(onBus: 0, bufferSize: 1024, format: hwFormat) { [weak self] buffer, _ in
      self?.recognitionRequest?.append(buffer)
    }
  }

  private func finish(notifyEnd: Bool) {
    recognitionRequest?.endAudio()
    if audioEngine.isRunning {
      audioEngine.stop()
    }
    audioEngine.inputNode.removeTap(onBus: 0)
    recognitionRequest = nil
    recognitionTask?.cancel()
    recognitionTask = nil
    let wasListening = listening
    listening = false
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    if notifyEnd, wasListening {
      notifyListeners("end", data: [:])
    }
  }
}
