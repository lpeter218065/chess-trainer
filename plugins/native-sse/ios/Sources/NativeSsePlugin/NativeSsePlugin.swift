import Foundation
import Capacitor

@objc(NativeSsePlugin)
public class NativeSsePlugin: CAPPlugin, CAPBridgedPlugin, URLSessionDataDelegate {
  public let identifier = "NativeSsePlugin"
  public let jsName = "NativeSse"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
  ]

  private lazy var session: URLSession = {
    let config = URLSessionConfiguration.ephemeral
    config.requestCachePolicy = .reloadIgnoringLocalCacheData
    config.timeoutIntervalForRequest = 180
    config.timeoutIntervalForResource = 300
    config.httpAdditionalHeaders = [
      "Accept-Encoding": "identity",
      "Accept": "text/event-stream",
      "Cache-Control": "no-cache",
    ]
    let queue = OperationQueue()
    queue.name = "dev.xu.chesstrainer.nativesse"
    queue.maxConcurrentOperationCount = 1
    return URLSession(configuration: config, delegate: self, delegateQueue: queue)
  }()

  private var tasks: [String: URLSessionDataTask] = [:]
  private var idByTask: [Int: String] = [:]
  private var utf8Remainder: [String: Data] = [:]
  private var pendingChunks: [String: String] = [:]
  private var flushWork: [String: DispatchWorkItem] = [:]
  private let lock = NSLock()

  @objc func start(_ call: CAPPluginCall) {
    guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
      call.reject("missing url")
      return
    }
    let method = call.getString("method") ?? "GET"
    var headers: [String: String] = [:]
    if let raw = call.getObject("headers") {
      for (key, value) in raw {
        headers[key] = String(describing: value)
      }
    }
    let body = call.getString("body")
    let id = UUID().uuidString

    var request = URLRequest(url: url)
    request.httpMethod = method
    request.timeoutInterval = 300
    request.cachePolicy = .reloadIgnoringLocalCacheData
    for (key, value) in headers {
      request.setValue(value, forHTTPHeaderField: key)
    }
    request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
    if request.value(forHTTPHeaderField: "Accept") == nil {
      request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
    }
    if request.value(forHTTPHeaderField: "Cache-Control") == nil {
      request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
    }
    if let body {
      request.httpBody = Data(body.utf8)
    }

    let task = session.dataTask(with: request)
    lock.lock()
    tasks[id] = task
    idByTask[task.taskIdentifier] = id
    utf8Remainder[id] = Data()
    lock.unlock()

    call.resolve(["id": id])
    task.resume()
  }

  @objc func cancel(_ call: CAPPluginCall) {
    guard let id = call.getString("id") else {
      call.reject("missing id")
      return
    }
    lock.lock()
    let task = tasks.removeValue(forKey: id)
    if let task {
      idByTask.removeValue(forKey: task.taskIdentifier)
    }
    utf8Remainder.removeValue(forKey: id)
    pendingChunks.removeValue(forKey: id)
    let work = flushWork.removeValue(forKey: id)
    lock.unlock()
    work?.cancel()
    task?.cancel()
    call.resolve()
  }

  public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    let id = streamId(for: dataTask)
    var status = 0
    var headers: [String: String] = [:]
    if let http = response as? HTTPURLResponse {
      status = http.statusCode
      for (key, value) in http.allHeaderFields {
        headers[String(describing: key).lowercased()] = String(describing: value)
      }
    }
    notify("open", ["id": id, "status": status, "headers": headers], retain: true)
    completionHandler(.allow)
  }

  public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    let id = streamId(for: dataTask)
    let chunk = decodeUtf8(id: id, incoming: data)
    if !chunk.isEmpty {
      enqueueChunk(id: id, chunk: chunk)
    }
  }

  public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    let id = streamId(for: task)
    lock.lock()
    let tail = utf8Remainder.removeValue(forKey: id) ?? Data()
    tasks.removeValue(forKey: id)
    idByTask.removeValue(forKey: task.taskIdentifier)
    lock.unlock()
    if !tail.isEmpty {
      let leftover = String(decoding: tail, as: UTF8.self)
      if !leftover.isEmpty {
        enqueueChunk(id: id, chunk: leftover)
      }
    }
    flushChunk(id)
    if let error, (error as NSError).code != NSURLErrorCancelled {
      notify("error", ["id": id, "message": error.localizedDescription], retain: true)
      return
    }
    notify("end", ["id": id], retain: true)
  }

  private func decodeUtf8(id: String, incoming: Data) -> String {
    lock.lock()
    var buf = utf8Remainder[id] ?? Data()
    buf.append(incoming)
    if let s = String(data: buf, encoding: .utf8) {
      utf8Remainder[id] = Data()
      lock.unlock()
      return s
    }
    var end = buf.count
    while end > 0 && buf.count - end <= 4 {
      end -= 1
      if let s = String(data: buf.prefix(end), encoding: .utf8) {
        utf8Remainder[id] = Data(buf.suffix(buf.count - end))
        lock.unlock()
        return s
      }
    }
    utf8Remainder[id] = buf
    lock.unlock()
    return ""
  }

  private func enqueueChunk(id: String, chunk: String) {
    lock.lock()
    pendingChunks[id, default: ""].append(chunk)
    let already = flushWork[id]
    lock.unlock()
    if already != nil { return }
    let work = DispatchWorkItem { [weak self] in
      self?.flushChunk(id)
    }
    lock.lock()
    flushWork[id] = work
    lock.unlock()
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.032, execute: work)
  }

  private func flushChunk(_ id: String) {
    lock.lock()
    let text = pendingChunks.removeValue(forKey: id) ?? ""
    flushWork.removeValue(forKey: id)?.cancel()
    lock.unlock()
    if !text.isEmpty {
      notify("chunk", ["id": id, "chunk": text], retain: false)
    }
  }

  private func streamId(for task: URLSessionTask) -> String {
    lock.lock()
    defer { lock.unlock() }
    return idByTask[task.taskIdentifier] ?? ""
  }

  private func notify(_ event: String, _ data: [String: Any], retain: Bool) {
    DispatchQueue.main.async {
      self.notifyListeners(event, data: data, retainUntilConsumed: retain)
    }
  }
}
