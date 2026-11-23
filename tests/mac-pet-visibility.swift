// A separate foreground app covers the pet's monitor. Quartz lists windows front to back.
import AppKit
import CoreGraphics

guard CommandLine.arguments.count == 2, let petID = UInt32(CommandLine.arguments[1]) else { exit(2) }
let app = NSApplication.shared
app.setActivationPolicy(.regular)
let window = NSWindow(contentRect: .init(x: 0, y: 0, width: 800, height: 600),
                      styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
window.collectionBehavior = [.fullScreenPrimary]
window.center()

func petIsAboveWindow() -> Bool {
    guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements],
                                                 kCGNullWindowID) as? [[String: Any]] else { return false }
    let numbers = list.compactMap { ($0[kCGWindowNumber as String] as? NSNumber)?.uint32Value }
    guard let pet = numbers.firstIndex(of: petID),
          let cover = numbers.firstIndex(of: UInt32(window.windowNumber)) else { return false }
    return pet < cover
}

var normal = false
var enteredFullscreen = false
let observer = NotificationCenter.default.addObserver(forName: NSWindow.didEnterFullScreenNotification,
                                                        object: window, queue: .main) { _ in
    enteredFullscreen = true
}
app.activate(ignoringOtherApps: true)
window.makeKeyAndOrderFront(nil)
let deadline = Date().addingTimeInterval(22)
let timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { _ in
    if app.isActive && petIsAboveWindow() {
        if enteredFullscreen {
            print("visible-above-fullscreen")
            exit(0)
        }
        if !normal {
            normal = true
            window.toggleFullScreen(nil)
        }
    }
    if Date() > deadline {
        print("active=\(app.isActive) aboveNormal=\(normal) enteredFullscreen=\(enteredFullscreen) aboveNow=\(petIsAboveWindow())")
        exit(1)
    }
}
app.run()
