package com.sixthfront.game;

import android.app.Activity;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;

/**
 * Hosts the game in a full-screen WebView. The web build ships inside the APK (assets/www)
 * and is served from a virtual https origin, so everything runs offline with the same
 * behaviour as the browser version (ES features, localStorage, WebGL 2, WebAudio).
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/index.html";

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        Window window = getWindow();
        window.setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        window.addFlags(WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);
        useDisplayCutout(window);

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(13, 16, 18));
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);

        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                return serveAsset(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Stay inside the bundled game
                return url == null || !url.startsWith("https://" + HOST + "/");
            }
        });

        setContentView(web);
        hideSystemUi();
        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(START_URL);
        }
    }

    private WebResourceResponse serveAsset(String url) {
        Uri uri = Uri.parse(url);
        if (!HOST.equals(uri.getHost())) return null;
        String path = uri.getPath();
        if (path == null || path.isEmpty() || "/".equals(path)) path = "/index.html";
        String mime = mimeType(path);
        try {
            InputStream in = getAssets().open("www" + path);
            HashMap<String, String> headers = new HashMap<String, String>();
            headers.put("Cache-Control", "no-cache");
            headers.put("Access-Control-Allow-Origin", "*");
            return new WebResourceResponse(mime, mime.startsWith("text/") || mime.endsWith("javascript") ? "UTF-8" : null,
                    200, "OK", headers, in);
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                    new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
        }
    }

    private static String mimeType(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    // Draw behind camera notches in landscape (API 28+), set reflectively to build against older SDKs
    private static void useDisplayCutout(Window window) {
        if (Build.VERSION.SDK_INT < 28) return;
        try {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.getClass().getField("layoutInDisplayCutoutMode").setInt(lp, 1);
            window.setAttributes(lp);
        } catch (Exception ignored) {
            // older platform without cutout support
        }
    }

    private void js(String code) {
        if (web != null) web.evaluateJavascript(code, null);
    }

    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        // Back pauses/resumes the match; from the main menu it leaves the app
        web.evaluateJavascript("(window.__game && window.__game.onBack) ? window.__game.onBack() : 'exit'",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        if (value == null || value.contains("exit")) finish();
                    }
                });
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    protected void onPause() {
        js("window.__game && window.__game.onAppPause && window.__game.onAppPause()");
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        js("window.__game && window.__game.onAppResume && window.__game.onAppResume()");
        hideSystemUi();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
