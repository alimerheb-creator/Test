import Foundation
import WebKit

/// window.SixthFrontStore in the game: a small key/value store in files on the device, as in the Android app.
/// The game keeps its mod list and settings here as well as in localStorage, which the web view may write to
/// disk late, so a change made just before the app is closed is not lost.
///
/// The game calls get/put/remove synchronously, so every page starts with a copy of the whole store
/// (bootstrapScript); put and remove update that copy at once and are sent here to be written to disk.
/// Each value is written to a temporary file and moved over the old one, so it is never half-written.
final class Store {
    private let dir: URL
    private var values: [String: String] = [:]
    private let disk = DispatchQueue(label: "com.sixthfront.game.store", qos: .utility)

    init() {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        dir = support.appendingPathComponent("store", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        for file in files where file.pathExtension == "v" {
            guard let key = Store.key(fromFileName: file.deletingPathExtension().lastPathComponent),
                  let data = try? Data(contentsOf: file),
                  let value = String(data: data, encoding: .utf8) else { continue }
            values[key] = value
        }
    }

    // file names: the key in URL-safe base64, so any key maps to a valid name and back
    private static func fileName(for key: String) -> String {
        Data(key.utf8).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private static func key(fromFileName name: String) -> String? {
        var b64 = name.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        guard let data = Data(base64Encoded: b64) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func file(for key: String) -> URL {
        dir.appendingPathComponent(Store.fileName(for: key)).appendingPathExtension("v")
    }

    func put(_ key: String, _ value: String) {
        values[key] = value
        let url = file(for: key), data = Data(value.utf8)
        disk.async { try? data.write(to: url, options: .atomic) }
    }

    func remove(_ key: String) {
        values.removeValue(forKey: key)
        let url = file(for: key)
        disk.async { try? FileManager.default.removeItem(at: url) }
    }

    /// Waits until everything sent so far is on disk.
    func flush() {
        disk.sync {}
    }

    /// JavaScript that defines window.SixthFrontStore with the store's current contents.
    func bootstrapScript() -> String {
        let json: String
        if let data = try? JSONSerialization.data(withJSONObject: values), let s = String(data: data, encoding: .utf8) {
            json = s
        } else {
            json = "{}"
        }
        return """
        (function () {
          var d = \(json);
          var has = Object.prototype.hasOwnProperty;
          var post = function (m) { try { window.webkit.messageHandlers.sfstore.postMessage(m); } catch (e) {} };
          window.SixthFrontStore = {
            get: function (k) { k = String(k); return has.call(d, k) ? d[k] : null; },
            put: function (k, v) {
              k = String(k);
              if (v === null || v === undefined) { delete d[k]; post({ op: 'remove', k: k }); return true; }
              v = String(v); d[k] = v; post({ op: 'put', k: k, v: v }); return true;
            },
            remove: function (k) { k = String(k); delete d[k]; post({ op: 'remove', k: k }); }
          };
        })();
        """
    }
}

/// Receives the game's writes (window.webkit.messageHandlers.sfstore) and passes them to the store.
final class StoreBridge: NSObject, WKScriptMessageHandler {
    private let store: Store

    init(store: Store) {
        self.store = store
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let op = body["op"] as? String, let key = body["k"] as? String else {
            return
        }
        if op == "put", let value = body["v"] as? String {
            store.put(key, value)
        } else if op == "remove" {
            store.remove(key)
        }
    }
}
