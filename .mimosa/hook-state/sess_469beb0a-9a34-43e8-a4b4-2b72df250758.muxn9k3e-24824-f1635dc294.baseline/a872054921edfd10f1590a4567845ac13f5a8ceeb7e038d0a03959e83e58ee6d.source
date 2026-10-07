package com.fitgroup.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Native document export using the Storage Access Framework.
 *
 * "Save" launches {@link Intent#ACTION_CREATE_DOCUMENT} so the user chooses the
 * destination through the system Documents UI (Downloads, Documents, cloud
 * providers, ...). We never resolve a real filesystem path and never request
 * wide storage permissions; content is streamed to the returned
 * {@code content://} URI via {@link ContentResolver}.
 *
 * After writing, the file is re-opened and its byte count is compared with the
 * expected UTF-8 length. A 0-byte or mismatched result rejects the call so the
 * JS layer can never report a fake success.
 */
@CapacitorPlugin(name = "DocumentExport")
public class DocumentExportPlugin extends Plugin {

    @PluginMethod
    public void saveTextDocument(PluginCall call) {
        String filename = call.getString("filename");
        String mimeType = call.getString("mimeType", "text/plain");
        String content = call.getString("content");

        if (filename == null || filename.trim().isEmpty()) {
            call.reject("filename is required");
            return;
        }
        if (mimeType == null || mimeType.trim().isEmpty()) {
            mimeType = "text/plain";
        }
        try {
            ExportContentValidator.requireNonEmpty(content);
        } catch (IllegalArgumentException ex) {
            call.reject(ex.getMessage());
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename);

        startActivityForResult(call, intent, "saveTextDocumentResult");
    }

    @ActivityCallback
    private void saveTextDocumentResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        if (result.getResultCode() != Activity.RESULT_OK) {
            JSObject cancelled = new JSObject();
            cancelled.put("status", "cancelled");
            call.resolve(cancelled);
            return;
        }

        Intent data = result.getData();
        Uri uri = data != null ? data.getData() : null;
        if (uri == null) {
            call.reject("未获取到保存位置");
            return;
        }

        String content = call.getString("content");
        String filename = call.getString("filename");
        String mimeType = call.getString("mimeType", "text/plain");

        try {
            writeToUri(uri, content);
            int bytesWritten = verifyBytes(uri, content);
            JSObject saved = new JSObject();
            saved.put("status", "saved");
            saved.put("uri", uri.toString());
            saved.put("filename", resolveDisplayName(uri, filename));
            saved.put("mimeType", mimeType);
            saved.put("bytesWritten", bytesWritten);
            call.resolve(saved);
        } catch (Exception ex) {
            String message = ex.getLocalizedMessage() != null ? ex.getLocalizedMessage() : ex.getClass().getSimpleName();
            call.reject("保存失败：" + message);
        }
    }

    private void writeToUri(Uri uri, String content) throws Exception {
        if (content == null) {
            throw new IllegalArgumentException("content is required");
        }
        ContentResolver resolver = getContext().getContentResolver();
        OutputStream out = resolver.openOutputStream(uri, "w");
        if (out == null) {
            throw new IllegalStateException("无法打开输出流");
        }
        try {
            out.write(content.getBytes(StandardCharsets.UTF_8));
            out.flush();
        } finally {
            out.close();
        }
    }

    /** Re-open the document and verify the written byte count. */
    private int verifyBytes(Uri uri, String content) throws Exception {
        int actual = countBytes(uri);
        return ExportContentValidator.verifyWrittenBytes(content, actual);
    }

    private int countBytes(Uri uri) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        InputStream in = resolver.openInputStream(uri);
        if (in == null) {
            return 0;
        }
        try {
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = in.read(buffer)) > 0) {
                total += read;
            }
            return total;
        } finally {
            in.close();
        }
    }

    private String resolveDisplayName(Uri uri, String fallback) {
        Cursor cursor = null;
        try {
            cursor = getContext()
                .getContentResolver()
                .query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null);
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0 && !cursor.isNull(index)) {
                    return cursor.getString(index);
                }
            }
        } catch (Exception ignored) {
            // Fall back to the requested filename.
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
        return fallback;
    }
}
