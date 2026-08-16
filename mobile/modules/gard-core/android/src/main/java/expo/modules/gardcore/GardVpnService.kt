package expo.modules.gardcore

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Log
import androidx.core.app.NotificationCompat
import gardcore.Gardcore
import org.json.JSONObject
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.concurrent.atomic.AtomicBoolean

/**
 * GardVpnService - Android VPN сервис для GARD VPN
 * 
 * Использует Android VpnService API для создания VPN туннеля
 * и интегрируется с Go библиотекой GardCore через gomobile bind.
 * 
 * Архитектура:
 * 1. Android создаёт TUN интерфейс через VpnService.Builder
 * 2. Пакеты читаются из TUN и передаются в Go через Gardcore.writePacket()
 * 3. Go шифрует пакеты через WireGuard и отправляет на сервер
 * 4. Ответы расшифровываются в Go и возвращаются через Gardcore.readPacket()
 * 5. Пакеты записываются обратно в TUN для приложений
 */
class GardVpnService : VpnService() {
    
    companion object {
        const val TAG = "GardVpnService"
        const val ACTION_CONNECT = "expo.modules.gardcore.CONNECT"
        const val ACTION_DISCONNECT = "expo.modules.gardcore.DISCONNECT"
        const val EXTRA_CONFIG = "config"
        
        private const val NOTIFICATION_CHANNEL_ID = "gard_vpn_channel"
        private const val NOTIFICATION_ID = 1
        
        // VPN параметры
        private const val VPN_MTU = 1420
        private const val VPN_ADDRESS = "10.0.0.2"
        private const val VPN_ADDRESS_PREFIX = 32
        private const val VPN_DNS_PRIMARY = "1.1.1.1"
        private const val VPN_DNS_SECONDARY = "8.8.8.8"
        private const val VPN_ROUTE = "0.0.0.0"
        private const val VPN_ROUTE_PREFIX = 0
        
        // Размер буфера для пакетов
        private const val PACKET_BUFFER_SIZE = 32767
    }
    
    private var vpnInterface: ParcelFileDescriptor? = null
    private val isRunning = AtomicBoolean(false)
    
    // Потоки для обработки пакетов
    private var readThread: Thread? = null
    private var writeThread: Thread? = null
    
    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        Log.i(TAG, "GardVpnService created")
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_CONNECT -> {
                val configJSON = intent.getStringExtra(EXTRA_CONFIG)
                if (configJSON != null) {
                    connect(configJSON)
                } else {
                    Log.e(TAG, "No config provided for connect")
                }
            }
            ACTION_DISCONNECT -> {
                disconnect()
            }
        }
        return START_STICKY
    }
    
    override fun onDestroy() {
        disconnect()
        Log.i(TAG, "GardVpnService destroyed")
        super.onDestroy()
    }
    
    override fun onRevoke() {
        Log.w(TAG, "VPN permission revoked by user")
        disconnect()
        super.onRevoke()
    }
    
    /**
     * Подключение к VPN
     */
    private fun connect(configJSON: String) {
        if (isRunning.get()) {
            Log.w(TAG, "VPN already running")
            return
        }
        
        try {
            Log.i(TAG, "Starting VPN connection...")
            
            // Парсим конфигурацию
            val config = JSONObject(configJSON)
            val address = config.optString("address", VPN_ADDRESS).split("/")[0]
            val dns = config.optString("dns", VPN_DNS_PRIMARY)
            val mtu = config.optInt("mtu", VPN_MTU)
            
            // Создаём VPN интерфейс
            val builder = Builder()
                .setSession("GARD VPN")
                .setMtu(mtu)
                .addAddress(address, VPN_ADDRESS_PREFIX)
                .addRoute(VPN_ROUTE, VPN_ROUTE_PREFIX)
                .setBlocking(true)
            
            // Добавляем DNS серверы
            dns.split(",").forEach { dnsServer ->
                val trimmed = dnsServer.trim()
                if (trimmed.isNotEmpty()) {
                    builder.addDnsServer(trimmed)
                }
            }
            
            // Добавляем резервный DNS
            if (!dns.contains(VPN_DNS_SECONDARY)) {
                builder.addDnsServer(VPN_DNS_SECONDARY)
            }
            
            // Разрешаем приложению обходить VPN для отладки
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                try {
                    // Исключаем само приложение чтобы избежать петли
                    // builder.addDisallowedApplication(packageName)
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to add disallowed application", e)
                }
            }
            
            // Устанавливаем VPN интерфейс
            vpnInterface = builder.establish()
            
            if (vpnInterface == null) {
                Log.e(TAG, "Failed to establish VPN interface")
                return
            }
            
            Log.i(TAG, "VPN interface established: fd=${vpnInterface?.fd}")
            
            // Устанавливаем MTU в Go библиотеке
            Gardcore.setMTU(mtu.toLong())
            
            // Подключаемся через Go библиотеку
            val error = Gardcore.connect(configJSON)
            if (error != null) {
                Log.e(TAG, "GardCore connect error: $error")
                disconnect()
                return
            }
            
            isRunning.set(true)
            
            // Запускаем foreground service с уведомлением
            startForeground(NOTIFICATION_ID, createNotification("Подключено к GARD VPN"))
            
            // Запускаем потоки обработки пакетов
            startPacketProcessing()
            
            Log.i(TAG, "VPN connected successfully")
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to connect VPN", e)
            disconnect()
        }
    }
    
    /**
     * Отключение от VPN
     */
    private fun disconnect() {
        Log.i(TAG, "Disconnecting VPN...")
        
        isRunning.set(false)
        
        // Останавливаем потоки
        stopPacketProcessing()
        
        // Отключаемся через Go библиотеку
        try {
            Gardcore.disconnect()
        } catch (e: Exception) {
            Log.e(TAG, "GardCore disconnect error", e)
        }
        
        // Закрываем VPN интерфейс
        try {
            vpnInterface?.close()
            vpnInterface = null
        } catch (e: Exception) {
            Log.e(TAG, "Failed to close VPN interface", e)
        }
        
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        
        Log.i(TAG, "VPN disconnected")
    }
    
    /**
     * Запуск потоков обработки пакетов
     */
    private fun startPacketProcessing() {
        val fd = vpnInterface?.fileDescriptor ?: return
        
        // Поток чтения из TUN → Go (исходящие пакеты от приложений)
        readThread = Thread({
            val buffer = ByteArray(PACKET_BUFFER_SIZE)
            val inputStream = FileInputStream(fd)
            
            Log.d(TAG, "Read thread started")
            
            try {
                while (isRunning.get()) {
                    val length = inputStream.read(buffer)
                    if (length > 0) {
                        // Копируем только нужную часть буфера
                        val packet = buffer.copyOf(length)
                        
                        // Передаём пакет в Go для шифрования и отправки
                        try {
                            Gardcore.writePacket(packet)
                        } catch (e: Exception) {
                            if (isRunning.get()) {
                                Log.w(TAG, "Failed to write packet to Go: ${e.message}")
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                if (isRunning.get()) {
                    Log.e(TAG, "Read thread error", e)
                }
            } finally {
                Log.d(TAG, "Read thread stopped")
            }
        }, "GardVPN-Read")
        
        // Поток записи из Go → TUN (входящие пакеты из интернета)
        writeThread = Thread({
            val outputStream = FileOutputStream(fd)
            
            Log.d(TAG, "Write thread started")
            
            try {
                while (isRunning.get()) {
                    // Читаем расшифрованный пакет из Go (блокирующий вызов)
                    val packet = Gardcore.readPacketBlocking()
                    
                    if (packet != null && packet.isNotEmpty() && isRunning.get()) {
                        try {
                            outputStream.write(packet)
                        } catch (e: Exception) {
                            if (isRunning.get()) {
                                Log.w(TAG, "Failed to write packet to TUN: ${e.message}")
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                if (isRunning.get()) {
                    Log.e(TAG, "Write thread error", e)
                }
            } finally {
                Log.d(TAG, "Write thread stopped")
            }
        }, "GardVPN-Write")
        
        readThread?.start()
        writeThread?.start()
    }
    
    /**
     * Остановка потоков обработки пакетов
     */
    private fun stopPacketProcessing() {
        readThread?.interrupt()
        writeThread?.interrupt()
        
        try {
            readThread?.join(1000)
            writeThread?.join(1000)
        } catch (e: InterruptedException) {
            Log.w(TAG, "Interrupted while waiting for threads to stop")
        }
        
        readThread = null
        writeThread = null
    }
    
    /**
     * Создание канала уведомлений (Android 8+)
     */
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "GARD VPN",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "VPN connection status"
                setShowBadge(false)
                setSound(null, null)
                enableVibration(false)
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    /**
     * Создание уведомления для foreground service
     */
    private fun createNotification(status: String): Notification {
        // Intent для открытия приложения
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            packageManager.getLaunchIntentForPackage(packageName),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        
        // Intent для отключения
        val disconnectIntent = Intent(this, GardVpnService::class.java).apply {
            action = ACTION_DISCONNECT
        }
        val disconnectPendingIntent = PendingIntent.getService(
            this,
            1,
            disconnectIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        
        return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("GARD VPN")
            .setContentText(status)
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setOngoing(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(pendingIntent)
            .addAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                "Отключить",
                disconnectPendingIntent
            )
            .build()
    }
    
    /**
     * Обновление уведомления со статистикой
     */
    private fun updateNotification(bytesIn: Long, bytesOut: Long) {
        val status = "↓ ${formatBytes(bytesIn)} ↑ ${formatBytes(bytesOut)}"
        val notification = createNotification(status)
        
        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.notify(NOTIFICATION_ID, notification)
    }
    
    /**
     * Форматирование байтов в читаемый формат
     */
    private fun formatBytes(bytes: Long): String {
        return when {
            bytes < 1024 -> "$bytes B"
            bytes < 1024 * 1024 -> "${bytes / 1024} KB"
            bytes < 1024 * 1024 * 1024 -> "${bytes / (1024 * 1024)} MB"
            else -> "${bytes / (1024 * 1024 * 1024)} GB"
        }
    }
}
