package com.ngo.finance.funding.entity;

import com.ngo.finance.funding.enums.FundingChangeAction;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

/**
 * One immutable change to a funding record: a field's old and new value as
 * readable text, or a status step. Rows written by one save (or one status
 * action) share a {@code changeGroup} and show as one history entry.
 */
@Entity
@Table(name = "funding_change_log")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FundingChangeLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "fund_profile_id", nullable = false)
    private Long fundProfileId;

    @Column(name = "grant_id")
    private Long grantId;

    @Column(name = "change_group", nullable = false, length = 40)
    private String changeGroup;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private FundingChangeAction action;

    @Column(length = 60)
    private String section;

    @Column(name = "field_label", length = 160)
    private String fieldLabel;

    @Column(name = "old_value", columnDefinition = "TEXT")
    private String oldValue;

    @Column(name = "new_value", columnDefinition = "TEXT")
    private String newValue;

    @Column(length = 1000)
    private String note;

    @Column(name = "changed_by")
    private String changedBy;

    @CreationTimestamp
    @Column(name = "changed_at", nullable = false, updatable = false)
    private LocalDateTime changedAt;
}
