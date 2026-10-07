package com.fitgroup.app;

import java.nio.charset.StandardCharsets;

/**
 * Pure, Android-independent helpers for validating export content before it is
 * written to a user-chosen document. Kept separate from the Capacitor plugin so
 * it can be covered by host-side JUnit tests.
 */
public final class ExportContentValidator {

    private ExportContentValidator() {}

    /** UTF-8 byte length of the content. */
    public static int byteLength(String content) {
        if (content == null) return 0;
        return content.getBytes(StandardCharsets.UTF_8).length;
    }

    /**
     * Ensure the export content is present and non-empty.
     *
     * @throws IllegalArgumentException when content is null or empty.
     */
    public static void requireNonEmpty(String content) {
        if (content == null) {
            throw new IllegalArgumentException("content is required");
        }
        if (content.isEmpty()) {
            throw new IllegalArgumentException("content must not be empty");
        }
        if (byteLength(content) == 0) {
            throw new IllegalArgumentException("content must not be empty");
        }
    }

    /**
     * Verify that the number of bytes actually written matches the expected
     * UTF-8 byte length for the given content.
     *
     * @return the verified byte count (always &gt; 0)
     * @throws IllegalStateException when the written size is empty or mismatched.
     */
    public static int verifyWrittenBytes(String content, int actualBytes) {
        int expected = byteLength(content);
        if (actualBytes <= 0) {
            throw new IllegalStateException("write produced an empty file");
        }
        if (actualBytes != expected) {
            throw new IllegalStateException(
                "written byte count mismatch (expected " + expected + ", actual " + actualBytes + ")"
            );
        }
        return actualBytes;
    }
}
