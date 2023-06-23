import UIKit
import Capacitor
import Vapor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    var app: Application!
    var environment: Environment!

    func configureMiddlewares(app: Application) {
        // Use FileMiddleware to serve files from the app bundle
        if let bundlePath = Bundle.main.resourcePath {
            let publicDirectory = bundlePath + "/public/"
            let fileMiddleware = FileMiddleware(publicDirectory: publicDirectory)
            app.middleware.use(fileMiddleware)
        }
    }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        print("Launching")
        
        do {
            self.environment = try Environment.detect()
            try LoggingSystem.bootstrap(from: &environment)
        } catch {
            print("Failed to bootstrap logging: \(error)")
        }

        self.app = Application(self.environment)
        self.configureMiddlewares(app: app)
        app.http.server.configuration.hostname = "localhost"
        app.http.server.configuration.port = 3000

        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try self.app.run()
            } catch {
                DispatchQueue.main.async {
                    let alert = UIAlertController(title: "Error", message: "Failed to start Vapor server: \(error)", preferredStyle: .alert)
                    alert.addAction(UIAlertAction(title: "OK", style: .default, handler: nil))
                    self.window?.rootViewController?.present(alert, animated: true, completion: nil)
                }
            }
        }

        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        print("Resigning active")
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        print("Entering background")
        self.app.shutdown()
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        print("Entering foreground")
        self.app = Application(self.environment)
        self.configureMiddlewares(app: app)
        app.http.server.configuration.hostname = "localhost"
        app.http.server.configuration.port = 3000

        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try self.app.run()
            } catch {
                DispatchQueue.main.async {
                    let alert = UIAlertController(title: "Error", message: "Failed to start Vapor server: \(error)", preferredStyle: .alert)
                    alert.addAction(UIAlertAction(title: "OK", style: .default, handler: nil))
                    self.window?.rootViewController?.present(alert, animated: true, completion: nil)
                }
            }
        }
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        print("Becoming active")
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        print("Terminating")
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
