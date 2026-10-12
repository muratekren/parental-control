# Keep Gson model classes (reflection-based) when minify is enabled later.
-keep class com.family.control.Models$** { *; }
-keep class com.family.control.Models { *; }
-dontwarn okhttp3.**
-dontwarn okio.**