import ExpoModulesCore
import NetworkExtension
import GardCore

/**
 * GardCoreModule - iOS Expo модуль для GARD VPN
 *
 * Интегрируется с Go библиотекой GardCore через gomobile bind
 * и использует NetworkExtension для VPN туннелирования.
 */
public class GardCoreModule: Module {
    
    private var vpnManager: NETunnelProviderManager?
    private var vpnStatusObserver: NSObjectProtocol?
    
    public func definition() -> ModuleDefinition {
        Name("GardCoreModule")
        
        // События
        Events("onStateChange", "onStatsUpdate", "onLog")
        
        // Константы
        Constants([
            "version": GardcoreGetVersion()
        ])
        
        // Инициализация
        OnCreate {
            self.setupCallbacks()
            self.loadVpnManager()
        }
        
        // Очистка
        OnDestroy {
            self.removeVpnStatusObserver()
        }
        
        // Подключение к VPN
        AsyncFunction("connect") { (configJSON: String, promise: Promise) in
            self.connect(configJSON: configJSON, promise: promise)
        }
        
        // Отключение от VPN
        AsyncFunction("disconnect") { (promise: Promise) in
            self.disconnect(promise: promise)
        }
        
        // Получить состояние
        AsyncFunction("getState") { (promise: Promise) in
            let state = GardcoreGetState()
            promise.resolve(state)
        }
        
        // Получить статистику
        AsyncFunction("getStats") { (promise: Promise) in
            let stats = GardcoreGetStats()
            promise.resolve(stats)
        }
        
        // Проверить подключение
        AsyncFunction("isConnected") { (promise: Promise) in
            let connected = GardcoreIsConnected()
            promise.resolve(connected)
        }
        
        // Получить версию
        Function("getVersion") {
            return GardcoreGetVersion()
        }
        
        // Запросить разрешение VPN
        AsyncFunction("requestVpnPermission") { (promise: Promise) in
            self.requestVpnPermission(promise: promise)
        }
        
        // Проверить разрешение VPN
        AsyncFunction("hasVpnPermission") { (promise: Promise) in
            // На iOS разрешение запрашивается при первом подключении
            promise.resolve(true)
        }
    }
    
    // MARK: - VPN Management
    
    private func loadVpnManager() {
        NETunnelProviderManager.loadAllFromPreferences { [weak self] managers, error in
            if let error = error {
                print("GardCore: Failed to load VPN managers: \(error)")
                return
            }
            
            self?.vpnManager = managers?.first ?? NETunnelProviderManager()
            self?.setupVpnStatusObserver()
        }
    }
    
    private func setupVpnStatusObserver() {
        removeVpnStatusObserver()
        
        vpnStatusObserver = NotificationCenter.default.addObserver(
            forName: .NEVPNStatusDidChange,
            object: vpnManager?.connection,
            queue: .main
        ) { [weak self] _ in
            self?.handleVpnStatusChange()
        }
    }
    
    private func removeVpnStatusObserver() {
        if let observer = vpnStatusObserver {
            NotificationCenter.default.removeObserver(observer)
            vpnStatusObserver = nil
        }
    }
    
    private func handleVpnStatusChange() {
        guard let status = vpnManager?.connection.status else { return }
        
        let stateString: String
        switch status {
        case .invalid:
            stateString = "disconnected"
        case .disconnected:
            stateString = "disconnected"
        case .connecting:
            stateString = "connecting"
        case .connected:
            stateString = "connected"
        case .reasserting:
            stateString = "connecting"
        case .disconnecting:
            stateString = "disconnecting"
        @unknown default:
            stateString = "disconnected"
        }
        
        let state: [String: Any] = [
            "status": stateString
        ]
        
        if let jsonData = try? JSONSerialization.data(withJSONObject: state),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            sendEvent("onStateChange", ["state": jsonString])
        }
    }
    
    private func connect(configJSON: String, promise: Promise) {
        guard let manager = vpnManager else {
            promise.reject("VPN_ERROR", "VPN manager not initialized")
            return
        }
        
        // Конфигурируем VPN
        let tunnelProtocol = NETunnelProviderProtocol()
        tunnelProtocol.providerBundleIdentifier = "\(Bundle.main.bundleIdentifier ?? "").GardTunnel"
        tunnelProtocol.serverAddress = "GARD VPN"
        tunnelProtocol.providerConfiguration = [
            "config": configJSON
        ]
        
        manager.protocolConfiguration = tunnelProtocol
        manager.localizedDescription = "GARD VPN"
        manager.isEnabled = true
        
        // Сохраняем конфигурацию
        manager.saveToPreferences { [weak self] error in
            if let error = error {
                promise.reject("VPN_SAVE_ERROR", error.localizedDescription)
                return
            }
            
            // Загружаем обновлённую конфигурацию
            manager.loadFromPreferences { error in
                if let error = error {
                    promise.reject("VPN_LOAD_ERROR", error.localizedDescription)
                    return
                }
                
                // Запускаем VPN
                do {
                    try (manager.connection as? NETunnelProviderSession)?.startTunnel(options: [
                        "config": configJSON as NSObject
                    ])
                    promise.resolve(nil)
                } catch {
                    promise.reject("VPN_START_ERROR", error.localizedDescription)
                }
            }
        }
    }
    
    private func disconnect(promise: Promise) {
        guard let manager = vpnManager else {
            promise.reject("VPN_ERROR", "VPN manager not initialized")
            return
        }
        
        manager.connection.stopVPNTunnel()
        promise.resolve(nil)
    }
    
    private func requestVpnPermission(promise: Promise) {
        guard let manager = vpnManager else {
            promise.reject("VPN_ERROR", "VPN manager not initialized")
            return
        }
        
        let tunnelProtocol = NETunnelProviderProtocol()
        tunnelProtocol.providerBundleIdentifier = "\(Bundle.main.bundleIdentifier ?? "").GardTunnel"
        tunnelProtocol.serverAddress = "GARD VPN"
        
        manager.protocolConfiguration = tunnelProtocol
        manager.localizedDescription = "GARD VPN"
        manager.isEnabled = true
        
        manager.saveToPreferences { error in
            if let error = error {
                promise.resolve(false)
            } else {
                promise.resolve(true)
            }
        }
    }
    
    // MARK: - Callbacks
    
    private func setupCallbacks() {
        // State callback
        GardcoreSetStateCallback(StateCallbackImpl { [weak self] stateJSON in
            self?.sendEvent("onStateChange", ["state": stateJSON])
        })
        
        // Stats callback
        GardcoreSetStatsCallback(StatsCallbackImpl { [weak self] statsJSON in
            self?.sendEvent("onStatsUpdate", ["stats": statsJSON])
        })
        
        // Log callback
        GardcoreSetLogCallback(LogCallbackImpl { [weak self] level, message in
            self?.sendEvent("onLog", ["level": level, "message": message])
        })
    }
}

// MARK: - Callback Implementations

class StateCallbackImpl: NSObject, GardcoreStateCallbackProtocol {
    private let handler: (String) -> Void
    
    init(handler: @escaping (String) -> Void) {
        self.handler = handler
    }
    
    func onStateChange(_ stateJSON: String?) {
        if let json = stateJSON {
            handler(json)
        }
    }
}

class StatsCallbackImpl: NSObject, GardcoreStatsCallbackProtocol {
    private let handler: (String) -> Void
    
    init(handler: @escaping (String) -> Void) {
        self.handler = handler
    }
    
    func onStatsUpdate(_ statsJSON: String?) {
        if let json = statsJSON {
            handler(json)
        }
    }
}

class LogCallbackImpl: NSObject, GardcoreLogCallbackProtocol {
    private let handler: (Int, String) -> Void
    
    init(handler: @escaping (Int, String) -> Void) {
        self.handler = handler
    }
    
    func onLog(_ level: Int, message: String?) {
        if let msg = message {
            handler(level, msg)
        }
    }
}
