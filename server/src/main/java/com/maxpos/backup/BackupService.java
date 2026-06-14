package com.maxpos.backup;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Whole-database backup / restore for the admin Settings screen.
 *
 * <p>Deliberately <em>generic and schema-driven</em> rather than mapping each
 * of the ~20 entities by hand: it reads the live table/column/foreign-key
 * metadata from {@code information_schema}, so a future migration that adds a
 * table or column is covered automatically with no code change here.
 *
 * <p><strong>Export</strong> dumps every base table (except Flyway's history)
 * to JSON. Every value is captured as its text form ({@code ResultSet.getString})
 * which round-trips losslessly back through PostgreSQL's input casts — uuids,
 * numerics (exact), timestamptz (with offset), dates and booleans all survive.
 *
 * <p><strong>Restore</strong> is a full replace: it refuses a backup whose
 * schema version differs from this database (restoring across schema shapes is
 * unsafe), then in a single transaction {@code TRUNCATE ... CASCADE}s every
 * table and re-inserts the rows parents-first (topological order) with
 * {@code ?::<type>} casts. Self-referencing columns (e.g.
 * {@code account_movements.transfer_pair_id}) are inserted NULL first and patched
 * with a follow-up UPDATE so a row can reference another row in the same table
 * regardless of insert order. Any failure rolls the whole thing back, leaving
 * the existing data untouched.
 */
@Service
public class BackupService {

    /** Marker so the importer can reject arbitrary JSON files. */
    static final String FORMAT = "maxpos-backup";
    /** Backup envelope version — bump if the file structure changes. */
    static final int FILE_VERSION = 1;

    /** How many daily auto-backups to keep on disk before pruning oldest. */
    private static final int RETENTION = 14;
    /** Naming for scheduled backups; the date makes "already done today" a
     *  filename check and keeps the list chronologically sortable. */
    private static final Pattern AUTO_FILE =
            Pattern.compile("maxpos-auto-\\d{4}-\\d{2}-\\d{2}\\.json");

    private final JdbcTemplate jdbc;
    private final Path backupDir;
    // Self-contained mapper: backup (de)serialization is plain maps/strings and
    // needs no app-specific Jackson config, and this app doesn't expose an
    // ObjectMapper bean to inject (so constructor-injecting one fails startup).
    private final ObjectMapper mapper = new ObjectMapper();

    public BackupService(JdbcTemplate jdbc,
                         @Value("${maxpos.backup.dir:backups}") String backupDir) {
        this.jdbc = jdbc;
        this.backupDir = Paths.get(backupDir);
    }

    // ─────────────────────────────── export ────────────────────────────────

    /**
     * Serialize every table to a single JSON document. Read-only transaction so
     * the dump is a consistent snapshot even while the till is being used.
     */
    @Transactional(readOnly = true)
    public String exportAll() {
        List<String> tables = orderedTables();
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("format", FORMAT);
        root.put("version", FILE_VERSION);
        root.put("schemaVersion", currentSchemaVersion());
        root.put("exportedAt", Instant.now().toString());

        Map<String, List<Map<String, String>>> data = new LinkedHashMap<>();
        for (String table : tables) {
            data.put(table, dumpTable(table));
        }
        root.put("tables", data);

        try {
            return mapper.writeValueAsString(root);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to serialize backup", e);
        }
    }

    // ───────────────────────── scheduled on-disk backups ──────────────────

    /** One file in the backup directory. */
    public record BackupFileInfo(String name, long size, String modifiedAt) {}

    /**
     * Write today's backup to the backup directory if it isn't there yet, then
     * prune to the retention limit. Invoked by {@link BackupScheduler} once an
     * hour; the date-stamped filename makes "already backed up today" a cheap
     * existence check, so a server restart mid-day doesn't double up.
     * Read-only transaction so {@link #exportAll} runs against a snapshot.
     */
    @Transactional(readOnly = true)
    public void runAutoBackupIfDue() {
        String name = "maxpos-auto-" + LocalDate.now(ZoneOffset.UTC) + ".json";
        try {
            Files.createDirectories(backupDir);
            Path target = backupDir.resolve(name);
            if (Files.exists(target)) return; // already done today
            Files.writeString(target, exportAll(), StandardCharsets.UTF_8);
            prune();
        } catch (IOException e) {
            throw new IllegalStateException("Auto-backup failed: " + e.getMessage(), e);
        }
    }

    /** Saved auto-backups, newest first. */
    public List<BackupFileInfo> listAutoBackups() {
        if (!Files.isDirectory(backupDir)) return List.of();
        try (Stream<Path> stream = Files.list(backupDir)) {
            return stream
                    .filter(p -> AUTO_FILE.matcher(p.getFileName().toString()).matches())
                    .sorted(Comparator.comparing((Path p) -> p.getFileName().toString()).reversed())
                    .map(this::toInfo)
                    .toList();
        } catch (IOException e) {
            return List.of();
        }
    }

    /** Contents of one saved auto-backup; name is validated to block traversal. */
    public String readAutoBackup(String name) {
        if (!AUTO_FILE.matcher(name).matches()) {
            throw new ConflictException("Invalid backup file name.");
        }
        Path p = backupDir.resolve(name);
        if (!Files.exists(p)) throw new NotFoundException("Backup file not found.");
        try {
            return Files.readString(p, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Could not read backup: " + e.getMessage(), e);
        }
    }

    private BackupFileInfo toInfo(Path p) {
        try {
            return new BackupFileInfo(p.getFileName().toString(), Files.size(p),
                    Files.getLastModifiedTime(p).toInstant().toString());
        } catch (IOException e) {
            return new BackupFileInfo(p.getFileName().toString(), 0, null);
        }
    }

    /** Delete the oldest files beyond {@link #RETENTION}. */
    private void prune() throws IOException {
        if (!Files.isDirectory(backupDir)) return;
        try (Stream<Path> stream = Files.list(backupDir)) {
            List<Path> files = stream
                    .filter(p -> AUTO_FILE.matcher(p.getFileName().toString()).matches())
                    .sorted(Comparator.comparing((Path p) -> p.getFileName().toString()).reversed())
                    .toList();
            for (int i = RETENTION; i < files.size(); i++) {
                Files.deleteIfExists(files.get(i));
            }
        }
    }

    /** All columns of one table as text (null preserved), column order kept. */
    private List<Map<String, String>> dumpTable(String table) {
        return jdbc.query("SELECT * FROM " + quote(table), (rs, n) -> {
            var md = rs.getMetaData();
            Map<String, String> row = new LinkedHashMap<>();
            for (int i = 1; i <= md.getColumnCount(); i++) {
                // getString renders every PG type as a literal that its own
                // input cast accepts on the way back in — no per-type handling.
                row.put(md.getColumnLabel(i), rs.getString(i));
            }
            return row;
        });
    }

    // ─────────────────────────────── restore ───────────────────────────────

    /** Result surfaced to the admin after a restore. */
    public record RestoreSummary(String message, int tables, int rows) {}

    /**
     * Replace all data with the contents of a backup file. Single transaction:
     * either the whole database is swapped or nothing changes.
     */
    @Transactional
    public RestoreSummary restoreAll(String json) {
        JsonNode root = parse(json);
        if (!FORMAT.equals(root.path("format").asText(null))) {
            throw new ConflictException("This file isn't a MaxPOS backup.");
        }

        String backupSchema = root.path("schemaVersion").asText(null);
        String current = currentSchemaVersion();
        if (current != null && backupSchema != null && !current.equals(backupSchema)) {
            throw new ConflictException(
                    "Backup is from schema version " + backupSchema +
                    " but this database is on version " + current +
                    ". Restore aborted to avoid corrupting data.");
        }

        JsonNode tablesNode = root.path("tables");
        if (!tablesNode.isObject()) {
            throw new ConflictException("Backup file is missing its table data.");
        }

        List<String> order = orderedTables(); // parents-first

        // Wipe everything in one shot — CASCADE + the full table list handles
        // FK order and the lone self-reference without needing a delete order.
        String truncate = "TRUNCATE TABLE " +
                String.join(", ", order.stream().map(this::quote).toList()) + " CASCADE";
        jdbc.execute(truncate);

        // Re-insert parents-first.
        int totalRows = 0;
        for (String table : order) {
            JsonNode rows = tablesNode.get(table);
            if (rows != null && rows.isArray()) {
                totalRows += insertRows(table, rows);
            }
        }
        return new RestoreSummary("Database restored.", order.size(), totalRows);
    }

    /** Insert all rows for one table, deferring any self-referencing FK column. */
    private int insertRows(String table, JsonNode rows) {
        if (rows.isEmpty()) return 0;
        Map<String, String> types = columnTypes(table);
        Set<String> selfRefs = selfRefColumns(table);
        List<DeferredSelfRef> deferred = new ArrayList<>();
        int count = 0;

        for (JsonNode row : rows) {
            List<String> cols = new ArrayList<>();
            for (Iterator<String> it = row.fieldNames(); it.hasNext(); ) {
                String c = it.next();
                if (types.containsKey(c)) cols.add(c); // ignore unknown columns
            }
            if (cols.isEmpty()) continue;

            StringBuilder sql = new StringBuilder("INSERT INTO ").append(quote(table)).append(" (");
            StringBuilder values = new StringBuilder();
            List<String> binds = new ArrayList<>(cols.size());
            for (int i = 0; i < cols.size(); i++) {
                String c = cols.get(i);
                if (i > 0) { sql.append(", "); values.append(", "); }
                sql.append(quote(c));
                values.append("?::").append(types.get(c));
                JsonNode v = row.get(c);
                // Self-referencing FK → insert NULL now, patch after the table
                // is fully loaded (the target row may not exist yet).
                binds.add(selfRefs.contains(c) || v == null || v.isNull() ? null : v.asText());
            }
            sql.append(") VALUES (").append(values).append(')');
            jdbc.update(sql.toString(), binds.toArray());

            if (!selfRefs.isEmpty()) {
                String id = textOrNull(row.get("id"));
                for (String sc : selfRefs) {
                    String val = textOrNull(row.get(sc));
                    if (val != null && id != null) {
                        deferred.add(new DeferredSelfRef(sc, val, id));
                    }
                }
            }
            count++;
        }

        // Second pass: wire up the self-references now that every row exists.
        for (DeferredSelfRef d : deferred) {
            jdbc.update(
                    "UPDATE " + quote(table) + " SET " + quote(d.column()) + " = ?::" + types.get(d.column()) +
                    " WHERE id = ?::" + types.get("id"),
                    d.value(), d.id());
        }
        return count;
    }

    private record DeferredSelfRef(String column, String value, String id) {}

    // ─────────────────────────────── metadata ──────────────────────────────

    /** Base tables in dependency order (parents before children), excluding
     *  Flyway's own bookkeeping table. */
    private List<String> orderedTables() {
        List<String> tables = jdbc.queryForList(
                "SELECT table_name FROM information_schema.tables " +
                "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' " +
                "AND table_name <> 'flyway_schema_history'",
                String.class);

        Map<String, Set<String>> deps = new HashMap<>();
        for (String t : tables) deps.put(t, new HashSet<>());

        jdbc.query(
                "SELECT tc.table_name AS child, ccu.table_name AS parent " +
                "FROM information_schema.table_constraints tc " +
                "JOIN information_schema.constraint_column_usage ccu " +
                "  ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema " +
                "WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'",
                rs -> {
                    String child = rs.getString("child");
                    String parent = rs.getString("parent");
                    // Ignore self-references (handled at insert time) and FKs to
                    // tables outside our set (e.g. flyway) so the sort terminates.
                    if (!child.equals(parent) && deps.containsKey(child) && deps.containsKey(parent)) {
                        deps.get(child).add(parent);
                    }
                });

        // Kahn-style topological sort: emit a table once all its parents are out.
        List<String> order = new ArrayList<>(tables.size());
        Set<String> done = new HashSet<>();
        while (order.size() < tables.size()) {
            boolean progressed = false;
            for (String t : tables) {
                if (done.contains(t)) continue;
                if (done.containsAll(deps.get(t))) {
                    order.add(t);
                    done.add(t);
                    progressed = true;
                }
            }
            if (!progressed) {
                // Unexpected cycle — append the remainder so we never loop forever.
                for (String t : tables) if (done.add(t)) order.add(t);
            }
        }
        return order;
    }

    /** column name → PostgreSQL udt_name (uuid, timestamptz, numeric, int4, bool, …). */
    private Map<String, String> columnTypes(String table) {
        Map<String, String> types = new LinkedHashMap<>();
        jdbc.query(
                "SELECT column_name, udt_name FROM information_schema.columns " +
                "WHERE table_schema = 'public' AND table_name = ?",
                rs -> { types.put(rs.getString("column_name"), rs.getString("udt_name")); },
                table);
        return types;
    }

    /** FK columns on {@code table} that reference {@code table} itself. */
    private Set<String> selfRefColumns(String table) {
        Set<String> cols = new HashSet<>();
        jdbc.query(
                "SELECT kcu.column_name " +
                "FROM information_schema.table_constraints tc " +
                "JOIN information_schema.key_column_usage kcu " +
                "  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema " +
                "JOIN information_schema.constraint_column_usage ccu " +
                "  ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema " +
                "WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' " +
                "AND tc.table_name = ? AND ccu.table_name = ?",
                rs -> { cols.add(rs.getString("column_name")); },
                table, table);
        return cols;
    }

    /** Latest successfully-applied Flyway version, or null if unavailable. */
    private String currentSchemaVersion() {
        try {
            return jdbc.query(
                    "SELECT version FROM flyway_schema_history " +
                    "WHERE success = true AND version IS NOT NULL " +
                    "ORDER BY installed_rank DESC LIMIT 1",
                    rs -> rs.next() ? rs.getString(1) : null);
        } catch (Exception e) {
            return null; // history table absent (tests / non-Flyway DB) — skip the check
        }
    }

    // ─────────────────────────────── helpers ───────────────────────────────

    private JsonNode parse(String json) {
        try {
            return mapper.readTree(json);
        } catch (Exception e) {
            throw new ConflictException("Backup file isn't valid JSON.");
        }
    }

    private static String textOrNull(JsonNode n) {
        return (n == null || n.isNull()) ? null : n.asText();
    }

    /** Double-quote an identifier sourced from DB metadata; reject the one
     *  character that could break out of the quoting. */
    private String quote(String identifier) {
        if (identifier.indexOf('"') >= 0) {
            throw new IllegalArgumentException("Illegal identifier: " + identifier);
        }
        return '"' + identifier + '"';
    }
}
