package com.ngo.finance.masters.overbudgetreason.entity;

import com.ngo.finance.common.entity.AuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

/**
 * Over-budget reason master — why a debit note took its budget line over
 * budget (Additional charge, FX difference, …). Debit notes point at it by id.
 */
@Entity
@Table(name = "over_budget_reason_master")
@Data
@EqualsAndHashCode(callSuper = false)
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OverBudgetReason extends AuditEntity {

    @Column(nullable = false, unique = true, length = 255)
    private String name;

    /** A line explaining when to use it; optional. */
    @Column(length = 500)
    private String description;

    @Column(nullable = false)
    @Builder.Default
    private Boolean status = true;
}
