package expo.modules.gardcore

import android.content.Context
import android.content.Intent
import android.net.VpnService
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import gardcore.Gardcore
import gardcore.LogCallback
import gardcore.StateCallback
import gardcore.StatsCallback

class GardCoreModule : Module() {
    
    private val context: Context
        get() = requireNotNull(appContext.reactContext)
    
    override fun definition() = ModuleDefinition {
        Name("GardCoreModule")
        
        // События
        Events("onStateChange", "onStatsUpdate", "onLog")
        
        // Константы
        Constants(
            "version" to Gardcore.getVersion()
        )
        
        // Инициализация при загрузке модуля
        OnCreate {
            setupCallbacks()
        }
        
        // Подключение к VPN
        AsyncFunction("connect") { configJSON: String, promise: Promise ->
            try {
                // Проверяем разрешение VPN
                val intent = VpnService.prepare(context)
                if (intent != null) {
                    // Нужно запросить разрешение
                    promise.reject("VPN_PERMISSION_REQUIRED", "VPN permission required", null)
                    return@AsyncFunction
                }
                
                // Запускаем VPN сервис
                val serviceIntent = Intent(context, GardVpnService::class.java).apply {
                    action = GardVpnService.ACTION_CONNECT
                    putExtra(GardVpnService.EXTRA_CONFIG, configJSON)
                }
                context.startService(serviceIntent)
                
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("CONNECT_ERROR", e.message, e)
            }
        }
        
        // Отключение от VPN
        AsyncFunction("disconnect") { promise: Promise ->
            try {
                val serviceIntent = Intent(context, GardVpnService::class.java).apply {
                    action = GardVpnService.ACTION_DISCONNECT
                }
                context.startService(serviceIntent)
                
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("DISCONNECT_ERROR", e.message, e)
            }
        }
        
        // Получить состояние
        AsyncFunction("getState") { promise: Promise ->
            try {
                val state = Gardcore.getState()
                promise.resolve(state)
            } catch (e: Exception) {
                promise.reject("GET_STATE_ERROR", e.message, e)
            }
        }
        
        // Получить статистику
        AsyncFunction("getStats") { promise: Promise ->
            try {
                val stats = Gardcore.getStats()
                promise.resolve(stats)
            } catch (e: Exception) {
                promise.reject("GET_STATS_ERROR", e.message, e)
            }
        }
        
        // Проверить подключение
        AsyncFunction("isConnected") { promise: Promise ->
            try {
                val connected = Gardcore.isConnected()
                promise.resolve(connected)
            } catch (e: Exception) {
                promise.reject("IS_CONNECTED_ERROR", e.message, e)
            }
        }
        
        // Получить версию
        Function("getVersion") {
            Gardcore.getVersion()
        }
        
        // Запросить разрешение VPN
        AsyncFunction("requestVpnPermission") { promise: Promise ->
            try {
                val intent = VpnService.prepare(context)
                if (intent != null) {
                    // Нужно запустить Activity для запроса разрешения
                    // В реальном приложении это делается через ActivityResultLauncher
                    promise.resolve(false)
                } else {
                    promise.resolve(true)
                }
            } catch (e: Exception) {
                promise.reject("PERMISSION_ERROR", e.message, e)
            }
        }
        
        // Проверить разрешение VPN
        AsyncFunction("hasVpnPermission") { promise: Promise ->
            try {
                val intent = VpnService.prepare(context)
                promise.resolve(intent == null)
            } catch (e: Exception) {
                promise.reject("PERMISSION_CHECK_ERROR", e.message, e)
            }
        }
    }
    
    private fun setupCallbacks() {
        // Callback для изменения состояния
        Gardcore.setStateCallback(object : StateCallback {
            override fun onStateChange(stateJSON: String) {
                sendEvent("onStateChange", mapOf("state" to stateJSON))
            }
        })
        
        // Callback для статистики
        Gardcore.setStatsCallback(object : StatsCallback {
            override fun onStatsUpdate(statsJSON: String) {
                sendEvent("onStatsUpdate", mapOf("stats" to statsJSON))
            }
        })
        
        // Callback для логов
        Gardcore.setLogCallback(object : LogCallback {
            override fun onLog(level: Long, message: String) {
                sendEvent("onLog", mapOf(
                    "level" to level.toInt(),
                    "message" to message
                ))
            }
        })
    }
}
