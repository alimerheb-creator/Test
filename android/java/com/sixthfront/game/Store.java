package com.sixthfront.game;

import android.webkit.JavascriptInterface;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.Charset;

/**
 * window.SixthFrontStore in the game: a small key/value store in files on the phone. The game keeps its mod
 * list here as well as in the WebView's localStorage, because the WebView may wait a while before it writes
 * localStorage to disk, and a change made just before the app is closed could otherwise be lost.
 * Each value is written to a temporary file, synced, then renamed over the old one, so it is never half-written.
 */
public class Store {
    private static final Charset UTF8 = Charset.forName("UTF-8");
    private final File dir;

    public Store(File dir) {
        this.dir = dir;
        dir.mkdirs();
    }

    private File file(String key) {
        String name = key == null ? "_" : key.replaceAll("[^A-Za-z0-9._-]", "_");
        if (name.length() > 120) name = name.substring(0, 120);
        return new File(dir, name);
    }

    @JavascriptInterface
    public synchronized String get(String key) {
        File f = file(key);
        if (!f.isFile()) return null;
        InputStream in = null;
        try {
            in = new FileInputStream(f);
            ByteArrayOutputStream out = new ByteArrayOutputStream((int) Math.max(16, f.length()));
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return new String(out.toByteArray(), UTF8);
        } catch (IOException e) {
            return null;
        } finally {
            if (in != null) try { in.close(); } catch (IOException ignored) { }
        }
    }

    @JavascriptInterface
    public synchronized boolean put(String key, String value) {
        if (value == null) { remove(key); return true; }
        File f = file(key), tmp = new File(dir, f.getName() + ".tmp");
        FileOutputStream out = null;
        try {
            out = new FileOutputStream(tmp);
            out.write(value.getBytes(UTF8));
            out.flush();
            out.getFD().sync();
            out.close();
            out = null;
            return tmp.renameTo(f) || (f.delete() && tmp.renameTo(f));
        } catch (IOException e) {
            return false;
        } finally {
            if (out != null) try { out.close(); } catch (IOException ignored) { }
        }
    }

    @JavascriptInterface
    public synchronized void remove(String key) {
        file(key).delete();
    }
}
