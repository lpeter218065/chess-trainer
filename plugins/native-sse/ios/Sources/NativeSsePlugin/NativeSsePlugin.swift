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
    URLSession(configuration: .default, delegate: self, delegateQueue: nil)
  }()

  private var tasks: [String: URLSessionDataTask] = [:]
  private var idByTask: [Int: String] = [:]
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
    request.timeoutInterval = 120
    for (key, value) in headers {
      request.setValue(value, forHTTPHeaderField: key)
    }
    if let body {
      request.httpBody = Data(body.utf8)
    }

    let task = session.dataTask(with: request)
    lock.lock()
    tasks[id] = task
    idByTask[task.taskIdentifier] = id
    lock.unlock()

    call.resolve(["id": id])
    DispatchQueue.global(qos: .userInitiated).async {
      task.resume()
    }
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
    lock.unlock()
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
        headers[String(describing: key)] = String(describing: value)
      }
    }
    notify("open", ["id": id, "status": status, "headers": headers])
    completionHandler(.allow)
  }

  public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    let id = streamId(for: dataTask)
    let chunk = String(data: data, encoding: .utf8) ?? String(decoding: data, as: UTF8.self)
    notify("chunk", ["id": id, "chunk": chunk])
  }

  public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    let id = streamId(for: task)
    lock.lock()
    tasks.removeValue(forKey: id)
    idByTask.removeValue(forKey: task.taskIdentifier)
    lock.unlock()
    if let error, (error as NSError).code != NSURLErrorCancelled {
      notify("error", ["id": id, "message": error.localizedDescription])
      return
    }
    notify("end", ["id": id])
  }

  private func streamId(for task: URLSessionTask) -> String {
    lock.lock()
    defer { lock.unlock() }
    return idByTask[task.taskIdentifier] ?? ""
  }

  private func notify(_ event: String, _ data: [String: Any]) {
    DispatchQueue.main.async {
      self.notifyListeners(event, data: data)
    }
  }
}
