package com.agc.permits;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final int PICK = 1, PERM = 2;
    private WebView web;
    private ValueCallback<Uri[]> pending;
    private Uri cameraUri;
    private boolean askedPerm = false;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.parseColor("#1f3a34"));
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        final String home = getString(R.string.app_url);
        final String host = Uri.parse(home).getHost();
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (host != null && host.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { }
                return true;
            }
            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) {
                    v.loadDataWithBaseURL(null, "<html><body style='font-family:sans-serif;padding:40px 20px;text-align:center;color:#1c2321'>"
                        + "<h2>No connection</h2><p>Check your internet connection, then try again.</p>"
                        + "<a href='" + home + "' style='display:inline-block;padding:14px 22px;background:#1f3a34;color:#fff;border-radius:10px;text-decoration:none'>Try again</a>"
                        + "</body></html>", "text/html", "utf-8", null);
                }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (pending != null) pending.onReceiveValue(null);
                pending = cb;
                openChooser();
                return true;
            }
        });
        if (state != null) web.restoreState(state); else web.loadUrl(home);
    }

    private void openChooser() {
        if (Build.VERSION.SDK_INT < 29 && !askedPerm
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            askedPerm = true;
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, PERM);
            return;
        }
        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        pick.setType("image/*");
        Intent chooser = Intent.createChooser(pick, "Permit photo");
        cameraUri = null;
        try {
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.Images.Media.DISPLAY_NAME, "permit_" + System.currentTimeMillis() + ".jpg");
            cv.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
            cameraUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
            if (cameraUri != null) {
                Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cam});
            }
        } catch (Exception e) { cameraUri = null; }
        try { startActivityForResult(chooser, PICK); } catch (Exception e) { finishPick(null); }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        if (code == PERM && pending != null) openChooser();
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        if (code != PICK) { super.onActivityResult(code, result, data); return; }
        Uri picked = null;
        if (result == RESULT_OK) {
            picked = (data != null && data.getData() != null) ? data.getData() : cameraUri;
            if (picked != null && picked.equals(data != null ? data.getData() : null) && cameraUri != null) {
                try { getContentResolver().delete(cameraUri, null, null); } catch (Exception e) { }
            }
        } else if (cameraUri != null) {
            try { getContentResolver().delete(cameraUri, null, null); } catch (Exception e) { }
        }
        finishPick(picked);
    }

    private void finishPick(Uri u) {
        if (pending != null) pending.onReceiveValue(u == null ? null : new Uri[]{u});
        pending = null;
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
}
