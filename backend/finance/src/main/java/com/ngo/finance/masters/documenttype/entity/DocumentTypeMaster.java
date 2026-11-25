package com.ngo.finance.masters.documenttype.entity;

import com.ngo.finance.common.entity.AuditEntity;
import com.ngo.finance.common.enums.FundSourceDomicile;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import java.util.HashSet;
import java.util.Set;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

/**
 * Document Type master — an identity document a donor can be identified by
 * (PAN Card, Aadhaar Card, Passport ID, …). Donors point at it by id.
 */
@Entity
@Table(name = "document_type_master")
@Data
@EqualsAndHashCode(callSuper = false)
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DocumentTypeMaster extends AuditEntity {

    /** Label shown on forms, e.g. "PAN Card". */
    @Column(nullable = false, unique = true, length = 255)
    private String name;

    @Column(nullable = false)
    @Builder.Default
    private Boolean status = true;

    /** Fund source domiciles this type is offered to — Domestic, Foreign or both; never empty. */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(
            name = "document_type_master_fund_source_domicile",
            joinColumns = @JoinColumn(name = "document_type_id"))
    @Column(name = "fund_source_domicile")
    @Enumerated(EnumType.STRING)
    @Builder.Default
    private Set<FundSourceDomicile> allowedFundSourceDomiciles = new HashSet<>();

    /**
     * Donor types that must give this document: a donor of one of them needs an
     * ID document, and it has to be one of the types marked for its donor type.
     */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(
            name = "document_type_master_required_donor_type",
            joinColumns = @JoinColumn(name = "document_type_id"))
    @Column(name = "donor_type_id")
    @Builder.Default
    private Set<Long> requiredForDonorTypeIds = new HashSet<>();

    /** True when a donor with this domicile may use the type (null domicile = not yet chosen). */
    public boolean appliesTo(FundSourceDomicile domicile) {
        return domicile == null || allowedFundSourceDomiciles.isEmpty() || allowedFundSourceDomiciles.contains(domicile);
    }
}
