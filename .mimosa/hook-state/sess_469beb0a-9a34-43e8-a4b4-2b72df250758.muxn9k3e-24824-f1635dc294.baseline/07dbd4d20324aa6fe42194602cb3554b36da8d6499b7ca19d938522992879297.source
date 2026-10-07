package com.fitgroup.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import org.junit.Test;

public class ExportContentValidatorTest {

    @Test
    public void byteLength_countsUtf8Bytes() {
        assertEquals(1, ExportContentValidator.byteLength("a"));
        // Chinese characters are 3 bytes each in UTF-8.
        assertEquals(6, ExportContentValidator.byteLength("中文"));
    }

    @Test
    public void requireNonEmpty_rejectsEmptyAndNull() {
        assertThrows(IllegalArgumentException.class, () -> ExportContentValidator.requireNonEmpty(null));
        assertThrows(IllegalArgumentException.class, () -> ExportContentValidator.requireNonEmpty(""));
    }

    @Test
    public void requireNonEmpty_acceptsJsonContent() {
        ExportContentValidator.requireNonEmpty("{\"ok\":true}");
    }

    @Test
    public void verifyWrittenBytes_rejectsZeroBytes() {
        assertThrows(IllegalStateException.class, () -> ExportContentValidator.verifyWrittenBytes("hello", 0));
    }

    @Test
    public void verifyWrittenBytes_rejectsMismatch() {
        assertThrows(IllegalStateException.class, () -> ExportContentValidator.verifyWrittenBytes("hello", 3));
    }

    @Test
    public void verifyWrittenBytes_acceptsExactMatch() {
        assertEquals(5, ExportContentValidator.verifyWrittenBytes("hello", 5));
        assertEquals(6, ExportContentValidator.verifyWrittenBytes("中文", 6));
    }
}
