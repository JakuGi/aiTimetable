# methods the web page calls through window.RozvrhAndroid
-keepclassmembers class com.jakugi.rozvrh.AppBridge {
    @android.webkit.JavascriptInterface <methods>;
}
