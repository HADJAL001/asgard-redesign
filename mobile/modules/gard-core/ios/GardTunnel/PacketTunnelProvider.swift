import NetworkExtension
import GardCore

/**
 * PacketTunnelProvider - iOS Network Extension для GARD VPN
 *
 * Реализует NEPacketTunnelProvider для обработки VPN трафика.
 * Интегрируется с Go библиотекой GardCore через gomobile bind.
 *
 * Архитектура:
 * 1. iOS создаёт packet tunnel через NEPacketTunnelProvider
 * 2. Пакеты читаются из packetFlow и передаются в Go через GardcoreWritePacket()
 * 3. Go шифрует пакеты через WireGuard и отправляет на сервер
 * 4. Ответы расшифровываются в Go и возвращаются через GardcoreReadPacketBlocking()
 * 5. Пакеты записываются обратно в packetFlow для приложений
 */
class PacketTunnelProvider: NEPacketTunnelProvider {
    
    // MARK: - Properties
    
    private var isRunning = false
    private let packetQueue = DispatchQueue(label: "com.gardvpn.tunnel.packets", qos: .userInitiated)
    private let writeQueue = DispatchQueue(label: "com.gardvpn.tunnel.write", qos: .userInitiated)
    
    // MARK: - Lifecycle
    
    override func startTunnel(options: [String : NSObject]?, completionHandler: @escaping (Error?) -> Void) {
        NSLog("GardTunnel: Starting tunnel...")
        
        // Получаем конфигурацию
        guard let configJSON = options?["config"] as? String ?? 
              (protocolConfiguration as? NETunnelProviderProtocol)?.providerConfiguration?["config"] as? String else {
            NSLog("GardTunnel: No config provided")
            completionHandler(TunnelError.noConfiguration)
            return
        }
        
        // Парсим конфигурацию
        guard let configData = configJSON.data(using: .utf8),
              let config = try? JSONSerialization.jsonObject(with: configData) as? [String: Any] else {
            NSLog("GardTunnel: Invalid config JSON")
            completionHandler(TunnelError.invalidConfiguration)
            return
        }
        
        // Настраиваем туннель
        let tunnelSettings = createTunnelSettings(from: config)
        
        setTunnelNetworkSettings(tunnelSettings) { [weak self] error in
            if let error = error {
                NSLog("GardTunnel: Failed to set tunnel settings: \(error)")
                completionHandler(error)
                return
            }
            
            NSLog("GardTunnel: Tunnel settings applied")
            
            // Устанавливаем MTU
            let mtu = config["mtu"] as? Int ?? 1420
            GardcoreSetMTU(Int(mtu))
            
            // Подключаемся через Go библиотеку
            do {
                try GardcoreConnect(configJSON)
                self?.isRunning = true
                self?.startPacketProcessing()
                NSLog("GardTunnel: Connected successfully")
                completionHandler(nil)
            } catch {
                NSLog("GardTunnel: GardCore connect error: \(error)")
                completionHandler(error)
            }
        }
    }
    
    override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
        NSLog("GardTunnel: Stopping tunnel, reason: \(reason.rawValue)")
        
        isRunning = false
        
        do {
            try GardcoreDisconnect()
        } catch {
            NSLog("GardTunnel: GardCore disconnect error: \(error)")
        }
        
        completionHandler()
    }
    
    override func handleAppMessage(_ messageData: Data, completionHandler: ((Data?) -> Void)?) {
        guard let message = String(data: messageData, encoding: .utf8) else {
            completionHandler?(nil)
            return
        }
        
        NSLog("GardTunnel: Received app message: \(message)")
        
        switch message {
        case "getState":
            let state = GardcoreGetState()
            completionHandler?(state.data(using: .utf8))
            
        case "getStats":
            let stats = GardcoreGetStats()
            completionHandler?(stats.data(using: .utf8))
            
        case "getTunnelStats":
            var bytesIn: Int64 = 0
            var bytesOut: Int64 = 0
            var packetsIn: Int64 = 0
            var packetsOut: Int64 = 0
            GardcoreGetTunnelStats(&bytesIn, &bytesOut, &packetsIn, &packetsOut)
            
            let stats: [String: Any] = [
                "bytesIn": bytesIn,
                "bytesOut": bytesOut,
                "packetsIn": packetsIn,
                "packetsOut": packetsOut
            ]
            
            if let jsonData = try? JSONSerialization.data(withJSONObject: stats) {
                completionHandler?(jsonData)
            } else {
                completionHandler?(nil)
            }
            
        default:
            completionHandler?(nil)
        }
    }
    
    override func sleep(completionHandler: @escaping () -> Void) {
        NSLog("GardTunnel: Going to sleep")
        completionHandler()
    }
    
    override func wake() {
        NSLog("GardTunnel: Waking up")
    }
    
    // MARK: - Tunnel Settings
    
    private func createTunnelSettings(from config: [String: Any]) -> NEPacketTunnelNetworkSettings {
        let serverAddress = config["serverHost"] as? String ?? "0.0.0.0"
        let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: serverAddress)
        
        // IPv4 настройки
        let address = config["address"] as? String ?? "10.0.0.2/32"
        let addressParts = address.split(separator: "/")
        let ipAddress = String(addressParts[0])
        let subnetMask = "255.255.255.255"
        
        let ipv4Settings = NEIPv4Settings(addresses: [ipAddress], subnetMasks: [subnetMask])
        ipv4Settings.includedRoutes = [NEIPv4Route.default()]
        settings.ipv4Settings = ipv4Settings
        
        // DNS настройки
        let dns = config["dns"] as? String ?? "1.1.1.1"
        var dnsServers = dns.split(separator: ",").map { String($0).trimmingCharacters(in: .whitespaces) }
        
        // Добавляем резервный DNS
        if !dnsServers.contains("8.8.8.8") {
            dnsServers.append("8.8.8.8")
        }
        
        let dnsSettings = NEDNSSettings(servers: dnsServers)
        settings.dnsSettings = dnsSettings
        
        // MTU
        let mtu = config["mtu"] as? Int ?? 1420
        settings.mtu = NSNumber(value: mtu)
        
        return settings
    }
    
    // MARK: - Packet Processing
    
    private func startPacketProcessing() {
        // Поток чтения из packetFlow → Go (исходящие пакеты от приложений)
        startReadingPackets()
        
        // Поток записи из Go → packetFlow (входящие пакеты из интернета)
        startWritingPackets()
    }
    
    /// Читает пакеты из packetFlow и передаёт в Go для шифрования
    private func startReadingPackets() {
        packetFlow.readPackets { [weak self] packets, protocols in
            guard let self = self, self.isRunning else { return }
            
            for (index, packet) in packets.enumerated() {
                // Передаём пакет в Go для шифрования и отправки
                do {
                    try GardcoreWritePacket(packet)
                } catch {
                    NSLog("GardTunnel: Failed to write packet to Go: \(error)")
                }
                
                _ = protocols[index] // Сохраняем протокол для будущего использования
            }
            
            // Продолжаем читать пакеты
            self.startReadingPackets()
        }
    }
    
    /// Читает пакеты из Go и записывает в packetFlow
    private func startWritingPackets() {
        writeQueue.async { [weak self] in
            while self?.isRunning == true {
                // Читаем расшифрованный пакет из Go (блокирующий вызов)
                guard let packet = GardcoreReadPacketBlocking() else {
                    // Если nil - туннель закрыт
                    if self?.isRunning == true {
                        // Небольшая пауза чтобы не грузить CPU
                        Thread.sleep(forTimeInterval: 0.001)
                    }
                    continue
                }
                
                if !packet.isEmpty {
                    // Определяем версию IP протокола
                    let ipVersion = self?.getIPVersion(from: packet) ?? AF_INET
                    
                    // Записываем пакет в packetFlow
                    self?.packetFlow.writePackets([packet], withProtocols: [NSNumber(value: ipVersion)])
                }
            }
            
            NSLog("GardTunnel: Write loop stopped")
        }
    }
    
    /// Определяет версию IP протокола из пакета
    private func getIPVersion(from packet: Data) -> Int32 {
        guard let firstByte = packet.first else {
            return AF_INET
        }
        
        let version = (firstByte >> 4) & 0x0F
        
        switch version {
        case 4:
            return AF_INET
        case 6:
            return AF_INET6
        default:
            return AF_INET
        }
    }
}

// MARK: - Error Types

extension PacketTunnelProvider {
    enum TunnelError: Error, LocalizedError {
        case noConfiguration
        case invalidConfiguration
        case connectionFailed(String)
        
        var errorDescription: String? {
            switch self {
            case .noConfiguration:
                return "No VPN configuration provided"
            case .invalidConfiguration:
                return "Invalid VPN configuration"
            case .connectionFailed(let reason):
                return "Connection failed: \(reason)"
            }
        }
    }
}
