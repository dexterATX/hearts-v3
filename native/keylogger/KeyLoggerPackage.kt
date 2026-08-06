package love.scotty.hearts.keylogger

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * Registers the KeyLogger native module with React Native. Manually wired
 * into MainApplication (autolinking cannot discover hand-written modules in
 * a CNG-generated android/ dir). Under the New Architecture interop this
 * package's modules resolve from JS via NativeModules.KeyLogger.
 */
class KeyLoggerPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(KeyLoggerModule(reactContext))

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}
