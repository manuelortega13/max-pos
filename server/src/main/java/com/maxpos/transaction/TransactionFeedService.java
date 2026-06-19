package com.maxpos.transaction;

import com.maxpos.common.PageResponse;
import com.maxpos.transaction.dto.TransactionRowDto;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class TransactionFeedService {

    /** Defensive page-size ceiling so a crafted request can't ask for
     *  the whole table and defeat the point of paging. */
    private static final int MAX_SIZE = 200;

    private final TransactionFeedRepository repository;

    public TransactionFeedService(TransactionFeedRepository repository) {
        this.repository = repository;
    }

    /**
     * One page of the unified feed, newest first. "all"/blank filter
     * values are treated as "no filter". Sorted by date desc with id as
     * a stable tiebreaker so paging never drops or repeats a row when
     * two transactions share a timestamp.
     */
    public PageResponse<TransactionRowDto> query(String source,
                                                 String status,
                                                 UUID cashierId,
                                                 String search,
                                                 String from,
                                                 String to,
                                                 int page,
                                                 int size) {
        String src = normalize(source);
        String st = normalize(status);
        // Empty string (not null) means "no search" — see the repository's
        // query doc for why the term parameter must never be null.
        String term = (search == null || search.isBlank()) ? "" : search.trim().toLowerCase(Locale.ROOT);
        Instant fromInstant = parseInstant(from);
        Instant toInstant = parseInstant(to);

        int safeSize = Math.min(Math.max(size, 1), MAX_SIZE);
        int safePage = Math.max(page, 0);
        Pageable pageable = PageRequest.of(
                safePage,
                safeSize,
                Sort.by(Sort.Direction.DESC, "date").and(Sort.by(Sort.Direction.DESC, "id"))
        );

        Page<TransactionFeedRow> result = repository.search(
                src, st, cashierId,
                fromInstant != null, fromInstant,
                toInstant != null, toInstant,
                term, pageable);
        return PageResponse.of(result, TransactionRowDto::from);
    }

    private static String normalize(String value) {
        if (value == null || value.isBlank() || "all".equalsIgnoreCase(value)) {
            return null;
        }
        return value;
    }

    /** Parse an ISO-8601 instant, or null for blank/garbage (a bad date
     *  filter simply doesn't constrain the query rather than 500-ing). */
    private static Instant parseInstant(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return Instant.parse(value.trim());
        } catch (Exception e) {
            return null;
        }
    }
}
