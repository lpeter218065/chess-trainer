import UIKit
import Capacitor
import CoreMotion

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private let motion = CMMotionManager()
    private let shakeDetectorQueue = OperationQueue()
    private var lastShakeAt: TimeInterval = 0

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        shakeDetectorQueue.name = "dev.xu.chesstrainer.shake"
        shakeDetectorQueue.maxConcurrentOperationCount = 1
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        motion.stopAccelerometerUpdates()
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        startShakeMonitor()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        motion.stopAccelerometerUpdates()
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    private func startShakeMonitor() {
        guard motion.isAccelerometerAvailable else { return }
        if motion.isAccelerometerActive { return }
        motion.accelerometerUpdateInterval = 0.05
        motion.startAccelerometerUpdates(to: shakeDetectorQueue) { [weak self] data, _ in
            guard let self, let a = data?.acceleration else { return }
            let mag = sqrt(a.x * a.x + a.y * a.y + a.z * a.z)
            guard mag >= 2.3 else { return }
            let now = Date().timeIntervalSince1970
            guard now - self.lastShakeAt >= 0.8 else { return }
            self.lastShakeAt = now
            DispatchQueue.main.async {
                self.emitShake()
            }
        }
    }

    private func emitShake() {
        var vc = window?.rootViewController
        while let current = vc {
            if let bridgeVC = current as? CAPBridgeViewController {
                bridgeVC.bridge?.triggerWindowJSEvent(eventName: "chess-shake")
                return
            }
            if let presented = current.presentedViewController {
                vc = presented
            } else if let nav = current as? UINavigationController {
                vc = nav.visibleViewController
            } else if let tab = current as? UITabBarController {
                vc = tab.selectedViewController
            } else {
                vc = current.children.first
            }
        }
    }
}
